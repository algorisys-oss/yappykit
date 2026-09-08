/**
 * Markdown into a small block tree.
 *
 * This is not a CommonMark implementation and does not try to be. It covers the
 * Markdown people actually write in a README, a set of meeting notes or an
 * exported document — headings, paragraphs, emphasis, lists, quotes, fenced
 * code, rules and GFM tables — and it is deliberately the whole of the syntax
 * the PDF renderer knows how to draw. Parsing more than can be drawn would only
 * produce a document that quietly lost something.
 *
 * The output is a tree of blocks whose leaves are runs of styled text. Nothing
 * here knows about pages, fonts or points: layout is core/markdown/pdf's job,
 * and keeping the split means the parser can be tested on strings alone.
 */

/** A run of text with its styling. Links keep their target for the annotation. */
export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
}

export type Align = 'left' | 'center' | 'right';

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; spans: Span[] }
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'code'; text: string; lang: string }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { kind: 'table'; align: Align[]; header: Span[][]; rows: Span[][][] }
  | { kind: 'rule' };

/* ------------------------------------------------------------------ inline */

/**
 * Escapes are resolved during the inline scan rather than in a pre-pass.
 * Stripping backslashes first would make `\*not emphasis\*` parse as emphasis,
 * which is the exact thing the author wrote the backslash to prevent.
 */
const ESCAPABLE = '\\`*_[]()#+-.!>|~';

/** Text up to the next unescaped occurrence of `close`, or null if absent. */
function readUntil(src: string, from: number, close: string): { text: string; end: number } | null {
  let out = '';
  let i = from;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '\\' && i + 1 < src.length && ESCAPABLE.includes(src[i + 1]!)) {
      out += src[i + 1];
      i += 2;
      continue;
    }
    if (src.startsWith(close, i)) return { text: out, end: i + close.length };
    out += ch;
    i++;
  }
  return null;
}

/**
 * Content up to a closing emphasis marker, or null if there is no valid one.
 *
 * Unlike a code span, an emphasis marker only closes when the character before
 * it is not a space. Without that rule `2 * 3 * 4` reads as an emphasised "3"
 * and loses both asterisks — arithmetic and footnote markers in ordinary prose
 * would silently become italics.
 */
function readEmphasis(src: string, from: number, marker: string): { text: string; end: number } | null {
  let out = '';
  let i = from;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '\\' && i + 1 < src.length && ESCAPABLE.includes(src[i + 1]!)) {
      out += src[i + 1];
      i += 2;
      continue;
    }
    // A longer run than the marker is a different delimiter (** vs *), so only
    // a run of exactly this length closes here.
    if (src.startsWith(marker, i) && src[i + marker.length] !== marker[0]) {
      if (!/\s/.test(src[i - 1] ?? ' ')) return { text: out, end: i + marker.length };
    }
    out += ch;
    i++;
  }
  return null;
}

/**
 * Inline Markdown into styled runs.
 *
 * Code spans win over everything: the backtick is scanned first and its content
 * is taken literally, so `**` inside a code span stays two asterisks. That is
 * both what CommonMark says and the only behaviour that lets someone document
 * Markdown syntax in Markdown.
 */
export function parseInline(src: string, inherited: Omit<Span, 'text'> = {}): Span[] {
  const out: Span[] = [];
  let plain = '';

  const flush = () => {
    if (plain) out.push({ text: plain, ...inherited });
    plain = '';
  };
  const push = (spans: Span[]) => {
    flush();
    out.push(...spans);
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;

    if (ch === '\\' && i + 1 < src.length && ESCAPABLE.includes(src[i + 1]!)) {
      plain += src[i + 1];
      i += 2;
      continue;
    }

    if (ch === '`') {
      // A run of N backticks closes on the next run of exactly N, so ``a ` b``
      // can contain a backtick.
      let n = 0;
      while (src[i + n] === '`') n++;
      const fence = '`'.repeat(n);
      const found = readUntil(src, i + n, fence);
      if (found) {
        // Code spans are written with padding spaces (`` ` a ` ``) to allow a
        // leading or trailing backtick; CommonMark strips one pair.
        const text = /^ .* $/.test(found.text) ? found.text.slice(1, -1) : found.text;
        push([{ text, ...inherited, code: true }]);
        i = found.end;
        continue;
      }
    }

    if (ch === '[') {
      const label = readUntil(src, i + 1, ']');
      if (label && src[label.end] === '(') {
        const target = readUntil(src, label.end + 1, ')');
        if (target) {
          const href = target.text.trim().split(/\s+/)[0] ?? '';
          push(parseInline(label.text, { ...inherited, href }));
          i = target.end;
          continue;
        }
      }
    }

    if (ch === '*' || ch === '_') {
      let run = 0;
      while (src[i + run] === ch) run++;
      const double = run >= 2;
      const marker = double ? ch + ch : ch;
      // `_` only delimits at a word boundary, so snake_case_names survive.
      const wordInternal = ch === '_' && /\w/.test(src[i - 1] ?? '');
      // An opener is never followed by a space: "note * see below" is prose.
      const opens = !wordInternal && !/\s/.test(src[i + marker.length] ?? ' ');
      const found = opens ? readEmphasis(src, i + marker.length, marker) : null;
      if (found && found.text.trim()) {
        const style = double ? { bold: true } : { italic: true };
        push(parseInline(found.text, { ...inherited, ...style }));
        i = found.end;
        continue;
      }
      // A run that opens nothing is literal text in full. Advancing one
      // character instead would let the tail of a `**` run close as a `*`,
      // turning "**a ** b" into an emphasised "a *".
      plain += ch.repeat(run);
      i += run;
      continue;
    }

    plain += ch;
    i++;
  }

  flush();
  return out;
}

