"""Raw-folder intake (spec §2): pull readable text out of whatever the
traveller dropped in — PDFs, photos, spreadsheets, saved pages, notes.

The division of labour matters: this module only *extracts*. Deciding what a
booking reference means, which of three hotel links was actually booked, or
that three name spellings are one person is the Convert Skill's job, done by
an agent reading these extracts. Nothing here guesses.
"""

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
    except Exception as exc:                      # noqa: BLE001 - reported, not raised
        return "error", f"[could not read this file: {type(exc).__name__}: {exc}]"
    return "unhandled", f"[no reader for '{suffix}' — open it yourself and summarise it]"


def _pdf(path: Path) -> str:
    import pdfplumber

    out = []
    with pdfplumber.open(str(path)) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ""
            tables = page.extract_tables() or []
            out.append(f"--- page {i} ---\n{text}")
            for table in tables:
                rows = [" | ".join((cell or "").strip() for cell in row) for row in table]
                out.append("[table]\n" + "\n".join(rows))
    body = "\n".join(out).strip()
    if len(body) < 40:
        # A scanned confirmation is an image in a PDF wrapper — OCR it.
        body += "\n" + _ocr_pdf(path)
    return body


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
