# guided-review

Turn a pull request into a **guided, narrated code review** — one self-contained HTML page
where the PR is told as a story, in the order the decisions were made, with each paragraph
paired against the exact diff lines it explains.

GitHub sorts changed files alphabetically. That is never the order the work happened in, so
`app/assets/…` opens first and the idea the whole PR is built on shows up somewhere in the
middle. Meanwhile the reasoning lives in a long description, in one place, and the code lives
in another — the reviewer reads a wall of prose, then a wall of diff, and reassembles the
mapping in their head.

`guided-review` puts each part of the explanation next to the code it is about.

- 📖 **Chapters, not files** — ordered by what you need to understand first
- 🔗 **Prose anchored to lines** — a paragraph sits beside the exact passage it describes, highlighted
- 💡 **The reasoning, made explicit** — `why`, `trade-off`, and `considered and rejected` callouts
- ✂️ **Focused panels** — an 800-line file shows the passage under discussion, not all of it
- 📦 **One HTML file** — no network, no assets, no build step; opens offline
- ⌨️ **Built to be read** — `J`/`K` between chapters, light/dark, keyboard-first
- 🤖 Installable as a [Claude Code](https://docs.claude.com/en/docs/claude-code) skill

---

## What it looks like

```
┌──────────────────────────────────────────────────────────────────────┐
│ #3649  Onboarding de prontidão dos dados          +2,790  −7    ☾    │
├──────────────┬───────────────────────────────────────────────────────┤
│ SUMÁRIO      │  Capítulo 03                                          │
│              │  Do snapshot ao percentual                            │
│ 01 Uma defi… │                                                       │
│ 02 Medir uma │  Readiness transforma o     ┌─ readiness.rb  NEW ────┐│
│ ● 03 Do sna… │  snapshot em percentuais.   │ ⋯ 11 lines not shown   ││
│ 04 Do númer… │  Não herda de BaseService   │ 7 + # Não herda de Bas ││
│ 05 A barra…  │  de propósito: a prontidão  │ 8 + # aos filtros da p ││
│ 06 O que su… │  é do município inteiro.    │ 9 + # cadastro não dei ││
│              │                             │11 + class Readiness    ││
│              │  ┌ POR QUÊ ───────────────┐ │12 +   # Um pré-requisi ││
│              │  │ Uma pendência de cada… │ │                        ││
│              │  └────────────────────────┘ └────────────────────────┘│
└──────────────┴───────────────────────────────────────────────────────┘
                                              ↑ the anchored lines are highlighted
```

---

## Requirements

- [Node](https://nodejs.org) v18+ — no `npm install`, zero dependencies.
- [`gh`](https://cli.github.com) authenticated, for pulling the PR.

## Quick start

As a Claude Code skill — this is the intended path, since writing the narrative is the part
that needs a reader:

```
/guided-review 3649
```

Claude reads the PR and its diff, works out the order the story should be told in, writes the
narrative, builds the page, and opens it.

Standalone, if you already have a story JSON:

```bash
gh pr diff 3649 > pr.diff
node build.mjs story.json pr.diff --lang pt --out review.html
```

---

## Options

| Option | Default | What it does |
|---|---|---|
| `--out <file>` | `guided-review-<pr>.html` | Output path. |
| `--lang <code>` | `en` | UI labels only (`en` or `pt`). The narrative renders in whatever language it was written in. |
| `--help` | | Usage. |

---

## The story format

`build.mjs` does no analysis — it takes a narrative you wrote and renders it. The unit is a
**beat**: one passage of prose, plus the lines of diff it is about.

```jsonc
{
  "number": 3649,
  "title": "Data readiness onboarding",
  "url": "https://github.com/org/repo/pull/3649",
  "headline": "The panel said \"1 family\" where there were hundreds",
  "lede": "Two or three paragraphs: the problem, and how to read this page.",
  "chapters": [
    {
      "title": "One definition of \"pending\"",
      "summary": "Optional line under the chapter title.",
      "beats": [
        {
          "text": "Each check declares **two** forms of itself: how it is *counted* …",
          "files": ["app/services/readiness_checks.rb:17-42"],
          "notes": [
            { "kind": "why", "text": "Two representations of one rule diverge silently…" }
          ]
        }
      ]
    }
  ]
}
```

**Anchors** are what make the pairing work:

| Anchor | Effect |
|---|---|
| `path/to/file.rb:17-42` | Highlights those new-side lines; the panel focuses on that passage. |
| `path/to/file.rb:42` | A single line. |
| `path/to/file.rb` | The whole file, no highlight — for one-line includes. |

**Notes** carry what a diff cannot: `why` (the reasoning behind a decision that had an
alternative), `tradeoff` (what was knowingly given up), `rejected` (an approach dropped, and
why).

---

## The build checks your narrative

It is not just a renderer. It refuses malformed input, and it flags the two failures that
would otherwise ship silently:

```
warning: anchor "app/foo.rb:120-140" matches no line in the new file
```
You guessed a line number instead of reading it off the diff. A wrong-but-valid number
highlights the wrong code and nothing complains.

```
warning: 2 substantial file(s) have no place in the narrative:
  - app/helpers/readiness_helper.rb (+49 −0)
```
Uncovered files land in an appendix. That is right for `db/structure.sql` and one-line
includes — and wrong for a new 49-line helper, which the page would then present as carrying
no decision worth explaining.

---

## What it is not

**Not a code review.** No findings, no severity ratings, no suggested changes. Reading for
*intent* and reading for *defects* are different jobs, and a document that tries to be both
serves neither. For defects, use [`agentic-cr`](https://github.com/MarceloCajueiro/agentic-cr)
or Claude Code's built-in `/code-review`.

**Not a substitute for reading the code.** It is a reading order and an explanation — the
reviewer still reviews.

---

## Install as a Claude Code plugin

```bash
git clone https://github.com/MarceloCajueiro/guided-review.git
```

Then add it as a plugin directory in Claude Code, and `/guided-review` becomes available.

---

## License

MIT © Marcelo Cajueiro
