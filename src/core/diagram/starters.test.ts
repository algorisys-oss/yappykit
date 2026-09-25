// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import mermaid from 'mermaid';
import { STARTERS, STARTER_IDS } from './starters';

beforeAll(() => {
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
});

describe('starters', () => {
  it('has one for every id', () => {
    expect(Object.keys(STARTERS).sort()).toEqual([...STARTER_IDS].sort());
  });

  it.each(STARTER_IDS)('%s parses', async (id) => {
    await expect(mermaid.parse(STARTERS[id])).resolves.toBeTruthy();
  });
});
