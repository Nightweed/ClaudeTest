import { labelDirection, evaluateSignal, runBacktest, pearson, correlationMatrix, informationCoefficient } from './backtest';

const H = 3600;
const snap = (i, price, label = 'NEUTRAL', extra = {}) => ({
  t: 1000 * H + i * H,
  price,
  label,
  momentum: label === 'BULL' ? 0.3 : label === 'BEAR' ? -0.3 : 0,
  valid: true,
  debug: { scoreInput: { deltaPctZ: 0, cvdSlopeZ: 0, dOIZ: 0, spotLead: 0, fundingZ: 0, liqZ: 0 } },
  ...extra,
});

describe('labelDirection', () => {
  test('irányok', () => {
    expect(labelDirection('STRONG_BULL')).toBe(1);
    expect(labelDirection('BULL')).toBe(1);
    expect(labelDirection('BEAR')).toBe(-1);
    expect(labelDirection('STRONG_BEAR')).toBe(-1);
    expect(labelDirection('NEUTRAL')).toBe(0);
    expect(labelDirection('INVALID')).toBe(0);
  });
});

describe('evaluateSignal', () => {
  const up = [snap(0, 100, 'BULL'), snap(1, 102), snap(2, 99), snap(3, 110)];

  test('long hozam, MFE és MAE kézzel számolva', () => {
    const o = evaluateSignal(up, 0, 3);
    expect(o.gross).toBeCloseTo(0.1, 12);
    expect(o.mfe).toBeCloseTo(0.1, 12);
    expect(o.mae).toBeCloseTo(-0.01, 12);
  });

  test('short jelnél az előjel megfordul', () => {
    const s = [snap(0, 100, 'BEAR'), snap(1, 90)];
    const o = evaluateSignal(s, 0, 1);
    expect(o.gross).toBeCloseTo(0.1, 12);
    expect(o.mae).toBeCloseTo(0.1, 12);
  });

  test('költség levonódik (bps)', () => {
    const o = evaluateSignal(up, 0, 3, { costBps: 10 });
    expect(o.net).toBeCloseTo(0.1 - 0.001, 12);
  });

  test('funding: long fizet pozitív rátánál, short kap', () => {
    const f = new Map([[up[1].t, 0.001], [up[2].t, 0.001], [up[3].t, 0.001]]);
    expect(evaluateSignal(up, 0, 3, { fundingByT: f }).net).toBeCloseTo(0.1 - 0.003, 12);
    const s = [snap(0, 100, 'BEAR'), snap(1, 100), snap(2, 100)];
    const fs = new Map([[s[1].t, 0.001], [s[2].t, 0.001]]);
    expect(evaluateSignal(s, 0, 2, { fundingByT: fs }).net).toBeCloseTo(0.002, 12);
  });

  test('hiányzó funding-ráta jelezve', () => {
    expect(evaluateSignal(up, 0, 3, { fundingByT: new Map() }).fundingMissing).toBe(3);
  });

  test('semleges jel, vég és időlyuk: null', () => {
    expect(evaluateSignal(up, 1, 1)).toBeNull();
    expect(evaluateSignal(up, 0, 4)).toBeNull();
    const gap = [snap(0, 100, 'BULL'), { ...snap(2, 101) }];
    expect(evaluateSignal(gap, 0, 1)).toBeNull();
  });
});

describe('runBacktest', () => {
  const series = [snap(0, 100, 'BULL'), snap(1, 101, 'BEAR'), snap(2, 100), snap(3, 103), snap(4, 104)];

  test('találati arány és darabszám', () => {
    const r = runBacktest(series, { horizons: [1] }).horizons[1];
    // BULL 0: +1% nyer; BEAR 1: ár 101 -> 100, short +0,99% nyer
    expect(r.all.n).toBe(2);
    expect(r.all.hitRate).toBe(1);
    expect(r.long.n).toBe(1);
    expect(r.short.n).toBe(1);
    expect(r.byLabel.BULL.n).toBe(1);
  });

  test('alapvonal: minden gyertyán long', () => {
    const r = runBacktest(series, { horizons: [1] }).horizons[1];
    expect(r.baselineLong.n).toBe(4);
    expect(r.baselineLong.meanNet).toBeCloseTo((0.01 + (100 / 101 - 1) + 0.03 + 104 / 103 - 1) / 4, 12);
  });

  test('érvénytelen snapshot kimarad, rendezetlen bemenet is jó', () => {
    const bad = { ...snap(5, 90, 'BULL'), valid: false };
    const r = runBacktest([...series].reverse().concat(bad), { horizons: [1] });
    expect(r.usedSnapshots).toBe(5);
    expect(r.totalSnapshots).toBe(6);
  });

  test('üres bemenet', () => {
    const r = runBacktest([], { horizons: [1] }).horizons[1];
    expect(r.all.n).toBe(0);
    expect(r.all.hitRate).toBeNull();
  });
});

describe('korreláció', () => {
  test('pearson kézzel', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 12);
  });
  test('nulla szórás és kevés pont: null', () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(pearson([1, 2], [1, 2])).toBeNull();
  });
  test('nem véges értékek kiesnek', () => {
    expect(pearson([1, 2, 3, NaN], [2, 4, 6, 9])).toBeCloseTo(1, 12);
  });
  test('mátrix: átló 1, a dupla beszámítás látszik', () => {
    const snaps = [1, 2, 3, 4].map((x, i) =>
      snap(i, 100, 'NEUTRAL', { debug: { scoreInput: { deltaPctZ: x, cvdSlopeZ: 2 * x, dOIZ: [3, 1, 4, 1][i], spotLead: 0, fundingZ: 0, liqZ: 0 } } })
    );
    const m = correlationMatrix(snaps, ['deltaPctZ', 'cvdSlopeZ', 'dOIZ']);
    expect(m.deltaPctZ.deltaPctZ).toBe(1);
    expect(m.deltaPctZ.cvdSlopeZ).toBeCloseTo(1, 12);
    expect(Math.abs(m.deltaPctZ.dOIZ)).toBeLessThan(0.5);
  });
  test('információs együttható: a tag és az előre hozam', () => {
    const prices = [100, 101, 103, 102, 105];
    const snaps = prices.map((p, i) =>
      snap(i, p, 'NEUTRAL', { momentum: i, debug: { scoreInput: { deltaPctZ: i, cvdSlopeZ: 0, dOIZ: 0, spotLead: 0, fundingZ: 0, liqZ: 0 } } })
    );
    const ic = informationCoefficient(snaps, 1, ['deltaPctZ']);
    expect(ic.deltaPctZ).toBeCloseTo(pearson([0, 1, 2, 3], [0.01, 103 / 101 - 1, 102 / 103 - 1, 105 / 102 - 1]), 12);
    expect(ic.momentum).toBeCloseTo(ic.deltaPctZ, 12);
  });
});
