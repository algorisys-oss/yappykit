import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

/**
 * Stitching, in a real browser.
 *
 * The unit tests prove the seam search on row signatures. What only a browser
 * can prove is that the plan becomes the right pixels: that the canvas is the
 * height the plan asked for, that the fixed bars survive once, and that the
 * file the visitor downloads is the one they were shown. So the download is
 * decoded and measured here rather than trusted.
 */

const WIDTH = 240;
const STATUS = 20; // rows of never-scrolling interface at the top
const NAV = 12; //    and at the bottom
const SHOT_BODY = 200;
const SCROLL = 120; // rows the page moves between screenshots
const SHOTS = 3;
const PAGE_ROWS = SCROLL * (SHOTS - 1) + SHOT_BODY;
const EXPECTED_HEIGHT = STATUS + PAGE_ROWS + NAV;

/** Deterministic pixels: fixtures that vary per run cannot pin a threshold. */
function noise(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s >>> 24;
  };
}

/** `rows` rows of textured RGBA, distinct per row and per seed. */
function band(rows: number, seed: number): Buffer {
  const next = noise(seed);
  const out = Buffer.alloc(WIDTH * rows * 4);
  for (let i = 0; i < WIDTH * rows; i++) {
    out[i * 4] = next();
    out[i * 4 + 1] = next();
    out[i * 4 + 2] = next();
    out[i * 4 + 3] = 255;
  }
  return out;
}

const CRC = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return (buf: Buffer) => {
    let c = -1;
    for (const byte of buf) c = table[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

/** A minimal PNG encoder, so the fixtures need no image library. */
function png(height: number, rgba: Buffer): Buffer {
  const stride = WIDTH * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The capture: one tall page, photographed in overlapping pieces. */
function screenshots(): { name: string; mimeType: string; buffer: Buffer }[] {
  const status = band(STATUS, 101);
  const nav = band(NAV, 202);
  const page = band(PAGE_ROWS, 303);
  return Array.from({ length: SHOTS }, (_, i) => {
    const from = i * SCROLL * WIDTH * 4;
    const body = page.subarray(from, from + SHOT_BODY * WIDTH * 4);
    const height = STATUS + SHOT_BODY + NAV;
    return {
      name: `Screenshot_${i + 1}.png`,
      mimeType: 'image/png',
      buffer: png(height, Buffer.concat([status, body, nav])),
    };
  });
}

/** A pixel of a fixture, read from the RGBA we encoded rather than the PNG. */
function pixelOf(_png: Buffer, x: number, y: number): number[] {
  const status = band(STATUS, 101);
  const nav = band(NAV, 202);
  const page = band(PAGE_ROWS, 303);
  const shotIndex = y >= STATUS + SHOT_BODY ? SHOTS - 1 : 0;
  let source: Buffer;
  let row: number;
  if (y < STATUS) {
    source = status;
    row = y;
  } else if (y < STATUS + SHOT_BODY) {
    source = page;
    row = shotIndex * SCROLL + (y - STATUS);
  } else {
    source = nav;
    row = y - STATUS - SHOT_BODY;
  }
  const p = (row * WIDTH + x) * 4;
  return [source[p]!, source[p + 1]!, source[p + 2]!];
}

/**
 * The size of the downloaded image, and the two corner pixels.
 *
 * The corners are the cheapest proof that the fixed bars really are the source
 * pixels: the top corner must be the first screenshot's status bar and the
 * bottom corner the last screenshot's nav bar. It is also what would catch the
 * canvas probe leaving its sentinel pixel behind in the far corner.
 */
async function downloaded(page: import('@playwright/test').Page, path: string) {
  const bytes = (await readFile(path)).toString('base64');
  return page.evaluate(async (b64) => {
    const binary = atob(b64);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
    const bitmap = await createImageBitmap(new Blob([buf], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const at = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    return {
      w: bitmap.width,
      h: bitmap.height,
      topLeft: at(0, 0),
      bottomRight: at(bitmap.width - 1, bitmap.height - 1),
    };
  }, bytes);
}

async function stitch(page: import('@playwright/test').Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (async () => {
      await page.getByRole('button', { name: /^stitch screenshots$/i }).click();
      await expect(page.getByRole('status')).toContainText(/done/i, { timeout: 30_000 });
      await page.getByRole('link', { name: /download/i }).click();
    })(),
  ]);
  return download;
}

test('joins the screenshots into one image, keeping the fixed bars once', async ({ page }) => {
  await page.goto('/stitch-screenshots');
  await expect(
    page.getByRole('heading', { name: /stitch screenshots into one long image/i, level: 1 }),
  ).toBeVisible();

  await page.setInputFiles('input[type="file"]', screenshots());
  await expect(page.getByText('Screenshot_1.png')).toBeVisible();
  await expect(page.getByText('3 screenshots.')).toBeVisible();

  const download = await stitch(page);

  // The overlap is SHOT_BODY - SCROLL rows, found without being told.
  await expect(page.getByRole('status')).toContainText(`${WIDTH} x ${EXPECTED_HEIGHT}`);
  await expect(page.getByText('2 of 2 joins matched cleanly.')).toBeVisible();
  await expect(page.getByText(`A fixed bar of ${STATUS + NAV} pixels never scrolled`)).toBeVisible();

  const out = await downloaded(page, (await download.path())!);
  expect({ w: out.w, h: out.h }).toEqual({ w: WIDTH, h: EXPECTED_HEIGHT });

  // The corners must be the source bars, not a redrawn or leftover pixel.
  const first = screenshots()[0]!.buffer;
  const last = screenshots()[SHOTS - 1]!.buffer;
  expect(out.topLeft).toEqual(pixelOf(first, 0, 0));
  expect(out.bottomRight).toEqual(pixelOf(last, WIDTH - 1, STATUS + SHOT_BODY + NAV - 1));
});

test('builds a PDF page by page from the same capture', async ({ page }) => {
  await page.goto('/stitch-screenshots');
  await page.setInputFiles('input[type="file"]', screenshots());
  await page.getByRole('radio', { name: /a pdf, page by page/i }).click();

  const download = await stitch(page);

  const doc = await PDFDocument.load(await readFile((await download.path())!));
  // A4 width is 595.28pt, so 240px of capture becomes 339px of page height.
  expect(doc.getPageCount()).toBe(Math.ceil(EXPECTED_HEIGHT / 339));
  expect(Math.round(doc.getPage(0).getWidth())).toBe(595);
});

test('skips a file that is not an image and keeps the rest', async ({ page }) => {
  await page.goto('/stitch-screenshots');
  await page.setInputFiles('input[type="file"]', [
    ...screenshots(),
    { name: 'notes.txt', mimeType: 'image/png', buffer: Buffer.from('not an image at all') },
  ]);

  await expect(page.getByText(/notes\.txt could not be read/i)).toBeVisible();
  await expect(page.getByText('3 screenshots.')).toBeVisible();
});

test('will not stitch a single screenshot', async ({ page }) => {
  await page.goto('/stitch-screenshots');
  await page.setInputFiles('input[type="file"]', screenshots().slice(0, 1));
  await expect(page.getByRole('button', { name: /^stitch screenshots$/i })).toBeDisabled();
});
