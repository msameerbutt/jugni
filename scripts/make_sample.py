#!/usr/bin/env python3
"""`make sample` — rebuild trips/sample from the reference trip.

The sample is the only trip committed to git, so it is the only one that can be
read by anyone who clones the repo. Everything identifying in it is invented:
names, emails, phone numbers, street addresses, booking references, PINs.

The substitutions below are not the safety mechanism — the check at the end is.
It re-reads the finished file and refuses to write anything if a single string
from the real trip survived, because a table of replacements is exactly the
kind of thing that quietly misses a case (`\\b` does not fire inside
`trav_sameer`, which is how two ids escaped the first attempt).

Run this whenever the schema or the reference trip changes, so the committed
example never drifts behind the app that reads it.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.lib import paths

PEOPLE = {"Shahid Faiz": "Chris Lee", "Irfan Shehzad": "Priya Raman",
          "sameer": "alex", "Sameer": "Alex", "Usman": "Robin", "usman": "robin",
          "Adeel": "Jamie", "adeel": "jamie", "Irfan": "Priya", "irfan": "priya",
          "Shahid": "Chris", "shahid": "chris", "Faiz": "Lee",
          "Nazia": "Sam", "Wania": "Nina", "Alizeh": "Ada"}
EMAILS = {"msameerbutt@gmail.com": "alex@example.com",
          "shahid.faiz@gmail.com": "chris@example.com",
          "irfanizami@gmail.com": "priya@example.com"}
REFS = {"U3WZQ8": "AB1CD2", "ZREGIV": "EF3GH4", "ZDNF55": "IJ5KL6", "X2COYB": "MN7PQ8",
        "X2MQFC": "QR9ST0", "UK6GJV": "UV1WX2", "YRB9UQ": "YZ3AB4", "EGP2BY": "CD5EF6",
        "TG462": "XX101", "TG345": "XX102", "TG346": "XX103", "TG465": "XX104",
        "W62424": "XX201", "TK169": "XX105", "TK1721": "XX106", "TK1768": "XX107",
        "TK168": "XX108",
        "6289.331.528": "1000.000.001", "5482.379.914": "1000.000.002",
        "6868.971.283": "1000.000.003", "6765.554.324": "1000.000.004",
        "6528.203.695": "1000.000.005", "5140.804.835": "1000.000.006",
        "6028.943.547": "1000.000.007", "5960.720.955": "1000.000.008",
        "5653.373.206": "1000.000.009", "90368": "1000.000.010",
        "174182531": "3000000001", "632006693": "3000000002",
        "40-1041910251": "40-0000000000", "EXP-2500314047": "EXP-0000000000",
        "120303UC012621": "000000XX000000", "15824": "1000.000.011",
        "73488107021029": "70000000000000"}
PINS = ["7457", "0714", "9618", "8730", "1693", "9450", "4857", "8342", "7892", "2822"]
ADDRESSES = {
    "Immanuelkirchstr. 14 A, Pankow, 10405 Berlin, Germany": "12 Sample Street, Berlin, Germany",
    "27 Bernstorffsgade, 1577 Copenhagen, Denmark": "12 Sample Street, Copenhagen, Denmark",
    "Kobenhavngata, 0566 Oslo, Norway": "12 Sample Street, Oslo, Norway",
    "1053 Budapest, Szep utca 5, Hungary": "12 Sample Street, Budapest, Hungary",
    "Beingasse 13 Ecke Goldschlagstraße, 15. Rudolfsheim-Fünfhaus, 1150 Vienna, Austria":
        "12 Sample Street, Vienna, Austria",
    "4 Jakubská 4, Prague, 110 00, Czech Republic": "12 Sample Street, Prague, Czech Republic",
    "Fatih Mah. Sertap Sk. No:22 D:14, 34277 Arnavutköy, Istanbul, Turkey":
        "12 Sample Street, Istanbul, Turkey",
    "Campingvägen 3, 98135 Kiruna, Sweden": "12 Sample Street, Kiruna, Sweden",
    "98107 Abisko, Sweden": "12 Sample Street, Abisko, Sweden",
    "Linnankatu 9, 00160 Helsinki, Finland": "12 Sample Street, Helsinki, Finland"}

PHONE_RE = re.compile(r"\+\d[\d ()\-]{6,}\d")
SAFE_PHONE = "+00 000 000 000"


def scrub(raw: str) -> str:
    text = raw
    for table in (ADDRESSES, EMAILS, REFS):
        for old, new in sorted(table.items(), key=lambda kv: -len(kv[0])):
            text = text.replace(old, new)
    for pin in PINS:
        text = re.sub(rf"PIN(?: CODE)?:? {pin}\b", "PIN 0000", text)
    text = PHONE_RE.sub(SAFE_PHONE, text)
    # `_` counts as a word character, so `\b` never fires inside `trav_sameer`.
    # Letter lookarounds are what actually catch a name embedded in an id.
    for old, new in sorted(PEOPLE.items(), key=lambda kv: -len(kv[0])):
        text = re.sub(rf"(?<![A-Za-z]){re.escape(old)}(?![A-Za-z])", new, text)
    return text


def leaks_in(blob: str) -> list[str]:
    found = [o for table in (PEOPLE, EMAILS, REFS, ADDRESSES) for o in table if o in blob]
    found += [f"PIN {p}" for p in PINS if re.search(rf"PIN(?: CODE)?:? {p}\b", blob)]
    if PHONE_RE.search(blob.replace(SAFE_PHONE, "")):
        found.append("a phone number")
    return sorted(set(found))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--from", dest="source", default="euro2026",
                    help="trip slug to derive the sample from")
    args = ap.parse_args()

    src = paths.trip_input(args.source)
    if not src.exists():
        print(f"error: {src.relative_to(paths.ROOT)} does not exist")
        return 1

    doc = json.loads(scrub(src.read_text(encoding="utf-8")))
    doc["trip"]["name"] = "Sample Trip 2026"
    doc["trip"]["notes"] = (
        "A worked example, not a real trip: eleven stops from Melbourne to Prague over "
        "three weeks, with flights, stays, a checklist, expenses and a full destination "
        "guide. Every name, address, booking reference and phone number is invented. "
        "Use it to see what a finished Jugni looks like before building your own.")
    for city in doc["cities"]:
        for k in ("lat", "lon"):
            if isinstance(city.get(k), (int, float)):
                city[k] = round(city[k], 1)
    for coll in ("stays", "transport"):
        for rec in doc[coll]:
            if rec.get("sourceFile"):
                rec["sourceFile"] = "sample-booking.pdf"
    doc["log"] = []

    blob = json.dumps(doc, ensure_ascii=False)
    found = leaks_in(blob)
    if found:
        print(f"REFUSED — real data survived into the sample: {found}")
        print("  Nothing written. Add the missing case to this script and re-run.")
        return 1

    out = paths.trip_input("sample")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out.relative_to(paths.ROOT)} from {args.source}")
    print(f"  cities {len(doc['cities'])}  stays {len(doc['stays'])}  "
          f"transport {len(doc['transport'])}  checklist {len(doc['checklist'])}  "
          f"extras {len(doc['extras'])}")
    print("  checked: no name, email, address, reference, PIN or phone number survived")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
