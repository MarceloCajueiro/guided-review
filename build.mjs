#!/usr/bin/env node
// guided-review — turn a story JSON + a unified diff into one self-contained
// HTML page for guided code review.
//
// Usage:
//   node build.mjs <story.json> <pr.diff> [--out <file.html>] [--lang pt|en]
//
// The story JSON is authored by the model (see the skill); this script does no
// analysis. It parses the diff, pairs each narrative beat with the exact lines
// it describes, and renders the page. Keeping the two apart means a wording fix
// is a re-render, not a re-analysis.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseDiff, parseRange } from './lib/diff.mjs';
import { render } from './lib/render.mjs';

const USAGE = `guided-review — build a guided code review page

Usage:
  node build.mjs <story.json> <diff-file> [options]

Arguments:
  <story.json>   Narrative written by the model (schema in the skill / README).
  <diff-file>    Unified diff, e.g. \`gh pr diff <N> > pr.diff\`.

Options:
  --out <file>   Output HTML (default: guided-review-<pr>.html in the current directory).
  --lang <code>  UI language for fixed labels: \`en\` (default) or \`pt\`.
                 Only chrome — the narrative renders in whatever language it was written in.
  --help         Show this help.

Exit codes: 0 ok, 1 usage/validation error.
`;

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  const opts = { lang: 'en' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
    if (!a.startsWith('--')) { positional.push(a); continue; }
    const key = a.slice(2);
    if (key !== 'out' && key !== 'lang') fail(`unknown flag --${key}`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) fail(`--${key} needs a value`);
    opts[key] = next;
    i++;
  }
  return { positional, opts };
}

const NOTE_KINDS = new Set(['why', 'tradeoff', 'rejected']);

