import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * The video engine's wasm ships gzipped.
 *
 * Cloudflare Pages rejects any file over 25 MiB and the ffmpeg core is 30.7, so
 * the build compresses it to `.wasmz` and the app expands it with
 * DecompressionStream. That is a real transformation of a binary the video tool
 * cannot run without, and nothing in the unit tests touches it: the failure mode
 * is a corrupt module at the moment a user tries to compress something.
 *
 * Compiling the expanded bytes is the proof. A truncated or double-decompressed
 * stream fails WebAssembly.compile, and doing it in the browser exercises the
 * same DecompressionStream the app uses.
 */
function packedCoreName(): string {
  const assets = readdirSync(new URL('../../dist/assets', import.meta.url));
  const packed = assets.filter((f) => f.endsWith('.wasmz'));
  if (packed.length !== 1) {
    throw new Error(`expected exactly one .wasmz in dist/assets, found ${packed.length}`);
  }
  return packed[0]!;
}

test('the gzipped ffmpeg core expands into a valid wasm module', async ({ page }) => {
  const name = packedCoreName();
  await page.goto('/compress-video-to-size');

  const result = await page.evaluate(async (asset) => {
    const res = await fetch(`/assets/${asset}`);
    if (!res.ok || !res.body) return { error: `fetch failed: ${res.status}` };
    // Exactly what src/core/video/ffmpeg.ts does.
    const bytes = await new Response(
      res.body.pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer();
    try {
      await WebAssembly.compile(bytes);
    } catch (e) {
      return { error: `compile failed: ${(e as Error).message}`, size: bytes.byteLength };
    }
    return { size: bytes.byteLength };
  }, name);

  expect(result.error, 'the expanded core must be a compilable wasm module').toBeUndefined();
  // The whole point is that it expands back to the full-size binary.
  expect(result.size).toBeGreaterThan(25 * 1024 * 1024);
});

test('the raw oversized wasm is not deployed alongside it', async ({ page }) => {
  // Leaving it behind would fail the upload for exactly the reason the
  // compression exists to avoid.
  const assets = readdirSync(new URL('../../dist/assets', import.meta.url));
  expect(assets.filter((f) => f.endsWith('.wasm'))).toEqual([]);

  const res = await page.request.get(`/assets/${packedCoreName().replace(/z$/, '')}`);
  expect(res.status()).toBe(404);
});
