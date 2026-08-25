#!/usr/bin/env python3
"""`make build` — assemble src/ into one self-contained file (spec §2/§8).

Source stays multi-file for contributors; this is the only place it becomes a
single file. Nothing in the output is fetched at runtime: CSS, JS, fonts and
icons are all inlined here.

With an input.json present its data is baked in (build path (a) in spec §8).
Without one it produces the generic empty shell that loads a trip through the
in-browser Import (build path (b)) — the same running app either way.
"""

import argparse
import base64
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib import paths, pwa, sprite
from scripts.lib.minify import minify_css

FONT_ROLES = [("display", "Jugni Display"), ("sans", "Jugni Sans"), ("mono", "Jugni Mono")]

# Icon names the sprite scanner cannot see, because they arrive as data rather
# than as literals in the source.
ALWAYS_INCLUDE_ICONS = {"circle-dot", "chevron-down", "chevron-left", "chevron-right"}


def read_css() -> str:
    """Files are numbered, so load order lives in the filenames rather than in
    a manifest that drifts out of date."""
    files = sorted(p for p in paths.CSS.glob("*.css") if p.is_file())
    if not files:
        raise SystemExit("error: no CSS found under src/css")
    print(f"  css:  {len(files)} files")
    return "\n".join(p.read_text(encoding="utf-8") for p in files)


def bundle_js(minify: bool) -> str:
    """esbuild resolves preact and htm through the symlink at /node_modules
    (see Dockerfile), so the repo stays free of a node_modules tree."""
    entry = paths.SRC / "app" / "main.js"
    if not entry.exists():
        raise SystemExit(f"error: entry point not found at {entry}")

    with tempfile.NamedTemporaryFile("r", suffix=".js", delete=False) as tmp:
        out_path = tmp.name

    cmd = [
        "esbuild", str(entry),
        "--bundle", "--format=iife", "--target=es2020",
        "--legal-comments=none", f"--outfile={out_path}",
    ]
    if minify:
        cmd.append("--minify")

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        Path(out_path).unlink(missing_ok=True)
        raise SystemExit(f"error: esbuild failed\n{result.stderr.strip()}")

    js = Path(out_path).read_text(encoding="utf-8")
    Path(out_path).unlink(missing_ok=True)

    modules = len(list((paths.SRC / "app").rglob("*.js")))
    print(f"  js:   {modules} modules bundled → {len(js) / 1024:.0f} KB")
    return js


def build_fonts() -> str:
    """Embed any .woff2 in src/fonts as base64 @font-face rules (spec §8).
    An empty folder is fine: the token stacks fall back to platform faces."""
    if not paths.FONTS.exists():
        return ""
    rules = []
    for font in sorted(paths.FONTS.glob("*.woff2")):
        stem = font.stem.lower()
        family = next((fam for key, fam in FONT_ROLES if key in stem), None)
        if not family:
            print(f"  !     skipping {font.name}: filename must contain display/sans/mono")
            continue
        weight = (re.search(r"-(\d{3})$", stem) or [None, "400"])[1]
        style = "italic" if "italic" in stem else "normal"
        b64 = base64.b64encode(font.read_bytes()).decode("ascii")
        rules.append(
            f"@font-face{{font-family:'{family}';font-weight:{weight};font-style:{style};"
            f"font-display:swap;src:url(data:font/woff2;base64,{b64}) format('woff2')}}")
        print(f"  font: {font.name} → {family} {weight}")
    return "".join(rules)


def load_json(path: Path | None):
    if not path or not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"error: {path} is not valid JSON — {exc}")


def strip_comments(doc):
    """default.json documents itself with $comment keys; they are for whoever
    edits the file, not for the 122 KB a traveller downloads."""
    if isinstance(doc, dict):
        return {k: strip_comments(v) for k, v in doc.items() if not k.startswith("$")}
    if isinstance(doc, list):
        return [strip_comments(v) for v in doc]
    return doc


