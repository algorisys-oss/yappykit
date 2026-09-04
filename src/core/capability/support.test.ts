import { describe, it, expect } from 'vitest';
import { supportFor, BROWSERS, BASELINE, minimumFor, type BrowserId } from './support';
import type { CapabilitySpec } from './index';

const of = (id: BrowserId, spec: CapabilitySpec) => supportFor(spec).find((b) => b.id === id)!;

describe('supportFor', () => {
  it('falls back to the build target when a tool needs nothing special', () => {
    for (const b of supportFor({ required: [] })) {
      expect(b.minVersion, b.id).toBe(BASELINE[b.id]);
      expect(b.degraded, b.id).toBe(false);
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
    expect(ff.degraded).toBe(true);
    expect(of('chrome', spec).degraded).toBe(false);
  });

  it('does not call a browser degraded for a capability it has always had', () => {
    expect(of('chrome', { required: [], preferred: ['wasm'] }).degraded).toBe(false);
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
