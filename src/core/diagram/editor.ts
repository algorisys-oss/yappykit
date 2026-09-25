/**
 * The CodeMirror editor for Mermaid source.
 *
 * CodeMirror rather than a textarea for the one thing a textarea cannot do:
 * put the parse error ON the line it is about, with an underline, a gutter mark
 * and the message on hover, so a mistake on line 40 of a long diagram is found
 * by looking rather than counting. Undo history, search and Tab to indent are
 * what an editor for an indentation-structured language needs anyway.
 *
 * Colours come from the site palette through CSS variables, so the editor
 * follows light and dark with no JavaScript involved.
 */
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  placeholder as placeholderExt,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching, indentUnit } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { tags as t } from '@lezer/highlight';
import { mermaidParser } from './highlight';

const v = (name: string) => `var(--zen-color-${name})`;

const theme = EditorView.theme({
  '&': { height: '100%', color: v('foreground'), backgroundColor: v('background'), fontSize: '14px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    lineHeight: '1.6',
  },
  '.cm-content': { caretColor: v('foreground'), paddingBlock: '12px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: v('foreground') },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: `${v('primary-soft')} !important`,
  },
  '.cm-gutters': { backgroundColor: v('muted'), color: v('muted-fg'), border: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent', boxShadow: `inset 3px 0 0 ${v('primary-soft')}` },
  '.cm-activeLineGutter': { backgroundColor: v('primary-soft'), color: v('foreground') },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: `underline wavy ${v('error')}`,
    textUnderlineOffset: '3px',
  },
  '.cm-tooltip': { backgroundColor: v('background'), color: v('foreground'), border: `1px solid ${v('border')}` },
  '.cm-panels': { backgroundColor: v('muted'), color: v('foreground') },
  '.cm-searchMatch': { backgroundColor: v('warning-soft') },
  '.cm-placeholder': { color: v('muted-fg') },
});

const colours = HighlightStyle.define([
  { tag: t.keyword, color: v('primary'), fontWeight: '600' },
  { tag: t.string, color: v('success') },
  { tag: t.labelName, color: v('success') },
  // Arrows are the structure of a diagram, so they get weight rather than a
  // hue: the palette's amber is 1.8:1 on the light background.
  { tag: t.operator, color: v('muted-fg'), fontWeight: '600' },
  { tag: t.comment, color: v('muted-fg'), fontStyle: 'italic' },
  { tag: t.meta, color: v('muted-fg') },
  { tag: t.propertyName, color: v('primary') },
]);

export interface DiagramEditor {
  view: EditorView;
  /** Replace the whole text, as one undoable change. */
  setText(text: string): void;
  /** Mark `line` (1-based) as the error, or clear the mark with null. */
  markError(line: number | null, column: number | null, message: string): void;
  /** Put the cursor on `line` and bring it into view. */
  goToLine(line: number): void;
  destroy(): void;
}

export function createEditor(opts: {
  parent: HTMLElement;
  text: string;
  label: string;
  placeholder: string;
  onChange: (text: string) => void;
  onSave: () => void;
}): DiagramEditor {
  const view = new EditorView({
    parent: opts.parent,
    state: EditorState.create({
      doc: opts.text,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        bracketMatching(),
        highlightSelectionMatches(),
        indentUnit.of('  '),
        EditorState.tabSize.of(2),
        StreamLanguage.define(mermaidParser),
        syntaxHighlighting(colours),
        lintGutter(),
        EditorView.lineWrapping,
        placeholderExt(opts.placeholder),
        EditorView.contentAttributes.of({ 'aria-label': opts.label }),
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              opts.onSave();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          // Tab indents; Escape then Tab still leaves the editor, per
          // CodeMirror's own keyboard-trap guidance.
          indentWithTab,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) opts.onChange(u.state.doc.toString());
        }),
        theme,
      ],
    }),
  });

  return {
    view,
    setText(text) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    markError(line, column, message) {
      const doc = view.state.doc;
      if (line === null || line < 1 || line > doc.lines) {
        view.dispatch(setDiagnostics(view.state, []));
        return;
      }
      const l = doc.line(line);
      const start = column ? Math.min(l.from + column - 1, l.to) : l.from;
      // An empty line or a column at its end still needs one character to
      // underline, or CodeMirror draws nothing and only the gutter shows it.
      const from = start === l.to && l.from < l.to ? start - 1 : start;
      const to = Math.max(l.to, from + (l.from < l.to ? 1 : 0));
      view.dispatch(setDiagnostics(view.state, [{ from, to, severity: 'error', message }]));
    },
    goToLine(line) {
      const doc = view.state.doc;
      const l = doc.line(Math.min(Math.max(line, 1), doc.lines));
      view.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
      view.focus();
    },
    destroy() {
      view.destroy();
    },
  };
}
