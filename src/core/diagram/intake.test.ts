import { describe, it, expect } from 'vitest';
import { diagramFromText } from './intake';

describe('diagramFromText', () => {
  it('takes the first mermaid block out of a README', () => {
    const md = '# Service\n\nIntro.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\n```mermaid\npie\n```\n';
    expect(diagramFromText(md)).toEqual({ text: 'flowchart LR\n  A --> B\n', fromMarkdown: true });
  });

  it('handles tilde fences and a longer closing fence', () => {
    expect(diagramFromText('~~~ mermaid\ngraph TD\n~~~~\n').text).toBe('graph TD\n');
  });

  it('does not stop at a shorter fence inside the block', () => {
    const md = '````mermaid\nflowchart TD\n  A["```"] --> B\n````\n';
    expect(diagramFromText(md).text).toBe('flowchart TD\n  A["```"] --> B\n');
  });

  it('ignores other code blocks and takes a plain file whole', () => {
    const md = '```js\nconst a = 1;\n```\n';
    expect(diagramFromText(md)).toEqual({ text: md, fromMarkdown: false });
    expect(diagramFromText('sequenceDiagram\n  A->>B: hi')).toEqual({
      text: 'sequenceDiagram\n  A->>B: hi',
      fromMarkdown: false,
    });
  });

  it('takes an unclosed block to the end of the file', () => {
    expect(diagramFromText('```mermaid\ngraph TD\n  A --> B').text).toBe('graph TD\n  A --> B\n');
  });
});
