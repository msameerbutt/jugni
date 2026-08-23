"""Catch an htm/Preact component referenced but never imported or declared.

This is a real class of bug, not a hypothetical: adding the copy-button
feature shipped it twice in one sitting. `<${CopyButton}` was added to four
files; a `sed`-style replace on the import line silently no-matched in two of
them because an earlier cleanup pass had already changed the string it was
targeting. The bundle built cleanly both times — esbuild does not know
`CopyButton` is supposed to be a local binding, so it just compiles the bare
reference — and it only threw `ReferenceError: CopyButton is not defined` at
RUNTIME, in whichever component actually rendered.

One of the two was caught by `make check` only because the fixture trip's
dates happen to straddle today's real date, exercising a code path the other
trip's dates never reach. That is luck, not coverage: the same mistake in a
rarely-rendered branch could ship silently forever.

A static check closes the gap regardless of what data is loaded: every
`<${Name}` in an htm template must resolve to something imported or declared
in that file.
"""

import re
from pathlib import Path

COMPONENT_REF_RE = re.compile(r'<\$\{\s*([A-Z][A-Za-z0-9_]*)\s*\}')

IMPORT_NAMED_RE = re.compile(r'import\s*\{([^}]*)\}\s*from')
IMPORT_DEFAULT_RE = re.compile(r'import\s+([A-Za-z_$][\w$]*)\s+from')
IMPORT_NAMESPACE_RE = re.compile(r'import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from')

# Anything that introduces a name into module scope: functions, const/let/var
# bindings (covers `const Foo = (...) => ...` and destructured imports-as-const
# re-exports), and class declarations.
LOCAL_DEF_RE = re.compile(
    r'^\s*(?:export\s+)?(?:function\s+([A-Za-z_$][\w$]*)'
    r'|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*='
    r'|class\s+([A-Za-z_$][\w$]*))',
    re.M,
)


def bound_names(text: str) -> set[str]:
    names: set[str] = set()

    for m in IMPORT_NAMED_RE.finditer(text):
        for entry in m.group(1).split(','):
            entry = entry.strip()
            if not entry:
                continue
            # `Foo as Bar` binds Bar in this file, not Foo.
            names.add(entry.split(' as ')[-1].strip())

    names.update(IMPORT_DEFAULT_RE.findall(text))
    names.update(IMPORT_NAMESPACE_RE.findall(text))

    for a, b, c in LOCAL_DEF_RE.findall(text):
        names.update(n for n in (a, b, c) if n)

    return names


def check(app_dir: Path) -> list[str]:
    """Returns a list of human-readable problems; empty means clean."""
    problems: list[str] = []

    for path in sorted(app_dir.rglob('*.js')):
        text = path.read_text(encoding='utf-8')
        available = bound_names(text)
        referenced = {m.group(1): m.start() for m in COMPONENT_REF_RE.finditer(text)}

        for name, pos in referenced.items():
            if name in available:
                continue
            line = text.count('\n', 0, pos) + 1
            problems.append(
                f'{path.relative_to(app_dir.parent.parent)}:{line}: '
                f'<${{{name}}}> is used but "{name}" is not imported or declared in this file')

    return problems
