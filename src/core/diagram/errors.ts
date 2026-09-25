/**
 * Turning a Mermaid failure into "this line, this problem".
 *
 * Mermaid never reports a line of the text you typed. Before parsing it strips
 * the front-matter block, every whole-line `%%` comment and directive, and any
 * blank lines ahead of the diagram, then numbers what is left. So an error it
 * calls "line 3" is the third SURVIVING line, which in a diagram with a title
 * block and two comments is line 8 of the editor. `keptLines` rebuilds that
 * numbering so the editor can mark the line the user actually has to fix.
 *
 * The two parser families report differently, both measured against 12.0.0:
 * the older Jison grammars (flowchart, sequence, class, state, ER, mindmap,
 * Gantt) put the position in `hash.loc`, whose `first_line` is where the bad
 * token starts; the message's own "line N" is where the parser gave up, which
 * for an unclosed bracket is the line after. The newer Langium grammars (pie,
 * packet, architecture and friends) put "line N, column M" in the message.
 */

export interface DiagramError {
  /** 1-based line in the editor's text, or null when no line is to blame. */
  line: number | null;
  /** 1-based column on that line, when the parser said. */
  column: number | null;
  kind: 'unknown-type' | 'syntax' | 'front-matter' | 'other';
  /** Mermaid's own wording, trimmed of its ASCII-art pointer. */
  detail: string;
  /** For `unknown-type`: the word that was not recognised, and a near miss. */
  word?: string;
  suggestion?: string | null;
}

/** Every diagram keyword Mermaid 12 detects, as typed on the first line. */
export const DIAGRAM_TYPES = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'quadrantChart',
  'requirementDiagram',
  'gitGraph',
  'C4Context',
  'mindmap',
  'timeline',
  'sankey-beta',
  'xychart-beta',
  'block-beta',
  'packet-beta',
  'kanban',
  'architecture-beta',
  'radar-beta',
  'treemap-beta',
] as const;

/**
 * 1-based source line numbers of the lines Mermaid keeps, in order, so that
 * Mermaid's line `n` is `keptLines(src)[n - 1]`.
 */
export function keptLines(source: string): number[] {
  const lines = source.split(/\r\n|\r|\n/);
  const out: number[] = [];
  let i = 0;
  // Front matter only counts when `---` is the very first line.
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((l, n) => n > 0 && l.trim() === '---');
    if (close > 0) i = close + 1;
  }
  for (; i < lines.length; i++) {
    const text = lines[i]!;
    if (/^\s*%%/.test(text)) continue;
    if (out.length === 0 && text.trim() === '') continue;
    out.push(i + 1);
  }
  return out;
}

function toSourceLine(source: string, mermaidLine: number): number {
  const kept = keptLines(source);
  if (kept.length === 0) return 1;
  const idx = Math.min(Math.max(mermaidLine, 1), kept.length) - 1;
  return kept[idx]!;
}

/** The first line Mermaid reads, which is where it looks for the diagram type. */
function headerLine(source: string): { line: number; word: string } {
  const kept = keptLines(source);
  const line = kept[0] ?? 1;
  const text = source.split(/\r\n|\r|\n/)[line - 1] ?? '';
  return { line, word: text.trim().split(/\s+/)[0] ?? '' };
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}

/** The diagram keyword `word` was probably meant to be, or null if none is close. */
export function suggestType(word: string): string | null {
  if (!word) return null;
  const w = word.toLowerCase();
  let best: string | null = null;
  let bestD = Infinity;
  for (const t of DIAGRAM_TYPES) {
    const d = distance(w, t.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  // A third of the word may be wrong: "flowchrt" and "sequencediagram" are
  // typos, "hello" is not an attempt at "pie".
  return bestD <= Math.max(1, Math.floor(word.length / 3)) ? best : null;
}

function cleanDetail(message: string): string {
  return message
    .replace(/^Parsing failed:\s*/, '')
    .split('\n')
    // Jison repeats the line and draws a ----^ pointer under it; the editor
    // marks the line itself, so both are noise here.
    .filter((l, n) => !(n === 1 && l.startsWith('...')) && !/^-*\^$/.test(l) && !/^\s*\d+ \|/.test(l))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  hash?: { loc?: { first_line?: unknown; first_column?: unknown }; line?: unknown };
}

export function locateError(source: string, err: unknown): DiagramError {
  const e = (typeof err === 'object' && err !== null ? err : {}) as ErrorLike;
  const message = typeof e.message === 'string' ? e.message : String(err);
  const detail = cleanDetail(message);

  if (e.name === 'UnknownDiagramError' || /No diagram type detected/.test(message)) {
    const { line, word } = headerLine(source);
    return {
      line: source.trim() ? line : null,
      column: null,
      kind: 'unknown-type',
      detail,
      word,
      suggestion: suggestType(word),
    };
  }

  const loc = e.hash?.loc;
  if (loc && typeof loc.first_line === 'number') {
    return {
      line: toSourceLine(source, loc.first_line),
      column: typeof loc.first_column === 'number' ? loc.first_column + 1 : null,
      kind: 'syntax',
      detail,
    };
  }

  const langium = /line (\d+), column (\d+)/.exec(message);
  if (langium) {
    return {
      line: toSourceLine(source, Number(langium[1])),
      column: Number(langium[2]),
      kind: 'syntax',
      detail,
    };
  }

  // js-yaml, for a broken front-matter block: "(line:column)" within the block.
  const yaml = /\((\d+):(\d+)\)/.exec(message);
  if (yaml && source.split(/\r\n|\r|\n/)[0]?.trim() === '---') {
    const lines = source.split(/\r\n|\r|\n/);
    const close = lines.findIndex((l, n) => n > 0 && l.trim() === '---');
    const last = close > 0 ? close : lines.length;
    return {
      line: Math.min(1 + Number(yaml[1]), last),
      column: Number(yaml[2]),
      kind: 'front-matter',
      detail,
    };
  }

  const plain = /line (\d+)/.exec(message);
  return {
    line: plain ? toSourceLine(source, Number(plain[1])) : null,
    column: null,
    kind: plain ? 'syntax' : 'other',
    detail,
  };
}
