"""The internal schema (spec §4), and a mechanical check against it.

The point of `make validate` is that schema drift gets caught here rather than
showing up as a broken screen in a generated app — so this checks shape, types,
cross-references and the data conventions the spec states explicitly (stable
IDs, ISO-8601 datetimes carrying a real UTC offset, confirmed-vs-candidate).
"""

import re

SCHEMA_VERSION = "1.3"

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$")
CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
COUNTRY_CODE_RE = re.compile(r"^[a-z]{2}$")

TRANSPORT_MODES = {"flight", "train", "ferry", "car", "bus", "other"}
TRAVELER_ROLES = {"primary", "companion"}
LOG_TYPES = {"task", "expense", "note"}
LOG_RELATED = {"checklist", "expense", "stay", "transport", "extra"}
DISPLAY_HINTS = {"list", "table", "text", "link", "auto"}

# field -> (required, kind). kind drives the format checks below.
COLLECTIONS = {
    "travelers": {
        "id": (True, "str"), "role": (True, "role"), "personaProfiles": (False, "list"),
        "nickname": (False, "str"), "email": (False, "str"), "age": (False, "num"),
    },
    "cities": {
        "id": (True, "str"), "name": (True, "str"), "country": (False, "str"),
        # 1.1: the flag lookup wants an unambiguous code, not a country name
        # spelled six different ways across booking platforms.
        "countryCode": (False, "countrycode"),
        "lat": (False, "num"), "lon": (False, "num"),
        "arriveDate": (False, "date"), "departDate": (False, "date"), "notes": (False, "str"),
    },
    "transport": {
        "id": (True, "str"), "mode": (True, "mode"), "from": (True, "str"), "to": (True, "str"),
        "departDateTime": (False, "datetime"), "arriveDateTime": (False, "datetime"),
        "bookingRef": (False, "str"), "cost": (False, "num"), "currency": (False, "currency"),
        "notes": (False, "str"),
        "homeAmount": (False, "num"), "homeCurrency": (False, "currency"),
        "rateSnapshotDate": (False, "date"), "sourceFile": (False, "str"),
    },
    "stays": {
        "id": (True, "str"), "cityId": (True, "ref:cities"), "name": (True, "str"),
        "address": (False, "str"), "checkIn": (False, "date_or_datetime"),
        "checkOut": (False, "date_or_datetime"), "confirmationNumber": (False, "str"),
        "cost": (False, "num"), "currency": (False, "currency"),
        "cancellationDeadline": (False, "date_or_datetime"), "notes": (False, "str"),
        "homeAmount": (False, "num"), "homeCurrency": (False, "currency"),
        "rateSnapshotDate": (False, "date"),
        # 1.3: the file this record was extracted from. Spec §12 wants the
        # pointer to exist; cycle 02 C4 wants it out of the way, so it is a
        # field the UI can collect in one place rather than prose in `notes`.
        "sourceFile": (False, "str"),
    },
    "checklist": {
        "id": (True, "str"), "task": (True, "str"), "category": (False, "str"),
        "cityId": (False, "ref:cities"), "dueDate": (False, "date"),
        "done": (False, "bool"), "completedDate": (False, "date"),
        # 1.1: marks an item instantiated from default.json, so deleting it
        # can be remembered rather than undone on the next load.
        "source": (False, "str"), "note": (False, "str"),
    },
    "expenses": {
        "id": (True, "str"), "label": (False, "str"), "category": (False, "str"),
        "amount": (True, "num"), "currency": (True, "currency"),
        "homeAmount": (False, "num"), "homeCurrency": (False, "currency"),
        "rateSnapshotDate": (False, "date"), "date": (False, "date"),
        "cityId": (False, "ref:cities"),
        # 1.1: set when this expense is the traveller's share of a group
        # booking, so the split is offered once and not twice.
        "relatedStayId": (False, "ref:stays"),
    },
    "destinationNotes": {
        "id": (True, "str"), "cityId": (False, "ref:cities"),
        "title": (True, "str"), "body": (False, "str"),
    },
    "log": {
        "id": (True, "str"), "date": (False, "date"), "relatedType": (False, "log_related"),
        "relatedId": (False, "str"), "type": (False, "log_type"), "text": (False, "str"),
    },
    "extras": {
        "id": (True, "str"), "cityId": (False, "ref:cities"), "title": (True, "str"),
        "displayHint": (False, "hint"), "content": (False, "str"),
        # 1.1: an extra with nowhere to go is a dead end. Links give the
        # reader something to do with the fact.
        "links": (False, "links"),
    },
}

