import { describe, it, expect } from 'vitest';
import { frameFileName, FRAME_FORMATS, findNeighbourFrame, framesDiffer } from './frame';

describe('frameFileName', () => {
  it('names the frame after the video and the moment it was taken, in characters every file system accepts', () => {
    expect(frameFileName('Holiday Clip.MOV', 65.2345, 'png')).toBe('Holiday Clip-01m05.235s.png');
    expect(frameFileName('talk.mp4', 0, 'jpg')).toBe('talk-00m00.000s.jpg');
    expect(frameFileName('noext', 3725.5, 'png')).toBe('noext-62m05.500s.png');
  });
});

describe('FRAME_FORMATS', () => {
  it('offers lossless PNG and smaller JPEG, each with a matching type and extension', () => {
    expect(FRAME_FORMATS.png).toEqual({ mime: 'image/png', ext: 'png', quality: undefined });
    expect(FRAME_FORMATS.jpeg.mime).toBe('image/jpeg');
    expect(FRAME_FORMATS.jpeg.ext).toBe('jpg');
    expect(FRAME_FORMATS.jpeg.quality).toBeGreaterThan(0.85);
  });
});

describe('findNeighbourFrame', () => {
  /** A fake video: frame i starts at starts[i]. `differs` compares with the frame at `from`. */
  const timeline = (starts: number[], duration: number) => {
    const frameAt = (t: number) => {
      let i = 0;
      while (i + 1 < starts.length && starts[i + 1]! <= t) i++;
      return i;
    };
    return {
      frameAt,
      async step(from: number, direction: 1 | -1) {
        const original = frameAt(from);
        let seeks = 0;
        const t = await findNeighbourFrame(from, direction, duration, async (at) => {
          seeks++;
          return frameAt(at) !== original;
        });
        return { t, frame: t === null ? null : frameAt(t), from: original, seeks };
      },
    };
  };

  it('lands on the very next and previous frame at 15 fps with millisecond timestamps, from anywhere in a frame', async () => {
    const starts = Array.from({ length: 30 }, (_, i) => Math.round((i * 1000) / 15) / 1000);
    const v = timeline(starts, 2);
    for (const from of [1.0, 1.03, 1.066, 1.1331]) {
      const fwd = await v.step(from, 1);
      expect(fwd.frame).toBe(fwd.from + 1);
      const back = await v.step(from, -1);
      expect(back.frame).toBe(back.from - 1);
    }
  });

  it('never skips a frame in a variable rate recording, even a short frame after a long one', async () => {
    const starts = [0, 0.5, 0.516, 0.533, 1.9, 1.92, 1.95];
    const v = timeline(starts, 2);
    for (let i = 0; i < starts.length - 1; i++) {
      expect((await v.step(starts[i]! + 0.001, 1)).frame).toBe(i + 1);
    }
    for (let i = starts.length - 1; i > 0; i--) {
      expect((await v.step(starts[i]! + 0.001, -1)).frame).toBe(i - 1);
    }
  });

  it('takes a handful of seeks per frame rather than one per probe', async () => {
    const v15 = timeline(Array.from({ length: 30 }, (_, i) => i / 15), 2);
    expect((await v15.step(1.0, 1)).seeks).toBeLessThanOrEqual(9);
    const slideshow = timeline([0, 2, 4], 6);
    const long = await slideshow.step(0.001, 1);
    expect(long.frame).toBe(1);
    expect(long.seeks).toBeLessThanOrEqual(20);
  });

  it('reports no neighbour at either end of the video', async () => {
    const v = timeline([0, 1], 2);
    expect((await v.step(1.5, 1)).t).toBeNull();
    expect((await v.step(0.5, -1)).t).toBeNull();
  });
});

describe('framesDiffer', () => {
  it('treats the same pixels as the same frame and any changed value as a new one', () => {
    const a = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
    expect(framesDiffer(a, new Uint8ClampedArray(a))).toBe(false);
    const b = new Uint8ClampedArray(a);
    b[5] = 6;
    expect(framesDiffer(a, b)).toBe(true);
  });

  it('calls buffers of different sizes different, rather than comparing past the end', () => {
    expect(framesDiffer([1, 2, 3, 4], [1, 2, 3])).toBe(true);
  });
});
