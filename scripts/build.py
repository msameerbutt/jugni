#!/usr/bin/env python3
"""`make build` — assemble src/ into one self-contained file (spec §2/§8).

Source stays multi-file for contributors; this is the only place it becomes a
single file. Nothing in the output is fetched from a remote host at runtime:
CSS, JS and fonts are all inlined here.

With an input.json present its data is baked in (build path (a) in spec §8).
Without one it produces the generic empty shell that loads a trip through the
in-browser Import (build path (b)) — the same running app either way.
"""

import argparse
import base64
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib import paths
from scripts.lib.minify import minify_css, minify_js

FONT_ROLES = [("display", "Jugni Display"), ("sans", "Jugni Sans"), ("mono", "Jugni Mono")]


def read_ordered(directory: Path, suffix: str) -> list[tuple[str, str]]:
    """Files are numbered, so load order is explicit in the filenames rather
    than hidden in a manifest that drifts out of date."""
    files = sorted(p for p in directory.glob(f"*{suffix}") if p.is_file())
    return [(p.name, p.read_text(encoding="utf-8")) for p in files]


def build_fonts() -> str:
    """Embed any .woff2 in src/fonts as base64 @font-face rules (spec §8).
    Empty folder is fine: the token stacks fall back to platform faces."""
    if not paths.FONTS.exists():
        return ""
    rules = []
    for font in sorted(paths.FONTS.glob("*.woff2")):
        stem = font.stem.lower()
        family = next((fam for key, fam in FONT_ROLES if key in stem), None)
        if not family:
            print(f"  ! skipping {font.name}: filename must contain display/sans/mono")
            continue
        weight_match = re.search(r"-(\d{3})$", stem)
        weight = weight_match.group(1) if weight_match else "400"
        style = "italic" if "italic" in stem else "normal"
        b64 = base64.b64encode(font.read_bytes()).decode("ascii")
        rules.append(
            f"@font-face{{font-family:'{family}';font-weight:{weight};"
            f"font-style:{style};font-display:swap;"
            f"src:url(data:font/woff2;base64,{b64}) format('woff2')}}"
        )
        print(f"  + font {font.name} -> {family} {weight}")
    return "".join(rules)


def load_trip(input_path: Path):
    if not input_path.exists():
        return None
    try:
        return json.loads(input_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"error: {input_path} is not valid JSON — {exc}")


def embed_json(data) -> str:
    """`</script>` inside embedded JSON would end the script element early."""
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", default="", help="path to a trip's input.json (optional)")
    ap.add_argument("--out", required=True, help="output .html path")
    ap.add_argument("--no-minify", action="store_true", help="readable output, for debugging")
    args = ap.parse_args()

    out_path = (paths.ROOT / args.out).resolve() if not Path(args.out).is_absolute() else Path(args.out)
    input_path = (paths.ROOT / args.input).resolve() if args.input else None

    css_files = read_ordered(paths.CSS, ".css")
    js_files = read_ordered(paths.JS, ".js")
    if not css_files or not js_files:
        raise SystemExit("error: no source found under src/css or src/js")

    print(f"building {out_path.relative_to(paths.ROOT) if out_path.is_relative_to(paths.ROOT) else out_path}")
    print(f"  css: {len(css_files)} files   js: {len(js_files)} files")

    css = "\n".join(body for _, body in css_files)
    js = "\n".join(body for _, body in js_files)

    # Everything shares one function scope: no globals leak onto window, and
    # no module loader is needed in a file opened over file://.
    js = '"use strict";\n(function(){\n' + js + "\n})();"

    if not args.no_minify:
        css, js = minify_css(css), minify_js(js)

    fonts = build_fonts()

    trip = load_trip(input_path) if input_path else None
    if input_path and trip is None:
        print(f"  ! {args.input} not found — building the empty shell instead")

    name = (trip or {}).get("trip", {}).get("name") or "Jugni"
    title = f"{name} · Jugni" if name != "Jugni" else "Jugni"
    description = "Your trip, in one place — checklist, cities, expenses, weather and guide."

    template = (paths.TEMPLATES / "app.html").read_text(encoding="utf-8")
    html = (
        template
        .replace("{{TRIP_TITLE}}", title)
        .replace("{{TRIP_DESCRIPTION}}", description)
        .replace("{{STYLES}}", fonts + css)
        .replace("{{SCRIPTS}}", js)
        .replace("{{DATA}}", embed_json(trip) if trip else "")
    )
    html = "<!doctype html>\n<html lang=\"en\">\n" + html + "\n</html>\n"

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")

    kb = len(html.encode("utf-8")) / 1024
    print(f"  data: {'baked in (' + name + ')' if trip else 'empty shell — import in-browser'}")
    print(f"  done: {kb:.0f} KB, self-contained, no network needed to open")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
