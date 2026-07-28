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

// Content rows only: the `hunk` class marks the "N lines not shown" separators.
const countRows = (html) =>
  [...html.matchAll(/<tr class="([^"]*)"/g)].filter((m) => !m[1].includes('hunk')).length;

const skipTotals = (html) =>
  [...html.matchAll(/⋯ ([\d,]+) lines not shown/g)]
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
