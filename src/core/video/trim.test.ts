import { describe, it, expect } from 'vitest';
import {
  removeRange,
  totalDuration,
  buildTrimArgs,
  formatTimecode,
  parseTimecode,
  MIN_SEGMENT_SEC,
} from './trim';

const seg = (start: number, end: number) => ({ start, end });

describe('removeRange', () => {
  it('leaves the list alone when the cut misses every segment', () => {
    const keep = [seg(0, 10)];
    expect(removeRange(keep, seg(20, 30))).toEqual([seg(0, 10)]);
    expect(removeRange(keep, seg(-5, 0))).toEqual([seg(0, 10)]);
  });

  it('splits a segment when the cut lands inside it', () => {
    expect(removeRange([seg(0, 10)], seg(4, 6))).toEqual([seg(0, 4), seg(6, 10)]);
  });

  it('trims the head when the cut overlaps the start', () => {
    expect(removeRange([seg(0, 10)], seg(-2, 3))).toEqual([seg(3, 10)]);
  });

  it('trims the tail when the cut overlaps the end', () => {
    expect(removeRange([seg(0, 10)], seg(7, 99))).toEqual([seg(0, 7)]);
  });

  it('drops a segment the cut covers completely', () => {
    expect(removeRange([seg(0, 10)], seg(0, 10))).toEqual([]);
    expect(removeRange([seg(2, 8)], seg(0, 10))).toEqual([]);
  });

  it('spans several segments, trimming the edges and deleting the middles', () => {
    const keep = [seg(0, 10), seg(20, 30), seg(40, 50)];
    // Cut from inside the first, across all of the second, into the third.
    expect(removeRange(keep, seg(5, 45))).toEqual([seg(0, 5), seg(45, 50)]);
  });

  it('drops slivers left below the minimum segment length', () => {
    // The head left behind is 0.01s — too short to encode, and not what the
    // user meant to keep when they dragged a cut to almost the start.
    const out = removeRange([seg(0, 10)], seg(0.01, 5));
    expect(out).toEqual([seg(5, 10)]);
    expect(MIN_SEGMENT_SEC).toBeGreaterThan(0);
  });

  it('treats a zero-width or inverted cut as removing nothing', () => {
    const keep = [seg(0, 10)];
    expect(removeRange(keep, seg(5, 5))).toEqual([seg(0, 10)]);
    expect(removeRange(keep, seg(8, 2))).toEqual([seg(0, 10)]);
  });

  it('does not mutate the list it was given', () => {
    const keep = [seg(0, 10)];
    removeRange(keep, seg(4, 6));
    expect(keep).toEqual([seg(0, 10)]);
  });
});

describe('totalDuration', () => {
  it('adds up the kept segments, not the source span', () => {
    expect(totalDuration([seg(0, 4), seg(6, 10)])).toBe(8);
  });

  it('is zero for an empty edit list', () => {
    expect(totalDuration([])).toBe(0);
  });
});

describe('buildTrimArgs', () => {
  it('rejects an empty edit list rather than writing an empty file', () => {
    expect(() => buildTrimArgs([], { input: 'in.mp4', output: 'out.mp4', hasAudio: true })).toThrow(
      RangeError,
    );
  });

  it('seeks on the input for a single range, so it does not decode from zero', () => {
    const args = buildTrimArgs([seg(30, 40)], {
      input: 'in.mp4',
      output: 'out.mp4',
      hasAudio: true,
    });
    // -ss before -i is an input seek; -t is a duration, which (unlike -to as an
    // input option) has never been ambiguous about what it is relative to.
    expect(args.slice(0, 6)).toEqual(['-ss', '30', '-t', '10', '-i', 'in.mp4']);
    expect(args).not.toContain('-filter_complex');
    expect(args.at(-1)).toBe('out.mp4');
  });

  it('encodes audio for a single range only when the source has some', () => {
    const opts = { input: 'in.mp4', output: 'out.mp4' };
    expect(buildTrimArgs([seg(0, 5)], { ...opts, hasAudio: true })).toContain('aac');
    const silent = buildTrimArgs([seg(0, 5)], { ...opts, hasAudio: false });
    expect(silent).toContain('-an');
    expect(silent).not.toContain('aac');
  });

  it('concatenates several ranges through a filter graph', () => {
    const args = buildTrimArgs([seg(0, 4), seg(6, 10)], {
      input: 'in.mp4',
      output: 'out.mp4',
      hasAudio: true,
    });
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('[0:v]trim=start=0:end=4,setpts=PTS-STARTPTS[v0]');
    expect(graph).toContain('[0:a]atrim=start=6:end=10,asetpts=PTS-STARTPTS[a1]');
    expect(graph).toContain('[v0][a0][v1][a1]concat=n=2:v=1:a=1[cv][outa]');
    expect(args).toContain('-map');
    expect(args).toContain('[outv]');
    expect(args).toContain('[outa]');
  });

  it('builds a video-only graph when the source has no audio track', () => {
    // A GIF or a silent clip: concat cannot take a stream that is not there, so
    // asking for one makes ffmpeg fail rather than drop it.
    const args = buildTrimArgs([seg(0, 4), seg(6, 10)], {
      input: 'in.gif',
      output: 'out.mp4',
      hasAudio: false,
    });
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).not.toContain('atrim');
    expect(graph).toContain('[v0][v1]concat=n=2:v=1:a=0[cv]');
    expect(args).not.toContain('[outa]');
    expect(args).toContain('-an');
  });

  it('pads odd dimensions so H.264 accepts a GIF of any size', () => {
    // libx264 with yuv420p needs even width and height; plenty of GIFs are odd.
    // Once on the single-range path, once on the concat output of the graph.
    const single = buildTrimArgs([seg(0, 4)], {
      input: 'in.gif',
      output: 'out.mp4',
      hasAudio: false,
    });
    expect(single.join(' ')).toContain('-vf pad=ceil(iw/2)*2:ceil(ih/2)*2');

    const multi = buildTrimArgs([seg(0, 4), seg(6, 10)], {
      input: 'in.gif',
      output: 'out.mp4',
      hasAudio: false,
    });
    expect(multi[multi.indexOf('-filter_complex') + 1]).toContain(
      '[cv]pad=ceil(iw/2)*2:ceil(ih/2)*2[outv]',
    );
  });
});

describe('timecodes', () => {
  it('formats seconds as mm:ss.ms', () => {
    expect(formatTimecode(0)).toBe('00:00.0');
    expect(formatTimecode(65.4)).toBe('01:05.4');
    expect(formatTimecode(3599.9)).toBe('59:59.9');
  });

  it('keeps counting in minutes past an hour rather than silently wrapping', () => {
    expect(formatTimecode(3600)).toBe('60:00.0');
  });

  it('parses what it formats', () => {
    for (const s of [0, 7.3, 65.4, 620.1]) {
      expect(parseTimecode(formatTimecode(s))).toBeCloseTo(s, 1);
    }
  });

  it('accepts a bare number of seconds', () => {
    expect(parseTimecode('12')).toBe(12);
    expect(parseTimecode('12.5')).toBe(12.5);
  });

  it('returns null for something it cannot read', () => {
    expect(parseTimecode('')).toBeNull();
    expect(parseTimecode('abc')).toBeNull();
    expect(parseTimecode('1:2:3:4')).toBeNull();
  });
});
