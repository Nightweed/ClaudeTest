import { computeMomentum } from './momentum';
import { buildExplanation } from './explain';

const makeCandles = (n) =>
  Array.from({ length: n }, (_, i) => {
    const c = 100 + i * 0.1;
    return { t: 1000 + i * 300, o: c - 0.05, h: c + 0.1, l: c - 0.1, c, v: 100, bv: 60 + (i % 5), tx: 10, btx: 6 };
  });

describe('explain: delta z-score sor', () => {
  test('a nyers és a vágott z külön látszik', () => {
    const ohlcv = makeCandles(60);
    ohlcv[59].bv = ohlcv[59].v; // szélsőséges vételi gyertya
    const { snapshots } = computeMomentum({ perps: [{ symbol: 'A', ohlcv }] });
    const snap = snapshots[59];
    const row = buildExplanation(snap, ohlcv[59], null).find((r) => r.name === 'Delta z-score');
    expect(snap.components.deltaPctZRaw).toBeGreaterThan(3);
    expect(row.values).toMatch(/^nyers /);
    expect(row.result).toBe('3');
  });
});
