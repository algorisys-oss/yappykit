/**
 * Reading a diagram out of whatever file it lives in.
 *
 * Mermaid mostly lives inside Markdown: a README or a doc page with a fenced
 * ```mermaid block, which GitHub and GitLab render in place. Opening that file
 * should open the diagram, not the whole README. A .mmd file, or a Markdown
 * file with no Mermaid block, is taken whole.
 */

export const DIAGRAM_FILE = /\.(mmd|mermaid|md|markdown|txt)$/i;

export const isDiagramFile = (f: File): boolean =>
  DIAGRAM_FILE.test(f.name) || f.type === 'text/plain' || f.type === 'text/markdown';

export function diagramFromText(text: string): { text: string; fromMarkdown: boolean } {
  // ``` or ~~~, three or more, optionally indented up to three spaces; the
  // closing fence must use the same character and be at least as long.
  const open = /^ {0,3}(`{3,}|~{3,})[ \t]*mermaid\b[^\n]*\n/m.exec(text);
  if (!open) return { text, fromMarkdown: false };
  const fence = open[1]!;
  const body = text.slice(open.index + open[0].length);
  const close = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`, 'm').exec(body);
  const inner = close ? body.slice(0, close.index) : body;
  return { text: inner.replace(/\n$/, '') + '\n', fromMarkdown: true };
}
