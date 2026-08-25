"""Every booking is an expense.

A flight, a hotel room and a coffee are the same kind of thing to a traveller
keeping track of money: something that cost something. The app used to disagree
— bookings lived in `stays[]`/`transport[]` with a `cost` field and were drawn
by a different component, behind a different form, with buttons ("Add the
price", "Add my share") that existed nowhere else. Three shapes of money on one
screen, and a total that came from only one of them.

So every booking gets a real `expenses[]` row, seeded here at build time:

- **Real, not generated.** It is written into the baked data, so it exports,
  it shares, it can be deleted, and a deletion sticks. A row conjured at render
  time would come back every reload and could never be got rid of.
- **0 is a legitimate amount.** A booking whose document never stated a fare
  seeds at 0 and sits in the table asking to be filled in. That is the whole
  point of "an expense with no figure yet is still an expense": one entity, one
  form, one row, whether or not anybody has looked the number up.
- **Minted once.** The id is derived from the booking's id, so rebuilding does
  not mint a second row for the same flight (spec §4: ids are never reminted).
  A row that already links to the booking is left completely alone — including
  its amount, which the traveller may well have corrected by hand.
"""

from .schema import SCHEMA_VERSION  # noqa: F401  (import asserts the module pairs with the schema)


def _day(value):
    """The date part of an ISO datetime, or "" — expenses are day-resolution."""
    return str(value or "")[:10]


def _num(value):
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n


def _city_for_leg(doc, leg):
    """Which stop a leg's fare belongs to: where it lands.

    Matched on the city name appearing in the arrival string, because a leg
    says "Berlin Brandenburg (BER) T1" and the city says "Berlin". No match
    means no city, which is honest — a fare filed under the wrong stop is
    worse than one filed under none, since the destination page totals it.
    """
    to = str(leg.get("to") or "").lower()
    if not to:
        return ""
    best = ""
    for city in doc.get("cities", []):
        name = str(city.get("name") or "").split("(")[0].strip().lower()
        if name and name in to:
            # Longest match wins, so "Berlin" does not claim a leg into
            # somewhere that merely contains it as a substring.
            if not best or len(name) > len(best[1]):
                best = (city.get("id", ""), name)
    return best[0] if best else ""


def _home_amount(rec, home):
    """What the booking cost, in the trip's currency.

    A document may price a room in the currency the property charged. The app
    displays one currency, so bring across the snapshotted home figure when
    there is one; when there is not, and the charge was foreign, seed 0 rather
    than passing a Danish krone figure off as Australian dollars.
    """
    cost = _num(rec.get("cost"))
    currency = rec.get("currency") or home
    if cost is None:
        return 0.0, ""
    if currency == home:
        return cost, ""
    snapshot = _num(rec.get("homeAmount"))
    charged = f"Charged {cost:,.2f} {currency}"
    if snapshot is not None:
        return snapshot, charged
    return 0.0, f"{charged} — home-currency figure not recorded"


def seed(doc: dict) -> int:
    """Add the missing booking expenses in place. Returns how many were added."""
    expenses = doc.setdefault("expenses", [])
    home = doc.get("trip", {}).get("homeCurrency", "") or ""

    linked_transport = {e.get("relatedTransportId") for e in expenses}
    linked_stays = {e.get("relatedStayId") for e in expenses}
    taken_ids = {e.get("id") for e in expenses}
    added = 0

    def new_id(booking_id):
        base = f"exp_{booking_id}"
        candidate, n = base, 2
        while candidate in taken_ids:
            candidate, n = f"{base}_{n}", n + 1
        taken_ids.add(candidate)
        return candidate

    for leg in doc.get("transport", []):
        if leg.get("id") in linked_transport:
            continue
        amount, note = _home_amount(leg, home)
        expenses.append({
            "id": new_id(leg["id"]),
            "label": f"{leg.get('from') or '?'} → {leg.get('to') or '?'}",
            "category": "transport",
            "amount": round(amount, 2),
            "currency": home,
            "homeAmount": round(amount, 2),
            "homeCurrency": home,
            "rateSnapshotDate": _day(leg.get("departDateTime")),
            "date": _day(leg.get("departDateTime")),
            "cityId": _city_for_leg(doc, leg),
            # A leg is normally priced per person. A shared one is a claim
            # about who paid, and only the traveller can make it — on the
            # form, where "Whose cost" lives.
            "splitBetween": 1,
            "note": note,
            "relatedTransportId": leg["id"],
        })
        added += 1

    for stay in doc.get("stays", []):
        if stay.get("id") in linked_stays:
            continue
        amount, note = _home_amount(stay, home)
        # `guests` is a fact the document stated, not a guess: a room booked
        # for two out of a party of five divides by two. Seeding 1 instead
        # would post the whole room to the traveller's budget.
        guests = _num(stay.get("guests")) or 1
        expenses.append({
            "id": new_id(stay["id"]),
            "label": stay.get("name") or "Stay",
            "category": "stay",
            "amount": round(amount, 2),
            "currency": home,
            "homeAmount": round(amount / max(1, int(guests)), 2),
            "homeCurrency": home,
            "rateSnapshotDate": _day(stay.get("checkIn")),
            "date": _day(stay.get("checkIn")),
            "cityId": stay.get("cityId") or "",
            "splitBetween": max(1, int(guests)),
            "note": note,
            "relatedStayId": stay["id"],
        })
        added += 1

    return added
