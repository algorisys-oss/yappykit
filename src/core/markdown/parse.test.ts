import { describe, it, expect } from 'vitest';
import { parseMarkdown, parseInline, type Block, type Span } from './parse';

/** Spans as a compact string, so assertions read like the source they came from. */
const show = (spans: Span[]) =>
  spans
    .map((s) => {
      let t = s.text;
      if (s.code) t = `\`${t}\``;
      if (s.bold) t = `**${t}**`;
      if (s.italic) t = `*${t}*`;
      if (s.href) t = `[${t}](${s.href})`;
      return t;
    })
    .join('');

const text = (spans: Span[]) => spans.map((s) => s.text).join('');

describe('parseInline', () => {
  it('reads bold, italic and code', () => {
    expect(show(parseInline('a **b** c *d* e `f`'))).toBe('a **b** c *d* e `f`');
  });

  it('nests emphasis inside strong', () => {
    const spans = parseInline('**bold *both* here**');
    const both = spans.find((s) => s.text === 'both');
    expect(both).toMatchObject({ bold: true, italic: true });
  });

  it('does not close emphasis on a marker after a space', () => {
    // The closer in "**a **" is preceded by a space, so it does not close.
    expect(text(parseInline('**a ** b'))).toBe('**a ** b');
  });

  it('takes a code span literally', () => {
    const spans = parseInline('use `**not bold**` here');
    expect(spans.find((s) => s.code)?.text).toBe('**not bold**');
    expect(spans.some((s) => s.bold)).toBe(false);
  });

  it('closes a backtick run on the same length', () => {
    expect(parseInline('``a ` b``').find((s) => s.code)?.text).toBe('a ` b');
  });

  it('leaves snake_case alone', () => {
    expect(parseInline('some_long_name').every((s) => !s.italic)).toBe(true);
    expect(text(parseInline('some_long_name'))).toBe('some_long_name');
  });

  it('still reads _emphasis_ at a word boundary', () => {
    expect(parseInline('an _emphasised_ word').find((s) => s.italic)?.text).toBe('emphasised');
  });

  it('keeps a link target and styles its label', () => {
    const spans = parseInline('see [the **docs**](https://x.test/a)');
    expect(spans.find((s) => s.text === 'docs')).toMatchObject({
      href: 'https://x.test/a',
      bold: true,
    });
  });

  it('honours a backslash escape', () => {
    expect(text(parseInline('\\*not emphasis\\*'))).toBe('*not emphasis*');
    expect(parseInline('\\*not emphasis\\*').some((s) => s.italic)).toBe(false);
  });

  it('leaves an unmatched marker as text', () => {
    expect(text(parseInline('2 * 3 * 4 is 24'))).toBe('2 * 3 * 4 is 24');
  });
});

