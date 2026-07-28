---
name: guided-review
description: Turn a pull request into a guided, narrated code review — a self-contained HTML page where the PR is told as a story in the order the decisions were made, each paragraph paired with the exact lines of the diff it explains. Use when the user wants to make a PR easier to review, says "guided review", "narrate this PR", "explain this PR", asks for a walkthrough or reading order for a large PR, or wants reviewers to understand *why* a change was made rather than just what changed. Replaces reading a long PR description separately from a file list sorted alphabetically.
argument-hint: "[PR-number or URL] (default: PR of the current branch)"
user_invocable: true
---

# guided-review — a pull request, told as a story

Produces one self-contained HTML page: the PR narrated in **chapters**, in the order the
decisions were actually made, with each paragraph paired against the exact diff lines it
describes.

The problem it solves: GitHub sorts files alphabetically, which is never the order the work
happened in. The description explains the reasoning in one place; the code sits somewhere
else. The reviewer reads a wall of prose, then a wall of diff, and reassembles the mapping in
their head. This puts each part of the explanation next to the code it is about.

**Scope: narrative only.** This does not hunt for bugs, rate severity, or suggest changes —
that is `/cr` (or `/code-review`). Mixing the two produces a document that is neither: a
reviewer reading for *intent* is doing something different from a reviewer reading for
*defects*. Keep them separate.

## How it works

You do the analysis and write a story JSON. `build.mjs` does the mechanical part: parsing the
diff, resolving anchors to line numbers, rendering the page. Keeping them apart means a
wording fix is a re-render, not a re-analysis.

The script lives at the plugin root. Reference it with `${CLAUDE_PLUGIN_ROOT}`.

## Prerequisites

- `node` v18+ — no `npm install`, no dependencies.
- `gh` authenticated, with access to the repository.

## Steps

### 1. Resolve the PR and pull the material

`$ARGUMENTS` is a PR number or URL. If empty, resolve from the current branch:

```bash
gh pr view --json number -q .number
```

No PR for the branch: stop and say so. Then, in a working directory:

```bash
WORK=$(mktemp -d)
gh pr view <PR> --json number,title,body,author,url,headRefOid,baseRefName,headRefName,additions,deletions,changedFiles,commits > "$WORK/pr.json"
gh pr diff <PR> > "$WORK/pr.diff"
```

For a PR in another repository, pass `--repo <owner>/<name>` to both. Otherwise never pass
`-R` — `gh` infers it from the git remote.

### 2. Read the code, not just the description

**This is the step that determines whether the output is worth anything.** Read the actual
diff. The PR description tells you what the author *meant* to explain; the code tells you
what they *did*, and often carries the reasoning in comments the description never mentions.

While reading, hunt specifically for:

- **Decisions with a visible alternative** — a rejected approach, a deliberate duplication, a
  `rescue` that isn't there, a scope that was widened instead of removed. These are what a
  reviewer cannot reconstruct from the diff alone, and they are the reason this document exists.
- **Non-obvious constraints** — a measured timing, a database that refuses a query, a feature
  gate, a framework behavior being worked around.
- **Load-bearing tests** — the spec that exists because the failure it prevents is silent.

If the code contains a comment explaining *why*, that is your raw material. Quote its
substance in the narrative; don't paraphrase it into vagueness.

### 3. Find the order the story wants to be told in

Not alphabetical, not the diff order. Ask: **what does a reader need to believe first for the
next part to make sense?** Common shapes:

- *Definition → measurement → presentation → access* (a new feature)
- *Symptom → root cause → fix → guard against regression* (a bug fix)
- *What the old thing couldn't do → the new seam → migrating each caller* (a refactor)

Group into **4–8 chapters**. Fewer than 4 usually means the chapters are too coarse to guide
anyone; more than 8 means you're narrating files instead of decisions. Every chapter should be
nameable as a decision or a movement, never as a directory (`"Services"` is not a chapter;
`"One definition of pending"` is).

### 4. Write the story JSON

