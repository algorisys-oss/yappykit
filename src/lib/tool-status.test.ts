import { describe, it, expect } from 'vitest';
import { BETA_TOOLS, isBeta } from './tool-status';
import { TOOL_KEYS, toolsInCategory } from '../i18n/routes';

describe('beta tools', () => {
  it('marks every video tool and the OCR scanner as beta', () => {
    for (const key of toolsInCategory('video')) expect(isBeta(key), key).toBe(true);
    expect(isBeta('document-scan')).toBe(true);
  });

  it('leaves the rest of the catalogue alone', () => {
    expect(isBeta('image-compress')).toBe(false);
    expect(isBeta('pdf-merge')).toBe(false);
  });

  it('names only tools that exist, once each', () => {
    expect(new Set(BETA_TOOLS).size).toBe(BETA_TOOLS.length);
    for (const key of BETA_TOOLS) expect(TOOL_KEYS).toContain(key);
  });
});
