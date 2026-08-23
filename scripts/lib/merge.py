"""Non-destructive merge for `make generate` (spec §2).

The rule the spec states, and the reason it exists: once a traveller has hand-
edited input.json, re-running generate must not silently throw that away — and
it must not silently ignore newer raw data either. So: new records are added,
conflicts are reported and left alone, and a record the raw data no longer
shows is flagged for removal rather than auto-deleted.
"""

from .schema import COLLECTIONS

# Fields the running app owns. A regenerated candidate never overwrites them:
# the raw booking PDF does not know whether you ticked the task off.
USER_OWNED = {
    "checklist": {"done", "completedDate"},
    "expenses": {"homeAmount", "homeCurrency", "rateSnapshotDate"},
    "trip": {"theme"},
}


def merge(existing: dict, candidate: dict) -> tuple[dict, list[str], list[str]]:
    """Returns (merged, conflicts, notes). Conflicts are never auto-resolved."""
    merged = {k: v for k, v in existing.items()}
    conflicts: list[str] = []
    notes: list[str] = []

    # --- trip block ---
    trip = dict(existing.get("trip") or {})
    for field, new in (candidate.get("trip") or {}).items():
        old = trip.get(field)
        if field in USER_OWNED["trip"]:
            continue
        if old in ("", None, 0) and new not in ("", None):
            trip[field] = new
            notes.append(f"trip.{field}: filled in from raw data ({new!r})")
        elif new not in ("", None) and old != new:
            conflicts.append(f"trip.{field}: kept {old!r}, raw data says {new!r}")
    merged["trip"] = trip

    # --- collections ---
    for key in COLLECTIONS:
        old_list = list(existing.get(key) or [])
        new_list = list(candidate.get(key) or [])
        by_id = {r.get("id"): r for r in old_list if r.get("id")}
        protected = USER_OWNED.get(key, set())

        for new_rec in new_list:
            rid = new_rec.get("id")
            match = by_id.get(rid) or _match_by_content(key, new_rec, old_list)
            if match is None:
                old_list.append(new_rec)
                notes.append(f"{key}: added '{_label(new_rec)}'")
                continue
            # IDs are stable across regenerations (spec §4) — the existing one wins.
            for field, new_value in new_rec.items():
                if field in {"id"} or field in protected:
                    continue
                old_value = match.get(field)
                if old_value in ("", None, 0, False) and new_value not in ("", None):
                    match[field] = new_value
                    notes.append(f"{key}[{_label(match)}].{field}: filled in ({new_value!r})")
                elif new_value not in ("", None) and old_value != new_value:
                    conflicts.append(
                        f"{key}[{_label(match)}].{field}: kept {old_value!r}, "
                        f"raw data says {new_value!r}"
                    )

        # Records the raw data no longer shows: flagged, never auto-deleted.
        new_ids = {r.get("id") for r in new_list}
        if new_list:
            for old_rec in old_list:
                if old_rec.get("id") not in new_ids and not _match_by_content(key, old_rec, new_list):
                    conflicts.append(
                        f"{key}[{_label(old_rec)}]: no longer present in the raw data "
                        f"(cancelled?) — kept, remove it yourself if that's right"
                    )
        merged[key] = old_list

    return merged, conflicts, notes


def _label(rec: dict) -> str:
    for field in ("name", "task", "label", "title", "bookingRef", "id"):
        if rec.get(field):
            return str(rec[field])
    return "?"


def _match_by_content(key: str, rec: dict, pool: list[dict]):
    """A regenerated record usually has a fresh id. Match on the fields that
    actually identify the thing so a re-run does not duplicate every booking."""
    keys = {
        "cities": ("name",),
        "stays": ("name", "checkIn"),
        "transport": ("mode", "from", "to", "departDateTime"),
        "travelers": ("email",),
        "checklist": ("task",),
        "expenses": ("label", "date", "amount"),
        "destinationNotes": ("cityId", "title"),
        "extras": ("cityId", "title"),
    }.get(key)
    if not keys:
        return None
    signature = tuple(str(rec.get(k, "")).strip().lower() for k in keys)
    if not any(signature):
        return None
    for other in pool:
        if tuple(str(other.get(k, "")).strip().lower() for k in keys) == signature:
            return other
    return None
