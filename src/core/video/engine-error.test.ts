import { describe, it, expect } from 'vitest';
import { toError, explainExit, rememberLine, RECENT_LINES } from './engine-error';

describe('toError', () => {
  it('passes a real Error through untouched', () => {
    const e = new Error('boom');
    expect(toError(e)).toBe(e);
  });

  it('turns the string the ffmpeg worker rejects with into an Error that keeps it', () => {
    // The worker posts `e.toString()`, so this is exactly what arrives.
    const e = toError('RuntimeError: memory access out of bounds');
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe('RuntimeError: memory access out of bounds');
  });

  it('never produces an empty message', () => {
    expect(toError('').message.length).toBeGreaterThan(0);
    expect(toError(undefined).message.length).toBeGreaterThan(0);
    expect(toError({ weird: true }).message.length).toBeGreaterThan(0);
  });
});

describe('explainExit', () => {
  it('names the first problem, which is the cause, not the cascade after it', () => {
    // Captured from the engine in a browser, for an encode given a filter that
    // does not exist. ffmpeg states the cause once and then reports each thing
    // that failed because of it.
    const log = [
      'Stream mapping:',
      '  Stream #0:0 -> #0:0 (vp9 (native) -> h264 (libx264))',
      "[AVFilterGraph @ 0xfdea20] No such filter: 'nosuchfilter'",
      'Error reinitializing filters!',
      'Failed to inject frame into filter network: Invalid argument',
      'Error while processing the decoded data for stream #0:0',
      '[aac @ 0xe3bde0] Qavg: nan',
      'Conversion failed!',
      'Aborted()',
    ];
    expect(explainExit(1, log)).toBe(
      "[AVFilterGraph @ 0xfdea20] No such filter: 'nosuchfilter' (exit code 1)",
    );
  });

  it('skips progress lines when looking for the cause', () => {
    const log = [
      'frame= 1200 fps= 30 q=25.0 size= 4096kB time=00:00:50.00 speed=1.2x',
      'Error while filtering: Cannot allocate memory',
      'Conversion failed!',
    ];
    expect(explainExit(1, log)).toBe('Error while filtering: Cannot allocate memory (exit code 1)');
  });

  it('uses the generic summary only when nothing more specific was said', () => {
    expect(explainExit(1, ['Conversion failed!', 'Aborted()'])).toBe('Conversion failed! (exit code 1)');
  });

  it('falls back to Aborted() when that is all there is', () => {
    expect(explainExit(-1, ['frame= 10 fps=0', 'Aborted()'])).toBe('Aborted() (exit code -1)');
  });

  it('still reports the exit code when the log says nothing useful', () => {
    expect(explainExit(1, ['frame= 10 fps=0 time=00:00:01.00'])).toBe(
      'the video engine stopped with exit code 1',
    );
    expect(explainExit(1, [])).toBe('the video engine stopped with exit code 1');
  });
});

describe('rememberLine', () => {
  it('keeps only the most recent lines', () => {
    const buf: string[] = [];
    for (let i = 0; i < RECENT_LINES + 10; i++) rememberLine(buf, `line ${i}`);
    expect(buf).toHaveLength(RECENT_LINES);
    expect(buf[buf.length - 1]).toBe(`line ${RECENT_LINES + 9}`);
    expect(buf[0]).toBe('line 10');
  });
});
