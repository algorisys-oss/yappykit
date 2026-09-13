import { describe, it, expect } from 'vitest';
import {
  strokeWidth,
  fontPx,
  arrowHead,
  inkOn,
  isUsable,
  calloutBox,
  nearestOnRect,
  layerFor,
  buildAnnotateArgs,
  COLOURS,
  type Annotation,
} from './annotate';

const FRAME = { width: 1280, height: 720 };
const ann = (over: Partial<Annotation>): Annotation => ({
  kind: 'rect',
  a: { x: 0.2, y: 0.2 },
  b: { x: 0.5, y: 0.6 },
  text: '',
  colour: 'yellow',
  size: 'm',
  start: 0,
  end: 10,
  ...over,
});

describe('sizes scale with the frame', () => {
  it('gives a stroke that grows with the frame and never drops below 2 px', () => {
    expect(strokeWidth({ width: 3840, height: 2160 })).toBeGreaterThan(strokeWidth(FRAME));
    expect(strokeWidth({ width: 160, height: 90 })).toBeGreaterThanOrEqual(2);
  });

  it('orders text sizes small, medium, large, all proportional to the height', () => {
    expect(fontPx('s', FRAME)).toBeLessThan(fontPx('m', FRAME));
    expect(fontPx('m', FRAME)).toBeLessThan(fontPx('l', FRAME));
    expect(fontPx('m', { width: 2560, height: 1440 })).toBeCloseTo(fontPx('m', FRAME) * 2, 5);
  });
});

describe('arrowHead', () => {
  const dist = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);

  it('puts both wings behind the tip, the same distance from it', () => {
    const tip = { x: 300, y: 100 };
    const wings = arrowHead({ x: 100, y: 100 }, tip, 6)!;
    expect(wings).not.toBeNull();
    expect(dist(wings[0], tip)).toBeCloseTo(dist(wings[1], tip), 6);
    // Pointing right, so both wings sit to the left of the tip, one above, one below.
    for (const w of wings) expect(w.x).toBeLessThan(tip.x);
    expect((wings[0].y - tip.y) * (wings[1].y - tip.y)).toBeLessThan(0);
  });

  it('is symmetric about the shaft whatever the direction', () => {
    const a = { x: 50, y: 400 };
    const b = { x: 420, y: 90 };
    const [w1, w2] = arrowHead(a, b, 5)!;
    // Mirror images about the shaft: equal perpendicular distance, opposite sides.
    const ux = (b.x - a.x) / dist(a, b);
    const uy = (b.y - a.y) / dist(a, b);
    const side = (p: { x: number; y: number }) => (p.x - b.x) * -uy + (p.y - b.y) * ux;
    expect(side(w1)).toBeCloseTo(-side(w2), 6);
  });

  it('draws no head for an arrow with no length, rather than NaN', () => {
    expect(arrowHead({ x: 10, y: 10 }, { x: 10, y: 10 }, 4)).toBeNull();
  });
});

describe('inkOn', () => {
  it('picks whichever of black and white has more contrast with the fill', () => {
    // These fills are bright on purpose, so they read on footage; by WCAG
    // contrast every one of them carries black text better than white.
    for (const c of ['yellow', 'white', 'red', 'green', 'blue'] as const) {
      expect(inkOn(c), c).toBe('#000000');
    }
    expect(inkOn('black')).toBe('#ffffff');
  });

  it('knows every colour it offers', () => {
    for (const c of Object.keys(COLOURS) as (keyof typeof COLOURS)[]) {
      expect(['#000000', '#ffffff']).toContain(inkOn(c));
    }
  });
});

describe('isUsable', () => {
  it('drops a click that never became a drag', () => {
    const b = { x: 0.3, y: 0.3 };
    expect(isUsable(ann({ kind: 'rect', a: b, b }))).toBe(false);
    expect(isUsable(ann({ kind: 'ellipse', a: b, b: { x: 0.3001, y: 0.3001 } }))).toBe(false);
    expect(isUsable(ann({ kind: 'arrow', a: b, b }))).toBe(false);
  });

  it('keeps text and callouts only when they say something', () => {
    expect(isUsable(ann({ kind: 'text', text: '   ' }))).toBe(false);
    expect(isUsable(ann({ kind: 'callout', text: '' }))).toBe(false);
    expect(isUsable(ann({ kind: 'text', text: 'Hello' }))).toBe(true);
  });

  it('drops a span that covers nothing', () => {
    expect(isUsable(ann({ start: 4, end: 4 }))).toBe(false);
  });
});

describe('callout geometry', () => {
  it('centres the box on b with room around the text', () => {
    const box = calloutBox({ x: 640, y: 360 }, { width: 200, height: 40 }, FRAME);
    expect(box.x + box.w / 2).toBeCloseTo(640, 6);
    expect(box.y + box.h / 2).toBeCloseTo(360, 6);
    expect(box.w).toBeGreaterThan(200);
    expect(box.h).toBeGreaterThan(40);
  });

  it('points the tail at the nearest point on the box edge', () => {
    const rect = { x: 100, y: 100, w: 200, h: 100 };
    expect(nearestOnRect({ x: 50, y: 150 }, rect)).toEqual({ x: 100, y: 150 });
    expect(nearestOnRect({ x: 500, y: 20 }, rect)).toEqual({ x: 300, y: 100 });
    expect(nearestOnRect({ x: 200, y: 400 }, rect)).toEqual({ x: 200, y: 200 });
  });
});

