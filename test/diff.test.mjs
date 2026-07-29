// Line-number tracking is the load-bearing contract of this tool: a narrative
// anchored to the wrong lines points the reviewer at code the paragraph is not
// about, and nothing crashes. These tests pin it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff, parseRange, isGenerated } from '../lib/diff.mjs';

// Every `git diff` / `gh pr diff` ends in a newline. Splitting on '\n' leaves a
// trailing '' that is not a line of the file — consumed as context, it invented
// a row and registered a line number that does not exist as a valid anchor.
test('a trailing newline does not fabricate a line', () => {
  const diff = [
    'diff --git a/x.rb b/x.rb',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/x.rb',
    '@@ -0,0 +1,2 @@',
    '+a',
    '+b',
    '',
  ].join('\n');

  const [file] = parseDiff(diff);
  assert.equal(file.hunks[0].lines.length, 2);
  assert.deepEqual(file.hunks[0].lines.map((l) => l.newNo), [1, 2]);
  assert.equal(file.additions, 2);
});

test('line numbers match the hunk header on both sides', () => {
  const diff = [
    'diff --git a/x.rb b/x.rb',
    '--- a/x.rb',
    '+++ b/x.rb',
    '@@ -10,3 +10,4 @@ def existing',
    ' ctx',
    '-gone',
    '+kept',
    '+added',
    ' tail',
    '',
  ].join('\n');

  const [file] = parseDiff(diff);
  const lines = file.hunks[0].lines;
  assert.deepEqual(lines.map((l) => [l.type, l.oldNo, l.newNo]), [
    ['ctx', 10, 10],
    ['del', 11, null],
    ['add', null, 11],
    ['add', null, 12],
    ['ctx', 12, 13],
  ]);
  assert.equal(file.additions, 2);
  assert.equal(file.deletions, 1);
});

test('a deleted file has no new-side line numbers', () => {
  const diff = [
    'diff --git a/old.rb b/old.rb',
    'deleted file mode 100644',
    '--- a/old.rb',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
    '-class Old',
    '-end',
    '',
  ].join('\n');

  const [file] = parseDiff(diff);
  assert.equal(file.status, 'deleted');
  // newNo 0 is not a line number; every consumer tests `!= null`, so a zero
  // would pass as a real line and mint a dead deep-link target.
  assert.ok(file.hunks[0].lines.every((l) => l.newNo === null));
});

// `--- ` and `+++ ` are file metadata only before the first hunk. Inside one,
// a deleted line reading `--- foo` is content, and skipping it drops real code.
test('content that looks like diff metadata survives', () => {
  const diff = [
    'diff --git a/CHANGELOG.md b/CHANGELOG.md',
    '--- a/CHANGELOG.md',
    '+++ b/CHANGELOG.md',
    '@@ -1,2 +1,2 @@',
    '---- old heading',
    '+--- new heading',
    ' body',
    '',
  ].join('\n');

  const [file] = parseDiff(diff);
  const lines = file.hunks[0].lines;
  assert.equal(lines.length, 3);
  assert.equal(lines[0].content, '--- old heading');
  assert.equal(lines[1].content, '--- new heading');
});

test('binary, renamed and added files are recognised', () => {
  const diff = [
    'diff --git a/logo.png b/logo.png',
    'new file mode 100644',
    'Binary files /dev/null and b/logo.png differ',
    'diff --git a/a.rb b/b.rb',
    'similarity index 90%',
    'rename from a.rb',
    'rename to b.rb',
    '@@ -1,1 +1,1 @@',
    '-old',
    '+new',
    '',
  ].join('\n');

  const files = parseDiff(diff);
  assert.equal(files.length, 2);
  assert.equal(files[0].status, 'added');
  assert.equal(files[0].isBinary, true);
  assert.equal(files[1].status, 'renamed');
  assert.equal(files[1].oldPath, 'a.rb');
  assert.equal(files[1].path, 'b.rb');
});

test('"\\ No newline at end of file" occupies no line number', () => {
  const diff = [
    'diff --git a/x.txt b/x.txt',
    '--- a/x.txt',
    '+++ b/x.txt',
    '@@ -1 +1 @@',
    '-a',
    '\\ No newline at end of file',
    '+b',
    '\\ No newline at end of file',
    '',
  ].join('\n');

  const [file] = parseDiff(diff);
  assert.equal(file.hunks[0].lines.length, 2);
});

test('multiple hunks each restart from their own header', () => {
  const diff = [
    'diff --git a/x.rb b/x.rb',
    '--- a/x.rb',
    '+++ b/x.rb',
    '@@ -1,1 +1,1 @@',
    '+first',
    '@@ -50,1 +60,1 @@',
    '+second',
    '',
  ].join('\n');

  const [file] = parseDiff(diff);
  assert.equal(file.hunks.length, 2);
  assert.equal(file.hunks[0].lines[0].newNo, 1);
  assert.equal(file.hunks[1].lines[0].newNo, 60);
});

test('parseRange splits anchors, and flags the malformed ones', () => {
  assert.deepEqual(parseRange('app/foo.rb'), { path: 'app/foo.rb', from: null, to: null });
  assert.deepEqual(parseRange('app/foo.rb:42'), { path: 'app/foo.rb', from: 42, to: 42 });
  assert.deepEqual(parseRange('app/foo.rb:17-42'), { path: 'app/foo.rb', from: 17, to: 42 });

  // GitHub's own fragment syntax is an easy thing to write by mistake. Reported
  // as malformed rather than as a missing file, which names the wrong cause.
  const bad = parseRange('app/foo.rb:L17-L42');
  assert.equal(bad.malformed, true);
  assert.equal(bad.from, null);

  // A reversed range is kept as written; validate() rejects it. Silently
  // reordering would hide an authoring mistake behind a plausible highlight.
  assert.deepEqual(parseRange('app/foo.rb:42-17'), { path: 'app/foo.rb', from: 42, to: 17 });
});

test('isGenerated matches machine-written paths only', () => {
  assert.ok(isGenerated('db/structure.sql'));
  assert.ok(isGenerated('package-lock.json'));
  assert.ok(isGenerated('app/assets/x.min.js'));
  assert.ok(isGenerated('vendor/gems/thing.rb'));
  assert.ok(!isGenerated('app/models/user.rb'));
  assert.ok(!isGenerated('lib/distribution.js'));
});
