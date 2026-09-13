/**
 * The canvas half of annotating: ./annotate decides, this draws.
 *
 * `drawAnnotation` is the only drawing code there is. The live preview calls it
 * on a canvas the size of the video's frame laid over the player, and the
 * export calls it on a transparent canvas cropped to the annotation's layer. So
 * the two cannot drift: same fonts, same stroke, same place.
 *
 * Proven in a browser (tests/e2e/video-annotate.spec.ts). What is decided rather
 * than drawn lives in ./annotate and is unit tested there.
 */
import type { Point, PixelRect } from '../redact/regions';
import type { Frame } from './blur';
import {
  COLOURS,
  arrowHead,
  calloutBox,
  fontPx,
  headLength,
  inkOn,
  isUsable,
  layerFor,
  nearestOnRect,
  px,
  strokeWidth,
  type Annotation,
  type Size,
} from './annotate';

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const fontFor = (size: number) => `600 ${size}px ${FONT_STACK}`;

/** A translucent edge under every stroke, so a yellow line still reads on a sky. */
const EDGE = 'rgba(0, 0, 0, 0.45)';

let scratch: CanvasRenderingContext2D | null = null;
function measuring(): CanvasRenderingContext2D {
  if (!scratch) {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    scratch = ctx;
  }
  return scratch;
}

/**
 * The size of an annotation's text at its font, or null for a shape.
 *
 * Height comes from the font's box rather than the ink, on purpose: ink height
 * changes with the letters, so a callout sized by it would grow and shrink as
 * the user typed "a" and then "A".
 */
export function measure(a: Annotation, frame: Frame): Size | null {
  if (a.kind !== 'text' && a.kind !== 'callout') return null;
  const size = fontPx(a.size, frame);
  const ctx = measuring();
  ctx.font = fontFor(size);
  const m = ctx.measureText(a.text);
  const fontBox = (m.fontBoundingBoxAscent ?? 0) + (m.fontBoundingBoxDescent ?? 0);
  return { width: m.width, height: fontBox > 0 ? fontBox : size * 1.2 };
}

function strokePath(ctx: CanvasRenderingContext2D, colour: string, width: number, path: () => void) {
  ctx.lineWidth = width + 2;
  ctx.strokeStyle = EDGE;
  ctx.beginPath();
  path();
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = colour;
  ctx.beginPath();
  path();
  ctx.stroke();
}

/** Draw one annotation in frame pixels, shifted by `origin` (a layer's corner). */
export function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  a: Annotation,
  frame: Frame,
  origin: Point = { x: 0, y: 0 },
): void {
  const stroke = strokeWidth(frame);
  const colour = COLOURS[a.colour];
  const pa = px(a.a, frame);
  const pb = px(a.b, frame);

  ctx.save();
  ctx.translate(-origin.x, -origin.y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (a.kind) {
    case 'rect': {
      const x = Math.min(pa.x, pb.x);
      const y = Math.min(pa.y, pb.y);
      strokePath(ctx, colour, stroke, () => ctx.rect(x, y, Math.abs(pb.x - pa.x), Math.abs(pb.y - pa.y)));
      break;
    }
    case 'ellipse': {
      const cx = (pa.x + pb.x) / 2;
      const cy = (pa.y + pb.y) / 2;
      const rx = Math.abs(pb.x - pa.x) / 2;
      const ry = Math.abs(pb.y - pa.y) / 2;
      strokePath(ctx, colour, stroke, () => ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2));
      break;
    }
    case 'arrow': {
      const wings = arrowHead(pa, pb, stroke);
      if (!wings) break;
      // Stop the shaft inside the head, so a round cap cannot poke through the tip.
      const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      const stop = Math.max(0, len - headLength(stroke) * 0.6) / len;
      const end = { x: pa.x + (pb.x - pa.x) * stop, y: pa.y + (pb.y - pa.y) * stop };
      strokePath(ctx, colour, stroke, () => {
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(end.x, end.y);
      });
      const head = () => {
        ctx.beginPath();
        ctx.moveTo(pb.x, pb.y);
        ctx.lineTo(wings[0].x, wings[0].y);
        ctx.lineTo(wings[1].x, wings[1].y);
        ctx.closePath();
      };
      head();
      ctx.lineWidth = 2;
      ctx.strokeStyle = EDGE;
      ctx.stroke();
      ctx.fillStyle = colour;
      ctx.fill();
      break;
    }
    case 'text': {
      const size = fontPx(a.size, frame);
      ctx.font = fontFor(size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, size * 0.12);
      ctx.strokeStyle = inkOn(a.colour);
      ctx.strokeText(a.text, pb.x, pb.y);
      ctx.fillStyle = colour;
      ctx.fillText(a.text, pb.x, pb.y);
      break;
    }
    case 'callout': {
      const measured = measure(a, frame)!;
      const box = calloutBox(pb, measured, frame);
      const joint = nearestOnRect(pa, box);
      strokePath(ctx, colour, stroke, () => {
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(joint.x, joint.y);
      });
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(pa.x, pa.y, stroke * 1.5, 0, Math.PI * 2);
      ctx.fill();
      roundedBox(ctx, box, box.h * 0.2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = EDGE;
      ctx.stroke();
      ctx.font = fontFor(fontPx(a.size, frame));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = inkOn(a.colour);
      ctx.fillText(a.text, pb.x, pb.y);
      break;
    }
  }
  ctx.restore();
}

function roundedBox(ctx: CanvasRenderingContext2D, r: PixelRect, radius: number) {
  const rr = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rr, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rr);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rr);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rr);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rr);
  ctx.closePath();
}

/** Every usable annotation showing at `time`, drawn over the full frame. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  annotations: readonly Annotation[],
  frame: Frame,
  time: number,
): void {
  ctx.clearRect(0, 0, frame.width, frame.height);
  for (const a of annotations) {
    if (isUsable(a) && time >= a.start && time < a.end) drawAnnotation(ctx, a, frame);
  }
}

/** One annotation as a transparent PNG cropped to its layer, for the engine. */
export async function renderLayer(
  a: Annotation,
  frame: Frame,
): Promise<{ bytes: Uint8Array; rect: PixelRect }> {
  const rect = layerFor(a, frame, measure(a, frame));
  const canvas = document.createElement('canvas');
  canvas.width = rect.w;
  canvas.height = rect.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  drawAnnotation(ctx, a, frame, { x: rect.x, y: rect.y });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error('could not encode an annotation');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), rect };
}
