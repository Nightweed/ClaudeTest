import { GLOSSARY, NAME_TO_ID } from './glossary';
import { buildExplanation } from './explain';
import { computeMomentum } from './momentum';

describe('glossary', () => {
  test('minden bejegyzés nem üres szöveg', () => {
    Object.entries(GLOSSARY).forEach(([k, v]) => {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(20);
      expect(k).not.toBe('');
    });
  });

  test('a NAME_TO_ID minden célja létezik a szótárban', () => {
    Object.values(NAME_TO_ID).forEach((id) => expect(GLOSSARY[id]).toBeDefined());
  });

  test('a számítás nézet minden sorához van magyarázat', () => {
    const ohlcv = Array.from({ length: 80 }, (_, i) => ({
      t: 1000 * 3600 + i * 3600,
      o: 100 + i * 0.1,
      h: 102 + i * 0.1,
      l: 99 + i * 0.1,
      c: 100.5 + i * 0.1 + (i % 3),
      v: 1000 + (i % 7) * 40,
      bv: 480 + (i % 5) * 30,
      tx: 100,
      btx: 50,
    }));
    const oi = ohlcv.map((c, i) => ({ t: c.t, o: 1e6 + i * 1e3, c: 1e6 + (i + 1) * 1e3 + (i % 4) * 500 }));
    const funding = ohlcv.map((c, i) => ({ t: c.t, c: 0.0001 * (1 + (i % 5)) }));
    const liq = ohlcv.map((c, i) => ({ t: c.t, l: 1000 + (i % 6) * 100, s: 900 + (i % 4) * 150 }));
    const spot = { symbol: 'S', ohlcv: ohlcv.map((c) => ({ ...c, v: c.v / 5, bv: c.bv / 5 + 3 })) };
    const { snapshots } = computeMomentum({
      perps: [{ symbol: 'P', ohlcv, oi, oiNative: oi, funding, liq }],
      spots: [spot],
      now: 1e15,
    });
    const last = snapshots[snapshots.length - 1];
    const rows = buildExplanation(last, ohlcv[ohlcv.length - 1], oi[oi.length - 1]);
    const missing = rows.filter((r) => !NAME_TO_ID[r.name]).map((r) => r.name);
    expect(missing).toEqual([]);
  });
});
