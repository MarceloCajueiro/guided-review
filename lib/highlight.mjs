// Minimal, dependency-free syntax highlighting.
//
// This is deliberately not a real parser. A diff shows fragments — half a
// function, a hunk starting mid-string — so any parser strict enough to be
// "correct" would fail on most input. Regex tokenization degrades gracefully:
// the worst case is a missed keyword, never a broken line.
//
// Scope is limited to what actually shows up in pull requests. Unknown
// extensions fall through to `escapeHtml`, which is always safe.

const KEYWORDS = {
  ruby: 'def|end|class|module|if|elsif|else|unless|while|until|for|in|do|then|begin|rescue|ensure|raise|return|yield|self|nil|true|false|and|or|not|require|require_relative|include|extend|attr_accessor|attr_reader|attr_writer|private|public|protected|lambda|proc|case|when|next|break|super|new|defined',
  js: 'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|this|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|null|undefined|true|false|delete|void|yield|static|get|set|of|in',
  python: 'def|class|return|if|elif|else|for|while|in|is|not|and|or|import|from|as|with|try|except|finally|raise|lambda|None|True|False|pass|break|continue|yield|global|nonlocal|assert|async|await|self',
  sql: 'SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|ALTER|DROP|ADD|COLUMN|PRIMARY|KEY|FOREIGN|REFERENCES|NOT|NULL|DEFAULT|UNIQUE|CONSTRAINT|AS|AND|OR|IN|EXISTS|CASE|WHEN|THEN|ELSE|END|DISTINCT|COUNT|SUM|AVG|MAX|MIN|COALESCE|WITH|UNION|ALL',
  css: 'important|media|import|supports|keyframes|font-face|root|and|not|only',
  go: 'func|package|import|return|if|else|for|range|switch|case|default|break|continue|var|const|type|struct|interface|map|chan|go|defer|select|nil|true|false|error|string|int|bool|make|new|append|len|cap',
  rust: 'fn|let|mut|const|static|if|else|match|for|while|loop|break|continue|return|struct|enum|impl|trait|pub|use|mod|crate|self|Self|super|where|as|dyn|move|ref|type|unsafe|async|await|true|false|Some|None|Ok|Err',
  php: 'function|class|extends|implements|interface|trait|public|private|protected|static|return|if|else|elseif|foreach|for|while|do|switch|case|break|continue|new|echo|print|use|namespace|require|include|try|catch|finally|throw|null|true|false|array|const|abstract|final|global',
  java: 'public|private|protected|class|interface|extends|implements|static|final|void|return|if|else|for|while|do|switch|case|break|continue|new|try|catch|finally|throw|throws|import|package|abstract|synchronized|this|super|null|true|false|instanceof|enum|record',
  shell: 'if|then|else|elif|fi|for|while|do|done|case|esac|function|return|export|local|source|echo|cd|set|unset|readonly|shift|exit|trap',
};

const BY_EXT = {
  rb: 'ruby', rake: 'ruby', gemspec: 'ruby', ru: 'ruby',
  js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'js', tsx: 'js', vue: 'js', svelte: 'js',
  py: 'python',
  sql: 'sql',
  css: 'css', scss: 'css', sass: 'css', less: 'css',
  go: 'go',
  rs: 'rust',
  php: 'php',
  java: 'java', kt: 'java', kts: 'java', scala: 'java', cs: 'java', swift: 'java',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  erb: 'html', html: 'html', xml: 'html', htm: 'html',
  json: 'json',
  yml: 'yaml', yaml: 'yaml',
  md: 'markdown', markdown: 'markdown',
};

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function languageOf(path) {
  const base = path.split('/').pop() || '';
  // `_bar.html.erb` must resolve as ERB, not HTML: take the last extension first.
  const parts = base.split('.');
  for (let i = parts.length - 1; i > 0; i--) {
    const lang = BY_EXT[parts[i].toLowerCase()];
    if (lang) return lang;
  }
  if (/^(Gemfile|Rakefile|Guardfile|Capfile)$/.test(base)) return 'ruby';
  if (/^(Makefile|Dockerfile)$/i.test(base)) return 'shell';
  return null;
}

