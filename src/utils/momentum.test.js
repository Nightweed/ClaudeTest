import {
  calculateDelta,
  calculateDeltaPct,
  calculateCVD,
  calculateZScore,
  rollingZ,
  linearRegression,
  processCandles,
  validateCandles,
  detectDivergence,
  detectAbsorption,
  getOIQuadrant,
  getLabel,
  calculateMomentumScore,
  computeMomentum,
} from './momentum';

describe('order flow (3.1)', () => {
  test('delta = 2*bv - v (valós SOL gyertya)', () => {
    const delta = calculateDelta(3056.42, 5435.75);
    expect(delta).toBeCloseTo(677.09, 2);
    expect(calculateDeltaPct(delta, 5435.75)).toBeCloseTo(0.1246, 4);
  });

  test('deltaPct: nulla volumennél 0', () => {
    expect(calculateDeltaPct(0, 0)).toBe(0);
  });

  test('CVD kumulatív összeg', () => {
    expect(calculateCVD([10, -4, 6, -20])).toEqual([10, 6, 12, -8]);
  });

  test('processCandles: sizeSkew, USD normalizálás', () => {
    // v=100, bv=60 -> sell=40, delta=20; tx=10, btx=4 -> sellTx=6
    // avgBuy=15, avgSell=40/6 -> skew=2.25
    const [r] = processCandles([{ t: 1, o: 10, h: 10, l: 10, c: 10, v: 100, bv: 60, tx: 10, btx: 4 }], 'BASE');
    expect(r.delta).toBe(20);
    expect(r.sizeSkew).toBeCloseTo(2.25, 6);
    expect(r.vUsd).toBe(1000);
    expect(r.deltaUsd).toBe(200);
    const [u] = processCandles([{ t: 1, o: 10, h: 10, l: 10, c: 10, v: 100, bv: 60, tx: 10, btx: 4 }], 'USD');
    expect(u.deltaUsd).toBe(20);
  });
});

describe('statisztika', () => {
  test('lineáris regresszió', () => {
    const { slope, intercept } = linearRegression([1, 3, 5, 7]);
    expect(slope).toBeCloseTo(2);
    expect(intercept).toBeCloseTo(1);
  });

  test('z-score: [1..5] utolsó eleme = 2/sqrt(2)', () => {
    expect(calculateZScore([1, 2, 3, 4, 5])).toBeCloseTo(1.4142, 4);
    expect(calculateZScore([2, 2, 2])).toBe(0);
  });

  test('rollingZ: null marad null, a többi folytatódik', () => {
    const z = rollingZ([1, 2, null, 4], 10);
    expect(z[2]).toBeNull();
    expect(z[3]).toBeGreaterThan(0);
  });
});

describe('validáció', () => {
  const ok = { t: 1, c: 1, v: 10, bv: 5, tx: 4, btx: 2 };
  test('jó adat -> nincs hiba', () => {
    expect(validateCandles([ok])).toEqual([]);
  });
  test('bv > v, btx > tx, időrend, NaN', () => {
    expect(validateCandles([{ ...ok, bv: 12 }])).toContain('bv > v (vagy negatív)');
    expect(validateCandles([{ ...ok, btx: 9 }])).toContain('btx > tx (vagy negatív)');
    expect(validateCandles([ok, ok])).toContain('az időbélyegek nem növekvők');
    expect(validateCandles([{ ...ok, v: NaN }])).toContain('NaN vagy hiányzó érték');
  });
});

