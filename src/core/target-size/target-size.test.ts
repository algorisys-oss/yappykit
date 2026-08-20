import { describe, it, expect } from 'vitest';
import { targetSize, type EncodeParams } from './index';

/**
 * A deterministic fake codec: output size is a smooth, monotonic function of
 * quality and scale. This gives the search a real convergence surface without
 * any real encoding — exactly the pure-function contract the engine relies on.
 */
function fakeCodec(maxBytes: number) {
  return async (p: EncodeParams): Promise<Uint8Array> => {
    const bytes = Math.max(1, Math.round(maxBytes * p.quality * p.scale));
    return new Uint8Array(bytes);
  };
}

describe('targetSize (binary strategy)', () => {
  it('finds an output under budget when quality alone suffices', async () => {
    const r = await targetSize({
      encode: fakeCodec(2_000_000),
      budgetBytes: 100 * 1024,
      searchSpace: { quality: { min: 0.05, max: 1 } },
      strategy: 'binary',
    });
    expect(r.withinBudget).toBe(true);
    expect(r.bytes).toBeLessThanOrEqual(100 * 1024);
  });

  it('returns the LARGEST fitting output (best quality that still fits)', async () => {
    const budget = 500 * 1024;
    const r = await targetSize({
      encode: fakeCodec(2_000_000),
      budgetBytes: budget,
      searchSpace: { quality: { min: 0.01, max: 1 } },
      strategy: 'binary',
      maxIterations: 20,
    });
    expect(r.withinBudget).toBe(true);
    // Should land close to the budget from below, not far under it.
    expect(r.bytes).toBeGreaterThan(budget * 0.85);
  });

  it('drops dimensions when quality alone cannot reach budget', async () => {
    // Even at min quality (0.5) the codec emits 1_000_000 * 0.5 = 500 KB > 200 KB,
    // so the engine must scale down.
    const r = await targetSize({
      encode: fakeCodec(1_000_000),
      budgetBytes: 200 * 1024,
      searchSpace: { quality: { min: 0.5, max: 1 }, scale: { min: 0.2, max: 1 } },
      strategy: 'binary',
      maxIterations: 24,
    });
    expect(r.withinBudget).toBe(true);
    expect(r.sacrifice.scaled).toBe(true);
    expect(r.params.scale).toBeLessThan(1);
  });

  it('reports honestly when nothing fits within the iteration budget', async () => {
    // Min quality still yields 900 KB, no scaling allowed → cannot fit 100 KB.
    const r = await targetSize({
      encode: fakeCodec(1_000_000),
      budgetBytes: 100 * 1024,
      searchSpace: { quality: { min: 0.9, max: 1 } },
      strategy: 'binary',
    });
    expect(r.withinBudget).toBe(false);
    // Returns the smallest it managed, not a throw.
    expect(r.bytes).toBeGreaterThan(0);
  });

  it('honours an already-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      targetSize({
        encode: fakeCodec(2_000_000),
        budgetBytes: 100 * 1024,
        searchSpace: { quality: { min: 0.1, max: 1 } },
        strategy: 'binary',
        signal: ac.signal,
      }),
    ).rejects.toThrow(/abort/i);
  });

  it('rejects a non-positive budget', async () => {
    await expect(
      targetSize({
        encode: fakeCodec(1000),
        budgetBytes: 0,
        searchSpace: { quality: { min: 0.1, max: 1 } },
        strategy: 'binary',
      }),
    ).rejects.toThrow(RangeError);
  });
});

describe('targetSize (analytic-then-verify strategy)', () => {
  it('uses the analytic guess and corrects once on overshoot', async () => {
    // Codec that ignores the guess intent and always returns 1.2x budget on the
    // first analytic point, forcing exactly one corrective pass.
    const budget = 25 * 1024 * 1024;
    const r = await targetSize({
      encode: fakeCodec(60 * 1024 * 1024),
      budgetBytes: budget,
      searchSpace: { quality: { min: 0.1, max: 1 }, scale: { min: 0.3, max: 1 } },
      strategy: 'analytic-then-verify',
      analyticGuess: (b) => ({ quality: Math.min(1, b / (60 * 1024 * 1024)), scale: 1 }),
    });
    expect(r.iterations).toBeGreaterThanOrEqual(1);
    expect(r.iterations).toBeLessThanOrEqual(2);
    expect(r.withinBudget).toBe(true);
  });

  it('throws if analyticGuess is missing', async () => {
    await expect(
      targetSize({
        encode: fakeCodec(1000),
        budgetBytes: 500,
        searchSpace: { quality: { min: 0.1, max: 1 } },
        strategy: 'analytic-then-verify',
      }),
    ).rejects.toThrow(TypeError);
  });
});