describe('layerFor', () => {
  const evenAndInside = (r: { x: number; y: number; w: number; h: number }) => {
    for (const n of [r.x, r.y, r.w, r.h]) expect(n % 2).toBe(0);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(FRAME.width);
    expect(r.y + r.h).toBeLessThanOrEqual(FRAME.height);
  };

  it('contains a rectangle and the whole of its stroke', () => {
    const a = ann({ kind: 'rect', a: { x: 0.25, y: 0.25 }, b: { x: 0.5, y: 0.5 } });
    const layer = layerFor(a, FRAME, null);
    const s = strokeWidth(FRAME);
    expect(layer.x).toBeLessThanOrEqual(320 - s / 2);
    expect(layer.y).toBeLessThanOrEqual(180 - s / 2);
    expect(layer.x + layer.w).toBeGreaterThanOrEqual(640 + s / 2);
    expect(layer.y + layer.h).toBeGreaterThanOrEqual(360 + s / 2);
    evenAndInside(layer);
  });

  it('leaves room for an arrow head sticking out beyond the shaft', () => {
    const a = ann({ kind: 'arrow', a: { x: 0.1, y: 0.5 }, b: { x: 0.6, y: 0.5 } });
    const layer = layerFor(a, FRAME, null);
    const [w1, w2] = arrowHead({ x: 128, y: 360 }, { x: 768, y: 360 }, strokeWidth(FRAME))!;
    for (const w of [w1, w2]) {
      expect(w.y).toBeGreaterThanOrEqual(layer.y);
      expect(w.y).toBeLessThanOrEqual(layer.y + layer.h);
    }
    evenAndInside(layer);
  });

  it('never leaves the frame for a shape at the edge', () => {
    for (const kind of ['rect', 'ellipse', 'arrow'] as const) {
      evenAndInside(layerFor(ann({ kind, a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }), FRAME, null));
    }
    evenAndInside(layerFor(ann({ kind: 'text', text: 'Edge', b: { x: 0.99, y: 0.01 } }), FRAME, { width: 300, height: 60 }));
    evenAndInside(
      layerFor(ann({ kind: 'callout', text: 'Edge', a: { x: 0, y: 1 }, b: { x: 1, y: 0 } }), FRAME, { width: 300, height: 60 }),
    );
  });

  it('contains both a callout box and the point it calls out', () => {
    const a = ann({ kind: 'callout', text: 'Look', a: { x: 0.1, y: 0.8 }, b: { x: 0.6, y: 0.3 } });
    const layer = layerFor(a, FRAME, { width: 120, height: 40 });
    expect(layer.x).toBeLessThanOrEqual(128);
    expect(layer.y + layer.h).toBeGreaterThanOrEqual(576);
    expect(layer.x + layer.w).toBeGreaterThanOrEqual(768 + 60);
    expect(layer.y).toBeLessThanOrEqual(216 - 20);
  });
});

describe('buildAnnotateArgs', () => {
  const opts = { input: 'in.mp4', output: 'out.mp4', hasAudio: true, duration: 10 };
  const layer = (name: string, x: number, y: number, start = 0, end = 10) => ({ name, x, y, start, end });

  it('throws when there is nothing to draw', () => {
    expect(() => buildAnnotateArgs([], opts)).toThrow();
  });

  it('adds one input per layer after the video, in order', () => {
    const args = buildAnnotateArgs([layer('l0.png', 10, 20), layer('l1.png', 30, 40)], opts);
    const inputs = args.flatMap((v, i) => (v === '-i' ? [args[i + 1]] : []));
    expect(inputs).toEqual(['in.mp4', 'l0.png', 'l1.png']);
  });

  it('pads the video even, then chains one overlay per layer ending in [outv]', () => {
    const args = buildAnnotateArgs([layer('l0.png', 10, 20), layer('l1.png', 30, 40, 2, 6)], opts);
    expect(args[args.indexOf('-filter_complex') + 1]).toBe(
      '[0:v]pad=ceil(iw/2)*2:ceil(ih/2)*2[b0];' +
        '[b0][1:v]overlay=10:20[b1];' +
        "[b1][2:v]overlay=30:40:enable='between(t,2,6)'[outv]",
    );
  });

  it('trims float noise out of the gate', () => {
    const args = buildAnnotateArgs([layer('l0.png', 0, 0, 0.1 + 0.2, 6)], opts);
    expect(args[args.indexOf('-filter_complex') + 1]).toContain("enable='between(t,0.3,6)'");
  });

  it('maps the audio and re-encodes it, or drops it for a silent clip', () => {
    const loud = buildAnnotateArgs([layer('l0.png', 0, 0)], opts).join(' ');
    expect(loud).toContain('-map [outv]');
    expect(loud).toContain('-map 0:a');
    expect(loud).toContain('-c:a aac');
    const silent = buildAnnotateArgs([layer('l0.png', 0, 0)], { ...opts, hasAudio: false });
    expect(silent).toContain('-an');
    expect(silent.join(' ')).not.toContain('0:a');
  });
});
