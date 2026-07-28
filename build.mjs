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
  --out <file>   Output HTML (default: guided-review-<pr>.html next to the diff).
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

// Validate the story up front. A malformed field here would otherwise surface
// as a silently empty chapter in the output, which is worse than an error.
function validate(story, files) {
  const paths = new Set(files.map((f) => f.path));
  const problems = [];
  const warnings = [];

  if (!story || typeof story !== 'object') fail('story JSON must be an object');
  for (const k of ['number', 'title', 'chapters']) {
    if (story[k] === undefined) problems.push(`missing required field: ${k}`);
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
      for (const spec of b.files || []) {
        const { path, from, to } = parseRange(spec);
        if (!paths.has(path)) {
          problems.push(`${w}: anchor "${spec}" — no such file in the diff`);
          continue;
        }
        covered.add(path);
        if (from != null) {
          const file = files.find((f) => f.path === path);
          const valid = new Set();
          for (const h of file.hunks) for (const l of h.lines) if (l.newNo != null) valid.add(l.newNo);
          // Anchors point at NEW-side lines. A range that hits nothing means the
          // model guessed line numbers instead of reading them off the diff —
          // the highlight would silently render nothing.
          let hit = 0;
          for (let n = from; n <= to; n++) if (valid.has(n)) hit++;
          if (hit === 0 && valid.size > 0) {
            warnings.push(`${w}: anchor "${spec}" matches no line in the new file`);
          }
        }
      }
    });
  });

  const uncovered = [...paths].filter((p) => !covered.has(p));
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

const [storyPath, diffPath] = positional;
if (!existsSync(storyPath)) fail(`story file not found: ${storyPath}`);
if (!existsSync(diffPath)) fail(`diff file not found: ${diffPath}`);

let story;
try {
  story = JSON.parse(readFileSync(storyPath, 'utf8'));
} catch (e) {
  fail(`story JSON is not valid JSON: ${e.message}`);
}

const rawDiff = readFileSync(diffPath, 'utf8');
const files = parseDiff(rawDiff);
if (files.length === 0) fail(`no files parsed from ${diffPath} — is it a unified diff?`);

if (opts.lang !== 'en' && opts.lang !== 'pt') fail(`--lang must be "en" or "pt", got "${opts.lang}"`);

const { uncovered } = validate(story, files);

const html = render(story, files, { lang: opts.lang });
const out = opts.out || `guided-review-${story.number}.html`;
writeFileSync(out, html);

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
