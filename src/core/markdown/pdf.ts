/**
 * A Markdown document laid out as a PDF.
 *
 * The tool's one question is what the page should be — A4 or US Letter — and
 * everything else is decided here. Type sizes, spacing, where a page breaks:
 * none of that is a knob, because nobody converting a README to a PDF wants to
 * pick a leading. What they want is a document that reads like a document.
 *
 * Only the 14 fonts every PDF reader already has are used, so the file stays
 * small and needs nothing embedded. The cost is that those fonts are WinAnsi
 * encoded and cannot show CJK, Cyrillic, Greek or Arabic text. That limit is
 * reported rather than hidden: `unsupported` lists the characters that could
 * not be drawn, so the tool can name them instead of quietly handing back a
 * page of question marks.
 *
 * pdf-lib runs in this tab. Nothing is uploaded.
 */
import { PDFDocument, PDFFont, PDFString, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import { A4, LETTER, MARGIN_PT } from '../pdf/from-images';
import { parseMarkdown, type Align, type Block, type Span } from './parse';

export type Paper = 'a4' | 'letter';

export interface MarkdownPdfOptions {
  paper: Paper;
  /** Written into the PDF metadata and used for the running footer. */
  title?: string;
  pageNumbers?: boolean;
}

export interface MarkdownPdfResult {
  bytes: Uint8Array;
  pages: number;
  /** Distinct characters the built-in fonts could not draw, in first-seen order. */
  unsupported: string[];
}

/* -------------------------------------------------------------- typography */

/** Body text. Everything else is expressed relative to this. */
const BODY = 11;
const LEADING = 1.45;

const HEADING_SIZE: Record<number, number> = { 1: 22, 2: 17, 3: 14, 4: 12.5, 5: 11, 6: 11 };
/** Space above a heading, which is what actually groups a document visually. */
const HEADING_ABOVE: Record<number, number> = { 1: 20, 2: 17, 3: 13, 4: 11, 5: 10, 6: 10 };
const HEADING_BELOW: Record<number, number> = { 1: 9, 2: 8, 3: 6, 4: 5, 5: 4, 6: 4 };

const CODE_SIZE = 9.5;
const CODE_PAD = 7;
const PARA_GAP = 9;
/** Between items of one list, which read as a group rather than as prose. */
const ITEM_GAP = 3.5;
const LIST_INDENT = 18;
const QUOTE_INDENT = 14;
const TABLE_PAD = 5;

const INK = rgb(0.12, 0.13, 0.15);
const SOFT = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.82, 0.84, 0.87);
const CODE_BG = rgb(0.96, 0.965, 0.975);
const LINK = rgb(0.11, 0.36, 0.72);

/* ---------------------------------------------------------------- encoding */

/**
 * What the built-in fonts can draw: printable ASCII, Latin-1, and the handful
 * of typographic characters WinAnsi puts in 0x80–0x9F. Anything else would make
 * pdf-lib throw at draw time, so it is replaced and reported.
 */
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

function drawable(ch: string): boolean {
  const code = ch.codePointAt(0)!;
  if (code === 0x0a || code === 0x09) return true;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return WIN_ANSI_EXTRA.includes(ch);
}

/**
 * Characters with an honest ASCII equivalent are mapped rather than reported:
 * a non-breaking hyphen or a fraction slash losing its exact identity is not
 * something the reader needs warning about.
 */
const FOLD: Record<string, string> = {
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '‑': '-',
  '−': '-',
  '⁄': '/',
  '→': '->',
  '←': '<-',
  '≤': '<=',
  '≥': '>=',
  '×': 'x',
};

/** Collects what had to be dropped, so the tool can say which characters. */
class Encoder {
  readonly missing = new Map<string, true>();

  text(src: string): string {
    let out = '';
    for (const ch of src) {
      const folded = FOLD[ch];
      if (folded !== undefined) {
        out += folded;
        continue;
      }
      if (drawable(ch)) {
        out += ch;
        continue;
      }
      this.missing.set(ch, true);
      out += '?';
    }
    return out;
  }
}

