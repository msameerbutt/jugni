---
name: jugni-persona-adapt
description: Decide which follow-up questions to ask and what to emphasise on the destination pages, based on the traveller's need profiles rather than any assumption about who they are. Read during Intake and again before writing destinationNotes.
---

# Persona-adapt

Profiles are **needs**, not identities. Ask which apply; never infer them from
who someone appears to be. A trip can combine several — budget + adventure is a
normal pairing — and so can a single traveller, which is why
`travelers[].personaProfiles` is an array.

The list lives in `04-persona-profiles.md`.

## How to ask

Offer the list, plainly, once:

> Which of these fit this trip? Pick as many as apply — they change what I ask
> about and what I put on the destination pages.

Do not interrogate further. If they pick none, use the general set and move on.

## What a profile actually changes

Two things, and only two:

1. **Which follow-up questions you ask during Intake.**
2. **What gets emphasised in `destinationNotes` and `checklist`.**

A profile never changes the schema, never hides a screen, and never overrides
something the traveller told you directly.

## Worked example

*Budget/backpacker + Adventure/outdoor + Nightlife-focused* — the profile set
confirmed for the reference trip (spec §10):

**Extra questions:** Hostel or private room preference? Rail pass or per-leg
tickets? Any hikes or permits that need booking ahead? Comfortable being out
late alone?

**Destination notes to pre-fill:** cost-per-day norms and cheap-eats districts;
transit passes and whether they beat single tickets; left-luggage options;
trailheads reachable by public transport, and permit/season rules; late-night
transport — last train, night bus, whether taxis need an app; which districts
are lively versus which are quiet after dark.

**Checklist emphasis:** book permits early; pack for the actual weather (the app
cross-references packing items against the live forecast); pre-book the legs
where walk-up prices spike.

Note what this set does *not* produce: no luxury-lounge notes, no kid-pacing
warnings. That is the profile doing its job.

## The rule that matters

If a profile's implication conflicts with something the traveller said, the
traveller wins. The profile is a prior, not a verdict.
