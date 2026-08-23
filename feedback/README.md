# Feedback cycles

Every round of review on Jugni is kept here in full — what was asked, what was
decided, and what actually shipped. Nothing is edited in place and nothing is
deleted, so a decision can always be traced back to the sentence that caused it.

## Why keep all of it

A cycle's *original* text matters more than a tidied summary of it. Wording
carries priority and irritation that a paraphrase loses — "poorly designed" and
"could be better" are not the same instruction. When a later cycle contradicts
an earlier one, the record shows which way the decision moved and why, instead
of leaving a silent reversal in the code.

## Layout

```
feedback/
  README.md              this file — the index
  cycle-01/
    original.md          verbatim, exactly as received. Never edited.
    review.md            analysis: what each item means, questions, suggestions
    decisions.md         the answers, once given — one line per item
    changelog.md         what actually shipped, with verification evidence
  cycle-02/
    ...
```

`original.md` is immutable. If something in it turns out to be wrong or gets
withdrawn, that is recorded in `decisions.md` — the original still stands as
written.

## The process

1. **Receive** — the raw feedback lands as `cycle-NN/original.md`, untouched.
2. **Review** — every item is read and written up in `review.md`: what it
   means, what it touches, what it costs, and where it conflicts with the spec
   or with an earlier decision. Ambiguous items become questions; items with a
   clear best answer become recommendations.
3. **Ask before building.** Questions get asked and answered *before* any code
   changes. An item that could reasonably be read two ways does not get a
   coin-flip — it gets a question.
4. **Decide** — answers are recorded in `decisions.md`, one line per item, so
   the reasoning survives past the conversation that produced it.
5. **Implement and verify** — changes land, `make check` passes, and
   `changelog.md` records what shipped against each item, including anything
   deliberately not done and why.

## Cycles

| Cycle | Date | Items | Status |
|---|---|---|---|
| [cycle-01](cycle-01/) | 2026-08-23 | 17 | **Shipped** — 16 of 17 done; F10 deferred |
| [cycle-02](cycle-02/) | 2026-08-23 | 10 | **Shipped** — 9 of 10; F10 blocked on network access |

## Relationship to the spec

`docs/jugni-spec.md` stays the product's source of truth. Where feedback
contradicts it — cycle 01's colour request against spec §11, for instance — the
conflict is named explicitly in `review.md` rather than quietly resolved in
code. Confirmed changes of direction get written back into the spec so it does
not rot into a historical document.
