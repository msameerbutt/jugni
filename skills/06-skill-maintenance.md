---
name: jugni-skill-maintenance
description: The propose-review-lock process for changing any Skill in this folder, and the privacy boundary on the data those proposals may be mined from. Read before editing any file in skills/.
---

# Skill maintenance

## Skills are not self-editing

An agent may **research and propose** an update. A human Engineer reviews it and
**locks** it. Same process for every Skill in this folder — no per-skill
exceptions, including the persona list.

## Proposing

Open a proposal that states:

1. **What changed in the world** — with a source, not a recollection.
2. **The evidence** — which real trips or `input.json` files show the pattern,
   how many, and what specifically went wrong without the change.
3. **The exact diff.**
4. **The blast radius** — which already-generated trips this affects, and
   whether they need `make update`.

Do not edit a Skill file directly and mention it afterwards.

## Reviewing and locking

The Engineer checks the evidence is real, the change does not contradict a
`CONFIRMED` decision in the spec without saying so explicitly, and that it does
not grow a Skill past its one concern. Once approved, the change lands and
`make update` picks it up per trip.

## Privacy boundary on the evidence

Jugni stores exactly three identity fields: **email, nickname, age.** A
nickname rather than a legal name, deliberately — it also doubles as the export
filename component (spec §8).

**Keep account fields in a separate record from anything pattern-mining reads.**
Patterns get computed on travel data — checklists, expenses, destinations, the
log — without identity attached per record. Build it this way now rather than
retrofitting it in Phase 3.

Age needs particular care once companions can include children. Treat it as
sensitive even though it is on the minimal-field list.

Never quote a real traveller's data in a proposal. Describe the pattern:
*"across 4 trips, cancellation deadlines were missed when the deadline had a
time as well as a date"* — not the booking.

## Splitting

A Skill that has grown a second unrelated behaviour gets split into two files,
not left to sprawl. An agent should be able to load the one relevant piece for
a task rather than reading everything to find one instruction. That property is
what keeps this library usable as it grows.