TRIP_FIELDS = {
    "schemaVersion": (True, "str"), "name": (True, "str"),
    "startDate": (True, "date"), "endDate": (True, "date"),
    "homeCurrency": (True, "currency"), "budget": (False, "num"),
    "notes": (False, "str"), "theme": (False, "theme"),
    # 1.2: rates implied by the traveller's own booking documents, used only
    # when a live rate is unavailable — which, opened from file:// on patchy
    # wifi, is the normal case rather than the exception.
    "rateHints": (False, "ratehints"),
    "rateHintsDate": (False, "date"),
    "rateHintsSource": (False, "str"),
}


def empty_doc() -> dict:
    return {
        "trip": {
            "schemaVersion": SCHEMA_VERSION, "name": "", "startDate": "", "endDate": "",
            "homeCurrency": "", "budget": 0, "notes": "", "theme": "light",
        },
        **{key: [] for key in COLLECTIONS},
        "suppressed": [],
    }


def _check_value(kind, value, ids, errors, warnings, where):
    if value in ("", None):
        return
    if kind == "str" and not isinstance(value, str):
        errors.append(f"{where}: expected a string, got {type(value).__name__}")
    elif kind == "num":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            errors.append(f"{where}: expected a number, got {value!r}")
    elif kind == "bool" and not isinstance(value, bool):
        errors.append(f"{where}: expected true/false, got {value!r}")
    elif kind == "list" and not isinstance(value, list):
        errors.append(f"{where}: expected a list, got {type(value).__name__}")
    elif kind == "date" and not DATE_RE.match(str(value)):
        errors.append(f"{where}: '{value}' is not a YYYY-MM-DD date")
    elif kind == "datetime" and not DATETIME_RE.match(str(value)):
        # Spec §4: a bare local time on a 12-city multi-timezone trip is
        # exactly where "what timezone is this?" bugs come from.
        errors.append(f"{where}: '{value}' must be ISO-8601 with a UTC offset, "
                      f"e.g. 2026-09-13T15:20:00+02:00")
    elif kind == "date_or_datetime":
        s = str(value)
        if not (DATE_RE.match(s) or DATETIME_RE.match(s)):
            errors.append(f"{where}: '{value}' must be YYYY-MM-DD or ISO-8601 with a UTC offset")
    elif kind == "currency" and not CURRENCY_RE.match(str(value)):
        errors.append(f"{where}: '{value}' is not a 3-letter ISO currency code")
    elif kind == "countrycode" and not COUNTRY_CODE_RE.match(str(value)):
        errors.append(f"{where}: '{value}' is not a lowercase ISO 3166-1 alpha-2 code")
    elif kind == "ratehints":
        if not isinstance(value, dict):
            errors.append(f"{where}: expected an object of currency -> rate")
        else:
            for code, r in value.items():
                if not CURRENCY_RE.match(str(code)):
                    errors.append(f"{where}.{code}: not a 3-letter ISO currency code")
                elif not isinstance(r, (int, float)) or r <= 0:
                    errors.append(f"{where}.{code}: rate must be a positive number")
    elif kind == "links":
        if not isinstance(value, list):
            errors.append(f"{where}: expected a list of {{label, url}} objects")
        else:
            for i, link in enumerate(value):
                if not isinstance(link, dict) or not link.get("url"):
                    errors.append(f"{where}[{i}]: each link needs a url")
                elif not str(link["url"]).startswith(("http://", "https://")):
                    errors.append(f"{where}[{i}]: '{link['url']}' is not an http(s) URL")
    elif kind == "mode" and value not in TRANSPORT_MODES:
        errors.append(f"{where}: mode '{value}' not one of {sorted(TRANSPORT_MODES)}")
    elif kind == "role" and value not in TRAVELER_ROLES:
        errors.append(f"{where}: role '{value}' not one of {sorted(TRAVELER_ROLES)}")
    elif kind == "log_type" and value not in LOG_TYPES:
        errors.append(f"{where}: type '{value}' not one of {sorted(LOG_TYPES)}")
    elif kind == "log_related" and value not in LOG_RELATED:
        errors.append(f"{where}: relatedType '{value}' not one of {sorted(LOG_RELATED)}")
    elif kind == "hint" and value not in DISPLAY_HINTS:
        errors.append(f"{where}: displayHint '{value}' not one of {sorted(DISPLAY_HINTS)}")
    elif kind == "theme" and value not in {"light", "dark"}:
        errors.append(f"{where}: theme must be 'light' or 'dark'")
    elif kind.startswith("ref:"):
        target = kind.split(":", 1)[1]
        if value not in ids.get(target, set()):
            errors.append(f"{where}: points at {target} id '{value}', which does not exist")


