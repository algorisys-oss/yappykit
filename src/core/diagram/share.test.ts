import { describe, it, expect } from 'vitest';
import { makeShare, readShare } from './share';

describe('share links', () => {
  it('round-trips a diagram, including non-Latin labels and emoji', async () => {
    const src = 'flowchart LR\n  A["Café 東京 👋🏽"] --> B{"Ready?"}\n  B -->|yes| C\n';
    const hash = await makeShare(src);
    expect(hash).toMatch(/^code=[A-Za-z0-9_-]+$/);
    expect(await readShare('#' + hash)).toBe(src);
  });

  it('compresses a real diagram', async () => {
    const src = Array.from({ length: 40 }, (_, i) => `  node${i} --> node${i + 1}`).join('\n');
    const hash = await makeShare('flowchart TD\n' + src);
    expect(hash.length).toBeLessThan(src.length / 2);
  });

  it('reads nothing from a hash that is not a share link', async () => {
    expect(await readShare('')).toBeNull();
    expect(await readShare('#faq')).toBeNull();
  });

  it('reads nothing from a damaged link rather than throwing', async () => {
    const hash = await makeShare('flowchart TD\n  A --> B');
    expect(await readShare('#' + hash.slice(0, -6))).toBeNull();
    expect(await readShare('#code=!!!')).toBeNull();
  });
});
