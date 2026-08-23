# Cycle 02 — review

**Received:** 2026-08-23 · **Items:** 10 · **Status:** awaiting decisions

Keys C1–C10 match the original's own numbering, which is clean this time.

| Key | Item | Verdict |
|---|---|---|
| C1 | Today boxes should match checklist style, different colour | Agreed — and it exposes a rule violation of mine |
| C2 | Date switching before the trip starts | Confirmed bug, clear fix |
| C3 | Reset to build-stage data, in Trip data, with confirmation | Partly exists, mislabelled — needs a decision |
| C4 | Stop showing "source:" everywhere; collect it in Trip data | Agreed — schema addition |
| C5 | Ticket with no price → flag it in red | Agreed on intent; I'd implement it differently |
| C6 | Group "due soon" by day, collapsible, hide empty days | Agreed, clear |
| C7 | Remove group cost estimates from the trip-wide guide | Agreed, one record |
| C8 | Must-try food should be per city | Agreed, splits into 4 |
| C9 | Trip-wide guide maybe not needed at all | Needs a decision |
| C10 | "Destination" instead of "City"; the page should cover all | Needs a decision — biggest item |

---

## C1 — Today's boxes

Agreed, and checking this found a rule I broke in cycle 01. Cycle 01 established
that categorical hues carry screen identity and **semantic** colours (brass,
transit-blue, rust) state facts and are never decorative. I then gave Today the
accent `brass` — a semantic colour — so Today's section rules and icons are
tinted with the same gold that means "done" everywhere else. That is exactly the
confusion the two-palette rule exists to prevent.

So Today needs its own categorical hue. The unused one is **clay**; I would
retune it browner so it cannot be confused with rust, which is alert-only and
always carries an icon and a word.

On "match the checklist style": the checklist reads as sectioned cards of rows
with a category accent, while Today is a bespoke hero block. I'd rebuild
Today's blocks on the same section-and-rows pattern so the two screens feel
like one app. See the questions — there is a version of this that keeps Today
feeling like a landing screen and a version that makes it uniform, and they
look quite different.

## C2 — Date switching before the trip starts

Confirmed bug, and the cause is a bad condition I wrote:

```js
phase === 'before' && viewDate === todayISO()   // Upcoming
```

So today (23 Aug, trip starts 9 Sep) shows "Departs in 17 days", but picking
24 Aug falls through to the day view and reports "Outside the trip dates" —
useless, and it looks broken.

**Fix:** the comparison should be against the trip's start date, not against
today. Any date **before** `startDate` shows Upcoming; `startDate` and after
show that day's events. Your example has the 10th as the start, so the 10th
shows Day 1 and the 11th shows Day 2 — I read "once I go to 11th" as describing
the pattern rather than excluding the 10th. Say if you meant otherwise.

## C3 — Reset to the built version

Half of this exists but is described badly. Trip data currently has *"Clear
this trip from the browser"*, which removes local state and reloads — and
because your file has the trip baked in, reloading restores the built version.
So it already does what you want, while sounding like it deletes your trip.

Two genuinely different actions are hiding under one button, and they should be
separated. See the questions.

## C4 — Stop repeating the source filename

Agreed. `source: Berlin_ Confirmation.pdf` is currently appended to `notes`, so
it shows up under every leg and stay. Spec §12 wants that pointer to exist —
at a check-in desk you need to know which file to open — but it does not need
to be on screen constantly.

**Proposed:** promote it out of free text into a real field, `sourceFile` on
`stays[]` and `transport[]` (schema 1.3), strip it from the displayed notes,
and collect every record's source in one collapsible **Source documents**
section under Trip data. The data stays; the noise goes. Your trip has 13
records carrying a source filename.

## C5 — Tickets with no price

Right problem. Six confirmed bookings have no cost recorded:

| Record | Ref |
|---|---|
| Melbourne → Istanbul | U3WZQ8 |
| Istanbul → Berlin | U3WZQ8 |
| Copenhagen → Oslo | ZDNF55 |
| Prague → Istanbul | U3WZQ8 |
| Istanbul → Melbourne | U3WZQ8 |
| Bunks at Rode (Oslo stay) | 90368 |

Those are real gaps — the Turkish Airlines ticket never states a fare, and the
Oslo booking was made by Usman.

**I'd push back on one detail.** Creating an actual `AUD 0.00` expense record
means your expense list grows six fake rows, "6 entries" becomes a lie, and the
category chart gains a zero slice. The reminder is right; the fake record is
the part I'd avoid.

**Proposed instead:** a **Missing prices** block, in rust, on Expenses and on
the relevant city page — "6 bookings have no price recorded" — each with a
one-tap *Add the price* that writes a real expense once you know the number.
Same red nudge, no invented data. Your "or something similar" suggests this is
in the spirit of what you meant, but say if you want literal zero rows.

## C6 — Group "due soon" by day

Clear and agreed. From the selected date forward: group by due date, one
collapsible per day, days with nothing are not rendered, and the labels are
relative to what you have selected — *Today*, *Tomorrow*, then the weekday and
date. Selecting the 4th makes the 4th "Today" and the 5th "Tomorrow", exactly
as you describe.

Two details I will apply unless told otherwise: the first day with tasks opens
by default and the rest start collapsed, and anything overdue stays in its own
block above rather than being folded away — hiding an overdue item inside a
collapsed day is the failure mode cycle 01 already ruled against.

## C7 — Remove the group cost estimates

Agreed. One record, `extra_group_totals`. Deleting it loses nothing: the
individual-versus-group split it described is already the Budget figure, and
the per-booking group totals are shown on each stay.

## C8 — Must-try food per city

Agreed. `extra_food` currently covers Germany, Norway, Sweden and Denmark in
one trip-wide card. It splits cleanly into four city records — Berlin,
Oslo, Kiruna/Abisko, Copenhagen — which is also where you would actually read
it.

## C9 — Does the trip-wide guide need to exist?

After C7 and C8 your trip-wide section holds only:

- **September climate averages** — belongs on Weather, or per city
- **Warsaw hotels shortlisted but not booked** — Warsaw is not on your route;
  this is a research leftover, not a guide entry
- **Tipping norms** — genuinely per country, so it splits per city

So for this trip the section empties out naturally. The open question is
whether to delete the *concept*. See the questions.

## C10 — "Destination" instead of "City"

You are right that "Destination" is the better word, and "Kiruna / Abisko" in
your own trip proves the point: that is one stop covering two places, and
calling it a city is already slightly false. The same applies to
"Helsinki + Tallinn day trip".

But the more interesting half of your sentence is *"should cover all"*. There
are currently **two** screens covering the same ground:

- **Cities** — list, then a detail page with stay, transport, tasks, notes,
  extras, spending
- **Guide** — a city switcher, country facts, the same notes, the same extras

The Guide screen is close to a duplicate of the detail page's lower half. That
is probably why the trip-wide section felt out of place in C9, and why C8's
food card felt homeless. Merging them into one **Destinations** screen would
resolve C8, C9 and C10 together and remove a screen from the nav.

That is a real information-architecture change, so it is the first question.

---

## Ordering, if the answers land as recommended

1. **C10 + C9 + C8** — the Destinations merge, since it decides where content lives
2. **C2** — the date bug, small and user-visible
3. **C1 + C6** — Today's rebuild, both touching the same screen
4. **C4 + C5** — source documents and missing prices, both Trip-data-adjacent
5. **C3, C7** — reset and the deletion

Everything verified with `make check` between steps.