describe('divergencia / abszorpció (3.2)', () => {
  test('bullish: ár lefelé, CVD felfelé', () => {
    const r = detectDivergence([10, 9, 8, 7, 6], [0, 1, 2, 3, 4], [1, 1, 1, 1, 1]);
    expect(r.divergence).toBe('BULLISH');
  });
  test('bearish: ár felfelé, CVD lefelé', () => {
    const r = detectDivergence([6, 7, 8, 9, 10], [4, 3, 2, 1, 0], [-1, -1, -1, -1, -1]);
    expect(r.divergence).toBe('BEARISH');
  });
  test('azonos irány -> nincs divergencia', () => {
    expect(detectDivergence([1, 2, 3], [1, 2, 3], [1, 1, 1]).divergence).toBeNull();
  });
  test('abszorpció: nagy z, de kicsi ármozgás', () => {
    expect(detectAbsorption(2.5, 0.0001, [0.01, 0.01, 0.01])).toBe(true);
    expect(detectAbsorption(2.5, 0.01, [0.01, 0.01, 0.01])).toBe(false);
    expect(detectAbsorption(1, 0.0001, [0.01, 0.01])).toBe(false);
  });
});

describe('OI kvadráns (3.3)', () => {
  test('mind a négy eset + holtsáv', () => {
    expect(getOIQuadrant(0.01, 0.02)).toBe('NEW_LONGS');
    expect(getOIQuadrant(0.01, -0.02)).toBe('SHORT_COVERING');
    expect(getOIQuadrant(-0.01, 0.02)).toBe('NEW_SHORTS');
    expect(getOIQuadrant(-0.01, -0.02)).toBe('LONG_LIQUIDATION');
    expect(getOIQuadrant(0.001, 0.02, 0.005, 0)).toBe('NEUTRAL');
    expect(getOIQuadrant(0.01, 0.001, 0, 0.005)).toBe('NEUTRAL');
  });
});

describe('kompozit (5.)', () => {
  const base = { deltaPctZ: 2, cvdSlopeZ: 1, oiQuadrant: 'NEW_LONGS', dOIZ: 3, spotLead: 1, liqZ: 0, fundingZ: 0 };

  test('kézi számítás: 0.5*1.6 + 0.25*1*3 + 0.15*1 = 1.7 -> 0.5667', () => {
    const r = calculateMomentumScore(base);
    expect(r.orderFlow).toBeCloseTo(1.6);
    expect(r.raw).toBeCloseTo(1.7);
    expect(r.momentum).toBeCloseTo(1.7 / 3, 6);
    expect(r.label).toBe('STRONG_BULL');
  });

  test('crowding: fundingZ=2 -> 1.7 - 0.1*(2-1) = 1.6', () => {
    expect(calculateMomentumScore({ ...base, fundingZ: 2 }).raw).toBeCloseTo(1.6);
  });

  test('crowding negatív momentumnál negatív fundinggal ugyanígy csökkent', () => {
    const bear = { ...base, deltaPctZ: -2, cvdSlopeZ: -1, oiQuadrant: 'NEW_SHORTS', spotLead: -1, fundingZ: -2 };
    expect(calculateMomentumScore(bear).raw).toBeCloseTo(-1.6);
  });

  test('likvidációs csillapítás: liqZ=3 -> 0.5*1.7 - 0.1*0 = 0.85', () => {
    expect(calculateMomentumScore({ ...base, liqZ: 3 }).raw).toBeCloseTo(0.85);
  });

  test('oiSignal a dOI z-vel skálázva: z=1.5 -> 0.5', () => {
    expect(calculateMomentumScore({ ...base, dOIZ: 1.5 }).oiSignal).toBeCloseTo(0.5);
  });

  test('címkék', () => {
    expect(getLabel(0.6)).toBe('STRONG_BULL');
    expect(getLabel(0.3)).toBe('BULL');
    expect(getLabel(0)).toBe('NEUTRAL');
    expect(getLabel(-0.3)).toBe('BEAR');
    expect(getLabel(-0.6)).toBe('STRONG_BEAR');
  });
});