// Each rule is [regex, cssClass]. Order matters: comments and strings must win
// over keywords, or a keyword inside a string gets colored.
function rulesFor(lang) {
  const kw = KEYWORDS[lang];
  const rules = [];

  if (lang === 'ruby' || lang === 'python' || lang === 'shell' || lang === 'yaml') {
    rules.push([/#.*$/, 'c']);
  }
  if (['js', 'go', 'rust', 'php', 'java', 'css', 'sql'].includes(lang)) {
    rules.push([/\/\/.*$/, 'c'], [/\/\*[\s\S]*?\*\//, 'c']);
  }
  if (lang === 'sql') rules.push([/--.*$/, 'c']);
  if (lang === 'html') rules.push([/<!--[\s\S]*?-->/, 'c']);

  if (lang === 'html') {
    // ERB/JSP-style embedded tags read as code, not markup.
    rules.push([/<%[-=]?[\s\S]*?-?%>/, 'k']);
    rules.push([/<\/?[a-zA-Z][\w:-]*/, 'k'], [/\/?>/, 'k']);
    rules.push([/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, 's']);
    rules.push([/[\w-]+(?==)/, 'a']);
    return rules;
  }

  if (lang === 'markdown') {
    rules.push([/^#{1,6} .*$/, 'k'], [/`[^`]+`/, 's'], [/\*\*[^*]+\*\*/, 'a']);
    return rules;
  }

  if (lang === 'json') {
    rules.push([/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'a']);
    rules.push([/"(?:[^"\\]|\\.)*"/, 's']);
    rules.push([/\b(true|false|null)\b/, 'k']);
    rules.push([/\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/, 'n']);
    return rules;
  }

  if (lang === 'yaml') {
    rules.push([/^\s*[\w.-]+(?=\s*:)/, 'a']);
    rules.push([/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, 's']);
    rules.push([/\b(true|false|null|yes|no)\b/, 'k']);
    rules.push([/\b-?\d+(?:\.\d+)?\b/, 'n']);
    return rules;
  }

  // Strings: double, single, and backtick. Ruby/JS interpolation is left inside
  // the string span — highlighting it separately costs more than it returns.
  rules.push([/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/, 's']);

  if (lang === 'ruby') {
    rules.push([/:[a-zA-Z_]\w*[?!]?/, 'a']);      // symbols
    rules.push([/@@?[a-zA-Z_]\w*/, 'v']);          // ivars / cvars
    rules.push([/\b[A-Z]\w*/, 't']);               // constants
  }
  if (lang === 'css') {
    rules.push([/\$[\w-]+|--[\w-]+/, 'v']);        // scss vars / custom props
    rules.push([/[.#][\w-]+/, 't']);               // selectors
    rules.push([/[\w-]+(?=\s*:)/, 'a']);           // properties
  }
  if (['js', 'go', 'rust', 'java', 'python'].includes(lang)) {
    rules.push([/\b[A-Z]\w*/, 't']);
  }
  if (lang === 'php') rules.push([/\$\w+/, 'v']);
  if (lang === 'shell') rules.push([/\$\{?\w+\}?/, 'v']);

  if (kw) rules.push([new RegExp(`\\b(?:${kw})\\b`, lang === 'sql' ? 'i' : ''), 'k']);
  rules.push([/\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/, 'n']);
  return rules;
}

const RULE_CACHE = new Map();

/**
 * Highlight one line of code. Returns escaped HTML with <i class="…"> spans.
 * Never throws: unknown languages return the escaped line unchanged.
 */
export function highlight(line, lang) {
  if (!lang || !line) return escapeHtml(line);
  if (!RULE_CACHE.has(lang)) {
    const rules = rulesFor(lang);
    // One combined regex; the matched alternative tells us which class to use.
    const source = rules.map(([re]) => `(${re.source})`).join('|');
    RULE_CACHE.set(lang, {
      re: new RegExp(source, 'g' + (rules.some(([r]) => r.flags.includes('i')) ? 'i' : '')),
      classes: rules.map(([, cls]) => cls),
    });
  }
  const { re, classes } = RULE_CACHE.get(lang);
  re.lastIndex = 0;

  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    // A zero-length match would spin forever; step past it.
    if (m[0] === '') { re.lastIndex++; continue; }
    out += escapeHtml(line.slice(last, m.index));
    const groupIdx = m.slice(1).findIndex((g) => g !== undefined);
    const cls = classes[groupIdx] || '';
    out += `<i class="${cls}">${escapeHtml(m[0])}</i>`;
    last = m.index + m[0].length;
  }
  out += escapeHtml(line.slice(last));
  return out;
}
