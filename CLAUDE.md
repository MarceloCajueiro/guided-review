# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A Claude Code plugin that turns a pull request into a **guided, narrated code review** — one
self-contained HTML page where the PR is told as a story, each paragraph paired against the
exact diff lines it explains.

```
build.mjs              CLI: validates the story, renders the page. No analysis.
lib/diff.mjs           Unified diff parser. Tracks line numbers on both sides.
lib/highlight.mjs      Regex tokenizer for syntax colouring.
lib/render.mjs         Story + parsed diff → HTML. Contains the inline page script.
lib/theme.mjs          The stylesheet, plus the REST constant shared with the script.
skills/guided-review/  The skill: how the model writes the narrative.
test/                  node:test, no dependencies.
```

## Commands

```bash
npm test                                    # 28 cases, node:test
node build.mjs story.json pr.diff --out review.html
node build.mjs --help
```

No `npm install` — there are no dependencies, and adding one needs a real argument.

## The invariants

These are load-bearing. Each has a test, and each was a bug at some point.

**Every hidden line is announced.** `focusHunks` shows the anchored passage and drops the rest,
but the count of what it dropped — leading, between regions, and trailing — always reaches the
page. A tool arguing that reviewers should not skim cannot hide code from them. If you touch
the focus logic, the accounting test in `test/render.test.mjs` is the one that matters:
shown + skipped must equal the file.

**Line numbers are the contract.** A parser that miscounts does not crash; it produces a
narrative anchored to the wrong code, which looks exactly as trustworthy as a correct one.
`parseDiff` is tested against the hunk header's own declared counts — git's ground truth.

**Invalid states are rejected, not rendered.** A reversed range, a line number below 1, an
unknown note `kind` — all fail the build rather than producing a plausible-looking page.
Silently reinterpreting an author's input invents intent they never expressed. Warnings are
reserved for things that still leave a usable page (an anchor matching no line); problems abort.

**Escaping runs before markup.** `inline()` escapes author text first, then applies `code`,
`**bold**`, `_italic_`. Reversing that order is an injection. Code spans are lifted out before
the emphasis passes because three independent regex sweeps cannot see each other's boundaries.

**`REST` is one constant.** `lib/theme.mjs` exports it; the stylesheet and the page script both
interpolate it. When the scroll destination and the scrollspy threshold drifted apart, `j`/`k`
oscillated between two chapters forever. Do not hard-code 76 anywhere.

## Conventions

- **English** for code, comments, commits, PRs and the README — this is a public repo.
- **Conventional Commits.** Bodies explain *why*, since the diff already shows *what*.
- **Comments explain reasoning**, not mechanics. A comment restating the line below it is noise;
  a comment naming the alternative that was rejected is what survives.
- **No speculative configurability.** `maxLines` was once a parameter no caller ever passed —
  that is the shape to avoid. Add a flag when something needs it, not before.

## Deliberate limits

Do not "fix" these without discussing it first:

- **The page script is a template string** in `lib/render.mjs`, so its ~110 lines are outside
  the test suite. Extracting it to a separate file would make it testable at the cost of the
  self-contained, zero-build-step output — which is the point of the tool. Accepted trade-off.
- **Highlighting is regex, not a parser.** A diff shows fragments; any parser strict enough to
  be correct fails on most hunks. Regex degrades to a missed keyword, never a broken line.
- **Generated-file detection matches paths**, so an unusual layout will occasionally be wrong.
  Inspecting content to guess is wrong far more often, and the failure here is one collapsed
  panel the reader can still open.
- **No web fonts, no external assets.** The page must open offline and from `file://`.

## Scope

This produces a **narrative**. It does not hunt for bugs, rate severity, or suggest changes —
that is `/cr` or `/code-review`. Reading for intent and reading for defects are different jobs,
and a document attempting both serves neither. Requests to add findings to the output should be
pushed back on.

## The example page

`https://guided-review-example.pages.dev/` hosts this tool's guided review of its own PR #1,
deployed to Cloudflare Pages (project `guided-review-example`). Regenerate and redeploy when the
tool changes enough that the example misrepresents it:

```bash
gh pr diff 1 > pr.diff
node build.mjs story.json pr.diff --out deploy/index.html
cd deploy && npx wrangler pages deploy . --project-name=guided-review-example --branch=main
```