describe('aggregálás + computeMomentum (4., 6.)', () => {
  const makeMarket = (symbol, n, { oiBase = 1000, buyShare = 0.6, withExtras = true } = {}) => {
    const ohlcv = [];
    const oi = [];
    const funding = [];
    const liq = [];
    const lsr = [];
    for (let i = 0; i < n; i++) {
      const c = 100 + i * 0.1 + (i % 3) * 0.05;
      ohlcv.push({ t: 1000 + i * 300, o: c - 0.05, h: c + 0.1, l: c - 0.1, c, v: 100, bv: 100 * buyShare + (i % 5), tx: 10, btx: 6 });
      oi.push({ t: 1000 + i * 300, o: oiBase + i * 10, c: oiBase + i * 10 + 5 + (i % 4) });
      funding.push({ t: 1000 + i * 300, c: 0.0001 + (i % 6) * 0.00001 });
      liq.push({ t: 1000 + i * 300, l: i % 7, s: i % 5 });
      lsr.push({ t: 1000 + i * 300, r: 1.2 + (i % 4) * 0.1, l: 55, s: 45 });
    }
    return withExtras
      ? { symbol, ohlcv, oi, funding, predFunding: funding, liq, lsr }
      : { symbol, ohlcv, oi };
  };

  test('két perp + egy spot: cvd és coverage kézzel ellenőrizve', () => {
    const p1 = makeMarket('A', 60, { oiBase: 5000 });
    const p2 = makeMarket('B', 60, { oiBase: 1000 });
    const s1 = { symbol: 'S', ohlcv: makeMarket('S', 60, { buyShare: 0.4 }).ohlcv };
    const { snapshots } = computeMomentum({ perps: [p1, p2], spots: [s1] });

    expect(snapshots).toHaveLength(60);
    const first = snapshots[0];
    expect(first.coverage).toEqual({ perpMarkets: 2, spotMarkets: 1 });

    // első gyertya: delta = 2*bv - v ; bv = 60 + 0 -> delta = 20, USD = 20 * close
    const c0 = p1.ohlcv[0].c;
    expect(first.components.cvdPerp).toBeCloseTo(2 * 20 * c0, 6);
    // spot: bv = 40 -> delta = -20
    expect(first.components.cvdSpot).toBeCloseTo(-20 * c0, 6);
    expect(first.price).toBeCloseTo(c0, 6);

    snapshots.forEach((s) => {
      expect(s.momentum).toBeGreaterThanOrEqual(-1);
      expect(s.momentum).toBeLessThanOrEqual(1);
      expect(['STRONG_BULL', 'BULL', 'NEUTRAL', 'BEAR', 'STRONG_BEAR']).toContain(s.label);
    });
    expect(snapshots[0].warnings.some((w) => w.includes('z-score ablak'))).toBe(true);
    expect(snapshots[59].warnings.some((w) => w.includes('z-score ablak'))).toBe(false);
  });

  test('hibás piac (bv > v) kimarad és warning jelzi', () => {
    const good = makeMarket('GOOD', 10);
    const bad = makeMarket('BAD', 10);
    bad.ohlcv[3].bv = bad.ohlcv[3].v + 1;
    const { snapshots, warnings } = computeMomentum({ perps: [good, bad] });
    expect(warnings.some((w) => w.startsWith('BAD kihagyva'))).toBe(true);
    expect(snapshots[0].coverage.perpMarkets).toBe(1);
  });

  test('hiányzó gyertya egy piacon -> coverage csökken', () => {
    const a = makeMarket('A', 10, { oiBase: 5000 });
    const b = makeMarket('B', 10);
    b.ohlcv.splice(4, 1);
    const { snapshots } = computeMomentum({ perps: [a, b] });
    expect(snapshots[4].coverage.perpMarkets).toBe(1);
    expect(snapshots[3].coverage.perpMarkets).toBe(2);
  });

  test('csak OHLCV+OI is működik (nincs spot/funding/liq), figyelmeztet', () => {
    const { snapshots, warnings } = computeMomentum({ perps: [makeMarket('A', 30, { withExtras: false })] });
    expect(snapshots).toHaveLength(30);
    expect(snapshots[29].components.spotLead).toBe(0);
    expect(snapshots[29].components.lsrZ).toBeNull();
    expect(warnings.some((w) => w.includes('spot'))).toBe(true);
  });

  test('nincs használható piac -> üres + warning', () => {
    const { snapshots, warnings } = computeMomentum({ perps: [] });
    expect(snapshots).toEqual([]);
    expect(warnings).toContain('Nincs használható perp piac');
  });
});