describe('parseMarkdown', () => {
  it('reads headings at every level', () => {
    const out = parseMarkdown('# One\n\n### Three');
    expect(out.map((b) => b.kind)).toEqual(['heading', 'heading']);
    expect(out[0]).toMatchObject({ level: 1 });
    expect(out[1]).toMatchObject({ level: 3 });
  });

  it('reads a setext heading', () => {
    const out = parseMarkdown('Title\n=====\n\nbody');
    expect(out[0]).toMatchObject({ kind: 'heading', level: 1 });
    expect(text((out[0] as Extract<Block, { kind: 'heading' }>).spans)).toBe('Title');
  });

  it('joins a wrapped paragraph into one block', () => {
    const out = parseMarkdown('one line\nand its continuation\n\nsecond');
    expect(out).toHaveLength(2);
    expect(text((out[0] as Extract<Block, { kind: 'paragraph' }>).spans)).toBe(
      'one line and its continuation',
    );
  });

  it('keeps a fenced code block verbatim', () => {
    const out = parseMarkdown('```js\nconst a = 1;\n\n  indented\n```');
    expect(out[0]).toMatchObject({ kind: 'code', lang: 'js', text: 'const a = 1;\n\n  indented' });
  });

  it('does not parse Markdown inside a fence', () => {
    const out = parseMarkdown('```\n# not a heading\n- not a list\n```');
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('code');
  });

  it('runs an unclosed fence to the end', () => {
    const out = parseMarkdown('```\nstill code\nto the end');
    expect(out[0]).toMatchObject({ kind: 'code', text: 'still code\nto the end' });
  });

  it('reads a bullet list', () => {
    const out = parseMarkdown('- one\n- two\n- three');
    const list = out[0] as Extract<Block, { kind: 'list' }>;
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(3);
    expect(text((list.items[1]![0] as Extract<Block, { kind: 'paragraph' }>).spans)).toBe('two');
  });

  it('reads an ordered list and keeps its start', () => {
    const list = parseMarkdown('3. three\n4. four')[0] as Extract<Block, { kind: 'list' }>;
    expect(list.ordered).toBe(true);
    expect(list.start).toBe(3);
    expect(list.items).toHaveLength(2);
  });

  it('nests a list inside a list item', () => {
    const list = parseMarkdown('- outer\n  - inner a\n  - inner b\n- second')[0] as Extract<
      Block,
      { kind: 'list' }
    >;
    expect(list.items).toHaveLength(2);
    const nested = list.items[0]!.find((b) => b.kind === 'list') as Extract<
      Block,
      { kind: 'list' }
    >;
    expect(nested.items).toHaveLength(2);
  });

  it('splits a bullet list from an ordered one', () => {
    const out = parseMarkdown('- a\n- b\n1. c');
    expect(out.map((b) => b.kind)).toEqual(['list', 'list']);
    expect((out[0] as Extract<Block, { kind: 'list' }>).ordered).toBe(false);
    expect((out[1] as Extract<Block, { kind: 'list' }>).ordered).toBe(true);
  });

  it('reads a blockquote as blocks', () => {
    const quote = parseMarkdown('> ## inside\n>\n> a paragraph')[0] as Extract<
      Block,
      { kind: 'quote' }
    >;
    expect(quote.kind).toBe('quote');
    expect(quote.blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph']);
  });

  it('reads a rule', () => {
    expect(parseMarkdown('a\n\n---\n\nb').map((b) => b.kind)).toEqual([
      'paragraph',
      'rule',
      'paragraph',
    ]);
  });

  it('reads a table with alignments', () => {
    const table = parseMarkdown(
      '| a | b | c |\n| :- | :-: | -: |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |',
    )[0] as Extract<Block, { kind: 'table' }>;
    expect(table.kind).toBe('table');
    expect(table.align).toEqual(['left', 'center', 'right']);
    expect(table.header.map(text)).toEqual(['a', 'b', 'c']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1]!.map(text)).toEqual(['4', '5', '6']);
  });

  it('pads a ragged table row to the header width', () => {
    const table = parseMarkdown('| a | b | c |\n| - | - | - |\n| 1 | 2 |')[0] as Extract<
      Block,
      { kind: 'table' }
    >;
    expect(table.rows[0]).toHaveLength(3);
  });

  it('does not mistake a pipe in prose for a table', () => {
    expect(parseMarkdown('use a | b to pipe\n\nnext')[0]!.kind).toBe('paragraph');
  });

  it('normalises CRLF', () => {
    const out = parseMarkdown('# Title\r\n\r\nbody\r\n');
    expect(text((out[0] as Extract<Block, { kind: 'heading' }>).spans)).toBe('Title');
    expect(text((out[1] as Extract<Block, { kind: 'paragraph' }>).spans)).toBe('body');
  });

  it('returns nothing for empty input', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('\n\n   \n')).toEqual([]);
  });

  it('reads a whole small document in order', () => {
    const out = parseMarkdown(
      ['# Title', '', 'Intro **text**.', '', '- a', '- b', '', '> note', '', '```', 'code', '```'].join(
        '\n',
      ),
    );
    expect(out.map((b) => b.kind)).toEqual([
      'heading',
      'paragraph',
      'list',
      'quote',
      'code',
    ]);
  });
});
