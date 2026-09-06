import { describe, it, expect } from 'vitest';
import { OUTPUTS, detectOutputs, outputName, type OutputFormat } from './convert';

describe('outputName', () => {
  it('swaps the extension for the one the new format uses', () => {
    expect(outputName('holiday.HEIC', 'image/jpeg')).toBe('holiday.jpg');
    expect(outputName('logo.jpg', 'image/png')).toBe('logo.png');
    expect(outputName('shot.png', 'image/webp')).toBe('shot.webp');
    expect(outputName('shot.png', 'image/avif')).toBe('shot.avif');
  });

  it('adds one when the name had none', () => {
    expect(outputName('IMG_0042', 'image/jpeg')).toBe('IMG_0042.jpg');
  });

  it('only replaces the last part of a name with several dots', () => {
    expect(outputName('scan.v2.final.heic', 'image/jpeg')).toBe('scan.v2.final.jpg');
  });

  it('leaves a name that is already right alone', () => {
    expect(outputName('a.jpg', 'image/jpeg')).toBe('a.jpg');
  });
});

describe('detectOutputs', () => {
  // canvas.toBlob does not fail on a format it cannot encode: it quietly hands
  // back a PNG. Trusting the call would offer AVIF everywhere and deliver PNGs
  // wearing an .avif name, so the produced type is what gets checked.
  const browser = (supported: string[]) => async (type: OutputFormat) =>
    supported.includes(type) ? type : 'image/png';

  it('keeps only the formats the browser really encoded', async () => {
    const got = await detectOutputs(browser(['image/jpeg', 'image/png', 'image/webp']));
    expect(got).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('drops a format that came back as something else', async () => {
    const got = await detectOutputs(browser(['image/jpeg', 'image/png']));
    expect(got).not.toContain('image/avif');
    expect(got).not.toContain('image/webp');
  });

  it('keeps PNG even though its probe cannot prove anything', async () => {
    // A PNG probe returning PNG is exactly what a total failure looks like.
    const got = await detectOutputs(async () => 'image/png');
    expect(got).toEqual(['image/png']);
  });

  it('survives a probe that throws rather than reporting nothing usable', async () => {
    const got = await detectOutputs(async (type) => {
      if (type === 'image/avif') throw new Error('encoder exploded');
      return type;
    });
    expect(got).toContain('image/jpeg');
    expect(got).not.toContain('image/avif');
  });

  it('returns them in the catalogue order, so the UI is stable', async () => {
    const got = await detectOutputs(browser([...OUTPUTS]));
    expect(got).toEqual([...OUTPUTS]);
  });
});