/* ------------------------------------------------------------------ layout */

/** Where a line of text was actually drawn. */
interface Mark {
  page: PDFPage;
  baseline: number;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
  monoBold: PDFFont;
}

function fontFor(span: Span, fonts: Fonts): PDFFont {
  if (span.code) return span.bold ? fonts.monoBold : fonts.mono;
  if (span.bold && span.italic) return fonts.boldItalic;
  if (span.bold) return fonts.bold;
  if (span.italic) return fonts.italic;
  return fonts.regular;
}

/** One word, already measured, with the style it must be drawn in. */
interface Word {
  text: string;
  span: Span;
  font: PDFFont;
  size: number;
  width: number;
  /** Width of the space that follows it, or 0 at a line end. */
  space: number;
}

interface Line {
  words: Word[];
  width: number;
}

/**
 * Break styled runs into words that can be measured independently.
 *
 * Code spans keep their spaces (`a b` is one token) so an inline code run is
 * never split across two lines, which would read as two separate snippets.
 */
function toWords(spans: Span[], size: number, fonts: Fonts, enc: Encoder): Word[] {
  const out: Word[] = [];
  for (const span of spans) {
    const font = fontFor(span, fonts);
    const s = span.code ? size * 0.92 : size;
    const text = enc.text(span.text);
    if (!text) continue;
    const pieces = span.code ? [text] : text.split(/(\s+)/).filter((p) => p !== '');
    for (const piece of pieces) {
      if (/^\s+$/.test(piece)) {
        const last = out[out.length - 1];
        if (last) last.space = font.widthOfTextAtSize(' ', s);
        continue;
      }
      out.push({
        text: piece,
        span,
        font,
        size: s,
        width: font.widthOfTextAtSize(piece, s),
        space: 0,
      });
    }
  }
  return out;
}

/** Split a word too long for any line (a URL, a hash) at the character level. */
function shatter(word: Word, maxWidth: number): Word[] {
  const out: Word[] = [];
  let buf = '';
  for (const ch of word.text) {
    const next = buf + ch;
    if (buf && word.font.widthOfTextAtSize(next, word.size) > maxWidth) {
      out.push({ ...word, text: buf, width: word.font.widthOfTextAtSize(buf, word.size), space: 0 });
      buf = ch;
      continue;
    }
    buf = next;
  }
  if (buf) {
    out.push({ ...word, text: buf, width: word.font.widthOfTextAtSize(buf, word.size) });
  }
  return out;
}

function wrap(words: Word[], maxWidth: number): Line[] {
  const lines: Line[] = [];
  let cur: Word[] = [];
  let width = 0;

  const commit = () => {
    if (!cur.length) return;
    const last = cur[cur.length - 1]!;
    lines.push({ words: cur, width: width - last.space });
    cur = [];
    width = 0;
  };

  for (const word of words) {
    for (const part of word.width > maxWidth ? shatter(word, maxWidth) : [word]) {
      if (cur.length && width + part.width > maxWidth) commit();
      cur.push(part);
      width += part.width + part.space;
    }
  }
  commit();
  return lines;
}

/* ------------------------------------------------------------------ writer */

/**
 * The page cursor.
 *
 * Blocks ask it for vertical space and it decides whether that means a new
 * page. Keeping pagination in one place is what stops a heading being drawn at
 * the foot of a page with its paragraph overleaf.
 */
class Writer {
  page: PDFPage;
  y: number;
  readonly pages: PDFPage[] = [];
  /** Set by a list item so its content starts flush, not a paragraph gap down. */
  suppressGap = false;
  /** Inside a list, blocks sit closer together than they do in running prose. */
  listDepth = 0;
  /**
   * Where the next drawn line actually landed.
   *
   * A list marker has to sit on the baseline of its item's first line, and only
   * the code that drew that line knows where it went — the item may have opened
   * with a heading, a code block or a page break. Guessing from the cursor put
   * every bullet a paragraph-gap too high.
   *
   * A stack, not a single slot: a list nested inside a list item starts its own
   * capture while the outer one is still open, and a single slot let the inner
   * one overwrite the outer's answer — the outer bullet then landed on the
   * nested item's line and its own line got none.
   */
  private pending: (Mark | null)[] = [];

