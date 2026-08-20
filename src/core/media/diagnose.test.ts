import { describe, it, expect } from 'vitest';
import {
  classifyMediaError, mediaSupport, rmsLevel, toDbfs, meterFraction, judgeMic, cameraFacts,
  resolutionName, SILENCE_FLOOR, QUIET_CEILING,
} from './diagnose';

const err = (name: string) => Object.assign(new Error('x'), { name });

describe('classifying why the camera did not start', () => {
  it('names the cause the browser reported, not a generic failure', () => {
    expect(classifyMediaError(err('NotAllowedError'))).toBe('denied');
    expect(classifyMediaError(err('NotFoundError'))).toBe('notFound');
    expect(classifyMediaError(err('NotReadableError'))).toBe('inUse');
    expect(classifyMediaError(err('OverconstrainedError'))).toBe('overconstrained');
  });

  it('handles the engine-specific spellings of the same cause', () => {
    // Firefox and older Chrome use different names for identical situations.
    expect(classifyMediaError(err('SecurityError'))).toBe('denied');
    expect(classifyMediaError(err('DevicesNotFoundError'))).toBe('notFound');
    expect(classifyMediaError(err('TrackStartError'))).toBe('inUse');
    expect(classifyMediaError(err('ConstraintNotSatisfiedError'))).toBe('overconstrained');
  });

  it('reports environment support separately from a call failing', () => {
    // jsdom has no mediaDevices, which is exactly the "no API" case. Folding
    // this into error classification once made every rejection read as
    // "insecure origin".
    expect(['ok', 'insecure', 'unsupported']).toContain(mediaSupport());
    expect(classifyMediaError(err('NotAllowedError'))).toBe('denied');
  });

  it('falls back to unknown rather than guessing', () => {
    expect(classifyMediaError(err('WeirdNewError'))).toBe('unknown');
    expect(classifyMediaError(null)).toBe('unknown');
    expect(classifyMediaError({})).toBe('unknown');
  });
});

describe('microphone level', () => {
  const buf = (fill: number, n = 512) => Float32Array.from({ length: n }, () => fill);

  it('is zero for digital silence', () => {
    expect(rmsLevel(buf(0))).toBe(0);
    expect(rmsLevel(new Float32Array(0))).toBe(0);
  });

  it('is the amplitude for a constant signal', () => {
    expect(rmsLevel(buf(0.5))).toBeCloseTo(0.5, 6);
  });

  it('computes RMS, not peak, so one click does not read as a live mic', () => {
    const mostlySilent = new Float32Array(512);
    mostlySilent[0] = 1; // a single loud sample
    expect(rmsLevel(mostlySilent)).toBeLessThan(0.05);
  });

  it('never exceeds 1 even if the buffer clips', () => {
    expect(rmsLevel(buf(3))).toBe(1);
  });

  it('handles negative samples, since audio is signed', () => {
    expect(rmsLevel(buf(-0.5))).toBeCloseTo(0.5, 6);
  });
});

describe('dB conversion', () => {
  it('puts full scale at 0 dBFS', () => {
    expect(toDbfs(1)).toBeCloseTo(0, 6);
  });

  it('halves to about -6 dB', () => {
    expect(toDbfs(0.5)).toBeCloseTo(-6.02, 1);
  });

  it('floors silence rather than returning -Infinity', () => {
    expect(toDbfs(0)).toBe(-60);
    expect(Number.isFinite(toDbfs(0))).toBe(true);
  });

  it('maps the meter across the full bar', () => {
    expect(meterFraction(0)).toBe(0);
    expect(meterFraction(1)).toBeCloseTo(1, 6);
    expect(meterFraction(0.5)).toBeGreaterThan(0.5); // dB scale, not linear
  });
});

describe('microphone verdict', () => {
  it('reports nothing heard for silence', () => {
    expect(judgeMic(0).heard).toBe(false);
    expect(judgeMic(SILENCE_FLOOR).heard).toBe(false);
  });

  it('separates "very quiet" from "nothing", because the causes differ', () => {
    const quiet = judgeMic(QUIET_CEILING / 2);
    expect(quiet.heard).toBe(true);
    expect(quiet.veryQuiet).toBe(true);

    const normal = judgeMic(0.3);
    expect(normal.heard).toBe(true);
    expect(normal.veryQuiet).toBe(false);
  });
});

describe('camera facts', () => {
  it('reports what the track actually delivered, not what was requested', () => {
    const f = cameraFacts({ width: 1280, height: 720, frameRate: 29.97 }, 'FaceTime HD');
    expect(f).toEqual({ width: 1280, height: 720, frameRate: 30, label: 'FaceTime HD' });
  });

  it('tolerates a track that reports nothing', () => {
    const f = cameraFacts({}, '');
    expect(f).toEqual({ width: 0, height: 0, frameRate: null, label: '' });
  });

  it('names common resolutions so a spec claim can be checked', () => {
    expect(resolutionName(1920, 1080)).toBe('1080p');
    expect(resolutionName(1280, 720)).toBe('720p');
    expect(resolutionName(3840, 2160)).toBe('4K');
  });

  it('names by the short edge, so portrait video is not mislabelled', () => {
    expect(resolutionName(1080, 1920)).toBe('1080p');
  });

  it('returns null for a size with no common name', () => {
    expect(resolutionName(1234, 567)).toBeNull();
    expect(resolutionName(0, 0)).toBeNull();
  });
});
