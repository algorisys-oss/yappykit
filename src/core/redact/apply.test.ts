import { describe, it, expect } from 'vitest';
import { redactedName } from './apply';

describe('redactedName', () => {
  it('marks the copy, so it cannot be confused with the original', () => {
    expect(redactedName('statement.pdf')).toBe('statement-redacted.pdf');
    expect(redactedName('passport.jpg')).toBe('passport-redacted.jpg');
  });

  it('keeps the rest of a name with dots intact', () => {
    expect(redactedName('scan.v2.final.pdf')).toBe('scan.v2.final-redacted.pdf');
  });

  it('copes with a name that has no extension', () => {
    expect(redactedName('scan')).toBe('scan-redacted');
  });
});