/* ------------------------------------------------------------------- blocks */

const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*(\S*)/;
const RULE = /^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/;
const BULLET = /^( *)([-*+])\s+(.*)$/;
const NUMBER = /^( *)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const SETEXT = /^ {0,3}(=+|-{2,})\s*$/;

/** A table needs the delimiter row; that row is what tells it apart from text. */
const DIVIDER = /^ *\|? *:?-{1,}:? *(\| *:?-{1,}:? *)*\|? *$/;

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    // A escaped pipe is content, not a column break.
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));

function alignments(divider: string): Align[] {
  return cells(divider).map((c) => {
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });
}

/** How far a list item's continuation lines must be indented to belong to it. */
function contentIndent(indent: string, marker: string): number {
  return indent.length + marker.length + 1;
}

/**
 * Markdown source into blocks.
 *
 * Line-based and non-recursive except where the syntax genuinely nests: a
 * blockquote and a list item both hold blocks, and both are parsed by stripping
 * their prefix and calling back in. Everything else is flat.
 */
export function parseMarkdown(src: string): Block[] {
  // Normalise newlines first so a CRLF file from Windows does not leave a \r on
  // the end of every line, which would show up as a box in the PDF.
  const lines = src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const close = fence[1]!;
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith(close)) body.push(lines[i++]!);
      // An unclosed fence runs to the end of the document, as CommonMark says.
      if (i < lines.length) i++;
      out.push({ kind: 'code', text: body.join('\n'), lang: fence[2] ?? '' });
      continue;
    }

    if (RULE.test(line)) {
      out.push({ kind: 'rule' });
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      out.push({
        kind: 'heading',
        level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6,
        spans: parseInline(heading[2]!),
      });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length) {
        const q = QUOTE.exec(lines[i]!);
        if (q) {
          body.push(q[1]!);
          i++;
          continue;
        }
        // A blank line ends the quote; an ordinary line is lazy continuation.
        if (!lines[i]!.trim()) break;
        if (HEADING.test(lines[i]!) || FENCE.test(lines[i]!) || RULE.test(lines[i]!)) break;
        body.push(lines[i]!);
        i++;
      }
      out.push({ kind: 'quote', blocks: parseMarkdown(body.join('\n')) });
      continue;
    }

    // A table is recognised by its second line, so both are needed up front.
    const next = lines[i + 1];
    if (line.includes('|') && next && DIVIDER.test(next) && cells(next).length > 1) {
      const align = alignments(next);
      const header = cells(line).map((c) => parseInline(c));
      const rows: Span[][][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim() && lines[i]!.includes('|')) {
        const row = cells(lines[i]!).map((c) => parseInline(c));
        // Ragged rows are padded or trimmed to the header, so a missing
        // trailing pipe cannot shift every later cell into the wrong column.
        while (row.length < header.length) row.push([]);
        rows.push(row.slice(0, header.length));
        i++;
      }
      out.push({ kind: 'table', align, header, rows });
      continue;
    }

    const bullet = BULLET.exec(line);
    const number = NUMBER.exec(line);
    if (bullet || number) {
      const ordered = !bullet;
      const first = (bullet ?? number)!;
      const baseIndent = first[1]!.length;
      const start = ordered ? Number(number![2]) : 1;
      const items: Block[][] = [];
      let buf: string[] = [];

      const commit = () => {
        if (buf.length) items.push(parseMarkdown(buf.join('\n')));
        buf = [];
      };

      while (i < lines.length) {
        const cur = lines[i]!;
        if (!cur.trim()) {
          // One blank line may sit inside an item; two end the list.
          if (!lines[i + 1]?.trim()) break;
          buf.push('');
          i++;
          continue;
        }
        const b = BULLET.exec(cur);
        const n = NUMBER.exec(cur);
        const m = b ?? n;
        if (m && m[1]!.length === baseIndent) {
          // A marker of the other kind at this level starts a different list.
          if (!!b !== !!bullet) break;
          commit();
          buf.push(m[3]!);
          i++;
          continue;
        }
        const indent = cur.length - cur.trimStart().length;
        if (indent > baseIndent) {
          // Nested content: strip exactly the parent's content indent so the
          // recursive parse sees the child list at column zero.
          buf.push(cur.slice(Math.min(indent, contentIndent(first[1]!, first[2]!))));
          i++;
          continue;
        }
        break;
      }
      commit();
      out.push({ kind: 'list', ordered, start, items });
      continue;
    }

    // Paragraph: runs to a blank line or to anything that starts a block.
    const body: string[] = [];
    while (i < lines.length && lines[i]!.trim()) {
      const cur = lines[i]!;
      if (body.length) {
        if (
          HEADING.test(cur) ||
          FENCE.test(cur) ||
          RULE.test(cur) ||
          QUOTE.test(cur) ||
          BULLET.test(cur) ||
          NUMBER.test(cur)
        ) {
          break;
        }
        const setext = SETEXT.exec(cur);
        if (setext) {
          out.push({
            kind: 'heading',
            level: setext[1]!.startsWith('=') ? 1 : 2,
            spans: parseInline(body.join(' ')),
          });
          i++;
          body.length = 0;
          break;
        }
      }
      body.push(cur.trim());
      i++;
    }
    if (body.length) out.push({ kind: 'paragraph', spans: parseInline(body.join(' ')) });
  }

  return out;
}
