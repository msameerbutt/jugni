"""Where a build reads its trip from.

This layer had no tests and three things depend on it being exactly right:
`make generate` scaffolding a new trip, `NAME=` picking one of several exports,
and a pre-`input/` trip still building instead of silently producing an empty
shell.
"""
import pytest

from scripts.lib import paths


@pytest.fixture
def trips(tmp_path, monkeypatch):
    """Point the path helpers at a throwaway trips/ so nothing touches a real
    trip. Every helper derives from TRIPS, so one patch covers the module."""
    root = tmp_path
    monkeypatch.setattr(paths, "ROOT", root)
    monkeypatch.setattr(paths, "TRIPS", root / "trips")
    return root / "trips"


# ---------- naming ----------

def test_default_input_is_default_json(trips):
    assert paths.trip_input("x") == trips / "x" / "input" / "default.json"


def test_named_input(trips):
    assert paths.trip_input("x", "input1") == trips / "x" / "input" / "input1.json"


def test_name_may_include_the_suffix(trips):
    """`NAME=input1` and `NAME=input1.json` are the same request — a doubled
    `.json.json` would silently miss the file the traveller means."""
    assert paths.trip_input("x", "input1.json") == paths.trip_input("x", "input1")


@pytest.mark.parametrize("blank", ["", "   ", None])
def test_blank_name_falls_back_to_default(trips, blank):
    assert paths.trip_input("x", blank).name == "default.json"


# ---------- scaffolding ----------

def test_scaffold_creates_the_three_folders(trips):
    made = paths.scaffold("newtrip")
    assert {p.name for p in made} == {"raw", "intake", "input"}
    for name in ("raw", "intake", "input"):
        assert (trips / "newtrip" / name).is_dir()


def test_scaffold_is_idempotent(trips):
    paths.scaffold("newtrip")
    assert paths.scaffold("newtrip") == [], "a re-run must report nothing new"


# ---------- migration off the old layout ----------

def test_migrate_moves_legacy_input(trips):
    old = trips / "t" / "input.json"
    old.parent.mkdir(parents=True)
    old.write_text('{"trip":{"name":"T"}}', encoding="utf-8")

    moved = paths.migrate_legacy_input("t")

    assert moved == paths.trip_input("t")
    assert moved.read_text(encoding="utf-8") == '{"trip":{"name":"T"}}'
    assert not old.exists()


def test_migrate_never_overwrites_an_existing_default(trips):
    """Both present means two different trips claim the same slot. Picking one
    would throw away a trip's worth of edits, so it must refuse."""
    old = trips / "t" / "input.json"
    old.parent.mkdir(parents=True)
    old.write_text('{"trip":{"name":"OLD"}}', encoding="utf-8")
    new = paths.trip_input("t")
    new.parent.mkdir(parents=True)
    new.write_text('{"trip":{"name":"NEW"}}', encoding="utf-8")

    assert paths.migrate_legacy_input("t") is None
    assert old.exists(), "the old file must be left for a human to reconcile"
    assert '"NEW"' in new.read_text(encoding="utf-8")


def test_migrate_is_a_no_op_without_a_legacy_file(trips):
    paths.scaffold("t")
    assert paths.migrate_legacy_input("t") is None


# ---------- resolution ----------

def test_resolve_prefers_the_named_input(trips):
    p = paths.trip_input("t", "input1")
    p.parent.mkdir(parents=True)
    p.write_text("{}", encoding="utf-8")
    assert paths.resolve_input("t", "input1") == p


def test_explicit_path_beats_trip_and_name(trips, tmp_path):
    elsewhere = tmp_path / "somewhere" / "other.json"
    elsewhere.parent.mkdir(parents=True)
    elsewhere.write_text("{}", encoding="utf-8")
    assert paths.resolve_input("t", "input1", str(elsewhere)) == elsewhere


def test_explicit_relative_path_resolves_against_the_repo_root(trips):
    assert paths.resolve_input("t", "default", "some/file.json") == paths.ROOT / "some/file.json"


def test_falls_back_to_the_pre_input_layout(trips):
    """An un-migrated trip must still build. Returning the non-existent new
    path instead would quietly produce an empty shell — the failure mode this
    fallback exists to prevent."""
    old = trips / "t" / "input.json"
    old.parent.mkdir(parents=True)
    old.write_text("{}", encoding="utf-8")
    assert paths.resolve_input("t") == old


def test_no_fallback_for_a_named_input(trips):
    """`NAME=input1` asked for a specific file. Silently serving the legacy
    default instead would build the wrong trip under the right name."""
    old = trips / "t" / "input.json"
    old.parent.mkdir(parents=True)
    old.write_text("{}", encoding="utf-8")
    assert paths.resolve_input("t", "input1") == paths.trip_input("t", "input1")


def test_resolves_to_the_new_path_when_nothing_exists(trips):
    assert paths.resolve_input("t") == paths.trip_input("t")
