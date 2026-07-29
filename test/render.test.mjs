// The failures pinned here all produced a page that looked fine: hidden lines
// with no marker, crossed tags, duplicate ids, a live javascript: href. For a
// tool whose value is "this paragraph is about exactly these lines", output
// that is confidently wrong is the most expensive failure mode there is.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff } from '../lib/diff.mjs';
import { render } from '../lib/render.mjs';

function addedFile(path, count) {
  const lines = [];
  for (let i = 1; i <= count; i++) lines.push(`+line ${i}`);
  return [
    `diff --git a/${path} b/${path}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${path}`,
    `@@ -0,0 +1,${count} @@`,
    ...lines,
    '',
  ].join('\n');
}

const story = (chapters, extra = {}) => ({
  number: 1,
  title: 'T',
  url: 'https://example.com/pr/1',
  chapters,
  ...extra,
});

// The fullscreen overlay carries its own unfocused copy of every focused file
// in a <template>. It is inert until opened and is not what the reader sees in
// the panel, so the accounting below must not count it — otherwise every
// focused file appears to render whole and the invariant silently passes.
const visible = (html) => html.replace(/<template class="full-src">[\s\S]*?<\/template>/g, '');

// Content rows only: the `hunk` class marks the "N lines not shown" separators.
const countRows = (html) =>
  [...visible(html).matchAll(/<tr class="([^"]*)"/g)].filter((m) => !m[1].includes('hunk')).length;

const skipTotals = (html) =>
  [...visible(html).matchAll(/⋯ ([\d,]+) lines not shown/g)]
    .reduce((n, m) => n + Number(m[1].replace(/,/g, '')), 0);

// The marker is the one guardrail the focus feature depends on. Lines dropped
// after the last kept region used to vanish with nothing announcing them, so a
// reviewer reaching the end of a panel concluded the file ended there.
test('every hidden line is announced, including the trailing ones', () => {
  const files = parseDiff(addedFile('big.rb', 200));
  const html = render(
    story([{ title: 'C', beats: [{ text: 'x', files: ['big.rb:100'] }] }]),
    files
  );

  const shown = countRows(html);
  assert.ok(shown < 200, 'the file should be focused, not rendered whole');
  assert.equal(skipTotals(html) + shown, 200);
});

// The overlay exists so the reader never has to leave for GitHub. A truncated
// copy would break that promise silently — it looks like a full file.
test('the fullscreen template carries the file whole', () => {
  const files = parseDiff(addedFile('big.rb', 200));
  const html = render(
    story([{ title: 'C', beats: [{ text: 'x', files: ['big.rb:100'] }] }]),
    files
  );
  const tpl = html.match(/<template class="full-src">([\s\S]*?)<\/template>/);
  assert.ok(tpl, 'a focused file should carry a full-file template');
  const rows = [...tpl[1].matchAll(/<tr class="([^"]*)"/g)]
    .filter((m) => !m[1].includes('hunk')).length;
  assert.equal(rows, 200);
  assert.ok(!/lines not shown/.test(tpl[1]), 'the full copy must hide nothing');
});

// The button and its template must ship together. Shipped apart, the button
// renders on files that hide nothing and clicking it does nothing at all —
// a dead control is worse than no control.
test('the fullscreen button appears only where a template backs it', () => {
  const files = parseDiff(addedFile('whole.rb', 12) + addedFile('big.rb', 200));
  const html = render(
    story([{ title: 'C', beats: [
      { text: 'x', files: ['big.rb:100'] },
      { text: 'y', files: ['whole.rb'] },
    ] }]),
    files
  );
  for (const [, panel] of html.matchAll(/<details class="file"[^>]*>([\s\S]*?)<\/details>/g)) {
    assert.equal(
      /class="full-btn/.test(panel),
      /<template class="full-src">/.test(panel),
      'button and template disagree'
    );
  }
  // The short file is rendered whole, so it must have neither.
  const short = html.match(/<details class="file" data-path="whole\.rb"[\s\S]*?<\/details>/)[0];
  assert.ok(!/full-btn/.test(short), 'a file shown whole needs no fullscreen button');
});

