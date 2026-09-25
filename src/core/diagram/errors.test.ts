// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import mermaid from 'mermaid';
import { keptLines, locateError, suggestType } from './errors';

/**
 * Against the real parser rather than hand-copied error objects: the whole
 * point of this module is Mermaid's numbering, and an upgrade that changes it
 * has to fail here rather than put the marker on the wrong line.
 */

beforeAll(() => {
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
});

async function errorFor(source: string) {
  try {
    await mermaid.parse(source);
  } catch (err) {
    return locateError(source, err);
  }
  throw new Error('expected a parse error');
}

/** The editor line `source` holds `needle` on. */
const lineOf = (source: string, needle: string) =>
  source.split('\n').findIndex((l) => l.includes(needle)) + 1;

describe('keptLines', () => {
  it('skips front matter, whole-line comments and leading blanks, but keeps later blanks', () => {
    const src = '---\ntitle: x\n---\n\n%% note\nflowchart TD\n\n  A --> B\n  %% c\n  B --> C';
    expect(keptLines(src)).toEqual([6, 7, 8, 10]);
  });

  it('treats --- as front matter only on the first line', () => {
    expect(keptLines('flowchart TD\n---\nA')).toEqual([1, 2, 3]);
  });
});

describe('locateError against Mermaid 12', () => {
  const cases: [string, string, string][] = [
    ['flowchart, unclosed bracket', 'flowchart TD\n  A --> B\n  B --> C[x\n  C --> D', 'C[x'],
    ['after a directive', '%%{init: {"theme":"dark"}}%%\nflowchart TD\n  A --> B\n  B --> C[x\n  C --> D', 'C[x'],
    ['after front matter', '---\ntitle: Hi\n---\nflowchart TD\n  A --> B\n  B --> C[x\n  C --> D', 'C[x'],
    ['after comments mid-diagram', 'flowchart TD\n  %% one\n  %% two\n  A --> B\n  B --> C[x\n  C --> D', 'C[x'],
    ['with blank lines mid-diagram', 'flowchart TD\n\n\n  A --> B\n  B --> C[x\n  C --> D', 'C[x'],
    ['after leading blanks and a comment', '\n\n%% c\nflowchart TD\n  A --> B\n  B --> C[x\n  C --> D', 'C[x'],
    ['Windows line endings', 'flowchart TD\r\n  A --> B\r\n  B --> C[x\r\n  C --> D', 'C[x'],
    ['sequence, missing actor', 'sequenceDiagram\n  Alice->>Bob: hi\n  Bob-->>: hi', 'Bob-->>:'],
    ['state, dangling arrow', 'stateDiagram-v2\n  [*] --> A\n  A --> \n', 'A --> '],
    ['pie (Langium), after front matter', '---\ntitle: Hi\n---\npie\n  %% c\n  "Dogs" : 386\n  "Cats" 85', '"Cats" 85'],
  ];

  it.each(cases)('%s', async (_name, source, needle) => {
    const e = await errorFor(source);
    expect(e.kind).toBe('syntax');
    expect(e.line).toBe(lineOf(source.replace(/\r/g, ''), needle));
    expect(e.detail).not.toMatch(/\^/);
  });

  it('points a misspelled diagram type at the header and suggests the real one', async () => {
    const src = '%% hello\nflowchrt TD\n  A --> B';
    const e = await errorFor(src);
    expect(e).toMatchObject({ kind: 'unknown-type', line: 2, word: 'flowchrt', suggestion: 'flowchart' });
  });

  it('blames no line for an empty diagram', async () => {
    expect((await errorFor('   \n')).line).toBeNull();
  });

  it('keeps a broken front-matter block inside the block', async () => {
    const e = await errorFor('---\ntitle: [\n---\nflowchart TD\n A-->B');
    expect(e.kind).toBe('front-matter');
    expect(e.line).toBeGreaterThanOrEqual(2);
    expect(e.line).toBeLessThanOrEqual(3);
  });
});

describe('suggestType', () => {
  it('fixes typos and case', () => {
    expect(suggestType('sequencediagram')).toBe('sequenceDiagram');
    expect(suggestType('classDiagarm')).toBe('classDiagram');
    expect(suggestType('mindmp')).toBe('mindmap');
  });

  it('does not guess at unrelated words', () => {
    expect(suggestType('hello')).toBeNull();
    expect(suggestType('')).toBeNull();
  });
});
