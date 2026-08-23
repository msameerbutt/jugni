# Fonts

Spec §8 requires fonts to be **embedded in the build output**, never fetched
from a CDN at runtime — a remote host is a server dependency the whole Phase 2
design exists to avoid, and it is what makes a trip file quietly break years
later.

Drop `.woff2` files here and `make build` base64-embeds them as `@font-face`
rules. The build maps them onto the three type roles from spec §11 by filename:

| Filename contains | Role                | Family name     |
|-------------------|---------------------|-----------------|
| `display`         | condensed grotesk   | `Jugni Display` |
| `sans`            | humanist sans, body | `Jugni Sans`    |
| `mono`            | ticket data         | `Jugni Mono`    |

Example: `display-600.woff2`, `sans-400.woff2`, `sans-600.woff2`, `mono-400.woff2`.
Weight is read from a trailing `-<number>`; anything else defaults to 400.

**No font files are checked in.** Jugni ships no fonts of its own, because
bundling a face into every generated trip file means redistributing it, and
that is a licence question per face rather than a blanket yes. Pick faces whose
licence permits embedding (most SIL OFL faces do), drop them in, rebuild.

With this folder empty the build is still correct and still offline-safe — the
token stacks in `src/css/01-tokens.css` fall through to the platform's own
condensed, humanist and monospace faces, which is a real fallback rather than a
broken one.
