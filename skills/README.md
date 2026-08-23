# Skills

Instruction files for the agent. "Using Jugni" means talking to an agent that
has these loaded — not filling in a form against a schema (spec §2).

Every file opens with `name` / `description` frontmatter so an agent can decide
whether to read the whole thing. That is progressive disclosure, not decoration:
this library grows (more persona profiles, more formats), and it has to stay
usable inside a limited context window as it does.

| File | Read it when |
|---|---|
| `01-intake.md` | Starting a trip: asking questions, or reading a `raw/` folder, or accepting someone else's export |
| `02-convert.md` | Turning intake material into `input.json` |
| `03-persona-adapt.md` | Deciding what to ask and what to emphasise for this traveller |
| `04-persona-profiles.md` | The profile list itself |
| `05-quality-bar.md` | Before shipping any generated app — the "does this look professionally built" check |
| `06-skill-maintenance.md` | Proposing a change to any Skill in this folder |

One Skill, one concern. A Skill that grows a second unrelated job gets split.
