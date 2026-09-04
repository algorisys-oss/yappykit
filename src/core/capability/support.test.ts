import { describe, it, expect } from 'vitest';
import { supportFor, BROWSERS, BASELINE, minimumFor, type BrowserId } from './support';
import type { CapabilitySpec } from './index';

const of = (id: BrowserId, spec: CapabilitySpec) => supportFor(spec).find((b) => b.id === id)!;

describe('supportFor', () => {
  it('falls back to the build target when a tool needs nothing special', () => {
    for (const b of supportFor({ required: [] })) {
      expect(b.minVersion, b.id).toBe(BASELINE[b.id]);
      expect(b.fastVersion, b.id).toBe(BASELINE[b.id]);
    }
  });

  it('raises the floor to the last capability to arrive', () => {
    // DecompressionStream reached Firefox long after WebAssembly did, so the
    // video tool's Firefox floor is the later of the two.
    const ff = of('firefox', { required: ['wasm', 'decompressionStream'] });
    expect(ff.minVersion).toBe(113);
    expect(of('chrome', { required: ['wasm', 'decompressionStream'] }).minVersion).toBe(94);
  });

  it('never reports a floor below the build target', () => {
    // WebAssembly predates ES2022 everywhere, but the bundle still will not run.
    for (const b of supportFor({ required: ['wasm'] })) {
      expect(b.minVersion, b.id).toBeGreaterThanOrEqual(BASELINE[b.id]);
    }
  });

  it('marks a browser unsupported when a requirement never shipped there', () => {
    const spec: CapabilitySpec = { required: ['localFonts'] };
    expect(of('firefox', spec).minVersion).toBeNull();
    expect(of('safari', spec).minVersion).toBeNull();
    expect(of('chrome', spec).minVersion).not.toBeNull();
  });

  it('a merely preferred capability degrades rather than excludes', () => {
    // The font tools read your installed fonts where they can and ask for a
    // file where they cannot. That is a slower path, not a closed door.
    const spec: CapabilitySpec = { required: [], preferred: ['localFonts'] };
    const ff = of('firefox', spec);
    expect(ff.minVersion).toBe(BASELINE.firefox);
    expect(ff.fastVersion, 'never gets the fast path').toBeNull();
    // Even Chromium only reads local fonts from 103, which is above the floor.
    expect(of('chrome', spec).fastVersion).toBe(103);
  });

  it('does not call a browser degraded for a capability it has always had', () => {
    const chrome = of('chrome', { required: [], preferred: ['wasm'] });
    expect(chrome.fastVersion).toBe(chrome.minVersion);
  });

  it('separates the version that runs from the version that runs fast', () => {
    // The compressor works from the ES2022 floor but only gets an offscreen
    // canvas at Firefox 105, so 93 to 104 runs and runs slowly. Saying only
    // "93 and later" advertises a fast path those versions do not have.
    const spec: CapabilitySpec = { required: [], preferred: ['offscreenCanvas'] };
    const ff = of('firefox', spec);
    expect(ff.minVersion).toBe(93);
    expect(ff.fastVersion).toBe(105);
  });

  it('never puts the fast path below the version that can run at all', () => {
    // OffscreenCanvas reached Safari in the same release as the ES2022 floor.
    const safari = of('safari', { required: [], preferred: ['offscreenCanvas'] });
    expect(safari.fastVersion).toBe(safari.minVersion);
  });

  it('raises the fast path above a required capability, not just the baseline', () => {
    // The video tool already needs Firefox 113; WebCodecs only arrives at 130.
    const ff = of('firefox', {
      required: ['wasm', 'decompressionStream'],
      preferred: ['webCodecs'],
    });
    expect(ff.minVersion).toBe(113);
    expect(ff.fastVersion).toBe(130);
  });

  it('has no fast path at all where the tool cannot run', () => {
    expect(of('safari', { required: ['localFonts'] }).fastVersion).toBeNull();
  });

  it('reports every browser in a stable order', () => {
    expect(supportFor({ required: [] }).map((b) => b.id)).toEqual(BROWSERS.map((b) => b.id));
  });
});

describe('minimumFor', () => {
  it('is the baseline when a tool asks for nothing beyond it', () => {
    expect(minimumFor({ required: [] })).toEqual(BASELINE);
  });
});

describe('the support table', () => {
  it('covers every browser it claims to list', () => {
    for (const b of BROWSERS) {
      expect(BASELINE[b.id], `${b.id} has no baseline`).toBeGreaterThan(0);
    }
  });

  it('names browsers, not engines, because that is what people recognise', () => {
    expect(BROWSERS.map((b) => b.label)).toEqual(['Chrome', 'Firefox', 'Safari', 'Edge']);
  });
});
