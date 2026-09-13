import { describe, it, expect } from 'vitest';
import {
  toEvenPixels,
  evenFrame,
  blurRadius,
  blurPower,
  usableMasks,
  withStart,
  withEnd,
  buildBlurArgs,
  type Mask,
} from './blur';

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const mask = (r: ReturnType<typeof rect>, start = 0, end = 10): Mask => ({ rect: r, start, end });
const FRAME = { width: 640, height: 480 };

/** The filter graph as one string, for the argument-shape assertions. */
function graph(masks: Mask[], over = FRAME, duration = 10, strength: 'strong' | 'soft' = 'strong') {
  const args = buildBlurArgs(masks, {
    input: 'in.mp4',
    output: 'out.mp4',
    hasAudio: false,
    frame: over,
    duration,
    strength,
  });
  const at = args.indexOf('-filter_complex');
  expect(at).toBeGreaterThanOrEqual(0);
  return args[at + 1]!;
}

describe('evenFrame', () => {
  it('leaves even dimensions alone', () => {
    expect(evenFrame({ width: 640, height: 480 })).toEqual({ width: 640, height: 480 });
  });

  it('rounds odd dimensions up, matching the pad filter', () => {
    expect(evenFrame({ width: 641, height: 481 })).toEqual({ width: 642, height: 482 });
  });
});

describe('toEvenPixels', () => {
  it('maps a full-frame mask to the whole frame', () => {
    expect(toEvenPixels(rect(0, 0, 1, 1), FRAME)).toEqual({ x: 0, y: 0, w: 640, h: 480 });
  });

  it('maps a full-frame mask to the PADDED frame when the source is odd', () => {
    expect(toEvenPixels(rect(0, 0, 1, 1), { width: 641, height: 481 })).toEqual({
      x: 0,
      y: 0,
      w: 642,
      h: 482,
    });
  });

  it('always produces even origin and size', () => {
    // 0.1 * 640 = 64, 0.3 * 480 = 144; deliberately offset onto odd pixels.
    for (const r of [
      rect(0.1015625, 0.3020833, 0.2, 0.2),
      rect(0.003, 0.007, 0.51, 0.33),
      rect(0.4999, 0.4999, 0.0101, 0.0101),
    ]) {
      const px = toEvenPixels(r, FRAME);
      expect(px.x % 2).toBe(0);
      expect(px.y % 2).toBe(0);
      expect(px.w % 2).toBe(0);
      expect(px.h % 2).toBe(0);
    }
  });

  it('never leaves the frame, at either edge', () => {
    for (const r of [rect(0.97, 0.97, 0.2, 0.2), rect(-0.1, -0.1, 0.3, 0.3), rect(0, 0, 2, 2)]) {
      const px = toEvenPixels(r, FRAME);
      expect(px.x).toBeGreaterThanOrEqual(0);
      expect(px.y).toBeGreaterThanOrEqual(0);
      expect(px.x + px.w).toBeLessThanOrEqual(FRAME.width);
      expect(px.y + px.h).toBeLessThanOrEqual(FRAME.height);
    }
  });

  it('keeps a region at least one even step wide', () => {
    const px = toEvenPixels(rect(0.5, 0.5, 0.0001, 0.0001), FRAME);
    expect(px.w).toBeGreaterThanOrEqual(2);
    expect(px.h).toBeGreaterThanOrEqual(2);
  });
});

describe('blurRadius', () => {
  it('scales with the region, so a small face is blurred as thoroughly as a large one', () => {
    expect(blurRadius(400, 'strong')).toBeGreaterThan(blurRadius(40, 'strong'));
  });

  it('blurs harder on strong than on soft', () => {
    expect(blurRadius(200, 'strong')).toBeGreaterThan(blurRadius(200, 'soft'));
  });

  it('never goes below 1, however small the region', () => {
    expect(blurRadius(2, 'soft')).toBeGreaterThanOrEqual(1);
    expect(blurRadius(0, 'strong')).toBeGreaterThanOrEqual(1);
  });

  it('stays inside the chroma plane, which is half resolution', () => {
    for (const side of [2, 8, 40, 200, 1080]) {
      const r = blurRadius(side, 'strong');
      expect(r).toBeLessThanOrEqual(Math.max(1, Math.floor(side / 4)));
    }
  });

  it('repeats the box more times on strong, which is what makes it unrecoverable', () => {
    expect(blurPower('strong')).toBeGreaterThan(blurPower('soft'));
  });
});

describe('usableMasks', () => {
  it('drops a rect too small to have been meant', () => {
    expect(usableMasks([mask(rect(0.5, 0.5, 0.0001, 0.0001))])).toHaveLength(0);
  });

  it('drops a span that is inverted or zero width', () => {
    expect(usableMasks([mask(rect(0, 0, 0.5, 0.5), 5, 5)])).toHaveLength(0);
    expect(usableMasks([mask(rect(0, 0, 0.5, 0.5), 8, 3)])).toHaveLength(0);
  });

  it('keeps a real one', () => {
    expect(usableMasks([mask(rect(0.1, 0.1, 0.3, 0.3), 1, 4)])).toHaveLength(1);
  });
});

