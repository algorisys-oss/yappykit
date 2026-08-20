import { describe, it, expect } from 'vitest';
import { evaluate, type CapabilitySnapshot, type CapabilitySpec } from './index';

const ALL_OFF: CapabilitySnapshot = {
  webWorkers: false,
  offscreenCanvas: false,
  createImageBitmap: false,
  webCodecs: false,
  sharedArrayBuffer: false,
  crossOriginIsolated: false,
  opfs: false,
  webgpu: false,
  wasm: false,
  decompressionStream: false,
};

const snapshot = (over: Partial<CapabilitySnapshot>): CapabilitySnapshot => ({
  ...ALL_OFF,
  ...over,
});

describe('capability.evaluate', () => {
  const spec: CapabilitySpec = {
    required: ['wasm', 'webWorkers'],
    preferred: ['createImageBitmap', 'offscreenCanvas'],
  };

  it('is unsupported when a required capability is missing', () => {
    const v = evaluate(spec, snapshot({ wasm: true }));
    expect(v.supported).toBe(false);
    expect(v.missingRequired).toContain('webWorkers');
  });

  it('is supported but degraded when required present, preferred missing', () => {
    const v = evaluate(spec, snapshot({ wasm: true, webWorkers: true }));
    expect(v.supported).toBe(true);
    expect(v.fastPath).toBe(false);
    expect(v.missingPreferred).toEqual(['createImageBitmap', 'offscreenCanvas']);
  });

  it('is fast-path when everything is present', () => {
    const v = evaluate(
      spec,
      snapshot({ wasm: true, webWorkers: true, createImageBitmap: true, offscreenCanvas: true }),
    );
    expect(v.supported).toBe(true);
    expect(v.fastPath).toBe(true);
    expect(v.missingRequired).toHaveLength(0);
    expect(v.missingPreferred).toHaveLength(0);
  });

  it('treats an empty preferred list as always fast-path when supported', () => {
    const v = evaluate({ required: ['wasm'] }, snapshot({ wasm: true }));
    expect(v.fastPath).toBe(true);
  });
});
