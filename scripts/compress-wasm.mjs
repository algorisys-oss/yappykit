#!/usr/bin/env node
/**
 * Gzip the large wasm binaries in dist, and refuse to ship a file the host
 * will reject.
 *
 * Cloudflare Pages caps a single file at 25 MiB. The ffmpeg core is 30.7 MiB,
 * which fails at deploy time rather than build time: the site builds perfectly
 * and then the upload is rejected, so nothing local catches it. This script
 * moves that failure to where it belongs.
 *
 * Compressing rather than hosting the binary elsewhere keeps it same-origin,
 * which the cross-origin-isolated video route wants anyway, and keeps it
 * content-hashed with the build it belongs to. `src/core/video/ffmpeg.ts`
 * expands it with DecompressionStream before handing it to ffmpeg.
 *
 * The `.wasmz` extension is deliberate — see the note in that file.
 */
import { readdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gzipAsync = promisify(gzip);
const DIST = fileURLToPath(new URL('../dist', import.meta.url));

/** Cloudflare Pages' hard per-file ceiling. */
const HOST_FILE_LIMIT = 25 * 1024 * 1024;
/**
 * Only compress what has to be compressed. A small wasm costs a needless
 * decompression on every load, and the loader only knows to expand the core.
 */
const COMPRESS_ABOVE = 20 * 1024 * 1024;

const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const files = await walk(DIST);

for (const file of files) {
  if (!file.endsWith('.wasm')) continue;
  const { size } = await stat(file);
  if (size <= COMPRESS_ABOVE) continue;

  const packed = await gzipAsync(await readFile(file), { level: 9 });
  const target = file.replace(/\.wasm$/, '.wasmz');
  await writeFile(target, packed);
  // The raw file must go, or it counts against the limit despite never being
  // requested.
  await unlink(file);
  console.log(
    `  ${path.relative(DIST, file)}  ${mib(size)} -> ${mib(packed.length)} (${path.basename(target)})`,
  );
}

// Whatever is left has to fit, including files this script does not touch.
const oversize = [];
for (const file of await walk(DIST)) {
  const { size } = await stat(file);
  if (size > HOST_FILE_LIMIT) oversize.push({ file: path.relative(DIST, file), size });
}

if (oversize.length) {
  console.error(`\n  ${oversize.length} file(s) exceed the ${mib(HOST_FILE_LIMIT)} host limit:\n`);
  for (const { file, size } of oversize) console.error(`    ${mib(size).padStart(10)}  ${file}`);
  console.error('\n  Cloudflare Pages will reject this deploy. Compress, split, or');
  console.error('  host these elsewhere before publishing.\n');
  process.exit(1);
}

console.log(`  ✓ every file fits the ${mib(HOST_FILE_LIMIT)} host limit.`);