```jsonc
{
  "number": 3649,
  "title": "…",                  // the PR title
  "url": "https://github.com/…/pull/3649",
  "author": "octocat",
  "branch": "feature-branch",
  "additions": 2790,             // from gh; shown in the masthead
  "deletions": 7,
  "headSha": "abc123…",          // headRefOid — stamps the page
  "headline": "…",               // the one sentence that makes someone want to read
  "lede": "…",                   // 2–3 paragraphs: the problem, and how to read the page
  "chapters": [
    {
      "title": "…",
      "summary": "…",            // one line under the chapter title (optional)
      "beats": [
        {
          "text": "…",           // 1–2 paragraphs. `code`, **bold**, _italic_ work.
          "files": ["app/services/thing.rb:17-42", "app/views/_bar.html.erb"],
          "notes": [
            { "kind": "why",      "text": "…" },
            { "kind": "tradeoff", "text": "…" },
            { "kind": "rejected", "text": "…" }
          ]
        }
      ]
    }
  ]
}
```

**Anchors** (`files`) are the mechanism that makes the page work:

- `path:from-to` highlights those **new-side** line numbers and focuses the panel on that
  passage. Read the numbers off the diff — do not estimate them. The build warns when an
  anchor matches nothing, and a wrong-but-valid number silently highlights the wrong code.
- `path:42` — a single line.
- `path` alone — the whole file, no highlight. Right for one-line includes and for files that
  need to be *seen* but have no passage worth pointing at.

**Notes** carry what the diff cannot say:

- `why` — the reasoning behind a decision that has a plausible alternative.
- `tradeoff` — what was knowingly given up, including accepted residual problems.
- `rejected` — an approach that was considered and dropped, and the reason.

Use them where they earn their place. A note on every beat is noise; a PR with real
engineering in it usually has three to six across the whole document.

**On writing the prose:** write for a colleague who knows the codebase but not this change.
Say what the code does only when it isn't obvious from reading it — the code is right there.
Spend the words on what the code cannot show: what was true before, what would have gone
wrong, what else was on the table. Prefer the concrete ("~21s on the largest municipality")
over the vague ("performance concerns").

Write the narrative in **the language the PR is written in**. A PR whose description and code
comments are in Portuguese gets a Portuguese narrative.

### 5. Build

```bash
node ${CLAUDE_PLUGIN_ROOT}/build.mjs "$WORK/story.json" "$WORK/pr.diff" \
  --lang pt --out "$WORK/guided-review-<PR>.html"
```

`--lang` sets only the fixed UI labels (`en` default, or `pt`) — the narrative renders in
whatever language you wrote it in. Match it to the narrative.

### 6. Act on what the build tells you

The build is a reviewer of your narrative. Do not ship past its output:

- **`anchor "…" matches no line`** — you guessed a line number. Go back to the diff and read
  the real one.
- **`N substantial file(s) have no place in the narrative`** — a file with real content landed
  in the appendix. The appendix is for generated output and one-line mechanical edits; a new
  50-line helper sitting there tells the reviewer it carried no decision. Either give it a beat
  or, if it genuinely is boilerplate, say so and move on.
- **validation errors** — the build refuses to render. Fix the JSON.

Then open the page and read it as a reviewer would. The specific thing to check: does each
paragraph sit beside the code it is actually talking about? If a beat's prose describes a
decision but the panel shows imports, the anchor is wrong.

### 7. Deliver

Give the user the path and open it (`open <file>`). Mention the chapter count and anything you
deliberately left in the appendix.

The page is one self-contained HTML file — no network, no assets. It can be attached to the PR,
sent to a reviewer, or published behind a password with `html-password-gate` if the code is
private.

## Reading the page

- **J / K** (or ← / →) move between chapters; **E** expands or collapses every file.
- The left rail tracks the current chapter; the hairline at the top is reading progress.
- Light and dark follow the OS, with a toggle that overrides and persists.
- Panels anchored to line ranges show that passage plus context, with a link to the full file
  on GitHub. Generated files (`structure.sql`, lockfiles, `dist/`, `vendor/`) are detected and
  collapsed.

## Fixed decisions of this skill (unless the user asks otherwise)

- **Narrative only** — no findings, no severities, no suggested changes. That's `/cr`.
- **One self-contained HTML file**, rendered locally. Nothing is posted to the PR.
- **Chapters ordered by dependency of understanding**, never alphabetically or by directory.
- **Every substantial file gets a beat.** The appendix is for changes that carry no decision.
