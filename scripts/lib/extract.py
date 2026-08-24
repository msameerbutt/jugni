"""Raw-folder intake (spec §2): pull readable text out of whatever the
traveller dropped in — PDFs, photos, spreadsheets, saved pages, notes.

The division of labour matters: this module only *extracts*. Deciding what a
booking reference means, which of three hotel links was actually booked, or
that three name spellings are one person is the Convert Skill's job, done by
an agent reading these extracts. Nothing here guesses.
"""

import re
from pathlib import Path

TEXT_SUFFIXES = {".txt", ".md", ".text", ".log", ".json"}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp", ".heic"}
HTML_SUFFIXES = {".html", ".htm"}
SHEET_SUFFIXES = {".xlsx", ".xlsm"}
CSV_SUFFIXES = {".csv", ".tsv"}


def extract(path: Path) -> tuple[str, str]:
    """Returns (kind, text). Never raises — an unreadable file is reported as
    text so the agent can see the gap rather than silently losing the file."""
    suffix = path.suffix.lower()
    try:
        if suffix == ".pdf":
            return "pdf", _pdf(path)
        if suffix in IMAGE_SUFFIXES:
            return "image", _ocr(path)
        if suffix in SHEET_SUFFIXES:
            return "spreadsheet", _xlsx(path)
        if suffix in CSV_SUFFIXES:
            return "table", path.read_text(encoding="utf-8", errors="replace")
        if suffix in HTML_SUFFIXES:
            return "html", _html(path)
        if suffix in TEXT_SUFFIXES:
            return "text", path.read_text(encoding="utf-8", errors="replace")
        # No suffix, or one nobody thought of. A traveller writing their plan
        # into a file called "overall plan" and dropping it in is the most
        # natural thing in the world, and refusing it on a missing extension
        # threw the whole file away behind a cheerful "ok". Sniff instead: if
        # it decodes as text, it is text.
        text = _as_text(path)
        if text is not None:
            return "text", text
    except Exception as exc:                      # noqa: BLE001 - reported, not raised
        return "error", f"[could not read this file: {type(exc).__name__}: {exc}]"
    return "unhandled", f"[no reader for '{suffix}' — open it yourself and summarise it]"


def _as_text(path: Path, probe: int = 8192) -> str | None:
    """The file's contents if it is plain text, else None. A NUL byte is the
    reliable giveaway for binary; a failed UTF-8 decode is the other."""
    head = path.read_bytes()[:probe]
    if b"\x00" in head:
        return None
    try:
        head.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return path.read_text(encoding="utf-8", errors="replace")


def _pdf(path: Path) -> str:
    import pdfplumber

    out, harvested = [], []
    with pdfplumber.open(str(path)) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ""
            tables = page.extract_tables() or []
            harvested.append(text)
            out.append(f"--- page {i} ---\n{text}")
            for table in tables:
                rows = [" | ".join((cell or "").strip() for cell in row) for row in table]
                harvested.append("".join(rows))
                out.append("[table]\n" + "\n".join(rows))

    # Whether to OCR is a question about the TEXT, never about the assembled
    # output: "--- page N ---" markers are scaffolding this function just
    # added, and four of them total 62 characters. Measuring the whole string
    # meant a scanned PDF of three or more pages cleared the threshold on
    # markers alone, skipped OCR, and was recorded as a healthy 62-character
    # extract. A real four-page scanned ticket reached Convert as nothing.
    body = "\n".join(out).strip()
    if meaningful_chars("".join(harvested)) < 40:
        # A scanned confirmation is an image in a PDF wrapper — OCR it.
        body += "\n" + _ocr_pdf(path)
    return body


PAGE_MARKER_RE = re.compile(r"^(?:--- page \d+(?: \(ocr\))? ---|\[table\])\s*$", re.M)


def meaningful_chars(text: str) -> int:
    """Length of what was actually read, with this module's own scaffolding
    discounted. Used for the OCR decision and for the `status` an intake run
    reports, so neither can be fooled by a long file that yielded nothing."""
    return len(PAGE_MARKER_RE.sub("", text or "").strip())


def _ocr_pdf(path: Path) -> str:
    try:
        import pdfplumber
        import pytesseract

        out = []
        with pdfplumber.open(str(path)) as pdf:
            for i, page in enumerate(pdf.pages, 1):
                image = page.to_image(resolution=200).original
                out.append(f"--- page {i} (ocr) ---\n{pytesseract.image_to_string(image)}")
        return "\n".join(out)
    except Exception as exc:                      # noqa: BLE001
        return f"[scanned PDF and OCR failed: {exc}]"


def _ocr(path: Path) -> str:
    from PIL import Image
    import pytesseract

    return pytesseract.image_to_string(Image.open(path))


def _xlsx(path: Path) -> str:
    import openpyxl

    book = openpyxl.load_workbook(str(path), data_only=True, read_only=True)
    out = []
    for sheet in book.worksheets:
        out.append(f"--- sheet: {sheet.title} ---")
        for row in sheet.iter_rows(values_only=True):
            cells = ["" if c is None else str(c).strip() for c in row]
            if any(cells):
                out.append(" | ".join(cells))
    book.close()
    return "\n".join(out)


def _html(path: Path) -> str:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    lines = [ln.strip() for ln in soup.get_text("\n").splitlines()]
    text = "\n".join(ln for ln in lines if ln)

    links = []
    for a in soup.find_all("a", href=True):
        label = a.get_text(" ", strip=True)
        if label and a["href"].startswith("http"):
            links.append(f"{label} -> {a['href']}")
    if links:
        text += "\n\n[links]\n" + "\n".join(dict.fromkeys(links))
    return text
