import { describe, it, expect } from 'vitest';
import { fileBase, MAX_AREA, MAX_SIDE, pngSize, svgSize } from './export';

describe('pngSize', () => {
  it('doubles for a document', () => {
    expect(pngSize(400, 300, 'document')).toEqual({ width: 800, height: 600 });
  });

  it('fills a 4K slide, limited by whichever side hits first', () => {
    expect(pngSize(800, 200, 'slides')).toEqual({ width: 3840, height: 960 });
    expect(pngSize(200, 800, 'slides')).toEqual({ width: 540, height: 2160 });
  });

  it('turns A4 to suit the diagram when printing', () => {
    expect(pngSize(300, 600, 'print')).toEqual({ width: 1754, height: 3508 });
    expect(pngSize(600, 300, 'print')).toEqual({ width: 3508, height: 1754 });
  });

  it('never asks for a canvas Safari will refuse', () => {
    for (const use of ['document', 'slides', 'print'] as const) {
      const huge = pngSize(6000, 5000, use);
      expect(huge.width * huge.height).toBeLessThanOrEqual(MAX_AREA);
      const long = pngSize(20000, 100, use);
      expect(long.width).toBeLessThanOrEqual(MAX_SIDE);
    }
  });

  it('survives a zero-size diagram', () => {
    expect(pngSize(0, 0, 'slides')).toEqual({ width: 1, height: 1 });
  });
});

describe('svgSize', () => {
  it('reads Mermaid’s viewBox', () => {
    const svg = '<svg id="m" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 188.5px;" viewBox="-8 -8 188.5 174" role="graphics-document">';
    expect(svgSize(svg)).toEqual({ width: 188.5, height: 174 });
  });

  it('is null without one', () => {
    expect(svgSize('<svg width="10"></svg>')).toBeNull();
  });
});

describe('fileBase', () => {
  it('prefers the opened file’s name', () => {
    expect(fileBase('pie title Pets', 'architecture.mmd')).toBe('architecture');
  });

  it('uses a front-matter title', () => {
    expect(fileBase('---\nconfig:\n  theme: dark\ntitle: "Order flow: v2"\n---\nflowchart TD')).toBe('order-flow-v2');
  });

  it('uses a diagram title line', () => {
    expect(fileBase('pie title Pets adopted\n  "Dogs" : 3')).toBe('pets-adopted');
    expect(fileBase('gantt\n  title Café launch\n  section A')).toBe('cafe-launch');
  });

  it('falls back to "diagram"', () => {
    expect(fileBase('flowchart TD\n  A --> B')).toBe('diagram');
    expect(fileBase('pie title ???')).toBe('diagram');
  });
});
