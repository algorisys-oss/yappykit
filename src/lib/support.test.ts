import { describe, it, expect } from 'vitest';
import { __testing } from './support';

const { isSafeSupportUrl } = __testing;

describe('isSafeSupportUrl', () => {
  it('accepts the payment hosts Razorpay actually serves pages on', () => {
    for (const url of [
      'https://razorpay.me/@algorisys',
      'https://pages.razorpay.com/yappykit',
      'https://rzp.io/l/abcd',
      'https://checkout.razorpay.com/anything',
    ]) {
      expect(isSafeSupportUrl(url), url).toBe(true);
    }
  });

  it('refuses a host that merely ends in something similar', () => {
    // notrazorpay.com must not pass a naive "endsWith" check.
    expect(isSafeSupportUrl('https://notrazorpay.com/pay')).toBe(false);
    expect(isSafeSupportUrl('https://razorpay.me.evil.example/pay')).toBe(false);
  });

  it('refuses anything that is not https, including a script URL', () => {
    expect(isSafeSupportUrl('http://razorpay.me/@algorisys')).toBe(false);
    expect(isSafeSupportUrl('javascript:alert(1)')).toBe(false);
  });

  it('refuses an unset or malformed value rather than rendering a dead link', () => {
    expect(isSafeSupportUrl('')).toBe(false);
    expect(isSafeSupportUrl('not a url')).toBe(false);
    expect(isSafeSupportUrl('razorpay.me/@algorisys')).toBe(false);
  });

  it('is case-insensitive about the host, as DNS is', () => {
    expect(isSafeSupportUrl('https://RaZoRpAy.Me/@algorisys')).toBe(true);
  });
});
