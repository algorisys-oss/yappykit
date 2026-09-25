/**
 * What a diagram is saved as.
 *
 * The PNG question is asked as where the picture is going, never as a scale
 * factor. A diagram is vector, so any size is sharp; the only real question is
 * how many pixels the destination will show it at:
 *
 *   document  twice its drawn size, which is crisp on a high-density screen at
 *             the width a document or a chat message shows it
 *   slides    fitted inside 3840 x 2160, so it fills a 4K slide
 *   print     fitted inside A4 at 300 dpi, in whichever orientation suits it
 *
 * Every size is then held under what a browser will allocate for one canvas.
 * Safari's limit is the smallest, 16,777,216 pixels, and past it toBlob quietly
 * returns nothing, so the cap is that and not Chromium's much larger one.
 */

export type PngUse = 'document' | 'slides' | 'print';

export const MAX_SIDE = 8192;
export const MAX_AREA = 16_777_216;

const BOXES: Record<Exclude<PngUse, 'document'>, [number, number]> = {
  slides: [3840, 2160],
  print: [2480, 3508],
};

export function pngSize(width: number, height: number, use: PngUse): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 1, height: 1 };
  let scale: number;
  if (use === 'document') {
    scale = 2;
  } else {
    let [bw, bh] = BOXES[use];
    if (use === 'print' && width > height) [bw, bh] = [bh, bw];
    scale = Math.min(bw / width, bh / height);
  }
  scale = Math.min(scale, MAX_SIDE / width, MAX_SIDE / height, Math.sqrt(MAX_AREA / (width * height)));
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

/** The drawn size of a rendered diagram, from the viewBox Mermaid always writes. */
export function svgSize(svg: string): { width: number; height: number } | null {
  const m = /<svg\b[^>]*\bviewBox="\s*[-\d.e]+[\s,]+[-\d.e]+[\s,]+([\d.e]+)[\s,]+([\d.e]+)\s*"/i.exec(svg);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  return width > 0 && height > 0 ? { width, height } : null;
}

const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/**
 * A name for the saved files: the file it was opened from, else its title,
 * else "diagram". Titles come from front matter (`title: ...`) or the `title`
 * line that pie, Gantt, journey, timeline and quadrant charts use.
 */
export function fileBase(source: string, openedName = ''): string {
  const opened = openedName.replace(/\.[^.]+$/, '').trim();
  if (opened) return opened;
  const title =
    /^---\s*\n(?:[^\n]*\n)*?\s*title:\s*["']?([^\n"']+)/.exec(source.replace(/\r/g, ''))?.[1] ??
    /^\s*(?:pie\s+)?title\s+(.+)$/m.exec(source)?.[1];
  return (title && slug(title)) || 'diagram';
}
