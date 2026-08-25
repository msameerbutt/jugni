"""Every booking becomes exactly one expense row, once.

The seeding runs on every build. If it were not idempotent, rebuilding a trip
would mint a second row for the same flight each time — and because the rows
carry real money, that silently doubles the traveller's total.
"""
from scripts.lib.seed_expenses import seed


def doc(**over):
    base = {
        "trip": {"homeCurrency": "AUD"},
        "cities": [
            {"id": "c_ber", "name": "Berlin"},
            {"id": "c_cph", "name": "Copenhagen"},
        ],
        "transport": [],
        "stays": [],
        "expenses": [],
    }
    base.update(over)
    return base


def test_a_leg_with_a_fare_becomes_an_expense():
    d = doc(transport=[{
        "id": "t1", "from": "Berlin Brandenburg (BER)", "to": "Copenhagen Kastrup (CPH)",
        "departDateTime": "2026-09-13T10:05:00+02:00", "cost": 1104, "currency": "AUD",
    }])
    assert seed(d) == 1
    e = d["expenses"][0]
    assert e["amount"] == 1104
    assert e["currency"] == "AUD"
    assert e["category"] == "transport"
    assert e["date"] == "2026-09-13"
    assert e["relatedTransportId"] == "t1"
    assert e["splitBetween"] == 1


def test_a_leg_with_no_fare_seeds_at_zero():
    """0 is a figure, not a blank. It is the whole point: the row exists,
    sits in the table, and asks to be filled in — rather than living in a
    warning panel with a bespoke button of its own."""
    d = doc(transport=[{"id": "t1", "from": "A", "to": "B"}])
    seed(d)
    assert d["expenses"][0]["amount"] == 0
    assert d["expenses"][0]["homeAmount"] == 0


def test_seeding_twice_adds_nothing():
    d = doc(transport=[{"id": "t1", "from": "A", "to": "B", "cost": 50}])
    assert seed(d) == 1
    assert seed(d) == 0
    assert len(d["expenses"]) == 1


def test_a_hand_edited_amount_survives_a_rebuild():
    """The traveller's own figure is not a default to be re-applied."""
    d = doc(transport=[{"id": "t1", "from": "A", "to": "B", "cost": 0}])
    seed(d)
    d["expenses"][0]["amount"] = 240
    d["expenses"][0]["label"] = "the airport train"
    seed(d)
    assert len(d["expenses"]) == 1
    assert d["expenses"][0]["amount"] == 240
    assert d["expenses"][0]["label"] == "the airport train"


def test_a_stay_divides_by_its_own_guests():
    """`guests` is a fact the document stated. Seeding 1 instead would post
    the whole room to a traveller who paid a fifth of it."""
    d = doc(stays=[{
        "id": "s1", "cityId": "c_ber", "name": "Hotel Transit Loft",
        "checkIn": "2026-09-11", "cost": 687, "currency": "AUD", "guests": 5,
    }])
    seed(d)
    e = d["expenses"][0]
    assert e["amount"] == 687          # what was charged
    assert e["splitBetween"] == 5
    assert e["homeAmount"] == 137.4    # what it cost you
    assert e["cityId"] == "c_ber"


def test_a_stay_with_no_guests_is_all_yours():
    d = doc(stays=[{"id": "s1", "cityId": "c_ber", "name": "Room", "cost": 100}])
    seed(d)
    assert d["expenses"][0]["splitBetween"] == 1
    assert d["expenses"][0]["homeAmount"] == 100


def test_a_foreign_charge_uses_the_snapshot_and_says_so():
    d = doc(stays=[{
        "id": "s1", "cityId": "c_cph", "name": "Next House", "cost": 2628,
        "currency": "DKK", "homeAmount": 576, "guests": 4,
    }])
    seed(d)
    e = d["expenses"][0]
    assert e["currency"] == "AUD"      # one trip, one currency
    assert e["amount"] == 576          # the home-currency figure
    assert "2,628.00 DKK" in e["note"]


def test_a_foreign_charge_with_no_snapshot_seeds_zero_rather_than_lying():
    """576 DKK is not 576 AUD. With no conversion recorded, 0 and a note is
    honest; carrying the number across unchanged is not."""
    d = doc(stays=[{"id": "s1", "cityId": "c_cph", "name": "Room",
                    "cost": 2628, "currency": "DKK"}])
    seed(d)
    e = d["expenses"][0]
    assert e["amount"] == 0
    assert "not recorded" in e["note"]


def test_a_legs_city_comes_from_where_it_lands():
    d = doc(transport=[{"id": "t1", "from": "Istanbul (IST)",
                        "to": "Berlin Brandenburg (BER) T1", "cost": 300}])
    seed(d)
    assert d["expenses"][0]["cityId"] == "c_ber"


def test_a_leg_landing_nowhere_known_gets_no_city():
    """A fare filed under the wrong stop is worse than one filed under none —
    the destination page totals it."""
    d = doc(transport=[{"id": "t1", "from": "Berlin", "to": "Melbourne (MEL)", "cost": 900}])
    seed(d)
    assert d["expenses"][0]["cityId"] == ""


def test_ids_never_collide_with_an_existing_expense():
    d = doc(transport=[{"id": "t1", "from": "A", "to": "B", "cost": 10}],
            expenses=[{"id": "exp_t1", "amount": 5, "label": "unrelated"}])
    seed(d)
    ids = [e["id"] for e in d["expenses"]]
    assert len(ids) == len(set(ids))
    assert len(d["expenses"]) == 2


def test_an_empty_trip_is_left_alone():
    d = doc()
    assert seed(d) == 0
    assert d["expenses"] == []
