import { describe, it, expect } from 'vitest';
import {
  setSpeed,
  outputDuration,
  speedToFit,
  atempoChain,
  frameRateFrom,
  buildSpeedArgs,
  MIN_SPEED,
  MAX_SPEED,
  type Piece,
} from './speed';

const whole = (d: number): Piece[] => [{ start: 0, end: d, speed: 1 }];

describe('setSpeed', () => {
  it('speeds up the whole clip as one piece', () => {
    expect(setSpeed(whole(60), { start: 0, end: 60 }, 2)).toEqual([{ start: 0, end: 60, speed: 2 }]);
  });

  it('splits a piece in three when a stretch in its middle changes speed', () => {
    expect(setSpeed(whole(60), { start: 10, end: 20 }, 4)).toEqual([
      { start: 0, end: 10, speed: 1 },
      { start: 10, end: 20, speed: 4 },
      { start: 20, end: 60, speed: 1 },
    ]);
  });

  it('overrides the pieces it covers and trims the ones it overlaps', () => {
    const pieces = setSpeed(whole(60), { start: 10, end: 20 }, 4);
    expect(setSpeed(pieces, { start: 15, end: 30 }, 0.5)).toEqual([
      { start: 0, end: 10, speed: 1 },
      { start: 10, end: 15, speed: 4 },
      { start: 15, end: 30, speed: 0.5 },
      { start: 30, end: 60, speed: 1 },
    ]);
  });

  it('merges neighbours that end up at the same speed, so setting 1x undoes a change', () => {
    const pieces = setSpeed(whole(60), { start: 10, end: 20 }, 4);
    expect(setSpeed(pieces, { start: 10, end: 20 }, 1)).toEqual(whole(60));
  });

  it('always covers the whole clip, with no gaps and no slivers', () => {
    // A selection a few milliseconds from an edge snaps to it instead of leaving a sliver.
    const pieces = setSpeed(whole(60), { start: 0.01, end: 59.98 }, 2);
    expect(pieces).toEqual([{ start: 0, end: 60, speed: 2 }]);
    const inner = setSpeed(setSpeed(whole(60), { start: 10, end: 20 }, 4), { start: 20.02, end: 30 }, 2);
    expect(inner.map((p) => [p.start, p.end])).toEqual([[0, 10], [10, 20], [20, 30], [30, 60]]);
  });

  it('ignores an empty or inverted range', () => {
    expect(setSpeed(whole(60), { start: 20, end: 20 }, 2)).toEqual(whole(60));
    expect(setSpeed(whole(60), { start: 30, end: 20 }, 2)).toEqual(whole(60));
  });

  it('clamps the speed into the range the engine can do', () => {
    expect(setSpeed(whole(10), { start: 0, end: 10 }, 100)[0]!.speed).toBe(MAX_SPEED);
    expect(setSpeed(whole(10), { start: 0, end: 10 }, 0.01)[0]!.speed).toBe(MIN_SPEED);
  });
});

describe('outputDuration', () => {
  it('divides each piece by its own speed', () => {
    const pieces = setSpeed(whole(60), { start: 10, end: 30 }, 4); // 10 + 5 + 30
    expect(outputDuration(pieces)).toBeCloseTo(45);
  });
});

describe('speedToFit', () => {
  it('is the speed that makes the clip last the target length', () => {
    expect(speedToFit(90, 60)).toEqual({ speed: 1.5, clamped: false });
    expect(speedToFit(30, 60)).toEqual({ speed: 0.5, clamped: false });
  });

  it('says so when the target is out of reach rather than pretending', () => {
    expect(speedToFit(3600, 15)).toEqual({ speed: MAX_SPEED, clamped: true });
    expect(speedToFit(10, 600)).toEqual({ speed: MIN_SPEED, clamped: true });
  });

  it('refuses a length that is not a length', () => {
    expect(speedToFit(60, 0)).toBeNull();
    expect(speedToFit(60, -5)).toBeNull();
  });
});

