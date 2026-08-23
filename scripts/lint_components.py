#!/usr/bin/env python3
"""`make check` step — verify every htm component reference resolves.

See scripts/lib/lint_components.py for why this exists: an unimported
component compiles fine and only throws at runtime, in whichever branch
happens to render it, which can depend on data the test harness doesn't
happen to exercise.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.lib import paths
from scripts.lib.lint_components import check


def main() -> int:
    problems = check(paths.SRC / 'app')
    if not problems:
        print('lint-components: every <${Component}> reference resolves')
        return 0

    print(f'lint-components: {len(problems)} unresolved component reference(s)')
    for p in problems:
        print(f'  FAIL  {p}')
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
