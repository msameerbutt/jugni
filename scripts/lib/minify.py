"""Conservative minifiers.

`make build` has one job that matters more than byte count: produce a file
that still works, offline, years from now. So these strip comments and
collapse whitespace and stop there — no renaming, no expression rewriting, no
newline removal (which is where naive JS minifiers meet automatic semicolon
insertion and lose). Both are state machines rather than regexes, because
regexes cannot tell a comment from the same characters inside a string.
"""

import re

_JS_REGEX_PRECEDERS = set("(,=:[!&|?{};+-*%~^<>")
_JS_KEYWORD_PRECEDERS = {
    "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
    "throw", "case", "do", "else", "yield", "await",
}


def minify_js(src: str) -> str:
    out = []
    i, n = 0, len(src)
    last_sig = ""          # last significant character emitted
    last_word = ""         # last identifier/keyword emitted

    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""

        # --- comments ---
        if c == "/" and nxt == "/":
            i = src.find("\n", i)
            if i == -1:
                break
            continue
        if c == "/" and nxt == "*":
            end = src.find("*/", i + 2)
            i = n if end == -1 else end + 2
            continue

        # --- strings and template literals ---
        if c in "\"'`":
            quote = c
            j = i + 1
            while j < n:
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == quote:
                    break
                j += 1
            chunk = src[i:j + 1]
            out.append(chunk)
            last_sig = quote
            last_word = ""
            i = j + 1
            continue

        # --- regex literal (only where a regex can legally begin) ---
        if c == "/":
            starts_regex = (
                last_sig == "" or last_sig in _JS_REGEX_PRECEDERS
                or last_word in _JS_KEYWORD_PRECEDERS
            )
            if starts_regex:
                j = i + 1
                in_class = False
                while j < n:
                    ch = src[j]
                    if ch == "\\":
                        j += 2
                        continue
                    if ch == "[":
                        in_class = True
                    elif ch == "]":
                        in_class = False
                    elif ch == "/" and not in_class:
                        break
                    elif ch == "\n":
                        break
                    j += 1
                while j + 1 < n and src[j + 1].isalpha():   # flags
                    j += 1
                out.append(src[i:j + 1])
                last_sig = "/"
                last_word = ""
                i = j + 1
                continue

        # --- whitespace ---
        if c in " \t\r\n":
            j = i
            has_newline = False
            while j < n and src[j] in " \t\r\n":
                has_newline = has_newline or src[j] == "\n"
                j += 1
            nxt_c = src[j] if j < n else ""
            # Keep one newline where ASI could matter; otherwise one space,
            # and nothing at all next to punctuation.
            if has_newline and _js_needs_break(last_sig, nxt_c):
                out.append("\n")
                last_sig = "\n"
            elif _js_needs_space(last_sig, nxt_c):
                out.append(" ")
            i = j
            continue

        out.append(c)
        if c.isalnum() or c in "_$":
            last_word = (last_word + c) if (last_word or c.isalpha() or c in "_$") else ""
        else:
            last_word = ""
        last_sig = c
        i += 1

    return "".join(out).strip()


def _js_needs_space(prev: str, nxt: str) -> bool:
    if not prev or not nxt:
        return False
    ident = lambda ch: ch.isalnum() or ch in "_$"
    if ident(prev) and ident(nxt):
        return True
    # `a + +b`, `a - -b`, `i++ +x` must not fuse into `++`/`--`.
    if prev in "+-" and nxt == prev:
        return True
    return False


def _js_needs_break(prev: str, nxt: str) -> bool:
    """Keep a newline only where dropping it could change parsing."""
    if not prev or not nxt:
        return False
    if prev in "{};:,([=<>+-*/%&|!?~^":
        return False
    if nxt in "});],:;=<>&|?.":
        return False
    return True


def minify_css(src: str) -> str:
    out = []
    i, n = 0, len(src)

    while i < n:
        c = src[i]
        if c == "/" and src[i + 1:i + 2] == "*":
            end = src.find("*/", i + 2)
            i = n if end == -1 else end + 2
            continue
        if c in "\"'":
            quote = c
            j = i + 1
            while j < n:
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == quote:
                    break
                j += 1
            out.append(src[i:j + 1])
            i = j + 1
            continue
        if c in " \t\r\n":
            j = i
            while j < n and src[j] in " \t\r\n":
                j += 1
            prev = out[-1] if out else ""
            nxt = src[j] if j < n else ""
            # Never touch whitespace around operators: calc() and custom
            # properties depend on it.
            if prev and nxt and not (prev in "{};,>" or nxt in "{};,>{}"):
                out.append(" ")
            elif prev and nxt and prev == ":" :
                pass
            i = j
            continue
        # Drop the space a declaration block does not need.
        if c == ":" and out and out[-1] == " ":
            out.pop()
        out.append(c)
        i += 1

    css = "".join(out)
    css = re.sub(r"\s*([{};,])\s*", r"\1", css)
    css = re.sub(r";}", "}", css)
    return css.strip()
