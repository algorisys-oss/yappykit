import { describe, it, expect } from 'vitest';
import {
  analyticsAllowed,
  countryFromTrace,
  CONSENT_REQUIRED,
  MEASUREMENT_ID,
} from './analytics';

describe('analyticsAllowed', () => {
  it('refuses every country where consent is required first', () => {
    for (const country of CONSENT_REQUIRED) {
      expect(analyticsAllowed(country), `${country} must not be measured`).toBe(false);
    }
  });

  it('covers the whole EEA plus the UK, and not Switzerland', () => {
    // 27 EU + Iceland, Liechtenstein, Norway + UK.
    expect(CONSENT_REQUIRED).toHaveLength(31);
    expect(CONSENT_REQUIRED).toContain('GB');
    expect(CONSENT_REQUIRED).toContain('NO');
    expect(CONSENT_REQUIRED).not.toContain('CH');
  });

  it('allows countries outside it', () => {
    for (const country of ['IN', 'US', 'BR', 'JP', 'AU', 'ID', 'CH']) {
      expect(analyticsAllowed(country), `${country} should be measured`).toBe(true);
    }
  });

  it('treats an unknown country as consent required', () => {
    // Failing open would measure exactly the people we cannot verify.
    expect(analyticsAllowed(null)).toBe(false);
    expect(analyticsAllowed(undefined)).toBe(false);
    expect(analyticsAllowed('')).toBe(false);
  });

  it('is not fooled by case or stray whitespace', () => {
    expect(analyticsAllowed('de')).toBe(false);
    expect(analyticsAllowed(' FR ')).toBe(false);
    expect(analyticsAllowed('in')).toBe(true);
  });

  it('does not match a country code that merely appears inside another string', () => {
    // A substring check over a joined list would let 'IN' collide with 'FI FR'.
    expect(analyticsAllowed('IN')).toBe(true);
  });
});

describe('countryFromTrace', () => {
  const body = [
    'fl=950f3',
    'h=yappykit.com',
    'ip=2401:4900::1',
    'visit_scheme=https',
    'colo=MRS',
    'loc=IN',
    'tls=TLSv1.3',
  ].join('\n');

  it('reads the country out of a real trace body', () => {
    expect(countryFromTrace(body)).toBe('IN');
  });

  it('reads a European country the same way', () => {
    expect(countryFromTrace(body.replace('loc=IN', 'loc=DE'))).toBe('DE');
  });

  it('returns null when the field is absent, so the caller measures nothing', () => {
    expect(countryFromTrace(body.replace('loc=IN\n', ''))).toBeNull();
    expect(countryFromTrace('')).toBeNull();
  });

  it('does not confuse a different field that ends in loc', () => {
    expect(countryFromTrace('sloc=DE\nloc=IN')).toBe('IN');
  });
});

describe('the measurement id', () => {
  it('is the property this site reports to', () => {
    expect(MEASUREMENT_ID).toBe('G-1FZ1NE7L5Y');
  });
});