def validate(doc) -> tuple[list[str], list[str]]:
    """Returns (errors, warnings). Errors block a build; warnings do not."""
    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(doc, dict):
        return ["top level must be a JSON object"], []

    trip = doc.get("trip")
    if not isinstance(trip, dict):
        return ["missing 'trip' object"], []

    for field, (required, kind) in TRIP_FIELDS.items():
        if required and not trip.get(field):
            errors.append(f"trip.{field} is required")
        _check_value(kind, trip.get(field), {}, errors, warnings, f"trip.{field}")

    if trip.get("schemaVersion") != SCHEMA_VERSION:
        warnings.append(
            f"trip.schemaVersion is '{trip.get('schemaVersion')}' but this tooling "
            f"writes '{SCHEMA_VERSION}' — a migration may be needed"
        )
    if trip.get("startDate") and trip.get("endDate") and trip["endDate"] < trip["startDate"]:
        errors.append("trip.endDate is before trip.startDate")

    if "suppressed" in doc:
        if not isinstance(doc["suppressed"], list):
            errors.append("'suppressed' must be a list of default ids")
        elif any(not isinstance(x, str) for x in doc["suppressed"]):
            errors.append("'suppressed' must contain only string ids")

    # Collect ids first so cross-references can be checked in one pass.
    ids: dict[str, set] = {}
    for key in COLLECTIONS:
        records = doc.get(key)
        if records is None:
            warnings.append(f"'{key}' is missing — treated as empty")
            continue
        if not isinstance(records, list):
            errors.append(f"'{key}' must be a list")
            continue
        seen = set()
        for i, rec in enumerate(records):
            if not isinstance(rec, dict):
                errors.append(f"{key}[{i}] must be an object")
                continue
            rid = rec.get("id")
            if not rid:
                errors.append(f"{key}[{i}] has no id — ids must be assigned once and stay stable")
            elif rid in seen:
                errors.append(f"{key}[{i}] duplicate id '{rid}' — cross-references need unique ids")
            else:
                seen.add(rid)
        ids[key] = seen

    for key, fields in COLLECTIONS.items():
        for i, rec in enumerate(doc.get(key) or []):
            if not isinstance(rec, dict):
                continue
            label = rec.get("id") or i
            for field, (required, kind) in fields.items():
                where = f"{key}[{label}].{field}"
                if required and rec.get(field) in ("", None):
                    errors.append(f"{where} is required")
                    continue
                _check_value(kind, rec.get(field), ids, errors, warnings, where)
            unknown = set(rec) - set(fields)
            if unknown:
                warnings.append(f"{key}[{label}] has fields not in the schema: {sorted(unknown)}")

    _semantic_warnings(doc, warnings)
    return errors, warnings


def _semantic_warnings(doc, warnings):
    """Things that are valid but almost always mean the raw data had a gap.
    Spec §4: incomplete raw data is normal — surface it, never invent a fix."""
    trip = doc.get("trip", {})
    cities = doc.get("cities") or []
    home = trip.get("homeCurrency")

    if not any((t.get("role") == "primary") for t in (doc.get("travelers") or [])):
        warnings.append("no traveler with role 'primary' — the itinerary has no owner")

    for city in cities:
        if city.get("lat") in (None, "") or city.get("lon") in (None, ""):
            warnings.append(f"city '{city.get('name')}' has no coordinates — no weather widget for it")
        if not city.get("arriveDate"):
            warnings.append(f"city '{city.get('name')}' has no arriveDate — it cannot be placed on the route")

    for city in cities:
        if not any(s.get("cityId") == city.get("id") for s in (doc.get("stays") or [])):
            warnings.append(f"city '{city.get('name')}' has no stay booked")

    for i in range(len(cities) - 1):
        a, b = cities[i], cities[i + 1]
        if a.get("departDate") and b.get("arriveDate"):
            if not any((t.get("departDateTime") or "")[:10] == a["departDate"][:10]
                       for t in (doc.get("transport") or [])):
                warnings.append(
                    f"no transport documented leaving {a.get('name')} on {a['departDate']} "
                    f"(next stop {b.get('name')})"
                )

    for exp in (doc.get("expenses") or []):
        if exp.get("currency") and home and exp["currency"] != home:
            if exp.get("homeAmount") in (None, ""):
                warnings.append(
                    f"expense '{exp.get('label') or exp.get('id')}' has no homeAmount — "
                    f"the app backfills it when next online"
                )
            elif not exp.get("rateSnapshotDate"):
                warnings.append(
                    f"expense '{exp.get('label') or exp.get('id')}' has a homeAmount with no "
                    f"rateSnapshotDate — the conversion is unattributable"
                )

    for stay in (doc.get("stays") or []):
        if not stay.get("confirmationNumber"):
            warnings.append(
                f"stay '{stay.get('name')}' has no confirmation number — if it was only a "
                f"candidate, it belongs in extras, not stays (spec §4)"
            )
