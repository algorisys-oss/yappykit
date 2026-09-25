import { describe, it, expect } from 'vitest';
import { StringStream } from '@codemirror/language';
import { mermaidParser } from './highlight';

/** [text, token] pairs for `source`, whitespace dropped, run as CodeMirror would. */
function tokens(source: string): [string, string | null][] {
  const state = mermaidParser.startState!(2);
  const out: [string, string | null][] = [];
  for (const line of source.split('\n')) {
    const stream = new StringStream(line, 2, 2);
    if (line === '') {
      mermaidParser.blankLine?.(state, 2);
      state.line++;
      continue;
    }
    while (!stream.eol()) {
      const style = mermaidParser.token(stream, state);
      const text = stream.current();
      if (text.trim()) out.push([text, style]);
      stream.start = stream.pos;
    }
  }
  return out;
}

const styleOf = (source: string, text: string) => tokens(source).find(([t]) => t === text)?.[1];

describe('mermaid highlighting', () => {
  it('marks the diagram type, keywords, labels and arrows', () => {
    const src = 'flowchart LR\n  subgraph A\n    x["Hello"] -->|yes| y\n  end';
    expect(styleOf(src, 'flowchart')).toBe('keyword');
    expect(styleOf(src, 'subgraph')).toBe('keyword');
    expect(styleOf(src, 'end')).toBe('keyword');
    expect(styleOf(src, '"Hello"')).toBe('string');
    expect(styleOf(src, '-->')).toBe('operator');
    expect(styleOf(src, '|yes|')).toBe('labelName');
    expect(styleOf(src, 'x')).toBe('variableName');
  });

  it.each(['-->', '---', '-.->', '==>', '->>', '-->>', '--x', '<|--', '*--', '||--o{', '}|..|{'])(
    'reads %s as one arrow',
    (arrow) => {
      expect(tokens(`graph TD\n  a ${arrow} b`).map(([t]) => t)).toContain(arrow);
    },
  );

  it('separates comments from directives', () => {
    const src = '%%{init: {"theme": "dark"}}%%\nflowchart TD\n  %% a note\n  A --> B';
    expect(styleOf(src, '%%{init: {"theme": "dark"}}%%')).toBe('meta');
    expect(styleOf(src, '%% a note')).toBe('comment');
    expect(styleOf(src, 'flowchart')).toBe('keyword');
  });

  it('keeps front matter as front matter, and only at the top', () => {
    const src = '---\ntitle: Orders\n---\nsequenceDiagram\n  A->>B: hi';
    expect(styleOf(src, 'title:')).toBe('propertyName');
    expect(styleOf(src, 'sequenceDiagram')).toBe('keyword');
    expect(styleOf(src, '->>')).toBe('operator');
  });

  it('leaves node names that are also Gantt tags alone', () => {
    expect(styleOf('flowchart TD\n  ship --> done', 'done')).toBe('variableName');
  });

  it('only treats the first word as a diagram type', () => {
    expect(tokens('flowchart TD\n  pie --> gantt').filter(([, s]) => s === 'keyword').map(([t]) => t)).toEqual([
      'flowchart',
      'TD',
    ]);
  });
});
