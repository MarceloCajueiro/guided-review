// The build is the author's only reviewer before the page ships. These cases
// cover the warnings it must raise — and, just as important, the ones it must
// not: a warning on correct prose teaches the author to ignore the next one.
//
// Driven through the CLI because build.mjs is a script, not a module: it parses
// argv and renders at import time, so there is nothing to import and call.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD = fileURLToPath(new URL('../build.mjs', import.meta.url));

const DIFF = [
  'diff --git a/x.rb b/x.rb',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/x.rb',
  '@@ -0,0 +1,2 @@',
  '+a',
  '+b',
  '',
].join('\n');

// Warnings go to stderr and the build still exits 0, so this runs the process
// and returns stderr rather than throwing on it.
function stderrFor(beats) {
  const dir = mkdtempSync(join(tmpdir(), 'gr-'));
  try {
    const story = { number: 1, title: 'T', chapters: [{ title: 'C', beats }] };
    writeFileSync(join(dir, 's.json'), JSON.stringify(story));
    writeFileSync(join(dir, 'p.diff'), DIFF);
    const r = spawnSync(
      process.execPath,
      [BUILD, join(dir, 's.json'), join(dir, 'p.diff'), '--out', join(dir, 'o.html')],
      { encoding: 'utf8' }
    );
    return r.stderr ?? '';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('an unclosed emphasis marker is reported', () => {
  assert.match(stderrFor([{ text: 'tem *aberto sem fechar aqui' }]), /unclosed "\*" in text/);
});

test('an unclosed underscore is reported', () => {
  assert.match(stderrFor([{ text: 'nota _tambem aberta assim' }]), /unclosed "_" in text/);
});

test('a note carrying an unclosed marker is reported', () => {
  const err = stderrFor([{ text: 'ok', notes: [{ kind: 'why', text: 'razao _sem fechar' }] }]);
  assert.match(err, /unclosed "_" in note/);
});

// The whole point of keeping danglingMarkers in step with inline(): prose the
// renderer handles correctly must not draw a warning. When the two drifted,
// `/* bloco */` and a closed `*isto*` both warned.
test('correct emphasis and ordinary asterisks stay quiet', () => {
  for (const text of [
    'usa *isto* e **aquilo** e _outro_',
    'glob *.rb e outro *.js aqui',
    'multiplica a * b = c',
    'comenta /* bloco */ aqui',
    'literal em `**kwargs` e `*args`',
  ]) {
    const err = stderrFor([{ text }]);
    assert.ok(!/unclosed/.test(err), `warned on correct prose: ${text}\n${err}`);
  }
});
