"""A base rule must not silently cancel a media query.

The real case: `.topbar { display: flex }` inside `@media (max-width: 900px)`,
then `.topbar { display: none }` further down the file. One class selector each,
so source order decides — and the mobile header never rendered anywhere.
"""
from scripts.lib.lint_css import check


BROKEN = """
@media (max-width: 900px) {
  .topbar { display: flex; }
}
.topbar { display: none; position: sticky; }
"""

FIXED = """
.topbar { display: none; position: sticky; }
@media (max-width: 900px) {
  .topbar { display: flex; }
}
"""


def test_catches_the_topbar_case():
    problems = check(BROKEN)
    assert len(problems) == 1
    assert ".topbar" in problems[0]
    assert "above the media query" in problems[0]


def test_accepts_the_right_order():
    assert check(FIXED) == []


def test_base_rule_before_the_media_query_is_fine_even_if_repeated():
    """Setting display twice is not itself a problem — order is."""
    assert check("""
      .x { display: none; }
      .x { display: block; }
      @media (max-width: 900px) { .x { display: flex; } }
    """) == []


def test_a_different_selector_is_not_flagged():
    assert check("""
      @media (max-width: 900px) { .a { display: flex; } }
      .b { display: none; }
    """) == []


def test_a_base_rule_that_sets_something_else_is_not_flagged():
    """Only `display` decides whether an element exists at all; a later base
    rule changing padding or colour is ordinary cascade, not a cancellation."""
    assert check("""
      @media (max-width: 900px) { .a { display: flex; } }
      .a { padding: 4px; color: red; }
    """) == []


def test_comma_separated_selectors_are_each_considered():
    problems = check("""
      @media (max-width: 900px) { .a, .b { display: flex; } }
      .b { display: none; }
    """)
    assert len(problems) == 1 and ".b" in problems[0]


def test_nested_media_does_not_swallow_the_rest_of_the_file():
    """A brace walk rather than a flat regex: without it every rule after the
    last @media reads as being inside it, and nothing is ever flagged."""
    problems = check("""
      @media (max-width: 900px) { .a { display: flex; } }
      @media (max-width: 400px) { .c { display: none; } }
      .a { display: none; }
    """)
    assert len(problems) == 1 and ".a" in problems[0]


def test_empty_and_junk_input():
    assert check("") == []
    assert check("/* just a comment */") == []
