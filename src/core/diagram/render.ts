/**
 * Mermaid, loaded on first use and run in strict mode.
 *
 * This runs on the main thread, which is the one exception to "workers do the
 * work". Mermaid lays text out by measuring it in a live document (getBBox on
 * real SVG text), and a worker has no document. The route renders on a short
 * debounce so typing never waits on a layout.
 *
 * Security, because a share link is a diagram written by someone else:
 * `securityLevel: 'strict'` makes Mermaid run DOMPurify over the finished SVG
 * and drop click handlers, and `securityLevel` is on Mermaid's own list of
 * keys that an `%%{init}%%` directive in the text cannot change. `htmlLabels`
 * is added to that list here. HTML labels live in <foreignObject>, which Safari
 * refuses to draw onto a canvas, so a diagram that turned them back on would
 * silently break PNG export.
 *
 * Layout is dagre, not Mermaid 12's new default of ELK. ELK is a 1.5 MB layout
 * engine that took a plain flowchart's first render from about 2 to 5 seconds
 * here, and dagre is what GitHub and GitLab draw with, which is where most of
 * these diagrams end up. A diagram can still ask for ELK in its front matter.
 */
import type { Mermaid } from 'mermaid';
import { locateError, type DiagramError } from './errors';
import { svgSize } from './export';

export type DiagramTheme = 'default' | 'dark' | 'neutral' | 'forest';

export type RenderResult =
  | { ok: true; svg: string; width: number; height: number; background: string }
  | { ok: false; error: DiagramError };

let loading: Promise<Mermaid> | null = null;

export function loadMermaid(): Promise<Mermaid> {
  loading ??= import('mermaid').then((m) => m.default);
  // A failed chunk load (offline on first visit) must be retryable.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

let counter = 0;

/** Mermaid's own page colour for a theme, which is what its text is drawn against. */
function backgroundOf(mermaid: Mermaid, fallback: string): string {
  const bg = (mermaid.mermaidAPI.getConfig().themeVariables as { background?: unknown } | undefined)?.background;
  return typeof bg === 'string' && bg ? bg : fallback;
}

export async function renderDiagram(source: string, theme: DiagramTheme): Promise<RenderResult> {
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    htmlLabels: false,
    layout: 'dagre',
    secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'htmlLabels'],
    theme,
  });

  try {
    // Parse first: a parse error then never reaches render, which on failure
    // can leave its scratch element behind in <body>.
    await mermaid.parse(source);
  } catch (err) {
    return { ok: false, error: locateError(source, err) };
  }

  const id = `yk-diagram-${++counter}`;
  try {
    const { svg } = await mermaid.render(id, source);
    const size = svgSize(svg) ?? { width: 0, height: 0 };
    return { ok: true, svg, ...size, background: backgroundOf(mermaid, theme === 'dark' ? '#333' : '#ffffff') };
  } catch (err) {
    return { ok: false, error: locateError(source, err) };
  } finally {
    document.getElementById(id)?.remove();
    document.getElementById('d' + id)?.remove();
  }
}

/**
 * A standalone SVG file: XML rather than the HTML serialisation Mermaid hands
 * back, at its drawn size rather than "100% of the page", with its background
 * painted in, so a dark-theme diagram is not white-on-nothing when opened.
 */
export function standaloneSvg(svg: string, width: number, height: number, background: string): string {
  const doc = new DOMParser().parseFromString(svg, 'text/html');
  const el = doc.querySelector('svg');
  if (!el) return svg;
  el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  el.setAttribute('width', String(width));
  el.setAttribute('height', String(height));
  el.style.removeProperty('max-width');
  el.style.backgroundColor = background;
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(el);
}

/** The diagram drawn at exactly `width` x `height` pixels, as PNG. */
export async function rasterise(
  svg: string,
  size: { width: number; height: number },
  background: string,
): Promise<Blob> {
  // Sized at the target resolution, so the browser rasterises the vector at
  // full detail rather than drawing a small bitmap and stretching it.
  const file = standaloneSvg(svg, size.width, size.height, background);
  const url = URL.createObjectURL(new Blob([file], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(img, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned nothing'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
