#!/usr/bin/env python3
"""`make check` — verify a built file rather than assuming it.

Three things, all of which have actually broken builds of this kind before:
the minified JS no longer parses; something references a remote asset, which
breaks the offline promise (spec §8); or a template placeholder survived into
the output.
"""

import argparse
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib import paths

# Endpoints the live widgets are *supposed* to call at runtime (spec §8).
ALLOWED_HOSTS = {
    "api.open-meteo.com",
    "api.frankfurter.app",
    "restcountries.com",
    "www.w3.org",          # inline SVG namespace, not a fetch
}

ASSET_ATTR_RE = re.compile(r'(?:src|href)\s*=\s*["\'](https?:)?//([^/"\']+)', re.I)
CSS_URL_RE = re.compile(r'url\(\s*["\']?(https?:)?//([^)"\']+)', re.I)
PLACEHOLDER_RE = re.compile(r"\{\{[A-Z_]+\}\}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--file", required=True)
    args = ap.parse_args()

    path = Path(args.file)
    if not path.is_absolute():
        path = paths.ROOT / path
    if not path.exists():
        print(f"check: no file at {args.file} — run `make build` first")
        return 1

    html = path.read_text(encoding="utf-8")
    rel = path.relative_to(paths.ROOT) if path.is_relative_to(paths.ROOT) else path
    print(f"check {rel}  ({len(html.encode('utf-8')) / 1024:.0f} KB)")
    failures = []

    # --- 1. does the bundled JS actually parse? ---
    scripts = re.findall(r"<script>(.*?)</script>", html, re.S)
    if not scripts:
        failures.append("no <script> block in the output")
    for i, body in enumerate(scripts):
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as tmp:
            tmp.write(body)
            tmp_path = tmp.name
        result = subprocess.run(["node", "--check", tmp_path], capture_output=True, text=True)
        Path(tmp_path).unlink()
        if result.returncode != 0:
            failures.append(f"script block {i} does not parse:\n{result.stderr.strip()}")
        else:
            print(f"  ok    javascript parses ({len(body) / 1024:.0f} KB)")

    # --- 2. offline promise: nothing remote may be needed to render ---
    remote = set()
    for match in ASSET_ATTR_RE.finditer(html):
        remote.add(match.group(2).split("/")[0])
    for match in CSS_URL_RE.finditer(html):
        remote.add(match.group(2).split("/")[0])
    offenders = sorted(host for host in remote if host not in ALLOWED_HOSTS)
    if offenders:
        failures.append(f"remote assets referenced — breaks the offline promise: {offenders}")
    else:
        print(f"  ok    no remote assets (fonts, css and js are inlined)")

    called = sorted(h for h in re.findall(r"https?://([a-z0-9.\-]+)", html, re.I) if h in ALLOWED_HOSTS)
    print(f"  info  runtime API hosts: {', '.join(sorted(set(called))) or 'none'}")

    # --- 3. no template placeholder survived ---
    leftover = set(PLACEHOLDER_RE.findall(html))
    if leftover:
        failures.append(f"unreplaced template placeholders: {sorted(leftover)}")
    else:
        print("  ok    no unreplaced placeholders")

    if "<html" not in html.lower() or "id=\"app\"" not in html:
        failures.append("output is missing the html shell or the #app mount point")

    # --- 4. does it actually run? ---
    smoke = subprocess.run(
        ["node", str(paths.ROOT / "scripts" / "smoke.js"), str(path)],
        capture_output=True, text=True,
    )
    print(smoke.stdout.rstrip())
    if smoke.returncode != 0:
        failures.append("smoke test failed" + (f"\n{smoke.stderr.strip()}" if smoke.stderr.strip() else ""))

    if failures:
        print()
        for f in failures:
            print(f"  FAIL  {f}")
        return 1
    print("\nOK — self-contained, parses, ready to open from file://")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