def flags_for(trip) -> set[str]:
    """Only the trip's own countries are embedded. Including every vendored
    flag would add megabytes to a file whose whole point is being small enough
    to send over WhatsApp."""
    available = {p.stem for p in (paths.SRC / "icons" / "flags").glob("*.svg")}
    if not trip:
        return available          # empty shell: the manifest set is small
    wanted = set()
    for city in trip.get("cities") or []:
        code = str(city.get("countryCode") or "").lower()
        if code:
            wanted.add(code)
        else:
            name = str(city.get("country") or "").lower()
            wanted |= {c for c in available if COUNTRY_HINTS.get(name) == c}
    home = str(trip.get("trip", {}).get("homeCurrency") or "")[:2].lower()
    if home in available:
        wanted.add(home)
    return wanted & available or available


# Mirrors the table in src/app/lib/util.js. Kept small on purpose: a country
# the app cannot name is a country whose flag simply does not render.
COUNTRY_HINTS = {
    "australia": "au", "austria": "at", "belgium": "be", "croatia": "hr",
    "czechia": "cz", "czech republic": "cz", "denmark": "dk", "estonia": "ee",
    "finland": "fi", "france": "fr", "germany": "de", "greece": "gr",
    "hungary": "hu", "iceland": "is", "ireland": "ie", "italy": "it",
    "latvia": "lv", "lithuania": "lt", "netherlands": "nl", "norway": "no",
    "poland": "pl", "portugal": "pt", "romania": "ro", "serbia": "rs",
    "slovakia": "sk", "slovenia": "si", "spain": "es", "sweden": "se",
    "switzerland": "ch", "turkey": "tr", "türkiye": "tr", "turkiye": "tr",
    "united kingdom": "gb", "united states": "us",
}


