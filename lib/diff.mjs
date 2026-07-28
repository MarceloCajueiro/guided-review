// Parser for unified diffs (`git diff` / `gh pr diff` output).
//
// Produces one entry per file, each holding its hunks and lines. Line numbers
// are tracked for both sides so the renderer can anchor a narrative beat to
// "app/foo.rb:42" without the narrative having to know about hunk offsets.

const FILE_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// Paths whose diff is machine-generated: shown collapsed by default, since
// reading them line by line teaches a reviewer nothing.
const GENERATED = [
  /(^|\/)db\/structure\.sql$/,
  /(^|\/)db\/schema\.rb$/,
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Gemfile\.lock|poetry\.lock|composer\.lock|Cargo\.lock|uv\.lock)$/,
  /\.min\.(js|css)$/,
  /(^|\/)vendor\//,
  /(^|\/)dist\//,
];

export function isGenerated(path) {
  return GENERATED.some((re) => re.test(path));
}

/**
 * Parse a unified diff into structured files.
 * @param {string} text raw diff
 * @returns {Array<{path,oldPath,status,isBinary,isGenerated,additions,deletions,hunks}>}
 */
export function parseDiff(text) {
  const files = [];
  let file = null;
  let hunk = null;
  let oldLine = 0;
  let newLine = 0;

  const pushFile = () => {
    if (file) files.push(file);
  };

  // A newline-terminated diff — which is every `git diff` / `gh pr diff` —
  // splits into a trailing '' that is not a line of the file. Consumed as
  // context it fabricates a row, bumps both line counters, and registers a
  // line number that does not exist as a valid anchor target.
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();

  for (const raw of lines) {
    const header = FILE_HEADER.exec(raw);
    if (header) {
      pushFile();
      const [, oldPath, newPath] = header;
      file = {
        path: newPath,
        oldPath,
        status: 'modified',
        isBinary: false,
        isGenerated: isGenerated(newPath),
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      hunk = null;
      continue;
    }
    if (!file) continue; // preamble before the first file

    // Metadata only exists between the file header and the first hunk. Testing
    // for it inside a hunk eats real content: a deleted line `--- foo` in a
    // changelog is `--- foo` on the wire, indistinguishable from a `---` header
    // by prefix alone, and it would vanish from the diff without a trace.
    if (!hunk) {
      if (raw.startsWith('new file mode')) { file.status = 'added'; continue; }
      if (raw.startsWith('deleted file mode')) { file.status = 'deleted'; continue; }
      if (raw.startsWith('rename from')) { file.status = 'renamed'; continue; }
      if (raw.startsWith('Binary files')) { file.isBinary = true; continue; }
      // `+++`/`---` carry no information the file header lacks.
      if (raw.startsWith('index ') || raw.startsWith('--- ') || raw.startsWith('+++ ') ||
          raw.startsWith('similarity index') || raw.startsWith('rename to') ||
          raw.startsWith('old mode') || raw.startsWith('new mode')) continue;
    }

    const hh = HUNK_HEADER.exec(raw);
    if (hh) {
      oldLine = Number(hh[1]);
      newLine = Number(hh[2]);
      hunk = { header: raw, lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;

    // `\ No newline at end of file` annotates the previous line; it occupies no
    // line number on either side.
    if (raw.startsWith('\\')) continue;

    const marker = raw[0];
    const content = raw.slice(1);
    if (marker === '+') {
      hunk.lines.push({ type: 'add', content, oldNo: null, newNo: newLine++ });
      file.additions++;
    } else if (marker === '-') {
      hunk.lines.push({ type: 'del', content, oldNo: oldLine++, newNo: null });
      file.deletions++;
    } else if (marker === ' ' || raw === '') {
      hunk.lines.push({ type: 'ctx', content, oldNo: oldLine++, newNo: newLine++ });
    }
  }
  pushFile();
  return files;
}

/**
 * Split an anchor into its parts.
 *
 * `path/to/f.rb:17-42` → `{ path, from: 17, to: 42 }`
 * `path/to/f.rb:17`    → `{ path, from: 17, to: 17 }`
 * `path/to/f.rb`       → `{ path, from: null, to: null }` — whole file
 *
 * A colon suffix that is not a valid range sets `malformed`, and the whole spec
 * is kept as the path. That distinction matters: without it, `f.rb:L17-L42`
 * (GitHub's own fragment syntax, an easy thing to write by mistake) is reported
 * as "no such file in the diff" — an error naming the wrong cause and pointing
 * the author at the filename instead of at the range they mistyped.
 *
 * A range is never reordered or clamped here; `validate` rejects `from > to`
 * and `from < 1` outright, since both are authoring errors with no sensible
 * interpretation.
 */
export function parseRange(spec) {
  const at = spec.lastIndexOf(':');
  if (at === -1) return { path: spec, from: null, to: null };
  const path = spec.slice(0, at);
  const range = spec.slice(at + 1);
  const m = /^(\d+)(?:-(\d+))?$/.exec(range);
  // Could be a path that legitimately contains a colon, or a typo'd range —
  // indistinguishable here, so flag it and let the caller decide.
  if (!m) return { path: spec, from: null, to: null, malformed: true };
  const from = Number(m[1]);
  return { path, from, to: m[2] ? Number(m[2]) : from };
}
