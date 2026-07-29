// The stylesheet, as a single exported string.
//
// Design direction: a technical essay, not a dashboard. The prose is the
// subject and the diff is the illustration beside it — so the narrative gets a
// serif at reading size and generous measure, while the code stays visually
// quiet until a beat points at it.
//
// Deliberate choices worth keeping:
// - Serif prose / sans chrome / mono code. Three voices, three roles: the
//   author's, the tool's, the machine's. Never blur them.
// - Diff colors are desaturated. Full-strength red/green on every changed line
//   turns the page into a Christmas tree and drowns the anchor highlight, which
//   is the one color that must cut through.
// - No web fonts. The page must open offline and from a file:// URL, so the
//   stacks below are curated system faces, not a downloaded family.
// - light-dark() with a [data-theme] override: follows the OS by default, and
//   the toggle wins in both directions.

// Where a chapter comes to rest below the sticky masthead, in px.
//
// Shared with the page script deliberately: the scrollspy treats a chapter as
// active once its top crosses this same line. When the two drifted apart, j/k
// oscillated between two chapters forever — the destination landed just outside
// the threshold that decides which chapter you are in.
export const REST = 76;

export const CSS = String.raw`
:root {
  color-scheme: light dark;

  /* Neutrals are tinted — warm parchment in light, cool slate in dark. A pure
     gray next to the amber accent reads as dirty. */
  --bg:        light-dark(oklch(98.6% 0.006 85),  oklch(19% 0.014 255));
  --bg-sunk:   light-dark(oklch(96.2% 0.009 85),  oklch(16% 0.014 255));
  --bg-raised: light-dark(oklch(100% 0 0),        oklch(23% 0.015 255));
  --bg-hover:  light-dark(oklch(94.5% 0.012 85),  oklch(27% 0.017 255));
  --line:      light-dark(oklch(89% 0.012 85),    oklch(30% 0.016 255));
  --line-soft: light-dark(oklch(93.5% 0.010 85),  oklch(25.5% 0.015 255));

  --ink:       light-dark(oklch(24% 0.020 75),    oklch(92% 0.012 250));
  --ink-2:     light-dark(oklch(44% 0.018 75),    oklch(74% 0.012 250));
  --ink-3:     light-dark(oklch(58% 0.016 75),    oklch(58% 0.012 250));

  /* One accent, used sparingly: chapter numbers, progress, active nav. */
  --accent:    light-dark(oklch(52% 0.145 52),    oklch(76% 0.135 62));
  --accent-bg: light-dark(oklch(94% 0.045 62),    oklch(30% 0.055 55));

  --add:       light-dark(oklch(45% 0.095 150),   oklch(78% 0.105 155));
  --add-bg:    light-dark(oklch(95.5% 0.035 155), oklch(26% 0.045 158));
  --add-gut:   light-dark(oklch(88% 0.055 155),   oklch(34% 0.055 158));
  --del:       light-dark(oklch(48% 0.115 22),    oklch(76% 0.105 22));
  --del-bg:    light-dark(oklch(96% 0.028 22),    oklch(26% 0.045 18));
  --del-gut:   light-dark(oklch(90% 0.045 22),    oklch(34% 0.050 18));

  /* The anchor highlight must beat every other color on the page. */
  --mark:      light-dark(oklch(85% 0.130 88),    oklch(62% 0.115 88));
  --mark-bg:   light-dark(oklch(96% 0.070 92),    oklch(32% 0.060 90));

  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Charter, "Source Serif 4", Georgia, serif;
  --sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", Helvetica, sans-serif;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", "IBM Plex Mono", Menlo, Consolas, monospace;

  /* Vertical rhythm: everything is a multiple of the prose line box (28px). */
  --u: 0.5rem;
  --rail: 19rem;
  --radius: 10px;
  --ease: cubic-bezier(0.22, 0.9, 0.28, 1);
}
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"]  { color-scheme: dark; }

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  font-kerning: normal;
}

/* ─────────────────────────────  Masthead  ───────────────────────────── */

.top {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 2);
  padding: calc(var(--u) * 1.5) calc(var(--u) * 3);
  background: color-mix(in oklch, var(--bg) 88%, transparent);
  backdrop-filter: blur(14px) saturate(140%);
  border-bottom: 1px solid var(--line);
}
.top h1 {
  margin: 0;
  font-family: var(--sans);
  font-size: 0.9375rem;
  font-weight: 600;
  letter-spacing: -0.011em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.top h1 a { color: inherit; text-decoration: none; }
.top h1 a:hover { color: var(--accent); }
.pr-no {
  font-family: var(--mono);
  font-size: 0.8125rem;
  color: var(--ink-3);
  margin-right: calc(var(--u) * 0.75);
}
.top .meta {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 1.75);
  font-size: 0.8125rem;
  color: var(--ink-3);
  white-space: nowrap;
}
.stat-add { color: var(--add); font-variant-numeric: tabular-nums; }
.stat-del { color: var(--del); font-variant-numeric: tabular-nums; }

.icon-btn {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-raised);
  color: var(--ink-2);
  cursor: pointer;
  transition: background 0.15s var(--ease), color 0.15s var(--ease), border-color 0.15s var(--ease);
}
.icon-btn:hover { background: var(--bg-hover); color: var(--ink); border-color: var(--ink-3); }
.icon-btn svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
:root[data-theme="dark"] .sun, .moon { display: none; }
:root[data-theme="dark"] .moon { display: block; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) .sun { display: none; }
  :root:not([data-theme]) .moon { display: block; }
}

/* Reading progress: a hairline, not a widget. */
.progress {
  position: fixed;
  top: 0; left: 0;
  height: 2px;
  width: 0;
  background: var(--accent);
  z-index: 60;
  transition: width 0.1s linear;
}

/* ─────────────────────────────  Shell  ───────────────────────────── */

.shell {
  display: grid;
  grid-template-columns: var(--rail) minmax(0, 1fr);
  align-items: start;
}

/* ───────────────────────────  Chapter rail  ─────────────────────────── */

.rail {
  position: sticky;
  top: 57px;
  max-height: calc(100vh - 57px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: calc(var(--u) * 3) 0 calc(var(--u) * 6) calc(var(--u) * 3);
  border-right: 1px solid var(--line);
  scrollbar-width: thin;
}
.rail h2 {
  margin: 0 0 calc(var(--u) * 2);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.rail ol { list-style: none; margin: 0; padding: 0; }
.rail li { position: relative; }

/* The spine: a continuous line the chapter dots sit on. */
.rail li::before {
  content: "";
  position: absolute;
  left: 7px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--line);
}
.rail li:first-child::before { top: 14px; }
.rail li:last-child::before { bottom: auto; height: 14px; }

.rail a {
  display: grid;
  grid-template-columns: 15px minmax(0, 1fr);
  gap: calc(var(--u) * 1.5);
  align-items: baseline;
  padding: calc(var(--u) * 0.875) calc(var(--u) * 2) calc(var(--u) * 0.875) 0;
  color: var(--ink-2);
  text-decoration: none;
  font-size: 0.8125rem;
  line-height: 1.45;
  transition: color 0.15s var(--ease);
}
.rail a:hover { color: var(--ink); }
.rail .dot {
  position: relative;
  z-index: 1;
  justify-self: center;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--bg);
  box-shadow: inset 0 0 0 1.5px var(--ink-3);
  transform: translateY(-1px);
  transition: box-shadow 0.2s var(--ease), background 0.2s var(--ease);
}
.rail a:hover .dot { box-shadow: inset 0 0 0 1.5px var(--ink); }
.rail a.on { color: var(--ink); font-weight: 500; }
.rail a.on .dot { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-bg); }
.rail .files-n {
  display: block;
  font-size: 0.6875rem;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
.rail .n {
  margin-right: calc(var(--u) * 0.875);
  font-family: var(--mono);
  font-size: 0.6875rem;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
.rail a.on .n { color: var(--accent); }

/* ───────────────────────────  Reading column  ─────────────────────────── */

/* The reading column is the query container: the beat layout must react to the
   space it actually has, not to the viewport. With the rail taking ~19rem, a
   viewport-based breakpoint keeps a two-column beat long after the code panel
   has been squeezed to an unreadable sliver. */
.read {
  container: read / inline-size;
  padding: calc(var(--u) * 5) calc(var(--u) * 5) 40vh;
  min-width: 0;
}

.lede {
  max-width: 62ch;
  margin: 0 0 calc(var(--u) * 8);
  padding-bottom: calc(var(--u) * 5);
  border-bottom: 1px solid var(--line);
}
.lede .kicker {
  margin: 0 0 calc(var(--u) * 1.5);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--accent);
}
.lede h2 {
  margin: 0 0 calc(var(--u) * 2.5);
  font-family: var(--serif);
  font-size: 2.125rem;
  font-weight: 600;
  line-height: 1.18;
  letter-spacing: -0.021em;
  text-wrap: balance;
}
.lede p {
  margin: 0 0 calc(var(--u) * 2);
  font-family: var(--serif);
  font-size: 1.125rem;
  line-height: 1.68;
  color: var(--ink-2);
}
.lede p:last-child { margin-bottom: 0; }
.lede strong { color: var(--ink); font-weight: 600; }

.byline {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--u) * 1.5);
  margin-top: calc(var(--u) * 3);
  font-size: 0.8125rem;
  color: var(--ink-3);
}
.byline span::after { content: "·"; margin-left: calc(var(--u) * 1.5); color: var(--line); }
.byline span:last-child::after { content: none; }

/* ─────────────────────────────  Chapter  ───────────────────────────── */

.ch { margin-bottom: calc(var(--u) * 12); scroll-margin-top: ${REST}px; }

.ch-head { max-width: 62ch; margin-bottom: calc(var(--u) * 3.5); }
.ch-num {
  display: block;
  margin-bottom: calc(var(--u) * 1.25);
  font-family: var(--mono);
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: var(--accent);
}
.ch-head h3 {
  margin: 0;
  font-family: var(--serif);
  font-size: 1.625rem;
  font-weight: 600;
  line-height: 1.24;
  letter-spacing: -0.017em;
  text-wrap: balance;
}
.ch-head .sub {
  margin: calc(var(--u) * 1.5) 0 0;
  font-family: var(--serif);
  font-size: 1.0625rem;
  line-height: 1.65;
  color: var(--ink-2);
}

/* A beat is one unit of narrative: prose on the left, its code on the right.
   Below 54rem of column width the two stack — the prose stays above the code it
   describes, which is the whole point of the pairing. The trigger is the
   reading column, not the viewport; see the container query below. */
.beat {
  display: grid;
  grid-template-columns: minmax(0, 27rem) minmax(0, 1fr);
  gap: calc(var(--u) * 4);
  align-items: start;
  margin-bottom: calc(var(--u) * 5);
}
/* Sticky needs room to travel: when the prose is the taller half there is
   nothing to scroll past, and a sticky card just floats out of line with the
   panel it belongs to. Grid tracks report their own height, so the pairing
   stays aligned when the code is short. */
.beat-code { min-width: 0; }
/* Below ~54rem of column there isn't room for prose AND a code panel wide
   enough to read: stack them, prose first, so each paragraph still sits
   directly above the code it describes. */
@container read (max-width: 54rem) {
  .beat { grid-template-columns: minmax(0, 1fr); gap: calc(var(--u) * 2.5); }
  /* Stacked, the prose sits directly above its code — there is no second
     column travelling behind it, so sticky would only detach it from the panel
     it introduces. */
  .beat-prose { position: static; z-index: auto; max-width: 62ch; }
}

/* The prose column carries its own surface. It is sticky, so as the reader
   scrolls the code panel travels behind it — on a transparent background the
   two sets of text overlap and neither is readable. The z-index keeps it above
   that panel for the same reason. */
.beat-prose {
  position: sticky;
  top: ${REST}px;
  z-index: 1;
  padding: calc(var(--u) * 2.5) calc(var(--u) * 3) calc(var(--u) * 3);
  border-radius: var(--radius);
  background: var(--bg-raised);
  border: 1px solid var(--line-soft);
  font-family: var(--serif);
  font-size: 1.0625rem;
  line-height: 1.68;
}
.beat-prose p { margin: 0 0 calc(var(--u) * 2); }
.beat-prose p:last-child { margin-bottom: 0; }
.beat-prose strong { font-weight: 600; }
.beat-prose code {
  font-family: var(--mono);
  font-size: 0.875em;
  padding: 0.1em 0.36em;
  border-radius: 4px;
  background: var(--bg-sunk);
  border: 1px solid var(--line);
  font-variant-ligatures: none;
}
.note code { border: 1px solid var(--line-soft); }

/* Callouts carry the "why": the decision, the trade-off, the rejected path. */
.note {
  margin: calc(var(--u) * 2.5) 0 0;
  padding: calc(var(--u) * 1.75) calc(var(--u) * 2.25);
  border-radius: 8px;
  /* Sits inside the raised prose card, so it recesses instead of lifting. */
  background: var(--bg-sunk);
  border: 1px solid var(--line);
  font-family: var(--sans);
  font-size: 0.875rem;
  line-height: 1.62;
  color: var(--ink-2);
}
.note b {
  display: block;
  margin-bottom: calc(var(--u) * 0.5);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.075em;
  text-transform: uppercase;
  color: var(--ink-3);
}
.note.why      { border-left: 2px solid var(--accent); }
.note.why b    { color: var(--accent); }
.note.tradeoff { border-left: 2px solid var(--mark); }
.note.tradeoff b { color: light-dark(oklch(52% 0.115 75), var(--mark)); }
.note.rejected { border-left: 2px solid var(--del); }
.note.rejected b { color: var(--del); }
.note code {
  font-family: var(--mono);
  font-size: 0.875em;
  padding: 0.1em 0.32em;
  border-radius: 4px;
  background: var(--bg-raised);
  font-variant-ligatures: none;
}

/* ─────────────────────────────  Diff  ───────────────────────────── */

.file {
  margin-bottom: calc(var(--u) * 2);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--bg-raised);
  overflow: hidden;
}
.file:last-child { margin-bottom: 0; }
.file > summary {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 1.25);
  padding: calc(var(--u) * 1.375) calc(var(--u) * 1.75);
  cursor: pointer;
  list-style: none;
  background: var(--bg-sunk);
  border-bottom: 1px solid transparent;
  font-size: 0.8125rem;
  user-select: none;
}
.file > summary::-webkit-details-marker { display: none; }
.file[open] > summary { border-bottom-color: var(--line); }
.file > summary:hover { background: var(--bg-hover); }
.file > summary .caret {
  flex: none;
  width: 9px; height: 9px;
  color: var(--ink-3);
  transition: transform 0.18s var(--ease);
}
.file[open] > summary .caret { transform: rotate(90deg); }
.file .path {
  font-family: var(--mono);
  font-size: 0.78125rem;
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;      /* keep the filename visible when the path is truncated */
  text-align: left;
}
.file .path b { color: var(--ink); font-weight: 600; }
.file .counts {
  margin-left: auto;
  flex: none;
  font-family: var(--mono);
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
}
.tag {
  flex: none;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-family: var(--sans);
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}
.tag.added   { background: var(--add-bg); color: var(--add); }
.tag.deleted { background: var(--del-bg); color: var(--del); }
.tag.renamed, .tag.generated { background: var(--bg-hover); color: var(--ink-3); }

/* Tall diffs scroll inside the panel rather than pushing the prose out of
   view — the pairing only works while both halves are on screen. */
.code {
  margin: 0;
  max-height: calc(100vh - 140px);
  overflow: auto;
  overscroll-behavior: contain;
  font-family: var(--mono);
  font-size: 0.75rem;
  line-height: 1.62;
  font-variant-ligatures: none;
  tab-size: 2;
}
.code table { border-collapse: collapse; width: 100%; }
.code td { padding: 0 0; vertical-align: top; white-space: pre; }
.code .no {
  width: 1%;
  padding: 0 calc(var(--u) * 0.875);
  text-align: right;
  color: var(--ink-3);
  background: var(--bg-sunk);
  border-right: 1px solid var(--line-soft);
  user-select: none;
  font-variant-numeric: tabular-nums;
  font-size: 0.6875rem;
}
.code .src { padding: 0 calc(var(--u) * 1.5) 0 calc(var(--u) * 1); width: 100%; }
.code .src::before {
  content: attr(data-m);
  display: inline-block;
  width: 1ch;
  color: var(--ink-3);
  user-select: none;
}
tr.add .src { background: var(--add-bg); }
tr.add .no  { background: var(--add-gut); color: color-mix(in oklch, var(--add) 80%, var(--ink)); }
tr.add .src::before { color: var(--add); }
tr.del .src { background: var(--del-bg); }
tr.del .no  { background: var(--del-gut); color: color-mix(in oklch, var(--del) 80%, var(--ink)); }
tr.del .src::before { color: var(--del); }

tr.hunk td {
  padding: calc(var(--u) * 0.5) calc(var(--u) * 1.5);
  background: var(--bg-sunk);
  border-top: 1px solid var(--line-soft);
  border-bottom: 1px solid var(--line-soft);
  color: var(--ink-3);
  font-size: 0.6875rem;
  white-space: pre-wrap;
}
tr:first-child.hunk td { border-top: none; }

/* The anchor highlight. The weight lives in the gutter rail, not the fill:
   an anchored passage often runs 30+ lines, and a saturated wash that long
   stops reading as emphasis and starts reading as the background. */
tr.mark .src { background: var(--mark-bg); }
tr.mark .no  { background: var(--mark); color: light-dark(oklch(30% 0.06 88), oklch(96% 0.02 88)); font-weight: 600; }
tr.mark .no:last-of-type { box-shadow: inset -2px 0 0 var(--mark); }
tr.flash .src { animation: flash 1.1s var(--ease); }
@keyframes flash {
  0%, 22% { background: var(--mark); }
  100%    { background: var(--mark-bg); }
}

/* Syntax tokens. Muted on purpose — a diff is read for its shape first.
   Scoped to both containers: the fullscreen overlay renders the same rows, and
   when these were .code-only the whole file opened uncoloured. */
.code i, .overlay-body i { font-style: normal; }
.code .k, .overlay-body .k { color: light-dark(oklch(46% 0.135 300), oklch(78% 0.105 305)); }
.code .s, .overlay-body .s { color: light-dark(oklch(44% 0.105 150), oklch(76% 0.088 152)); }
.code .c, .overlay-body .c { color: var(--ink-3); font-style: italic; }
.code .n, .overlay-body .n { color: light-dark(oklch(48% 0.115 40),  oklch(78% 0.088 48)); }
.code .t, .overlay-body .t { color: light-dark(oklch(45% 0.110 235), oklch(76% 0.085 238)); }
.code .a, .overlay-body .a { color: light-dark(oklch(46% 0.105 265), oklch(75% 0.080 268)); }
.code .v, .overlay-body .v { color: light-dark(oklch(47% 0.110 20),  oklch(77% 0.085 24)); }

/* The diff legend. Green and red a reviewer already knows; the amber highlight
   is this tool's own convention — "the lines this paragraph is about" — and
   nothing on the page said so. Shown once, under the lede, rather than on every
   panel: a caption repeated forty times stops being read after the first. */
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--u) * 2.5);
  margin-top: calc(var(--u) * 3);
  padding-top: calc(var(--u) * 2.5);
  border-top: 1px solid var(--line-soft);
  font-size: 0.75rem;
  color: var(--ink-3);
}
/* The label keeps the muted ink; only the swatch takes the channel colour, via
   currentColor on the wrapper. Colouring the text too would make the legend
   louder than the diff it explains. */
.legend span { display: flex; align-items: center; gap: calc(var(--u) * 0.875); }
.legend span b { color: var(--ink-3); font-weight: 400; }
.legend i {
  width: 3px;
  height: 1em;
  border-radius: 2px;
  background: currentColor;
  flex: none;
}
.legend .l-add { color: var(--add); }
.legend .l-del { color: var(--del); }
.legend .l-mark { color: var(--mark); }

.elide {
  padding: calc(var(--u) * 1.75) calc(var(--u) * 2);
  color: var(--ink-3);
  font-size: 0.8125rem;
  font-family: var(--sans);
  text-align: center;
}

/* ─────────────────────  Fullscreen file viewer  ───────────────────── */

/* The escape hatch from a focused panel: the same file, every line, over the
   whole viewport — so reading the rest never costs the reader the narrative.
   A plain overlay rather than <dialog>: this page must work from file:// in
   whatever browser it is mailed to, and the focus trap below is the only part
   of <dialog> actually needed here. */
.full-btn {
  flex: none;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin-left: calc(var(--u) * 0.75);
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--ink-3);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s var(--ease), background 0.15s var(--ease), color 0.15s var(--ease);
}
.full-btn svg { width: 13px; height: 13px; }
/* Revealed on hover to keep the header quiet, but always present for keyboard
   and touch users, who never produce a hover. */
.file > summary:hover .full-btn,
.full-btn:focus-visible { opacity: 1; }
.full-btn:hover { background: var(--bg-hover); color: var(--ink); border-color: var(--line); }
@media (hover: none) { .full-btn { opacity: 1; } }

.link-btn {
  border: 0;
  padding: 0;
  background: none;
  font: inherit;
  color: var(--accent);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.link-btn:hover { text-decoration-thickness: 2px; }

.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: none;
  flex-direction: column;
  background: var(--bg);
}
.overlay[open] { display: flex; }
.overlay-head {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 1.5);
  flex: none;
  padding: calc(var(--u) * 1.5) calc(var(--u) * 3);
  border-bottom: 1px solid var(--line);
  background: var(--bg-sunk);
  font-size: 0.8125rem;
}
.overlay-head .path { font-family: var(--mono); font-size: 0.8125rem; color: var(--ink); }
.overlay-head .hint {
  color: var(--ink-3);
  font-size: 0.75rem;
  margin-left: calc(var(--u) * 1);
}
.overlay-head .spacer { margin-left: auto; }
.overlay-close {
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 0.75);
  padding: calc(var(--u) * 0.5) calc(var(--u) * 1.25);
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg-raised);
  color: var(--ink-2);
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}
.overlay-close:hover { background: var(--bg-hover); color: var(--ink); }
.overlay-close kbd {
  font-family: var(--mono);
  font-size: 0.6875rem;
  padding: 0.05rem 0.3rem;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--bg-sunk);
}
/* The scroll container. max-height is not enough — the code block inside sets
   its own, and a nested cap would clip the file the overlay exists to show. */
.overlay-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  font-family: var(--mono);
  font-size: 0.78125rem;
  line-height: 1.62;
  font-variant-ligatures: none;
  tab-size: 2;
}
.overlay-body table { border-collapse: collapse; width: 100%; }
.overlay-body td { padding: 0; vertical-align: top; white-space: pre; }
/* The overlay reuses the row markup verbatim, so it inherits .code's cell
   rules by repeating them here rather than by wrapping in .code — whose
   max-height is exactly what must not apply. */
.overlay-body .no {
  width: 1%;
  padding: 0 calc(var(--u) * 1);
  text-align: right;
  color: var(--ink-3);
  background: var(--bg-sunk);
  border-right: 1px solid var(--line-soft);
  user-select: none;
  font-variant-numeric: tabular-nums;
  font-size: 0.71875rem;
}
.overlay-body .src { padding: 0 calc(var(--u) * 1.5) 0 calc(var(--u) * 1); width: 100%; }
.overlay-body .src::before {
  content: attr(data-m);
  display: inline-block;
  width: 1ch;
  color: var(--ink-3);
  user-select: none;
}
/* Scrolling is locked while the overlay is up: without this the page behind
   drifts under the fixed layer and the reader returns somewhere else. */
body.overlay-open { overflow: hidden; }

/* ───────────────────────  Appendix & footer  ─────────────────────── */

.appendix {
  margin-top: calc(var(--u) * 6);
  padding-top: calc(var(--u) * 4);
  border-top: 1px solid var(--line);
}
.appendix h3 {
  margin: 0 0 calc(var(--u) * 1);
  font-family: var(--serif);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.014em;
}
.appendix > p {
  max-width: 62ch;
  margin: 0 0 calc(var(--u) * 3);
  font-size: 0.875rem;
  color: var(--ink-3);
}

.end {
  max-width: 62ch;
  margin-top: calc(var(--u) * 8);
  padding-top: calc(var(--u) * 4);
  border-top: 1px solid var(--line);
  font-size: 0.8125rem;
  color: var(--ink-3);
}
.end a { color: var(--accent); text-decoration: none; }
.end a:hover { text-decoration: underline; }

/* ─────────────────────────  Keyboard nav  ───────────────────────── */

.keys {
  position: fixed;
  right: calc(var(--u) * 3);
  bottom: calc(var(--u) * 3);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: calc(var(--u) * 1.25);
  padding: calc(var(--u) * 1) calc(var(--u) * 1.75);
  border: 1px solid var(--line);
  border-radius: 999px;
  background: color-mix(in oklch, var(--bg-raised) 92%, transparent);
  backdrop-filter: blur(12px);
  box-shadow: 0 2px 14px light-dark(oklch(0% 0 0 / 0.07), oklch(0% 0 0 / 0.32));
  font-size: 0.75rem;
  color: var(--ink-3);
}
.keys kbd {
  font-family: var(--mono);
  font-size: 0.6875rem;
  padding: 0.1rem 0.34rem;
  border: 1px solid var(--line);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--bg-sunk);
  color: var(--ink-2);
}
.keys button {
  border: 0; background: none; padding: 0;
  font: inherit; color: var(--ink-3); cursor: pointer;
}
.keys button:hover { color: var(--ink); }
@media (max-width: 900px) { .keys { display: none; } }

@media (max-width: 1000px) {
  .shell { grid-template-columns: minmax(0, 1fr); }
  .rail {
    position: static;
    max-height: none;
    border-right: 0;
    border-bottom: 1px solid var(--line);
    padding: calc(var(--u) * 2.5) calc(var(--u) * 3);
  }
  .read { padding: calc(var(--u) * 4) calc(var(--u) * 3) 30vh; }
  .lede h2 { font-size: 1.75rem; }
}

@media print {
  .top, .rail, .keys, .progress { display: none; }
  .shell { display: block; }
  .beat { display: block; }
  .beat-prose { position: static; margin-bottom: 1rem; }
  .file { break-inside: avoid; }
  .ch { break-before: page; }
}
`;