def embed_json(data) -> str:
    """`</script>` inside embedded JSON would close the element early."""
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--trip", default="", help="trip slug under trips/")
    ap.add_argument("--name", default=paths.DEFAULT_INPUT,
                    help="which file under the trip's input/ to build "
                         "(default: default); ignored when --input is given")
    ap.add_argument("--input", default="", help="explicit path to a trip file (overrides --name)")
    ap.add_argument("--out", required=True, help="output .html path")
    ap.add_argument("--no-minify", action="store_true", help="readable output, for debugging")
    ap.add_argument("--host-dir", default="",
                    help="also write an installable web-app bundle here "
                         "(index.html + manifest + service worker + icons)")
    args = ap.parse_args()

    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = paths.ROOT / out_path

    # An explicit --input wins; otherwise the trip's own input/<name>.json.
    # Without either there is nothing to bake in, which is build path (b) in
    # spec §8 — the empty shell that imports a trip in-browser.
    if args.input or args.trip:
        input_path = paths.resolve_input(args.trip, args.name, args.input)
    else:
        input_path = None

    rel = out_path.relative_to(paths.ROOT) if out_path.is_relative_to(paths.ROOT) else out_path
    print(f"building {rel}")

    trip = load_json(input_path)
    if input_path and trip is None:
        shown = input_path.relative_to(paths.ROOT) if input_path.is_relative_to(paths.ROOT) else input_path
        print(f"  !     {shown} not found — building the empty shell instead")
    elif trip is not None and args.trip:
        shown = input_path.relative_to(paths.ROOT) if input_path.is_relative_to(paths.ROOT) else input_path
        print(f"  input:{shown}")

    defaults = strip_comments(load_json(paths.ROOT / "default.json") or {})

    css = read_css()
    js = bundle_js(minify=not args.no_minify)
    if not args.no_minify:
        css = minify_css(css)

    available_icons = {p.stem for p in (paths.SRC / "icons" / "lucide").glob("*.svg")}
    icon_names = sprite.referenced_icons(
        paths.SRC / "app",
        [json.dumps(defaults)],
        available_icons,
    ) | (ALWAYS_INCLUDE_ICONS & available_icons)
    sprite_markup, stats = sprite.build(
        paths.SRC / "icons", icon_names, flags_for(trip))
    print(f"  icons:{stats['icons']} symbols + {stats['flags']} flags "
          f"({len(sprite_markup) / 1024:.0f} KB)")
    if stats["missing_flags"]:
        print(f"  !     flags not vendored: {', '.join(stats['missing_flags'])} "
              f"— add them to src/icons/flags.txt and run `make icons`")

    name = (trip or {}).get("trip", {}).get("name") or "Jugni"

    # Identity of the data baked into this file. The app saves the trip to
    # localStorage and, by design, prefers that copy on reopen — otherwise
    # reopening would discard everything the traveller has done. But that also
    # means a REBUILT file silently shows the old saved trip: regenerate with
    # two new bookings, open it, and they are not there. Stamping the build
    # lets the app notice it is holding a copy from a different build and say
    # so, instead of quietly disagreeing with its own contents.
    build_id = hashlib.sha256(
        embed_json(trip).encode("utf-8")).hexdigest()[:12] if trip else ""

    # Which trip this file is, for the browser's storage. Every trip builds to
    # a file called jugni.html, and on one origin they all wrote to the same
    # localStorage key — so opening a second trip overwrote the first one's
    # ticked tasks and logged spend, silently.
    #
    # This must stay stable across rebuilds (or a regeneration would orphan the
    # traveller's edits) while differing between trips. The slug is both, and
    # is what the traveller already calls the trip. Without one, fall back to
    # the trip's own name and start date, which are stable for the same reason.
    trip_key = args.trip.strip() if args.trip.strip() else ""
    if not trip_key and trip:
        t = trip.get("trip", {})
        trip_key = hashlib.sha256(
            f"{t.get('name','')}|{t.get('startDate','')}".encode("utf-8")).hexdigest()[:12]

    template = (paths.TEMPLATES / "app.html").read_text(encoding="utf-8")
    html = (template
            .replace("{{BUILD_ID}}", build_id)
            .replace("{{TRIP_KEY}}", trip_key)
            .replace("{{TRIP_TITLE}}", f"{name} · Jugni" if name != "Jugni" else "Jugni")
            .replace("{{TRIP_DESCRIPTION}}",
                     "Your trip, in one place — checklist, cities, expenses, weather and guide.")
            .replace("{{STYLES}}", build_fonts() + css)
            .replace("{{SPRITE}}", sprite_markup)
            .replace("{{DEFAULTS}}", embed_json(defaults) if defaults else "")
            .replace("{{DATA}}", embed_json(trip) if trip else "")
            .replace("{{SCRIPTS}}", js))
    html = f'<!doctype html>\n<html lang="en">\n{html}\n</html>\n'

    out_path.parent.mkdir(parents=True, exist_ok=True)

    # The hosted copy is cut from the template BEFORE the portable one, while
    # the PWA slot is still open. Doing it the other way round replaced the
    # slot with "" and then had nothing left to inject — the bundle shipped
    # with no manifest link and looked fine until you tried to install it.
    # Opting in to hosting is explicit (`make host`), but staying in sync is
    # not optional: once a trip has a hosted/ bundle, every later `make build`
    # refreshes it. Leaving that to whoever remembers is how it went three
    # features stale — the file looked fine, it was just an older app.
    host_dir = None
    if args.host_dir:
        host_dir = Path(args.host_dir)
        if not host_dir.is_absolute():
            host_dir = paths.ROOT / host_dir
    elif (out_path.parent / "hosted" / "index.html").exists():
        host_dir = out_path.parent / "hosted"

    # Cut the hosted copy while the PWA slot is still open, but write it
    # *after* the portable file so its mtime is never behind — a staleness
    # check that has to allow a fudge factor is a staleness check that will
    # eventually miss something.
    hosted = None
    if host_dir:
        theme = (trip or {}).get("trip", {}).get("theme", "light")
        hosted = html.replace("{{PWA_HEAD}}", pwa.head_tags(name, theme))
        hosted = (hosted.replace("</body>", pwa.REGISTER + "\n</body>")
                  if "</body>" in hosted else hosted + pwa.REGISTER)

    # The portable file carries no manifest link: it would point at a sibling
    # that is not there, in the one artifact whose promise is self-containment.
    html = html.replace("{{PWA_HEAD}}", "")
    out_path.write_text(html, encoding="utf-8")

    if hosted is not None:
        theme = (trip or {}).get("trip", {}).get("theme", "light")
        written = pwa.write(host_dir, hosted, name, theme, build_id)
        rel_host = (host_dir.relative_to(paths.ROOT)
                    if host_dir.is_relative_to(paths.ROOT) else host_dir)
        print(f"  hosted:{rel_host}/ — {', '.join(written)}")

    kb = len(html.encode("utf-8")) / 1024
    print(f"  data: {'baked in (' + name + ')' if trip else 'empty shell — import in-browser'}")
    print(f"  done: {kb:.0f} KB, self-contained, no network needed to open")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