  constructor(
    readonly doc: PDFDocument,
    readonly fonts: Fonts,
    readonly enc: Encoder,
    readonly width: number,
    readonly height: number,
  ) {
    this.page = this.newPage();
    this.y = height - MARGIN_PT;
  }

  private newPage(): PDFPage {
    const page = this.doc.addPage([this.width, this.height]);
    this.pages.push(page);
    return page;
  }

  get bottom(): number {
    return MARGIN_PT;
  }

  /** Start a new page unless `need` points still fit below the cursor. */
  reserve(need: number): void {
    if (this.y - need >= this.bottom) return;
    this.page = this.newPage();
    this.y = this.height - MARGIN_PT;
  }

  /** Vertical space between blocks, which is dropped at the top of a page. */
  gap(points: number): void {
    if (this.suppressGap) {
      this.suppressGap = false;
      return;
    }
    if (this.y < this.height - MARGIN_PT) this.y -= points;
  }

  /** Start watching for the next baseline drawn. */
  beginCapture(): void {
    this.pending.push(null);
  }

  /** Stop watching, and report where the first line since then was drawn. */
  endCapture(): Mark | null {
    return this.pending.pop() ?? null;
  }

  /**
   * Told by every drawing path where it put a line of text. Every capture still
   * waiting resolves to the same line, which is what nesting means: the first
   * line of an inner item is also the first line of the outer one.
   */
  noteBaseline(baseline: number): void {
    for (let i = 0; i < this.pending.length; i++) {
      if (this.pending[i] === null) this.pending[i] = { page: this.page, baseline };
    }
  }

  link(url: string, x: number, y: number, w: number, h: number): void {
    // Drawn as a real annotation rather than blue text alone: a document whose
    // links are only coloured is a document whose links do not work.
    const annot = this.doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, y, x + w, y + h],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    });
    this.page.node.addAnnot(this.doc.context.register(annot));
  }

  /** Draw one wrapped line at `x`, returning nothing; the caller moves y. */
  drawLine(line: Line, x: number, baseline: number, indentX = 0): void {
    this.noteBaseline(baseline);
    let cursor = x + indentX;

    // Consecutive words in the same style are drawn as ONE string rather than
    // one call each. The standard 14 fonts carry no width table in the file, so
    // the reader spaces text by its own metrics, which differ from pdf-lib's by
    // a fraction of a point per glyph. Placing every word absolutely made that
    // difference visible as an uneven gap at every space; placing a whole run
    // once lets the reader space its inside, and leaves only style boundaries
    // positioned by us.
    for (let i = 0; i < line.words.length; ) {
      const first = line.words[i]!;
      let text = first.text;
      let width = first.width;
      let j = i;
      while (j + 1 < line.words.length && line.words[j + 1]!.span === first.span) {
        const gap = line.words[j]!.space;
        const next = line.words[j + 1]!;
        // A zero gap means the word was split mid-token to fit, so it rejoins
        // with no space between the halves.
        text += (gap > 0 ? ' ' : '') + next.text;
        width += gap + next.width;
        j++;
      }

      if (first.span.code) {
        // A faint plate behind inline code, so it reads as code without a box
        // heavy enough to break the line up. Drawn before the glyphs, or it
        // would cover them.
        this.page.drawRectangle({
          x: cursor - 1.5,
          y: baseline - first.size * 0.28,
          width: width + 3,
          height: first.size * 1.22,
          color: CODE_BG,
        });
      }

      this.page.drawText(text, {
        x: cursor,
        y: baseline,
        size: first.size,
        font: first.font,
        color: first.span.href ? LINK : INK,
      });

      if (first.span.href) {
        this.page.drawLine({
          start: { x: cursor, y: baseline - 1.6 },
          end: { x: cursor + width, y: baseline - 1.6 },
          thickness: 0.5,
          color: LINK,
        });
        this.link(first.span.href, cursor, baseline - 2, width, first.size);
      }

      cursor += width + line.words[j]!.space;
      i = j + 1;
    }
  }
}