describe('atempoChain', () => {
  it('is a plain pass-through at normal speed', () => {
    expect(atempoChain(1)).toBe('anull');
  });

  it('uses one atempo where the filter can do it in one step', () => {
    expect(atempoChain(2)).toBe('atempo=2');
    expect(atempoChain(0.5)).toBe('atempo=0.5');
    expect(atempoChain(MAX_SPEED)).toBe(`atempo=${MAX_SPEED}`);
  });

  it('chains halves below 0.5, which one atempo refuses, and multiplies back to the speed', () => {
    const chain = atempoChain(0.25);
    expect(chain).toBe('atempo=0.5,atempo=0.5');
    const product = chain.split(',').reduce((p, f) => p * Number(f.split('=')[1]), 1);
    expect(product).toBeCloseTo(0.25);
  });
});

describe('frameRateFrom', () => {
  it('reads the video stream’s frame rate from the input summary', () => {
    expect(frameRateFrom(['  Stream #0:0[0x1](und): Video: h264 (High), yuv420p, 1280x720, 1500 kb/s, 30 fps, 30 tbr, 90k tbn'])).toBe(30);
    expect(frameRateFrom(['  Stream #0:0: Video: h264, yuv420p, 1920x1080, 29.97 fps, 29.97 tbr, 30k tbn'])).toBe(29.97);
  });

  it('falls back to tbr when a variable rate recording prints no fps', () => {
    expect(frameRateFrom(['  Stream #0:0: Video: vp9 (Profile 0), yuv420p(tv), 1376x736, 60 tbr, 1k tbn'])).toBe(60);
  });

  it('ignores audio lines and returns null when there is nothing to read', () => {
    expect(frameRateFrom(['  Stream #0:1: Audio: aac (LC), 48000 Hz, stereo, fltp'])).toBeNull();
  });
});

describe('buildSpeedArgs', () => {
  const opts = { input: 'in.mp4', output: 'out.mp4', hasAudio: true, fps: 30 };

  it('seeks each piece as its own input, so nothing between pieces is decoded twice', () => {
    const pieces = setSpeed(whole(60), { start: 10, end: 20 }, 4);
    const args = buildSpeedArgs(pieces, opts);
    expect(args.slice(0, 18)).toEqual([
      '-ss', '0', '-t', '10', '-i', 'in.mp4',
      '-ss', '10', '-t', '10', '-i', 'in.mp4',
      '-ss', '20', '-t', '40', '-i', 'in.mp4',
    ]);
  });

  it('re-times each piece, brings it back to the source frame rate, and concatenates', () => {
    const pieces = setSpeed(whole(60), { start: 10, end: 20 }, 4);
    const graph = buildSpeedArgs(pieces, opts)[buildSpeedArgs(pieces, opts).indexOf('-filter_complex') + 1];
    expect(graph).toBe(
      '[0:v]setpts=(PTS-STARTPTS)/1,fps=30[v0];[0:a]anull,asetpts=PTS-STARTPTS[a0];' +
        '[1:v]setpts=(PTS-STARTPTS)/4,fps=30[v1];[1:a]atempo=4,asetpts=PTS-STARTPTS[a1];' +
        '[2:v]setpts=(PTS-STARTPTS)/1,fps=30[v2];[2:a]anull,asetpts=PTS-STARTPTS[a2];' +
        '[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[cv][outa];[cv]pad=ceil(iw/2)*2:ceil(ih/2)*2[outv]',
    );
  });

  it('maps and encodes audio only when there is some', () => {
    const silent = buildSpeedArgs([{ start: 0, end: 8, speed: 2 }], { ...opts, hasAudio: false });
    const graph = silent[silent.indexOf('-filter_complex') + 1]!;
    expect(graph).not.toContain(':a]');
    expect(graph).toContain('concat=n=1:v=1:a=0[cv]');
    expect(silent).toContain('-an');
    expect(silent).not.toContain('[outa]');
  });

  it('leaves the frame rate to the engine when the source did not say what it is', () => {
    const args = buildSpeedArgs([{ start: 0, end: 8, speed: 2 }], { ...opts, fps: null });
    expect(args[args.indexOf('-filter_complex') + 1]).toContain('[0:v]setpts=(PTS-STARTPTS)/2[v0]');
  });

  it('refuses an empty list', () => {
    expect(() => buildSpeedArgs([], opts)).toThrow(RangeError);
  });
});
