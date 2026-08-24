"""Getting text out of whatever was dropped in.

Both cases here are real failures from the Pakistan trip, and both failed the
same way: the file was reported `ok` while its contents never reached Convert.
A loud failure would have been fine. A cheerful one cost a rebuild.
"""
from scripts.lib.extract import extract, meaningful_chars


# ---- scaffolding must not be mistaken for content ----

def test_page_markers_do_not_count_as_text():
    """Four "--- page N ---" markers are 62 characters of this module's own
    output. Counting them meant a scanned four-page ticket looked like a
    healthy extract and never reached OCR."""
    scanned = "--- page 1 ---\n\n--- page 2 ---\n\n--- page 3 ---\n\n--- page 4 ---"
    assert len(scanned) > 40, "the raw length is what fooled the old check"
    assert meaningful_chars(scanned) == 0


def test_table_markers_do_not_count_either():
    assert meaningful_chars("[table]\n[table]\n") == 0


def test_ocr_markers_do_not_count():
    assert meaningful_chars("--- page 1 (ocr) ---\n") == 0


def test_real_text_is_counted():
    body = "--- page 1 ---\nBooking ref EGP2BY, Melbourne to Lahore"
    assert meaningful_chars(body) == len("Booking ref EGP2BY, Melbourne to Lahore")


def test_meaningful_chars_tolerates_nothing():
    assert meaningful_chars("") == 0
    assert meaningful_chars(None) == 0


# ---- a file with no extension is still a file ----

def test_extensionless_text_file_is_read(tmp_path):
    """"overall plan" with no suffix is what a traveller actually types. It
    used to come back as `unhandled` with a placeholder where the plan should
    have been."""
    p = tmp_path / "overall plan"
    p.write_text("Lahore to Sialkot (House 8/336 Rungpura Road) Main Stay\n", encoding="utf-8")

    kind, text = extract(p)

    assert kind == "text"
    assert "Rungpura Road" in text


def test_unknown_extension_that_holds_text_is_read(tmp_path):
    p = tmp_path / "notes.rtfish"
    p.write_text("Day trips to Lahore and Islamabad", encoding="utf-8")
    kind, text = extract(p)
    assert kind == "text"
    assert "Islamabad" in text


def test_binary_file_is_not_pretend_text(tmp_path):
    """A NUL byte means this is not prose. Reporting it as text would put
    mojibake into extracts.md and call it a successful read."""
    p = tmp_path / "mystery.bin"
    p.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00")
    kind, text = extract(p)
    assert kind == "unhandled"
    assert "no reader" in text


def test_invalid_utf8_is_not_pretend_text(tmp_path):
    p = tmp_path / "mystery.dat"
    p.write_bytes(b"\xff\xfe\xfd\xfc" * 40)
    kind, _ = extract(p)
    assert kind == "unhandled"


def test_known_suffixes_still_win(tmp_path):
    """The sniffing is a fallback, not a takeover: a .csv stays a table."""
    p = tmp_path / "trip.csv"
    p.write_text("a,b\n1,2\n", encoding="utf-8")
    kind, _ = extract(p)
    assert kind == "table"


def test_unreadable_file_reports_rather_than_raises(tmp_path):
    kind, text = extract(tmp_path / "does-not-exist")
    assert kind == "error"
    assert "could not read" in text
