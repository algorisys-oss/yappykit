import { describe, it, expect } from 'vitest';
import { slicePages, sliceHeightFor, A4_WIDTH_PT, A4_HEIGHT_PT } from './pdf';

describe('slicePages', () => {
  it('cuts a tall image into whole pages and one short remainder', () => {
    expect(slicePages(1000, 300)).toEqual([
      { y: 0, h: 300 },
      { y: 300, h: 300 },
      { y: 600, h: 300 },
      { y: 900, h: 100 },
    ]);
  });

  it('leaves no empty last page when the height divides exactly', () => {
    expect(slicePages(900, 300)).toEqual([
      { y: 0, h: 300 },
      { y: 300, h: 300 },
      { y: 600, h: 300 },
    ]);
  });

  it('puts a short image on one short page rather than padding it out', () => {
    expect(slicePages(120, 300)).toEqual([{ y: 0, h: 120 }]);
  });
});

describe('sliceHeightFor', () => {
  it('gives each page the paper aspect, so nothing is stretched', () => {
    const h = sliceHeightFor(1170);
    expect(h / 1170).toBeCloseTo(A4_HEIGHT_PT / A4_WIDTH_PT, 3);
  });
});
