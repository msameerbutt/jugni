"""Catch a base rule that silently cancels a media query.

`.topbar` is shown on phones by a rule inside `@media (max-width: 900px)`, and
hidden everywhere else by a base rule. Both are one class selector, so the
cascade decides on source order alone — and the base rule sat *after* the media
query, which meant the mobile header never rendered at any width. Share and
Trip data were unreachable on a phone for as long as that file has existed.

Nothing caught it. jsdom has no layout engine and applies no media queries, so
the smoke test counted the buttons in the DOM, found them, and passed. The only
coverage available for this is the stylesheet itself, which is what this reads.
"""

import re

def _skip_block(css: str, open_brace: int) -> int:
    """Index just past the `}` matching the `{` at `open_brace`."""
    depth = 0
    for i in range(open_brace, len(css)):
        if css[i] == "{":
            depth += 1
        elif css[i] == "}":
            depth -= 1
            if depth == 0:
                return i + 1
    return len(css)


def _blocks(css: str):
    """Yield (selector, body, offset, inside_media) for every plain rule.

    A character walk rather than a regex sweep: `@media` nests, and a pattern
    that ignores nesting treats every rule after the last media query as being
    inside it — which silently reports no problems at all.
    """
    i, n = 0, len(css)
    sel_start = 0
    media_end = []            # end offsets of the media blocks we are inside

    while i < n:
        # Leave any media block we have walked past.
        while media_end and i >= media_end[-1]:
            media_end.pop()

        ch = css[i]
        if ch == "{":
            sel = css[sel_start:i].strip()
            if sel.startswith("@media"):
                media_end.append(_skip_block(css, i))
                i += 1
                sel_start = i
                continue
            if sel.startswith("@"):
                # @keyframes, @font-face, @supports: their contents are not
                # rules whose display cascades against anything here.
                i = _skip_block(css, i)
                sel_start = i
                continue
            close = css.find("}", i)
            if close == -1:
                return
            if sel:
                yield sel, css[i + 1:close], sel_start, bool(media_end)
            i = close + 1
            sel_start = i
            continue

        if ch == "}":
            i += 1
            sel_start = i
            continue

        i += 1


def check(css: str) -> list[str]:
    """Return a list of problems, empty when the stylesheet is sound."""
    seen_in_media = {}     # selector -> offset of the media rule that sets display
    problems = []

    for sel, body, offset, in_media in _blocks(css):
        if not re.search(r"(^|;)\s*display\s*:", body):
            continue
        for one in (x.strip() for x in sel.split(",")):
            if not one:
                continue
            if in_media:
                seen_in_media.setdefault(one, offset)
            elif one in seen_in_media and offset > seen_in_media[one]:
                problems.append(
                    f"`{one}` has `display` set inside a media query, and again in a base "
                    f"rule further down the stylesheet. Same specificity, so the base rule "
                    f"wins everywhere and the media query does nothing. Move the base rule "
                    f"above the media query.")
    return problems
