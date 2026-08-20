import { describe, it, expect } from 'vitest';
import {
  analyseChatter, analysePolling, rolloverClass, CHATTER_MS, SUSPECT_MS, STANDARD_RATES,
} from './diagnostics';

describe('chatter analysis', () => {
  it('reports untested when no presses have happened', () => {
    const r = analyseChatter([]);
    expect(r.health).toBe('untested');
    expect(r.shortestGapMs).toBeNull();
  });

  it('passes a button clicked at human speeds', () => {
    expect(analyseChatter([180, 240, 400]).health).toBe('ok');
  });

  it('fails a button that bounces — the whole point of the tool', () => {
    const r = analyseChatter([200, 6, 350]);
    expect(r.health).toBe('faulty');
    expect(r.chatterEvents).toBe(1);
    expect(r.shortestGapMs).toBe(6);
  });

  it('flags the ambiguous band as suspect rather than condemning the mouse', () => {
    const r = analyseChatter([200, 40]);
    expect(r.health).toBe('suspect');
    expect(r.suspectEvents).toBe(1);
    expect(r.chatterEvents).toBe(0);
  });

  it('treats the thresholds as exclusive lower bounds', () => {
    expect(analyseChatter([CHATTER_MS]).health).toBe('suspect');
    expect(analyseChatter([CHATTER_MS - 1]).health).toBe('faulty');
    expect(analyseChatter([SUSPECT_MS]).health).toBe('ok');
  });

  it('lets a real fault outrank merely-suspect gaps', () => {
    expect(analyseChatter([40, 5]).health).toBe('faulty');
  });

  it('ignores nonsense gaps instead of crashing', () => {
    expect(analyseChatter([NaN, -5, 200]).health).toBe('ok');
  });
});

describe('polling rate', () => {
  const evenly = (hz: number, n: number) =>
    Array.from({ length: n }, (_, i) => (i * 1000) / hz);

  it('withholds a verdict until it has enough samples', () => {
    const r = analysePolling(evenly(500, 5));
    expect(r.hz).toBeNull();
    expect(r.nearest).toBeNull();
  });

  it('recovers each standard rate from clean timings', () => {
    for (const rate of STANDARD_RATES) {
      const r = analysePolling(evenly(rate, 60));
      expect(r.hz, `${rate} Hz`).toBeCloseTo(rate, 6);
      expect(r.nearest).toBe(rate);
    }
  });

  it('is unmoved by a single huge stall, which a mean would not survive', () => {
    const ts = evenly(1000, 60);
    // A 250 ms GC pause in the middle.
    for (let i = 30; i < ts.length; i++) ts[i]! += 250;
    const r = analysePolling(ts);
    expect(r.nearest).toBe(1000);
    expect(r.hz!).toBeGreaterThan(900);
  });

  it('reports the raw figure rather than snapping to a rate it is not near', () => {
    const r = analysePolling(evenly(70, 60));
    expect(r.hz).toBeCloseTo(70, 3);
    expect(r.nearest).toBeNull();
  });

  it('ignores duplicate timestamps', () => {
    const ts = [...evenly(500, 60), ...evenly(500, 60)];
    expect(analysePolling(ts).nearest).toBe(500);
  });
});

describe('rollover class', () => {
  it('names the common cases the way keyboard specs do', () => {
    expect(rolloverClass(6)).toBe('6KRO');
    expect(rolloverClass(2)).toBe('2KRO');
    expect(rolloverClass(10)).toBe('NKRO');
    expect(rolloverClass(14)).toBe('NKRO');
    expect(rolloverClass(0)).toBe('-');
  });
});