// Emphasis markers the renderer leaves on the page verbatim because they never
// closed. A warning, not a problem: the page is still readable, it just shows
// `*like this*` where the author meant emphasis. Worth catching because the
// author sees it only by opening the page and reading the paragraph — the
// failure this tool exists to prevent, applied to its own output.
//
// Code spans are stripped first: `**kwargs` inside backticks is a literal, and
// prose about globs (`*.rb`) or multiplication is ordinary. What survives is an
// asterisk or underscore that looked like it was opening emphasis and never
// found its partner.
function danglingMarkers(text) {
  const bare = String(text ?? '').replace(/`[^`]*`/g, '');
  const found = new Set();
  // These three must stay identical to the passes in render.mjs `inline()`.
  // When they drifted, prose the renderer handled correctly still looked
  // unclosed here: `/* bloco */` and `char *p` each drew a warning for emphasis
  // that was never intended and never rendered. A warning on correct input is
  // worse than none — it teaches the author to ignore the next one.
  const stripped = bare
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\s)\*([^\s*][^*\n]*[^\s*]|[^\s*])\*(?![\w*])/g, '$1$2')
    .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:!?])/g, '$1$2');
  // A leftover marker is only worth reporting where emphasis could have opened:
  // whitespace before, a word character after. That excludes the asterisk in
  // `*.rb` or `a * b`, which no reader would take for emphasis.
  //
  // `char *p` still trips this, and deliberately so: it is indistinguishable
  // from a genuinely unclosed `*word` without parsing the prose. The warning is
  // the cheap direction to be wrong in — a false positive costs one glance and
  // a backtick, a miss ships markers onto the page. Wrap pointers in `code` and
  // the check goes quiet, which is how they should be written anyway.
  if (/(^|\s)\*(?=\w)/.test(stripped)) found.add('*');
  if (/(^|\s)_(?=\w)/.test(stripped)) found.add('_');
  return [...found];
}

// Validate the story up front. A malformed field here would otherwise surface
// as a silently empty chapter in the output, which is worse than an error.
//
// Problems abort the run; warnings print and rendering continues. The split is
// deliberate: a wrong anchor still produces a usable page, a wrong structure
// does not. Every problem is collected before exiting so an author fixing a
// story sees the whole list, not one error per run.
//
// Returns the paths no beat anchored.
function validate(story, files) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const problems = [];
  const warnings = [];
  // Valid new-side line numbers, computed once per file rather than per anchor.
  const validLines = new Map();
  const linesOf = (path) => {
    if (!validLines.has(path)) {
      const set = new Set();
      for (const h of byPath.get(path).hunks) {
        for (const l of h.lines) if (l.newNo != null) set.add(l.newNo);
      }
      validLines.set(path, set);
    }
    return validLines.get(path);
  };

  for (const k of ['number', 'title', 'chapters']) {
    if (story[k] === undefined) problems.push(`missing required field: ${k}`);
  }
  // `number` becomes part of the default output filename, so a value carrying a
  // path separator would write somewhere the user did not ask for.
  if (story.number !== undefined && !Number.isInteger(story.number)) {
    problems.push(`number must be an integer, got ${JSON.stringify(story.number)}`);
  }
  if (!Array.isArray(story.chapters) || story.chapters.length === 0) {
    problems.push('chapters must be a non-empty array');
  }

  const covered = new Set();
  (story.chapters || []).forEach((ch, ci) => {
    const where = `chapters[${ci}]`;
    if (!ch.title) problems.push(`${where}: missing title`);
    if (!Array.isArray(ch.beats) || ch.beats.length === 0) {
      problems.push(`${where}: beats must be a non-empty array`);
      return;
    }
    ch.beats.forEach((b, bi) => {
      const w = `${where}.beats[${bi}]`;
      if (!b.text) problems.push(`${w}: missing text`);
      for (const m of danglingMarkers(b.text)) {
        warnings.push(`${w}: unclosed "${m}" in text — renders literally, not as emphasis`);
      }
      // An unrecognized kind used to fall back to "why", relabelling the
      // author's trade-off as a justification — inventing intent is worse than
      // refusing to render.
      for (const n of b.notes || []) {
        if (n && n.kind !== undefined && !NOTE_KINDS.has(n.kind)) {
          problems.push(`${w}: note kind "${n.kind}" — expected why, tradeoff or rejected`);
        }
        for (const m of danglingMarkers(n && n.text)) {
          warnings.push(`${w}: unclosed "${m}" in note — renders literally, not as emphasis`);
        }
      }
      for (const spec of b.files || []) {
        const { path, from, to, malformed } = parseRange(spec);
        if (malformed && !byPath.has(path)) {
          problems.push(`${w}: anchor "${spec}" — malformed range (expected path:N or path:N-M)`);
          continue;
        }
        if (!byPath.has(path)) {
          problems.push(`${w}: anchor "${spec}" — no such file in the diff`);
          continue;
        }
        covered.add(path);
        if (from == null) continue;
        // Both are authoring mistakes with no valid reading, and both would
        // otherwise make every `for (n = from; n <= to)` loop run zero times —
        // an empty highlight that never trips the "matches no line" warning.
        if (from < 1) {
          problems.push(`${w}: anchor "${spec}" — line numbers start at 1`);
          continue;
        }
        if (to < from) {
          problems.push(`${w}: anchor "${spec}" — range runs backwards`);
          continue;
        }
        // Anchors point at NEW-side lines. A range that hits nothing means the
        // model guessed line numbers instead of reading them off the diff —
        // the highlight would silently render nothing.
        const valid = linesOf(path);
        let hit = 0;
        for (let n = from; n <= to; n++) if (valid.has(n)) hit++;
        if (hit === 0 && valid.size > 0) {
          warnings.push(`${w}: anchor "${spec}" matches no line in the new file`);
        }
      }
    });
  });

  const uncovered = [...byPath.keys()].filter((p) => !covered.has(p));
  if (problems.length) {
    console.error('story validation failed:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  for (const w of warnings) console.error(`warning: ${w}`);
  return { uncovered };
}

const { positional, opts } = parseArgs(process.argv.slice(2));
if (positional.length < 2) { console.error(USAGE); process.exit(1); }

// Flags are checked before any I/O: a typo should fail immediately, not after
// parsing a 3,000-line diff.
if (opts.lang !== 'en' && opts.lang !== 'pt') fail(`--lang must be "en" or "pt", got "${opts.lang}"`);

const [storyPath, diffPath] = positional;
if (!existsSync(storyPath)) fail(`story file not found: ${storyPath}`);
if (!existsSync(diffPath)) fail(`diff file not found: ${diffPath}`);

let story;
try {
  story = JSON.parse(readFileSync(storyPath, 'utf8'));
} catch (e) {
  fail(`story JSON is not valid JSON: ${e.message}`);
}
// Guarded here rather than inside validate(), which collects problems and
// reports them together — an early exit from inside that collector reports one
// error where every other malformed story reports all of them.
if (!story || typeof story !== 'object' || Array.isArray(story)) {
  fail('story JSON must be an object');
}

let rawDiff;
try {
  rawDiff = readFileSync(diffPath, 'utf8');
} catch (e) {
  fail(`cannot read ${diffPath}: ${e.message}`);
}
const files = parseDiff(rawDiff);
if (files.length === 0) fail(`no files parsed from ${diffPath} — is it a unified diff?`);

const { uncovered } = validate(story, files);

const html = render(story, files, { lang: opts.lang });
const out = opts.out || `guided-review-${story.number}.html`;
try {
  writeFileSync(out, html);
} catch (e) {
  // The skill drives this from a mktemp directory; when that is gone the raw
  // ENOENT stack trace is the least useful thing to hand back.
  fail(`cannot write ${out}: ${e.message}`);
}

const beats = story.chapters.reduce((n, c) => n + (c.beats || []).length, 0);
console.log(`✓ ${out}`);
console.log(`  ${story.chapters.length} chapters · ${beats} beats · ${files.length} files · ${(html.length / 1024).toFixed(0)} KB`);
if (uncovered.length) {
  console.log(`  ${uncovered.length} file(s) in the appendix: ${uncovered.slice(0, 5).map((p) => basename(p)).join(', ')}${uncovered.length > 5 ? '…' : ''}`);

  // The appendix is for files that carry no decision: generated output, lockfiles,
  // one-line includes. Anything substantial landing there means the narrative
  // skipped it — which reads to the reviewer as "this file didn't matter".
  const substantial = uncovered
    .map((p) => files.find((f) => f.path === p))
    .filter((f) => f && !f.isGenerated && f.additions + f.deletions >= 20);
  if (substantial.length) {
    console.error(
      `\nwarning: ${substantial.length} substantial file(s) have no place in the narrative.\n` +
      'The appendix is meant for generated and mechanical changes. Either give these a beat,\n' +
      'or accept that the review presents them as carrying no decision:'
    );
    for (const f of substantial) {
      console.error(`  - ${f.path} (+${f.additions} −${f.deletions})`);
    }
  }
}
