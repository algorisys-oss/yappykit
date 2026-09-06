import { describe, it, expect } from 'vitest';
import { imageName, dpiFor, OUTPUT_KINDS, extensionFor } from './plan';

describe('imageName', () => {
  it('numbers pages and carries the right extension', () => {
    expect(imageName('report.pdf', 1, 'image/jpeg')).toBe('report-p1.jpg');
    expect(imageName('report.pdf', 12, 'image/png')).toBe('report-p12.png');
  });

  it('drops the .pdf rather than stacking extensions', () => {
    expect(imageName('REPORT.PDF', 2, 'image/jpeg')).toBe('REPORT-p2.jpg');
    expect(imageName('no-extension', 1, 'image/png')).toBe('no-extension-p1.png');
  });

  it('leaves the rest of a name with dots alone', () => {
    expect(imageName('scan.v2.final.pdf', 3, 'image/jpeg')).toBe('scan.v2.final-p3.jpg');
  });
});

describe('extensionFor', () => {
  it('uses the extension people expect, not the MIME subtype', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/png')).toBe('png');
  });
});

describe('dpiFor', () => {
  it('maps each outcome to a resolution that suits it', () => {
    // Screen reading, email, and print. The user picks the job, not the number.
    expect(dpiFor('screen')).toBe(150);
    expect(dpiFor('print')).toBe(300);
  });

  it('covers every kind the UI offers, so none can fall through', () => {
    for (const kind of OUTPUT_KINDS) {
      expect(dpiFor(kind), kind).toBeGreaterThan(0);
    }
  });

  it('never exceeds what a browser canvas will survive at A4', () => {
    // A4 is 842pt on the long edge. 300 DPI is ~3508px, inside the 4000px clamp;
    // anything higher would be silently truncated by MAX_RENDER_PX instead.
    const longEdgePx = (842 / 72) * dpiFor('print');
    expect(longEdgePx).toBeLessThan(4000);
  });
});