describe('buildBlurArgs', () => {
  it('throws when nothing is left to blur', () => {
    expect(() => graph([])).toThrow();
    expect(() => graph([mask(rect(0.5, 0.5, 0.0001, 0.0001))])).toThrow();
  });

  it('pads to even dimensions, as the trimmer does', () => {
    expect(graph([mask(rect(0.1, 0.1, 0.2, 0.2))])).toContain('pad=ceil(iw/2)*2:ceil(ih/2)*2');
  });

  it('emits one crop, one boxblur and one overlay for one mask', () => {
    const g = graph([mask(rect(0.1, 0.1, 0.2, 0.2), 0, 10)]);
    expect(g.match(/crop=/g)).toHaveLength(1);
    expect(g.match(/boxblur=/g)).toHaveLength(1);
    expect(g.match(/overlay=/g)).toHaveLength(1);
  });

  it('chains one overlay per mask, each consuming the previous label', () => {
    const g = graph([
      mask(rect(0.1, 0.1, 0.2, 0.2)),
      mask(rect(0.5, 0.5, 0.2, 0.2)),
      mask(rect(0.2, 0.6, 0.1, 0.1)),
    ]);
    expect(g.match(/overlay=/g)).toHaveLength(3);
    expect(g.match(/boxblur=/g)).toHaveLength(3);
    expect(g).toContain('[v0]');
    expect(g).toContain('[v1]');
    expect(g).toContain('[outv]');
  });

  it('splits the padded source once per mask, plus the base being drawn on', () => {
    expect(graph([mask(rect(0.1, 0.1, 0.2, 0.2))])).toContain('split=2');
    expect(
      graph([mask(rect(0.1, 0.1, 0.2, 0.2)), mask(rect(0.5, 0.5, 0.2, 0.2))]),
    ).toContain('split=3');
  });

  it('omits the enable gate when the mask covers the whole clip', () => {
    expect(graph([mask(rect(0.1, 0.1, 0.2, 0.2), 0, 10)], FRAME, 10)).not.toContain('enable=');
  });

  it('gates on time when the mask covers only part of the clip', () => {
    const g = graph([mask(rect(0.1, 0.1, 0.2, 0.2), 2, 6)], FRAME, 10);
    expect(g).toContain("enable='between(t,2,6)'");
  });

  it('trims float noise out of the gate', () => {
    const g = graph([mask(rect(0.1, 0.1, 0.2, 0.2), 0.1 + 0.2, 6)], FRAME, 10);
    expect(g).toContain("enable='between(t,0.3,6)'");
  });

  it('crops on even coordinates, so the chroma planes line up', () => {
    const g = graph([mask(rect(0.1015625, 0.3020833, 0.2, 0.2))]);
    const crop = /crop=(\d+):(\d+):(\d+):(\d+)/.exec(g);
    expect(crop).not.toBeNull();
    for (const n of crop!.slice(1)) expect(Number(n) % 2).toBe(0);
  });

  it('maps no audio and passes -an for a silent clip', () => {
    const args = buildBlurArgs([mask(rect(0.1, 0.1, 0.2, 0.2))], {
      input: 'in.mp4',
      output: 'out.mp4',
      hasAudio: false,
      frame: FRAME,
      duration: 10,
      strength: 'strong',
    });
    expect(args).toContain('-an');
    expect(args.join(' ')).not.toContain('0:a');
  });

  it('maps and re-encodes the audio when there is some', () => {
    const args = buildBlurArgs([mask(rect(0.1, 0.1, 0.2, 0.2))], {
      input: 'in.mp4',
      output: 'out.mp4',
      hasAudio: true,
      frame: FRAME,
      duration: 10,
      strength: 'strong',
    });
    expect(args).not.toContain('-an');
    // Re-encoded rather than copied: a WebM's Opus track cannot be dropped into
    // an MP4 untouched, and this tool accepts WebM.
    expect(args.join(' ')).toContain('-map 0:a');
    expect(args.join(' ')).toContain('-c:a aac');
  });

  it('maps the filtered video, not the input stream', () => {
    const args = buildBlurArgs([mask(rect(0.1, 0.1, 0.2, 0.2))], {
      input: 'in.mp4',
      output: 'out.mp4',
      hasAudio: false,
      frame: FRAME,
      duration: 10,
      strength: 'strong',
    });
    expect(args.join(' ')).toContain('-map [outv]');
    expect(args[args.length - 1]).toBe('out.mp4');
  });
});

describe('withStart / withEnd', () => {
  const box = rect(0.1, 0.1, 0.2, 0.2);

  it('moves the start and keeps the end when there is room', () => {
    expect(withStart(mask(box, 0, 10), 3, 10)).toMatchObject({ start: 3, end: 10 });
  });

  it('moves the end and keeps the start when there is room', () => {
    expect(withEnd(mask(box, 2, 10), 6, 10)).toMatchObject({ start: 2, end: 6 });
  });

  it('runs a start placed past the end on to the end of the clip', () => {
    // "Start here" after the old end means "from now on", not "nothing".
    expect(withStart(mask(box, 1, 4), 6, 10)).toMatchObject({ start: 6, end: 10 });
  });

  it('runs an end placed before the start back to the start of the clip', () => {
    expect(withEnd(mask(box, 5, 9), 3, 10)).toMatchObject({ start: 0, end: 3 });
  });

  it('clamps to the clip at both ends', () => {
    expect(withStart(mask(box, 2, 8), -4, 10)).toMatchObject({ start: 0, end: 8 });
    expect(withEnd(mask(box, 2, 8), 99, 10)).toMatchObject({ start: 2, end: 10 });
  });

  it('never leaves a span too short to cover a frame, even at the very edge', () => {
    const late = withStart(mask(box, 0, 10), 10, 10);
    const early = withEnd(mask(box, 0, 10), 0, 10);
    expect(late.end - late.start).toBeGreaterThanOrEqual(0.05 - 1e-9);
    expect(early.end - early.start).toBeGreaterThanOrEqual(0.05 - 1e-9);
    expect(late.end).toBeLessThanOrEqual(10);
    expect(early.start).toBeGreaterThanOrEqual(0);
  });

  it('keeps the rectangle untouched', () => {
    expect(withStart(mask(box, 0, 10), 3, 10).rect).toEqual(box);
    expect(withEnd(mask(box, 0, 10), 3, 10).rect).toEqual(box);
  });
});
