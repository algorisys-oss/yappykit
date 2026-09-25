/**
 * Syntax colouring for Mermaid in the editor.
 *
 * Mermaid is two dozen small languages that share a few habits: `%%` comments,
 * `%%{ }%%` directives, a `---` front-matter block, quoted labels, arrows made
 * of dashes, dots and equals signs, and a vocabulary of structural words. A
 * stream tokenizer over those habits colours every diagram type well enough to
 * read, without shipping a grammar per type. It never decides validity; that
 * is Mermaid's parser, and its errors are what the editor marks.
 */
import type { StringStream, StreamParser } from '@codemirror/language';
import { DIAGRAM_TYPES } from './errors';

export interface State {
  line: number;
  frontMatter: boolean;
  seenHeader: boolean;
}

const TYPES = new Set<string>(DIAGRAM_TYPES);

const KEYWORDS = new Set([
  'subgraph', 'end', 'direction', 'TD', 'TB', 'BT', 'LR', 'RL',
  'participant', 'actor', 'as', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'critical', 'break',
  'rect', 'box', 'Note', 'note', 'over', 'left', 'right', 'of', 'activate', 'deactivate', 'autonumber',
  'create', 'destroy', 'class', 'classDef', 'style', 'linkStyle', 'click', 'namespace', 'state',
  'section', 'title', 'dateFormat', 'axisFormat', 'tickInterval', 'excludes', 'includes', 'todayMarker',
  'accTitle', 'accDescr', 'showData', 'commit', 'branch', 'checkout', 'merge', 'cherry-pick',
]);
// Gantt's task tags (done, active, crit, after) are left out on purpose: they
// are also everyday node names, and a flowchart node called "done" coloured as
// a keyword reads as a mistake.

/** Arrows and links: -->, ---, -.->, ==>, ->>, -->>, -x, --o, <-->, ||--o{, }|..|{, <|--, *--. */
const ARROW = /^(?:<\|?|[*ox])?(?:-\.+-?|={2,3}|-{1,3}|\.\.)(?:[->]{0,2}>|[xo)]|\|>)?|^[|}o]{1,2}(?:--|\.\.)[|{o]{1,2}/;

export const mermaidParser: StreamParser<State> = {
  name: 'mermaid',
  startState: () => ({ line: 0, frontMatter: false, seenHeader: false }),
  copyState: (s) => ({ ...s }),
  token(stream: StringStream, state: State): string | null {
    if (stream.sol()) {
      state.line++;
      if (stream.match(/^\s*---\s*$/)) {
        if (state.line === 1) state.frontMatter = true;
        else if (state.frontMatter) state.frontMatter = false;
        return 'meta';
      }
    }
    if (state.frontMatter) {
      if (stream.sol() && stream.match(/^\s*[\w-]+:/)) return 'propertyName';
      stream.skipToEnd();
      return 'meta';
    }
    if (stream.eatSpace()) return null;

    if (stream.match('%%{')) {
      stream.skipTo('}%%') ? stream.match('}%%') : stream.skipToEnd();
      return 'meta';
    }
    if (stream.match('%%')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string';
    if (stream.match(ARROW)) return 'operator';
    if (stream.match(/^\|[^|\n]*\|/)) return 'labelName';
    if (stream.match(/^\d+(?:\.\d+)?(?:-\d{2}){0,2}d?\b/)) return 'number';

    const word = stream.match(/^[A-Za-z_]\w*(?:-\w+)*/) as RegExpMatchArray | null;
    if (word) {
      const w = word[0];
      if (!state.seenHeader) {
        state.seenHeader = true;
        if (TYPES.has(w) || w.startsWith('C4')) return 'keyword';
      }
      if (KEYWORDS.has(w)) return 'keyword';
      return 'variableName';
    }
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: '%%' } },
};
