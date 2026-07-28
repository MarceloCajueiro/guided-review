// Renders the story JSON + parsed diff into one self-contained HTML page.

import { CSS } from './theme.mjs';
import { escapeHtml, highlight, languageOf } from './highlight.mjs';
import { parseRange } from './diff.mjs';

// Inline markup for prose: `code`, **bold**, _italic_. Applied AFTER escaping,
// so author text can never inject HTML.
function inline(s) {
  return escapeHtml(s ?? '')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:!?])/g, '$1<em>$2</em>');
}

function paragraphs(text) {
  return String(text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${inline(p.replace(/\n/g, ' '))}</p>`)
    .join('');
}

const NOTE_LABELS = { why: 'Why', tradeoff: 'Trade-off', rejected: 'Considered and rejected' };

function renderNotes(notes = [], labels = NOTE_LABELS) {
  return notes
    .filter((n) => n && n.text)
    .map((n) => {
      const kind = ['why', 'tradeoff', 'rejected'].includes(n.kind) ? n.kind : 'why';
      return `<aside class="note ${kind}"><b>${escapeHtml(labels[kind] || NOTE_LABELS[kind])}</b>${inline(n.text)}</aside>`;
    })
    .join('');
}

const CARET = '<svg class="caret" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function fileTag(file) {
  if (file.isGenerated) return '<span class="tag generated">generated</span>';
  if (file.status === 'added') return '<span class="tag added">new</span>';
  if (file.status === 'deleted') return '<span class="tag deleted">deleted</span>';
  if (file.status === 'renamed') return '<span class="tag renamed">renamed</span>';
  return '';
}

function pathHtml(path) {
  const i = path.lastIndexOf('/');
  // Rendered RTL by CSS so truncation eats the directory, never the filename.
  // The bidi isolate keeps the slashes from being reordered.
  const html = i === -1
    ? `<b>${escapeHtml(path)}</b>`
    : `${escapeHtml(path.slice(0, i + 1))}<b>${escapeHtml(path.slice(i + 1))}</b>`;
  return `<span class="path"><bdi>${html}</bdi></span>`;
}

// Lines of unchanged context kept around each anchored region when a large
// file is focused down to its anchors.
const FOCUS_PAD = 12;

/**
 * Reduce a file's hunks to the neighbourhoods around `marks`, dropping the rest.
 *
 * An 800-line new file has one or two passages the narrative actually points
 * at. Showing all of it buries them; collapsing the file hides them entirely.
 * Focusing keeps the anchored passage readable in place, with a marker naming
 * how much was skipped so nobody mistakes it for the whole file.
 */
function focusHunks(file, marks) {
  const out = [];
  for (const hunk of file.hunks) {
    let keep = [];
    let skipped = 0;
    const flush = () => {
      if (!keep.length) return;
      out.push({ header: hunk.header, lines: keep, skippedBefore: skipped });
      keep = [];
      skipped = 0;
    };
    // Distance (in lines) from each line to the nearest marked line.
    const idxMarked = hunk.lines.map((l) => l.newNo != null && marks.has(l.newNo));
    const near = hunk.lines.map((_, i) => {
      for (let d = 0; d <= FOCUS_PAD; d++) {
        if (idxMarked[i - d] || idxMarked[i + d]) return true;
      }
      return false;
    });
    for (let i = 0; i < hunk.lines.length; i++) {
      if (near[i]) keep.push(hunk.lines[i]);
      else if (keep.length) { flush(); skipped = 1; }
      else skipped++;
    }
    flush();
  }
  return out;
}

/**
 * Render a file's diff. `marks` is a Set of NEW-side line numbers to highlight.
 * Large files with anchors are focused to those anchors; large files without
 * anchors (and generated files) collapse to a summary line.
 */
function renderFile(file, { marks = new Set(), open = true, maxLines = 400 } = {}) {
  const lang = languageOf(file.path);
  const counts =
    `<span class="counts"><span class="stat-add">+${file.additions}</span> ` +
    `<span class="stat-del">−${file.deletions}</span></span>`;
  const head = `<summary>${CARET}${pathHtml(file.path)}${fileTag(file)}${counts}</summary>`;

  let body;
  const total = file.hunks.reduce((n, h) => n + h.lines.length, 0);
  // A line-anchored panel shows the passage the paragraph is about, plus
  // context — not the whole file. Two reasons: a long file buries the anchor,
  // and a file cited by three beats would otherwise be re-read in full three
  // times. `focusThreshold` is where "just show all of it" stops being kinder.
  const focused =
    marks.size > 0 && !file.isGenerated && !file.isBinary &&
    total > FOCUS_PAD * 2 + marks.size + 8;

  if (file.isBinary) {
    body = '<div class="elide">Binary file — no textual diff.</div>';
  } else if (total === 0) {
    body = '<div class="elide">No content changes (mode or rename only).</div>';
  } else if (file.isGenerated || (total > maxLines && marks.size === 0)) {
    const why = file.isGenerated
      ? 'Generated file — collapsed by default.'
      : `${total.toLocaleString('en-US')} changed lines — collapsed by default.`;
    body = `<div class="elide">${why} Open on <a href="${escapeHtml(file.prUrl || '#')}">GitHub</a> to read it in full.</div>`;
  } else {
    const hunks = focused ? focusHunks(file, marks) : file.hunks;
    const rows = [];
    for (const hunk of hunks) {
      const label = focused && hunk.skippedBefore
        ? `⋯ ${hunk.skippedBefore.toLocaleString('en-US')} lines not shown`
        : escapeHtml(hunk.header);
      rows.push(`<tr class="hunk"><td colspan="3">${label}</td></tr>`);
      for (const l of hunk.lines) {
        const cls = l.type === 'add' ? 'add' : l.type === 'del' ? 'del' : '';
        const marked = l.newNo != null && marks.has(l.newNo) ? ' mark' : '';
        const m = l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' ';
        const id = l.newNo != null ? ` id="L${escapeHtml(file.path)}-${l.newNo}"` : '';
        rows.push(
          `<tr class="${cls}${marked}"${id}>` +
          `<td class="no">${l.oldNo ?? ''}</td>` +
          `<td class="no">${l.newNo ?? ''}</td>` +
          `<td class="src" data-m="${m}">${highlight(l.content, lang)}</td></tr>`
        );
      }
    }
    body = `<div class="code"><table>${rows.join('')}</table></div>`;
    if (focused) {
      body += `<div class="elide">Showing the passage this section is about — ` +
        `<a href="${escapeHtml(file.prUrl || '#')}">read the full file on GitHub</a>.</div>`;
    }
  }

  const isOpen = open && !file.isGenerated ? ' open' : '';
  return `<details class="file"${isOpen}>${head}${body}</details>`;
}

/** Collect NEW-side line numbers covered by a beat's anchors, per file. */
function marksFor(anchors, byPath) {
  const perFile = new Map();
  for (const spec of anchors) {
    const { path, from, to } = parseRange(spec);
    const file = byPath.get(path);
    if (!file) continue;
    if (!perFile.has(path)) perFile.set(path, new Set());
    if (from == null) continue; // whole-file anchor: no line highlight
    const set = perFile.get(path);
    for (let n = from; n <= to; n++) set.add(n);
  }
  return perFile;
}

function renderBeat(beat, byPath, used, labels) {
  const anchors = Array.isArray(beat.files) ? beat.files : [];
  const perFile = marksFor(anchors, byPath);

  const prose = `<div class="beat-prose">${paragraphs(beat.text)}${renderNotes(beat.notes, labels)}</div>`;

  const files = [];
  for (const [path, marks] of perFile) {
    const file = byPath.get(path);
    used.add(path);
    files.push(renderFile(file, { marks }));
  }
  const code = files.length
    ? `<div class="beat-code">${files.join('')}</div>`
    : '<div class="beat-code"></div>';

  return `<div class="beat">${prose}${code}</div>`;
}

function renderChapter(ch, n, byPath, used, L) {
  const beats = (ch.beats || []).map((b) => renderBeat(b, byPath, used, L.notes)).join('');
  const sub = ch.summary ? `<p class="sub">${inline(ch.summary)}</p>` : '';
  return `
<section class="ch" id="ch-${n}">
  <header class="ch-head">
    <span class="ch-num">${escapeHtml(L.chapter)} ${String(n).padStart(2, '0')}</span>
    <h3>${inline(ch.title)}</h3>
    ${sub}
  </header>
  ${beats}
</section>`;
}

const SUN = '<svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2M12 19.4v2M4.4 4.4l1.4 1.4M18.2 18.2l1.4 1.4M2.6 12h2M19.4 12h2M4.4 19.6l1.4-1.4M18.2 5.8l1.4-1.4"/></svg>';
const MOON = '<svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.2A8.2 8.2 0 019.8 4a8.2 8.2 0 1010.2 10.2z"/></svg>';

const SCRIPT = String.raw`
(function () {
  var root = document.documentElement;
  var KEY = 'gr-theme';
  try {
    var saved = localStorage.getItem(KEY);
    if (saved) root.setAttribute('data-theme', saved);
  } catch (e) {}

  document.getElementById('theme').addEventListener('click', function () {
    var dark = root.getAttribute('data-theme')
      ? root.getAttribute('data-theme') === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(KEY, next); } catch (e) {}
  });

  var chapters = [].slice.call(document.querySelectorAll('.ch'));
  var links = [].slice.call(document.querySelectorAll('.rail a'));
  var bar = document.getElementById('progress');
  // -1, not 0: the first onScroll() must be able to paint chapter 0 as active.
  // Starting at 0 makes that call a no-op and the rail loads with nothing marked.
  var current = -1;

  function setCurrent(i) {
    if (i === current) return;
    current = i;
    links.forEach(function (a, n) { a.classList.toggle('on', n === i); });
  }

  // Active chapter = the last one whose top has crossed the masthead. Chapters
  // are taller than the viewport, so IntersectionObserver would flip between
  // neighbours mid-scroll; a position read is stable.
  //
  // Measured against the viewport, not offsetTop: the chapters sit inside a
  // positioned column, so offsetTop is relative to that column while scrollY is
  // absolute — comparing them is off by the column's own offset.
  // Where a chapter comes to rest when navigated to. The scrollspy uses the
  // same value, so a chapter that has just been jumped to reads as the active
  // one — off-by-a-few here makes j/k oscillate between two chapters forever.
  var REST = 76;

  function onScroll() {
    var i = 0;
    for (var n = 0; n < chapters.length; n++) {
      // +1 absorbs the sub-pixel rounding of a smooth scroll landing.
      if (chapters[n].getBoundingClientRect().top <= REST + 1) i = n; else break;
    }
    setCurrent(i);
    var max = document.body.scrollHeight - innerHeight;
    bar.style.width = (max > 0 ? Math.min(100, (scrollY / max) * 100) : 0) + '%';
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  onScroll();

  // Scroll to an absolute position rather than scrollIntoView: the target is
  // computed from the viewport rect, so it lands under the masthead regardless
  // of the element's offset parent, and it honours prefers-reduced-motion.
  var SMOOTH = !matchMedia('(prefers-reduced-motion: reduce)').matches;

  function go(i) {
    if (i < 0 || i >= chapters.length) return;
    var top = chapters[i].getBoundingClientRect().top + window.scrollY - REST;
    window.scrollTo({ top: Math.max(0, top), behavior: SMOOTH ? 'smooth' : 'auto' });
    // Claim the destination immediately. A smooth scroll fires many scroll
    // events on the way, and reading "current" off them mid-flight makes the
    // next keypress compute its step from wherever the animation happens to be.
    setCurrent(i);
  }

  addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.key === 'j' || e.key === 'ArrowRight') { e.preventDefault(); go(current + 1); }
    else if (e.key === 'k' || e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
    else if (e.key === 'e') {
      e.preventDefault();
      var all = document.querySelectorAll('.file');
      var anyClosed = [].some.call(all, function (d) { return !d.open; });
      [].forEach.call(all, function (d) { d.open = anyClosed; });
    }
  });

  document.getElementById('expand').addEventListener('click', function () {
    var all = document.querySelectorAll('.file');
    var anyClosed = [].some.call(all, function (d) { return !d.open; });
    [].forEach.call(all, function (d) { d.open = anyClosed; });
  });

  // Clicking a chapter link should land you at the chapter, not wherever the
  // browser's default anchor jump puts it under the sticky masthead.
  links.forEach(function (a, i) {
    a.addEventListener('click', function (e) { e.preventDefault(); go(i); });
  });

  // Deep links to a specific line (#Lpath-42) flash the row so it's findable.
  function flashHash() {
    if (!location.hash) return;
    var el = document.getElementById(location.hash.slice(1));
    if (!el) return;
    var d = el.closest('details');
    while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details'); }
    el.scrollIntoView({ block: 'center' });
    el.classList.add('flash');
    setTimeout(function () { el.classList.remove('flash'); }, 1200);
  }
  addEventListener('hashchange', flashHash);
  flashHash();
})();
`;

const EN = {
  chapter: 'Chapter',
  contents: 'Contents',
  guidedReview: 'Guided review',
  appendixTitle: 'Appendix — files not covered by the narrative',
  appendixBody: 'These changed with the PR but carry no decision of their own: generated output, mechanical renames, and boilerplate. Listed for completeness.',
  filesWord: (n) => `${n} file${n === 1 ? '' : 's'}`,
  navHint: 'chapter',
  expandAll: 'expand all',
  notes: NOTE_LABELS,
};

const PT = {
  chapter: 'Capítulo',
  contents: 'Sumário',
  guidedReview: 'Review guiado',
  appendixTitle: 'Apêndice — arquivos fora da narrativa',
  appendixBody: 'Mudaram junto com o PR, mas não carregam decisão própria: código gerado, renomeações mecânicas e boilerplate. Listados por completude.',
  filesWord: (n) => `${n} arquivo${n === 1 ? '' : 's'}`,
  navHint: 'capítulo',
  expandAll: 'expandir tudo',
  notes: { why: 'Por quê', tradeoff: 'Trade-off', rejected: 'Considerado e descartado' },
};

export function render(story, files, { lang = 'en' } = {}) {
  const L = lang === 'pt' ? PT : EN;
  const byPath = new Map(files.map((f) => [f.path, f]));
  for (const f of files) f.prUrl = story.url ? `${story.url}/files` : '#';

  const used = new Set();
  const chapters = (story.chapters || []).map((ch, i) =>
    renderChapter(ch, i + 1, byPath, used, L)
  );

  const nav = (story.chapters || [])
    .map((ch, i) => {
      const n = new Set();
      for (const b of ch.beats || []) for (const f of b.files || []) n.add(parseRange(f).path);
      return `<li><a href="#ch-${i + 1}"><span class="dot"></span><span>` +
        `<span class="n">${String(i + 1).padStart(2, '0')}</span>${inline(ch.title)}` +
        `<span class="files-n">${L.filesWord(n.size)}</span></span></a></li>`;
    })
    .join('');

  const leftover = files.filter((f) => !used.has(f.path));
  const appendix = leftover.length
    ? `<section class="appendix"><h3>${escapeHtml(L.appendixTitle)}</h3><p>${escapeHtml(L.appendixBody)}</p>` +
      leftover.map((f) => renderFile(f, { open: false })).join('') +
      '</section>'
    : '';

  const meta = [
    story.author && `@${story.author}`,
    story.branch,
    `${(story.additions ?? 0).toLocaleString('en-US')} +`,
    `${(story.deletions ?? 0).toLocaleString('en-US')} −`,
    L.filesWord(files.length),
  ].filter(Boolean);

  const title = `#${story.number} ${story.title}`;

  return `<!doctype html>
<html lang="${lang === 'pt' ? 'pt-BR' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — ${escapeHtml(L.guidedReview)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="progress" id="progress"></div>

<header class="top">
  <h1><span class="pr-no">#${escapeHtml(String(story.number))}</span><a href="${escapeHtml(story.url || '#')}">${escapeHtml(story.title)}</a></h1>
  <div class="meta">
    <span class="stat-add">+${(story.additions ?? 0).toLocaleString('en-US')}</span>
    <span class="stat-del">−${(story.deletions ?? 0).toLocaleString('en-US')}</span>
    <button class="icon-btn" id="theme" type="button" aria-label="Toggle theme">${SUN}${MOON}</button>
  </div>
</header>

<div class="shell">
  <nav class="rail">
    <h2>${escapeHtml(L.contents)}</h2>
    <ol>${nav}</ol>
  </nav>

  <main class="read">
    <div class="lede">
      <p class="kicker">${escapeHtml(L.guidedReview)}</p>
      <h2>${inline(story.headline || story.title)}</h2>
      ${paragraphs(story.lede)}
      <div class="byline">${meta.map((m) => `<span>${escapeHtml(m)}</span>`).join('')}</div>
    </div>

    ${chapters.join('')}
    ${appendix}

    <footer class="end">
      <p>Generated by <a href="https://github.com/MarceloCajueiro/guided-review">guided-review</a> from
      <a href="${escapeHtml(story.url || '#')}">#${escapeHtml(String(story.number))}</a>${story.headSha ? ` at <code>${escapeHtml(story.headSha.slice(0, 7))}</code>` : ''}.
      The narrative explains intent; it is not a substitute for reviewing the code.</p>
    </footer>
  </main>
</div>

<div class="keys">
  <kbd>J</kbd><kbd>K</kbd><span>${escapeHtml(L.navHint)}</span>
  <kbd>E</kbd><button id="expand" type="button">${escapeHtml(L.expandAll)}</button>
</div>

<script>${SCRIPT}</script>
</body>
</html>`;
}