/** Draw wrapped text, paginating between lines. Returns the height consumed. */
function flow(w: Writer, spans: Span[], size: number, x: number, maxWidth: number): void {
  const lines = wrap(toWords(spans, size, w.fonts, w.enc), maxWidth);
  const step = size * LEADING;
  for (const line of lines) {
    w.reserve(step);
    w.y -= step;
    w.drawLine(line, x, w.y + size * 0.28);
  }
}

/* ------------------------------------------------------------------ blocks */

/** Prose is set apart; blocks inside a list item are held together. */
function gapFor(w: Writer): number {
  return w.listDepth > 0 ? ITEM_GAP : PARA_GAP;
}

function renderBlocks(w: Writer, blocks: Block[], x: number, maxWidth: number): void {
  for (const block of blocks) renderBlock(w, block, x, maxWidth);
}

function renderBlock(w: Writer, block: Block, x: number, maxWidth: number): void {
  switch (block.kind) {
    case 'heading': {
      const size = HEADING_SIZE[block.level]!;
      w.gap(HEADING_ABOVE[block.level]!);
      // Keep the heading with the first line under it: reserving both means a
      // heading never lands alone at the foot of a page.
      w.reserve(size * LEADING + HEADING_BELOW[block.level]! + BODY * LEADING);
      const bold = block.spans.map((s) => ({ ...s, bold: true }));
      flow(w, bold, size, x, maxWidth);
      if (block.level <= 2) {
        // A rule under the top two levels, which is what makes the sections of
        // a long document findable when it is flicked through on paper.
        w.y -= 5;
        w.reserve(1);
        w.page.drawLine({
          start: { x, y: w.y },
          end: { x: x + maxWidth, y: w.y },
          thickness: 0.75,
          color: RULE,
        });
      }
      w.y -= HEADING_BELOW[block.level]!;
      return;
    }

    case 'paragraph': {
      w.gap(gapFor(w));
      flow(w, block.spans, BODY, x, maxWidth);
      return;
    }

    case 'rule': {
      w.gap(PARA_GAP);
      w.reserve(10);
      w.y -= 5;
      w.page.drawLine({
        start: { x, y: w.y },
        end: { x: x + maxWidth, y: w.y },
        thickness: 0.75,
        color: RULE,
      });
      w.y -= 5;
      return;
    }

    case 'code': {
      w.gap(gapFor(w));
      const step = CODE_SIZE * 1.35;
      const inner = maxWidth - CODE_PAD * 2;
      // Long lines wrap rather than run off the page: a code listing cut at the
      // margin is a code listing with the ends of its lines missing.
      const rows: string[] = [];
      for (const raw of w.enc.text(block.text).split('\n')) {
        const word: Word = {
          text: raw,
          span: {} as Span,
          font: w.fonts.mono,
          size: CODE_SIZE,
          width: w.fonts.mono.widthOfTextAtSize(raw, CODE_SIZE),
          space: 0,
        };
        if (word.width <= inner || !raw) rows.push(raw);
        else for (const part of shatter(word, inner)) rows.push(part.text);
      }

      // The plate is drawn per page so a listing that spans a break keeps its
      // background on both halves instead of one tall rectangle off the page.
      let i = 0;
      while (i < rows.length) {
        w.reserve(step + CODE_PAD * 2);
        const room = Math.max(1, Math.floor((w.y - w.bottom - CODE_PAD * 2) / step));
        const chunk = rows.slice(i, i + room);
        const height = chunk.length * step + CODE_PAD * 2;
        w.page.drawRectangle({
          x,
          y: w.y - height,
          width: maxWidth,
          height,
          color: CODE_BG,
          borderColor: RULE,
          borderWidth: 0.5,
        });
        let baseline = w.y - CODE_PAD - CODE_SIZE;
        for (const row of chunk) {
          w.page.drawText(row, {
            x: x + CODE_PAD,
            y: baseline,
            size: CODE_SIZE,
            font: w.fonts.mono,
            color: INK,
          });
          baseline -= step;
        }
        w.y -= height;
        i += chunk.length;
      }
      return;
    }

    case 'quote': {
      w.gap(gapFor(w));
      const top = w.y;
      let page = w.page;
      let start = top;
      const bar = () => {
        if (start - w.y <= 0) return;
        page.drawRectangle({
          x,
          y: w.y,
          width: 2.5,
          height: start - w.y,
          color: RULE,
        });
      };
      for (const inner of block.blocks) {
        renderBlock(w, inner, x + QUOTE_INDENT, maxWidth - QUOTE_INDENT);
        if (w.page !== page) {
          // The quote crossed a page: close the bar on the old one and start a
          // fresh bar at the top of the new.
          bar();
          page = w.page;
          start = w.height - MARGIN_PT;
        }
      }
      bar();
      return;
    }

    case 'list': {
      w.gap(gapFor(w));
      w.listDepth++;
      block.items.forEach((item, index) => {
        if (index > 0) w.gap(ITEM_GAP);
        const marker = block.ordered ? `${block.start + index}.` : '•';
        const markerWidth = w.fonts.regular.widthOfTextAtSize(marker, BODY);
        // Draw the content first, then put the marker on the baseline it
        // actually used: the item may have broken across a page.
        w.beginCapture();
        w.suppressGap = true;
        renderBlocks(w, item, x + LIST_INDENT, maxWidth - LIST_INDENT);
        const at = w.endCapture();
        if (at) {
          at.page.drawText(marker, {
            x: x + LIST_INDENT - markerWidth - 6,
            y: at.baseline,
            size: BODY,
            font: w.fonts.regular,
            color: SOFT,
          });
        }
      });
      w.listDepth--;
      return;
    }

    case 'table':
      renderTable(w, block, x, maxWidth);
      return;
  }
}

