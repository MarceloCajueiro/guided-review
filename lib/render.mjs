// Renders the story JSON + parsed diff into one self-contained HTML page.

import { CSS, REST } from './theme.mjs';
import { escapeHtml, highlight, languageOf } from './highlight.mjs';
import { parseRange } from './diff.mjs';

// Inline markup for prose: `code`, **bold**, _italic_. Applied AFTER escaping,
// so author text can never inject HTML.
function inline(s) {
  const spans = [];
  // Code spans are lifted out before the emphasis passes and restored after.
  // Three independent sweeps cannot see each other's boundaries, so prose like
  // "see `a**b` and **x**" used to emit <code>a<strong>b</code> — tags crossing
  // each other, which some browsers recover from by swallowing the rest of the
  // paragraph. Prose about code containing ** (kwargs, pointers) is ordinary.
  //
  // The placeholder is delimited by U+E000 (private use area): a printable
  // sentinel would collide with author text (" 1 " occurs in ordinary prose),
  // and NUL would make this file read as binary to grep and diff.
  const SENTINEL = '\uE000';
  const escaped = escapeHtml(s ?? '').replace(/`([^`]+)`/g, (_, code) => {
    spans.push(code);
    return `${SENTINEL}${spans.length - 1}${SENTINEL}`;
  });
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:!?])/g, '$1<em>$2</em>')
    .replace(/\uE000(\d+)\uE000/g, (_, i) => `<code>${spans[Number(i)]}</code>`);
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

// `kind` defaults to `why` when absent, but an unrecognized value is rejected by
// validate() rather than silently relabelled — presenting an author's trade-off
// as a justification invents intent they never expressed.
function renderNotes(notes = [], labels = NOTE_LABELS) {
  return notes
    .filter((n) => n && n.text)
    .map((n) => {
      const kind = n.kind || 'why';
      return `<aside class="note ${kind}"><b>${escapeHtml(labels[kind])}</b>${inline(n.text)}</aside>`;
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

// Beyond this many changed lines, an un-anchored file collapses to a summary
// rather than dumping itself into the page.
const MAX_LINES = 400;

const ROW = {
  add: { cls: 'add', marker: '+' },
  del: { cls: 'del', marker: '−' },
  ctx: { cls: '', marker: ' ' },
};

// Paths go into DOM ids and URL fragments, so anything outside [\w.-] has to
// go — a space alone makes the fragment unaddressable and breaks deep links.
function slugPath(path) {
  return path.replace(/[^\w.-]/g, '_');
}

// Only http(s) reaches an href. Anything else — `javascript:`, `data:` — is
// replaced rather than sanitized, since there is no valid reason for a PR URL
// to carry another scheme.
function safeUrl(u) {
  return /^https?:\/\//i.test(String(u ?? '')) ? String(u) : '#';
}

/**
 * Reduce a file's hunks to the neighbourhoods around `marks`, dropping the rest.
 *
 * An 800-line new file has one or two passages the narrative actually points
 * at. Showing all of it buries them; collapsing the file hides them entirely.
 * Focusing keeps the anchored passage readable in place.
 *
 * EVERY dropped line is accounted for by a marker — leading, between, and
 * trailing. A segment with no lines is a pure trailing marker. Hiding code
 * without saying so is the one failure this tool must never commit: a reviewer
 * who reaches the end of a panel and sees no marker concludes the file ended
 * there, and approves what they never read.
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
    // Mark a window of FOCUS_PAD lines around every anchored line.
    const near = new Array(hunk.lines.length).fill(false);
    hunk.lines.forEach((l, i) => {
      if (l.newNo == null || !marks.has(l.newNo)) return;
      const from = Math.max(0, i - FOCUS_PAD);
      const to = Math.min(hunk.lines.length - 1, i + FOCUS_PAD);
      for (let n = from; n <= to; n++) near[n] = true;
    });
    for (let i = 0; i < hunk.lines.length; i++) {
      if (near[i]) { keep.push(hunk.lines[i]); continue; }
      // flush() zeroes the counter, so this line is counted once — assigning 1
      // here instead double-counted the first line of every gap.
      if (keep.length) flush();
      skipped++;
    }
    flush();
    // Lines trailing the last kept run: a marker with no lines of its own.
    if (skipped) out.push({ header: hunk.header, lines: [], skippedBefore: skipped });
  }
  return out;
}

/**
 * Render a file's diff. `marks` is a Set of NEW-side line numbers to highlight.
 * Anchored files are focused to those anchors — MAX_LINES does not apply to
 * them. Un-anchored files over MAX_LINES, and generated files, collapse to a
 * summary line.
 *
 * `idScope` prefixes the per-line DOM ids; pass a value unique to this panel,
 * or omit it to emit no ids at all (appendix panels, which nothing links to).
 */
function renderFile(file, { marks = new Set(), open = true, idScope = '', prUrl = '#' } = {}) {
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
  // times.
  //
  // Below the threshold, focusing would hide fewer lines than the "N lines not
  // shown" markers cost, so showing the file whole is the kinder option. The
  // threshold is what focusing would keep — a FOCUS_PAD window on each side of
  // the marked lines — plus a small margin so a file barely over it doesn't
  // gain a marker announcing that two lines were hidden.
  const focusThreshold = FOCUS_PAD * 2 + marks.size + 8;
  const focused =
    marks.size > 0 && !file.isGenerated && !file.isBinary && total > focusThreshold;

  if (file.isBinary) {
    body = '<div class="elide">Binary file — no textual diff.</div>';
  } else if (total === 0) {
    body = '<div class="elide">No content changes (mode or rename only).</div>';
  } else if (file.isGenerated || (total > MAX_LINES && marks.size === 0)) {
    const why = file.isGenerated
      ? 'Generated file — collapsed by default.'
      : `${total.toLocaleString('en-US')} changed lines — collapsed by default.`;
    body = `<div class="elide">${why} Open on <a href="${escapeHtml(prUrl)}">GitHub</a> to read it in full.</div>`;
  } else {
    const hunks = focused ? focusHunks(file, marks) : file.hunks;
    const rows = [];
    for (const hunk of hunks) {
      const label = focused && hunk.skippedBefore
        ? `⋯ ${hunk.skippedBefore.toLocaleString('en-US')} lines not shown`
        : escapeHtml(hunk.header);
      rows.push(`<tr class="hunk"><td colspan="3">${label}</td></tr>`);
      for (const l of hunk.lines) {
        const row = ROW[l.type];
        const marked = l.newNo != null && marks.has(l.newNo) ? ' mark' : '';
        // Only the panel that owns a line mints its id. The same file is
        // rendered once per beat that anchors it, so an unscoped id would be
        // emitted several times — invalid HTML, and getElementById would send
        // every deep link to whichever panel happened to render first.
        const id = l.newNo != null && idScope ? ` id="${idScope}-${l.newNo}"` : '';
        rows.push(
          `<tr class="${row.cls}${marked}"${id}>` +
          `<td class="no">${l.oldNo ?? ''}</td>` +
          `<td class="no">${l.newNo ?? ''}</td>` +
          `<td class="src" data-m="${row.marker}">${highlight(l.content, lang)}</td></tr>`
        );
      }
    }
    body = `<div class="code"><table>${rows.join('')}</table></div>`;
    if (focused) {
      body += `<div class="elide">Showing the passage this section is about — ` +
        `<a href="${escapeHtml(prUrl)}">read the full file on GitHub</a>.</div>`;
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

function renderBeat(beat, byPath, used, labels, { key, prUrl }) {
  const anchors = Array.isArray(beat.files) ? beat.files : [];
  const perFile = marksFor(anchors, byPath);

  const prose = `<div class="beat-prose">${paragraphs(beat.text)}${renderNotes(beat.notes, labels)}</div>`;

  const files = [];
  for (const [path, marks] of perFile) {
    const file = byPath.get(path);
    used.add(path);
    files.push(renderFile(file, { marks, idScope: `${key}-L${slugPath(path)}`, prUrl }));
  }
  // The wrapper is emitted even with no files: it is a grid track, and dropping
  // it collapses the two-column beat layout.
  const code = `<div class="beat-code">${files.join('')}</div>`;

  return `<div class="beat">${prose}${code}</div>`;
}

function renderChapter(ch, n, byPath, used, L, prUrl) {
  const beats = (ch.beats || [])
    .map((b, i) => renderBeat(b, byPath, used, L.notes, { key: `c${n}b${i + 1}`, prUrl }))
    .join('');
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

  // Where a chapter comes to rest below the masthead. Interpolated from the
  // REST constant in theme.mjs, which the stylesheet uses for the matching
  // scroll-margin — the two must not drift apart.
  var REST = ${REST};

  // Active chapter = the last one whose top has crossed the masthead. Chapters
  // are taller than the viewport, so IntersectionObserver would flip between
  // neighbours mid-scroll; a position read is stable.
  //
  // Measured against the viewport, not offsetTop: the chapters sit inside a
  // positioned column, so offsetTop is relative to that column while scrollY is
  // absolute — comparing them is off by the column's own offset.
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

  // One implementation for both the E key and the button: two copies of this
  // drift apart the moment either is touched.
  function toggleAll() {
    var all = document.querySelectorAll('.file');
    var anyClosed = [].some.call(all, function (d) { return !d.open; });
    [].forEach.call(all, function (d) { d.open = anyClosed; });
  }

  addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.key === 'j' || e.key === 'ArrowRight') { e.preventDefault(); go(current + 1); }
    else if (e.key === 'k' || e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
    else if (e.key === 'e') { e.preventDefault(); toggleAll(); }
  });

  document.getElementById('expand').addEventListener('click', toggleAll);

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
  // Escaping stops a URL from breaking out of the attribute; it says nothing
  // about the scheme, and `javascript:` in an href is live code. This page is
  // built to be handed to other reviewers, so the scheme is checked here rather
  // than trusted from the story JSON.
  const url = safeUrl(story.url);
  const prUrl = url === '#' ? '#' : `${url}/files`;

  const used = new Set();
  const chapters = (story.chapters || []).map((ch, i) =>
    renderChapter(ch, i + 1, byPath, used, L, prUrl)
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
      leftover.map((f) => renderFile(f, { open: false, prUrl })).join('') +
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
  <h1><span class="pr-no">#${escapeHtml(String(story.number))}</span><a href="${escapeHtml(url)}">${escapeHtml(story.title)}</a></h1>
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
      <a href="${escapeHtml(url)}">#${escapeHtml(String(story.number))}</a>${story.headSha ? ` at <code>${escapeHtml(story.headSha.slice(0, 7))}</code>` : ''}.
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