// Duplicate ids sent every deep link to whichever copy rendered first; the
// template is a second copy of a file the panel already numbered.
test('the fullscreen template mints no ids', () => {
  const html = render(
    story([{ title: 'C', beats: [{ text: 'x', files: ['big.rb:100'] }] }]),
    parseDiff(addedFile('big.rb', 200))
  );
  const tpl = html.match(/<template class="full-src">([\s\S]*?)<\/template>/)[1];
  assert.ok(!/ id="/.test(tpl), 'template rows must not carry ids');
});

test('a mark near the start still accounts for the tail', () => {
  const files = parseDiff(addedFile('big.rb', 120));
  const html = render(
    story([{ title: 'C', beats: [{ text: 'x', files: ['big.rb:2'] }] }]),
    files
  );
  assert.equal(skipTotals(html) + countRows(html), 120);
});

// Three independent replace() passes could not see each other's boundaries.
test('interleaved code and bold markers do not cross', () => {
  const html = render(
    story([{ title: 'C', beats: [{ text: 'see `a**b` and **x**' }] }]),
    parseDiff(addedFile('x.rb', 3))
  );
  assert.match(html, /<code>a\*\*b<\/code> and <strong>x<\/strong>/);
  assert.ok(!/<code>[^<]*<strong>[^<]*<\/code>/.test(html), 'tags crossed');
});

// `*x*` used to reach the page verbatim: the renderer knew `**bold**` and
// `_italic_` and nothing else, so an author writing single-asterisk emphasis
// saw the markers printed as text.
test('single asterisks render as emphasis', () => {
  const html = render(
    story([{ title: 'C', beats: [{ text: 'usa *isto* e **aquilo**' }] }]),
    parseDiff(addedFile('x.rb', 3))
  );
  assert.match(html, /usa <em>isto<\/em> e <strong>aquilo<\/strong>/);
});

// The first fix for the above italicised the span between two unrelated globs:
// `*.rb` opened emphasis and the next `*` closed it. Prose about globs, C
// pointers and multiplication is ordinary in a tool about code.
test('asterisks that are not emphasis survive as text', () => {
  for (const text of [
    'glob *.rb e outro *.js aqui',
    'multiplica a * b = c',
    'ponteiro char *p e char *q',
    'comenta /* bloco */ aqui',
  ]) {
    const html = render(
      story([{ title: 'C', beats: [{ text }] }]),
      parseDiff(addedFile('x.rb', 3))
    );
    const p = html.match(/<div class="beat-prose"><p>(.*?)<\/p>/s)[1];
    assert.ok(!/<em>/.test(p), `emphasis fired on: ${text} → ${p}`);
  }
});

test('bare numbers in prose are not swallowed by the code-span placeholder', () => {
  const html = render(
    story([{ title: 'C', beats: [{ text: 'about 1 of 10 items, see `x`' }] }]),
    parseDiff(addedFile('x.rb', 3))
  );
  assert.match(html, /about 1 of 10 items, see <code>x<\/code>/);
});

// The same file renders once per beat that anchors it, so an id built only from
// path and line was emitted several times — invalid HTML, and getElementById
// sent every deep link to whichever panel happened to render first.
test('line ids are unique across beats citing the same file', () => {
  const files = parseDiff(addedFile('a.rb', 40));
  const html = render(
    story([
      {
        title: 'C',
        beats: [
          { text: 'one', files: ['a.rb:5'] },
          { text: 'two', files: ['a.rb:6'] },
        ],
      },
    ]),
    files
  );
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids emitted');
});

test('ids stay addressable when the path contains a space', () => {
  const files = parseDiff(addedFile('a b.rb', 5));
  const html = render(
    story([{ title: 'C', beats: [{ text: 'x', files: ['a b.rb:2'] }] }]),
    files
  );
  for (const [, id] of html.matchAll(/ id="(L[^"]*|c\d+b\d+-L[^"]*)"/g)) {
    assert.ok(!/\s/.test(id), `id contains whitespace: ${id}`);
  }
});

// Escaping stops attribute breakout but says nothing about the scheme, and this
// page is built to be handed to other reviewers.
test('a javascript: story url never reaches an href', () => {
  const html = render(
    story([{ title: 'C', beats: [{ text: 'x' }] }], { url: 'javascript:alert(1)' }),
    parseDiff(addedFile('x.rb', 3))
  );
  assert.ok(!/href="javascript:/i.test(html));
  assert.match(html, /href="#"/);
});

test('an ordinary https url survives intact', () => {
  const html = render(
    story([{ title: 'C', beats: [{ text: 'x' }] }]),
    parseDiff(addedFile('x.rb', 3))
  );
  assert.match(html, /href="https:\/\/example\.com\/pr\/1"/);
});

test('markup in narrative prose renders as text, not HTML', () => {
  const html = render(
    story([{ title: 'C', beats: [{ text: 'an <img src=x onerror=alert(1)> tag' }] }]),
    parseDiff(addedFile('x.rb', 3))
  );
  assert.ok(!/<img/.test(html));
  assert.match(html, /&lt;img src=x/);
});

test('files no beat anchors land in the appendix', () => {
  const files = parseDiff(addedFile('used.rb', 5) + addedFile('spare.rb', 5));
  const html = render(
    story([{ title: 'C', beats: [{ text: 'x', files: ['used.rb:1'] }] }]),
    files
  );
  assert.match(html, /class="appendix"/);
  assert.match(html, /spare\.rb/);
});

test('the pt locale switches the chrome, not the narrative', () => {
  const html = render(
    story([{ title: 'Capítulo um', beats: [{ text: 'texto' }] }]),
    parseDiff(addedFile('x.rb', 3)),
    { lang: 'pt' }
  );
  assert.match(html, /lang="pt-BR"/);
  assert.match(html, /Capítulo 01/);
});

test('render does not mutate the parsed diff it is given', () => {
  const files = parseDiff(addedFile('x.rb', 3));
  const before = JSON.stringify(files);
  render(story([{ title: 'C', beats: [{ text: 'x', files: ['x.rb:1'] }] }]), files);
  assert.equal(JSON.stringify(files), before);
});
