import { describe, it, expect } from 'vitest';
import { readGifInfo, MIN_RENDERED_DELAY_CS } from './gif';

/** Assemble a GIF byte for byte, so each test states exactly what it feeds in. */
function buildGif(opts: {
  width?: number;
  height?: number;
  /** One entry per frame, in hundredths of a second. */
  delaysCs?: number[];
  globalColorTable?: boolean;
  version?: string;
  trailer?: boolean;
}): Uint8Array {
  const {
    width = 2,
    height = 3,
    delaysCs = [10],
    globalColorTable = false,
    version = 'GIF89a',
    trailer = true,
  } = opts;
  const bytes: number[] = [];
  const u16 = (n: number) => bytes.push(n & 0xff, (n >> 8) & 0xff);

  for (const c of version) bytes.push(c.charCodeAt(0));
  u16(width);
  u16(height);
  // Packed field: a global colour table of 2 entries when asked for one.
  bytes.push(globalColorTable ? 0x80 : 0x00, 0, 0);
  if (globalColorTable) bytes.push(0, 0, 0, 255, 255, 255);

  for (const delay of delaysCs) {
    bytes.push(0x21, 0xf9, 0x04, 0x00);
    u16(delay);
    bytes.push(0x00, 0x00);
    bytes.push(0x2c);
    u16(0);
    u16(0);
    u16(width);
    u16(height);
    bytes.push(0x00); // no local colour table
    bytes.push(0x02); // LZW minimum code size
    bytes.push(0x02, 0x4c, 0x01); // one sub-block of image data
    bytes.push(0x00); // sub-block terminator
  }
  if (trailer) bytes.push(0x3b);
  return new Uint8Array(bytes);
}

describe('readGifInfo', () => {
  it('reads dimensions from the logical screen descriptor', () => {
    const info = readGifInfo(buildGif({ width: 320, height: 241 }));
    expect(info).not.toBeNull();
    expect(info!.width).toBe(320);
    expect(info!.height).toBe(241);
  });

  it('counts frames and sums their delays', () => {
    const info = readGifInfo(buildGif({ delaysCs: [10, 20, 5] }));
    expect(info!.frameCount).toBe(3);
    // 0.10 + 0.20 + 0.05
    expect(info!.durationSec).toBeCloseTo(0.35, 5);
    expect(info!.delaysSec).toHaveLength(3);
  });

  it('steps over a global colour table to find the frames', () => {
    // Miscounting the table's size reads image data as block headers, which is
    // the classic way a GIF parser reports one frame for a long animation.
    const info = readGifInfo(buildGif({ delaysCs: [10, 10], globalColorTable: true }));
    expect(info!.frameCount).toBe(2);
    expect(info!.width).toBe(2);
  });

  it('clamps the delays browsers refuse to honour', () => {
    // A 0 or 1 centisecond delay is rendered as 100 ms by every major browser,
    // so a 100-frame "0 delay" GIF really runs for 10 s, not for nothing.
    const info = readGifInfo(buildGif({ delaysCs: [0, 1] }));
    expect(info!.durationSec).toBeCloseTo((MIN_RENDERED_DELAY_CS * 2) / 100, 5);
    expect(info!.delaysSec.every((d) => d > 0)).toBe(true);
  });

  it('accepts the older GIF87a signature', () => {
    expect(readGifInfo(buildGif({ version: 'GIF87a' }))).not.toBeNull();
  });

  it('reads a file whose trailer byte is missing', () => {
    // Truncated GIFs are common in the wild and still perfectly displayable.
    expect(readGifInfo(buildGif({ delaysCs: [10, 10], trailer: false }))!.frameCount).toBe(2);
  });

  it('returns null for something that is not a GIF', () => {
    expect(readGifInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(readGifInfo(new Uint8Array([]))).toBeNull();
    expect(readGifInfo(new Uint8Array([0x47, 0x49, 0x46]))).toBeNull();
  });

  it('returns null for a GIF carrying no frames', () => {
    expect(readGifInfo(buildGif({ delaysCs: [] }))).toBeNull();
  });
});
