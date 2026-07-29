// The class-mapping bug these pin was invisible by inspection: JSON and YAML
// numbers rendered with class="" — unhighlighted, but not obviously broken —
// because a rule containing its own capture group shifted every index after it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { highlight, escapeHtml, languageOf } from '../lib/highlight.mjs';

const classesIn = (html) => [...html.matchAll(/<i class="([^"]*)">/g)].map((m) => m[1]);

test('no language emits an empty class', () => {
  const samples = {
    ruby: 'def x; return 42; end',
    js: 'const a = 42;',
    python: 'def f(): return 42',
    sql: 'SELECT 42 FROM t',
    css: '.a { width: 42px; }',
    go: 'func f() int { return 42 }',
    rust: 'fn f() -> i32 { 42 }',
    php: 'function f() { return 42; }',
    java: 'public int f() { return 42; }',
    shell: 'if true; then echo 42; fi',
    json: '{"k": 12, "ok": true}',
    yaml: 'key: 5\nflag: true',
    html: '<b class="x">hi</b>',
    markdown: '# Title with `code`',
  };
  for (const [lang, src] of Object.entries(samples)) {
    const classes = classesIn(highlight(src, lang));
    assert.ok(classes.length > 0, `${lang}: nothing highlighted`);
    assert.ok(!classes.includes(''), `${lang}: emitted an empty class`);
  }
});

// Both languages declare a rule with an inner group before the number rule.
test('numbers are classed in JSON and YAML', () => {
  assert.match(highlight('{"k": 12}', 'json'), /<i class="n">12<\/i>/);
  assert.match(highlight('a: 5', 'yaml'), /<i class="n">5<\/i>/);
});

test('escaping holds for every language, including the unknown fallthrough', () => {
  const hostile = '"<script>alert(1)</script>" & \'x\'';
  for (const lang of ['ruby', 'js', 'json', 'yaml', 'html', 'sql', null]) {
    const out = highlight(hostile, lang);
    assert.ok(!/<script>/.test(out), `${lang}: raw <script> survived`);
    assert.ok(!out.includes('alert(1)</script>'), `${lang}: tag reconstructed`);
  }
});

test('escapeHtml covers every character that can break an attribute', () => {
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});

test('a keyword inside a string is not highlighted as a keyword', () => {
  // Rule order is precedence: strings must win over keywords.
  const out = highlight('const a = "return false";', 'js');
  assert.match(out, /<i class="s">&quot;return false&quot;<\/i>/);
});

test('very long lines skip tokenization but stay escaped', () => {
  const line = '"'.repeat(3000) + '<b>';
  const out = highlight(line, 'js');
  assert.ok(!out.includes('<b>'));
  assert.ok(!out.includes('<i class='));
});

test('languageOf reads the last meaningful extension', () => {
  assert.equal(languageOf('app/views/_bar.html.erb'), 'html');
  assert.equal(languageOf('app/models/user.rb'), 'ruby');
  assert.equal(languageOf('Gemfile'), 'ruby');
  assert.equal(languageOf('Dockerfile'), 'shell');
  assert.equal(languageOf('README'), null);
});
