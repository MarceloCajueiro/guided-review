// Parser for unified diffs (`git diff` / `gh pr diff` output).
//
// Produces one entry per file, each holding its hunks and lines. Line numbers
// are tracked for both sides so the renderer can anchor a narrative beat to
// "app/foo.rb:42" without the narrative having to know about hunk offsets.

const FILE_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

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

  for (const raw of text.split('\n')) {
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

    if (raw.startsWith('new file mode')) { file.status = 'added'; continue; }
    if (raw.startsWith('deleted file mode')) { file.status = 'deleted'; continue; }
    if (raw.startsWith('rename from')) { file.status = 'renamed'; continue; }
    if (raw.startsWith('Binary files')) { file.isBinary = true; continue; }
    // Skip the remaining metadata lines; `+++`/`---` carry no info the header lacks.
    if (raw.startsWith('index ') || raw.startsWith('--- ') || raw.startsWith('+++ ') ||
        raw.startsWith('similarity index') || raw.startsWith('rename to') ||
        raw.startsWith('old mode') || raw.startsWith('new mode')) continue;

    const hh = HUNK_HEADER.exec(raw);
    if (hh) {
      oldLine = Number(hh[1]);
      newLine = Number(hh[3]);
      hunk = { header: raw, context: hh[5].trim(), lines: [] };
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

/** Index files by path for O(1) lookup from narrative beats. */
export function indexByPath(files) {
  return new Map(files.map((f) => [f.path, f]));
}

/**
 * Resolve a `path:start-end` (or `path:line`, or bare `path`) anchor against a
 * parsed file, returning the set of NEW-side line numbers it covers.
 * Returns null when the anchor names no explicit range.
 */
export function parseRange(spec) {
  const at = spec.lastIndexOf(':');
  if (at === -1) return { path: spec, from: null, to: null };
  const path = spec.slice(0, at);
  const range = spec.slice(at + 1);
  const m = /^(\d+)(?:-(\d+))?$/.exec(range);
  if (!m) return { path: spec, from: null, to: null };
  const from = Number(m[1]);
  return { path, from, to: m[2] ? Number(m[2]) : from };
}