/**
 * Column widths from the content.
 *
 * The natural width of each column is measured, and if they overflow the page
 * the surplus is taken from the widest columns first. Sharing the cut equally
 * would squeeze a "Yes"/"No" column to nothing to spare a prose one.
 */
function columnWidths(
  w: Writer,
  table: Extract<Block, { kind: 'table' }>,
  maxWidth: number,
): number[] {
  const cols = table.header.length;
  const natural = table.header.map((cell, c) => {
    const rows = [cell, ...table.rows.map((r) => r[c] ?? [])];
    return Math.max(
      ...rows.map((spans) => {
        const words = toWords(spans, BODY, w.fonts, w.enc);
        return words.reduce((n, word) => n + word.width + word.space, 0);
      }),
      w.fonts.regular.widthOfTextAtSize('mmm', BODY),
    );
  });

  const pad = TABLE_PAD * 2;
  const total = natural.reduce((a, b) => a + b, 0) + pad * cols;
  if (total <= maxWidth) {
    // Spread the slack proportionally rather than leaving the table short of
    // the margin, which reads as a mistake.
    const slack = (maxWidth - total) / cols;
    return natural.map((n) => n + pad + slack);
  }

  let over = total - maxWidth;
  const out = natural.map((n) => n + pad);
  const floor = w.fonts.regular.widthOfTextAtSize('mmmm', BODY) + pad;
  // Trim the widest column repeatedly until the table fits or nothing can give.
  while (over > 0.5) {
    const widest = out.reduce((best, n, i) => (n > out[best]! ? i : best), 0);
    if (out[widest]! <= floor) break;
    const take = Math.min(over, out[widest]! - floor, Math.max(4, over / cols));
    out[widest] = out[widest]! - take;
    over -= take;
  }
  return out;
}

