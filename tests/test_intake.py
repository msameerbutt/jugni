"""Intake accumulates rather than mirroring `raw/`.

The rule these protect: a file is read once, and taking the original out of
`raw/` must never lose what it said. Before this, intake rebuilt extracts.md
from whatever happened to be in the folder — so tidying a consumed booking PDF
away silently deleted its extract, and the trip data with it.
"""
import json

import pytest

from scripts import generate
from scripts.lib import paths


@pytest.fixture
def trip(tmp_path, monkeypatch):
    """A throwaway trip with a raw inbox and an intake folder."""
    monkeypatch.setattr(paths, "ROOT", tmp_path)
    monkeypatch.setattr(paths, "TRIPS", tmp_path / "trips")
    paths.scaffold("t")

    class Trip:
        root = tmp_path
        raw = paths.trip_raw("t")
        intake = paths.trip_intake("t")

        def drop(self, name, text):
            (self.raw / name).write_text(text, encoding="utf-8")

        def remove(self, name):
            (self.raw / name).unlink()

        def run(self):
            return generate.run_intake(self.raw, self.intake)

        @property
        def extracts(self):
            return (self.intake / "extracts.md").read_text(encoding="utf-8")

        @property
        def manifest(self):
            return json.loads((self.intake / "manifest.json").read_text(encoding="utf-8"))

        def entry(self, name):
            return next(f for f in self.manifest["files"] if f["file"] == name)

    return Trip()


def test_first_run_extracts_and_records(trip, capsys):
    trip.drop("notes.txt", "Ferry to Tallinn 10:30, booking ref ABC123")
    trip.run()

    assert "ABC123" in trip.extracts
    entry = trip.entry("notes.txt")
    assert entry["present"] is True
    assert entry["status"] == "ok"
    assert entry["sha256"]
    assert "1 extracted, 0 unchanged, 0 archived" in capsys.readouterr().out


def test_unchanged_file_is_not_re_extracted(trip, capsys):
    trip.drop("notes.txt", "Ferry to Tallinn 10:30, booking ref ABC123")
    trip.run()
    capsys.readouterr()

    trip.run()

    out = capsys.readouterr().out
    assert "0 extracted, 1 unchanged" in out
    assert "same" in out
    assert "ABC123" in trip.extracts, "reusing an extract must not drop it"


def test_changed_file_is_re_extracted(trip):
    trip.drop("notes.txt", "Ferry to Tallinn 10:30, booking ref ABC123")
    trip.run()
    trip.drop("notes.txt", "Ferry CANCELLED, rebooked as ref ZZZ999")
    trip.run()

    assert "ZZZ999" in trip.extracts
    assert "ABC123" not in trip.extracts


def test_consumed_file_keeps_its_extract(trip, capsys):
    """The whole point: `raw/` is an inbox you are allowed to empty."""
    trip.drop("ticket.txt", "Flight TK169 MEL-IST, ref U3WZQ8")
    trip.drop("hotel.txt", "Hotel Transit Loft, ref 6289.331.528")
    trip.run()
    capsys.readouterr()

    trip.remove("ticket.txt")
    trip.run()

    out = capsys.readouterr().out
    assert "1 archived" in out
    assert "U3WZQ8" in trip.extracts, "an archived file must keep its extract"
    assert "6289.331.528" in trip.extracts
    assert trip.entry("ticket.txt")["present"] is False
    assert trip.entry("hotel.txt")["present"] is True


def test_archived_sections_are_marked(trip):
    trip.drop("ticket.txt", "Flight TK169 MEL-IST, ref U3WZQ8")
    trip.run()
    trip.remove("ticket.txt")
    trip.run()

    line = next(l for l in trip.extracts.splitlines() if l.startswith("## ticket.txt"))
    assert "archived" in line, "Convert must be able to see the original is gone"


def test_emptying_raw_entirely_keeps_everything(trip):
    for i in range(3):
        trip.drop(f"doc{i}.txt", f"booking reference REF{i}0000")
    trip.run()

    for i in range(3):
        trip.remove(f"doc{i}.txt")
    trip.run()

    assert len(trip.manifest["files"]) == 3
    for i in range(3):
        assert f"REF{i}0000" in trip.extracts


def test_returning_a_file_costs_nothing(trip, capsys):
    """Putting an archived original back must be recognised by content, not
    re-read — and it flips back to present."""
    trip.drop("ticket.txt", "Flight TK169 MEL-IST, ref U3WZQ8")
    trip.run()
    trip.remove("ticket.txt")
    trip.run()
    capsys.readouterr()

    trip.drop("ticket.txt", "Flight TK169 MEL-IST, ref U3WZQ8")
    trip.run()

    out = capsys.readouterr().out
    assert "0 extracted, 1 unchanged, 0 archived" in out
    assert trip.entry("ticket.txt")["present"] is True


def test_new_file_alongside_archived_ones(trip, capsys):
    """The workflow: consume, tidy away, then add more when details emerge."""
    trip.drop("old.txt", "booking reference OLD111")
    trip.run()
    trip.remove("old.txt")
    trip.drop("new.txt", "booking reference NEW222")
    trip.run()

    out = capsys.readouterr().out
    assert "1 extracted, 0 unchanged, 1 archived" in out
    assert "OLD111" in trip.extracts and "NEW222" in trip.extracts


def test_archived_entry_whose_extract_vanished_is_dropped(trip, capsys):
    """A manifest row pointing at a file that is not there would crash the
    extracts.md rebuild. Drop it loudly instead."""
    trip.drop("gone.txt", "booking reference GONE33")
    trip.run()
    trip.remove("gone.txt")
    (trip.intake / "text" / "gone.txt.txt").unlink()
    capsys.readouterr()

    trip.run()

    assert "dropping it" in capsys.readouterr().out
    assert not [f for f in trip.manifest["files"] if f["file"] == "gone.txt"]


def test_corrupt_manifest_does_not_lose_the_run(trip, capsys):
    trip.drop("notes.txt", "booking reference KEEP44")
    trip.run()
    (trip.intake / "manifest.json").write_text("{not json", encoding="utf-8")
    capsys.readouterr()

    trip.run()

    assert "starting a fresh one" in capsys.readouterr().out
    assert "KEEP44" in trip.extracts


def test_manifest_is_ordered_by_filename(trip):
    for name in ("zulu.txt", "alpha.txt", "mike.txt"):
        trip.drop(name, f"reference for {name}")
    trip.run()

    names = [f["file"] for f in trip.manifest["files"]]
    assert names == sorted(names, key=str.lower), "stable order keeps diffs readable"


def test_thin_extract_is_reported_not_hidden(trip, capsys):
    trip.drop("blank.txt", "   ")
    trip.run()

    assert "yielded little or no text" in capsys.readouterr().out
    assert trip.entry("blank.txt")["status"] == "empty"
