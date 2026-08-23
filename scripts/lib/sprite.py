"""Build one inline SVG sprite from the vendored icons (spec §8, feedback F14).

Every icon becomes a <symbol>; the page references it with <use href="#i-name">.
About 400 bytes an icon, sharp at any size, follows currentColor, and nothing
is ever fetched. Base64 images would be larger, blurrier and un-themeable.
"""

import re
from pathlib import Path

SVG_OPEN_RE = re.compile(r"<svg\b([^>]*)>", re.I | re.S)
SVG_CLOSE_RE = re.compile(r"</svg>\s*$", re.I)
VIEWBOX_RE = re.compile(r'viewBox\s*=\s*"([^"]+)"', re.I)
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
ID_RE = re.compile(r'\bid\s*=\s*"([^"]+)"')


def _inner(svg_text: str) -> tuple[str, str]:
    """Returns (viewBox, inner markup)."""
    text = COMMENT_RE.sub("", svg_text).strip()
    match = SVG_OPEN_RE.search(text)
    if not match:
        return "0 0 24 24", ""
    attrs = match.group(1)
    view_box = VIEWBOX_RE.search(attrs)
    inner = text[match.end():]
    inner = SVG_CLOSE_RE.sub("", inner).strip()
    return (view_box.group(1) if view_box else "0 0 24 24"), inner


def _namespace_ids(inner: str, prefix: str) -> str:
    """Flag SVGs all define id="a" for their clip mask. Dropped into one
    document unchanged, every flag after the first would render the first
    one's mask — so ids and their references are prefixed per symbol."""
    ids = set(ID_RE.findall(inner))
    for original in ids:
        new = f"{prefix}-{original}"
        inner = re.sub(rf'\bid\s*=\s*"{re.escape(original)}"', f'id="{new}"', inner)
        inner = inner.replace(f"url(#{original})", f"url(#{new})")
        inner = re.sub(rf'href\s*=\s*"#{re.escape(original)}"', f'href="#{new}"', inner)
    return inner


def build(icons_dir: Path, icon_names: set[str], flag_codes: set[str]) -> tuple[str, dict]:
    """Only what is referenced ends up in the output, so a large vendored set
    costs nothing at runtime."""
    symbols = []
    stats = {"icons": 0, "flags": 0, "missing_icons": [], "missing_flags": []}

    lucide = icons_dir / "lucide"
    for name in sorted(icon_names):
        path = lucide / f"{name}.svg"
        if not path.exists():
            stats["missing_icons"].append(name)
            continue
        view_box, inner = _inner(path.read_text(encoding="utf-8"))
        symbols.append(f'<symbol id="i-{name}" viewBox="{view_box}">{inner}</symbol>')
        stats["icons"] += 1

    flags = icons_dir / "flags"
    for code in sorted(flag_codes):
        path = flags / f"{code}.svg"
        if not path.exists():
            stats["missing_flags"].append(code)
            continue
        view_box, inner = _inner(path.read_text(encoding="utf-8"))
        inner = _namespace_ids(inner, f"f-{code}")
        symbols.append(f'<symbol id="f-{code}" viewBox="{view_box}">{inner}</symbol>')
        stats["flags"] += 1

    if not symbols:
        return "", stats
    return f'<svg id="sprite" aria-hidden="true">{"".join(symbols)}</svg>', stats


QUOTED_TOKEN_RE = re.compile(r"""["']([a-z][a-z0-9-]*)["']""")


def referenced_icons(app_dir: Path, extra_sources: list[str], available: set[str]) -> set[str]:
    """Which vendored icons the source actually asks for.

    An earlier version pattern-matched `name="..."` and required a hyphen,
    which silently missed single-word names and names given as object
    properties (`icon: 'compass'`) — five icons shipped as empty boxes before
    the smoke test caught it.

    So: collect every quoted lowercase token in the source and intersect with
    the filenames on disk. Over-collection is bounded by what was vendored and
    costs a few hundred bytes; under-collection renders nothing at all, which
    is the failure worth designing against."""
    names = set()
    for path in app_dir.rglob("*.js"):
        names.update(QUOTED_TOKEN_RE.findall(path.read_text(encoding="utf-8")))
    for text in extra_sources:
        names.update(QUOTED_TOKEN_RE.findall(text))
    return names & available