function renderTable(
  w: Writer,
  table: Extract<Block, { kind: 'table' }>,
  x: number,
  maxWidth: number,
): void {
  w.gap(gapFor(w));
  const widths = columnWidths(w, table, maxWidth);
  const step = BODY * 1.35;

  const cellLines = (spans: Span[], width: number, bold: boolean): Line[] =>
    wrap(
      toWords(
        bold ? spans.map((s) => ({ ...s, bold: true })) : spans,
        BODY,
        w.fonts,
        w.enc,
      ),
      width - TABLE_PAD * 2,
    );

  const drawRow = (cells: Span[][], bold: boolean, shade: boolean): void => {
    const lines = widths.map((width, c) => cellLines(cells[c] ?? [], width, bold));
    const height = Math.max(...lines.map((l) => l.length), 1) * step + TABLE_PAD;
    w.reserve(height);
    const top = w.y;

    if (shade) {
      w.page.drawRectangle({
        x,
        y: top - height,
        width: widths.reduce((a, b) => a + b, 0),
        height,
        color: CODE_BG,
      });
    }

    let cx = x;
    lines.forEach((cellLinesForCol, c) => {
      const width = widths[c]!;
      const align: Align = table.align[c] ?? 'left';
      let baseline = top - step + BODY * 0.28;
      for (const line of cellLinesForCol) {
        const free = width - TABLE_PAD * 2 - line.width;
        const shift = align === 'right' ? free : align === 'center' ? free / 2 : 0;
        w.drawLine(line, cx + TABLE_PAD + Math.max(0, shift), baseline);
        baseline -= step;
      }
      cx += width;
    });

    w.y = top - height;
    w.page.drawLine({
      start: { x, y: w.y },
      end: { x: x + widths.reduce((a, b) => a + b, 0), y: w.y },
      thickness: bold ? 1 : 0.5,
      color: RULE,
    });
  };

  drawRow(table.header, true, true);
  table.rows.forEach((row) => drawRow(row, false, false));
}

/* ------------------------------------------------------------------- entry */

/** A sensible filename: the document's own H1 if it has one, else the source. */
export function pdfName(sourceName: string, title?: string): string {
  const base = (title ?? sourceName.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '')).trim();
  const safe = base
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return `${safe || 'document'}.pdf`;
}

/** The first level-1 heading, which is what a Markdown file uses as its title. */
export function titleOf(markdown: string): string {
  for (const block of parseMarkdown(markdown)) {
    if (block.kind === 'heading' && block.level === 1) {
      return block.spans.map((s) => s.text).join('').trim();
    }
  }
  return '';
}

export async function buildMarkdownPdf(
  markdown: string,
  options: MarkdownPdfOptions,
): Promise<MarkdownPdfResult> {
  const paper = options.paper === 'letter' ? LETTER : A4;
  const doc = await PDFDocument.create();
  const enc = new Encoder();

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
    monoBold: await doc.embedFont(StandardFonts.CourierBold),
  };

  const w = new Writer(doc, fonts, enc, paper.short, paper.long);
  const maxWidth = paper.short - MARGIN_PT * 2;
  renderBlocks(w, parseMarkdown(markdown), MARGIN_PT, maxWidth);

  if (options.pageNumbers !== false && w.pages.length > 1) {
    w.pages.forEach((page, i) => {
      const label = `${i + 1} / ${w.pages.length}`;
      const width = fonts.regular.widthOfTextAtSize(label, 9);
      page.drawText(label, {
        x: (paper.short - width) / 2,
        y: MARGIN_PT / 2,
        size: 9,
        font: fonts.regular,
        color: SOFT,
      });
    });
  }

  const title = options.title?.trim();
  if (title) doc.setTitle(enc.text(title));
  doc.setProducer('YappyKit');
  doc.setCreator('YappyKit');

  return {
    bytes: await doc.save(),
    pages: w.pages.length,
    unsupported: [...enc.missing.keys()],
  };
}
