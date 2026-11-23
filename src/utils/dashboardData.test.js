import { buildRows } from './dashboardData';
import { computeMomentum } from './momentum';

// Fix mintaadat a valós esetből (2026. 11. 20. 23:00 lezárt, 11. 21. 00:00 formálódó gyertya).
const HOUR = 3600;
const T_CLOSED = Date.UTC(2026, 10, 20, 23, 0, 0) / 1000;
const T_OPEN = T_CLOSED + HOUR;
const NOW = (T_OPEN + 14 * 60) * 1000; // 00:14, a 00:00-s gyertya még formálódik

const mk = (t, v, bv, c) => ({ t, o: c, h: c, l: c, c, v, bv, tx: 100, btx: 50 });
const history = [];
for (let i = 60; i >= 2; i--) history.push(mk(T_CLOSED - i * HOUR, 1000 + i, 500 + (i % 7), 69));
history.push(mk(T_CLOSED, 681603.41, 314465.15, 69.29)); // delta −52 673,11 SOL
history.push(mk(T_OPEN, 136746.48, 77983.66, 69.46)); // formálódó, delta +19 220,84 SOL

describe('buildRows és computeMomentum ugyanazt a lezárt gyertyát látja', () => {
  const data = { ohlcv: history, oi: [], funding: [], liq: [], lsr: [] };
  const { snapshots } = computeMomentum({ perps: [{ symbol: 'P', ohlcv: history }], now: NOW });
  const rows = buildRows(data, snapshots, { now: NOW }); // legújabb elöl

  test('a formálódó gyertya nem szerepel a sorok között', () => {
    expect(rows.some((r) => r.t === T_OPEN)).toBe(false);
    expect(rows[0].t).toBe(T_CLOSED);
  });

  test('a sorok és a snapshotok utolsó időpontja azonos', () => {
    expect(rows[0].t).toBe(snapshots[snapshots.length - 1].t);
  });

  test('a SOL-delta és a USD-delta előjele és nagysága egyezik', () => {
    const last = snapshots[snapshots.length - 1];
    expect(rows[0].delta).toBeCloseTo(-52673.11, 2);
    expect(rows[0].delta).toBeLessThan(0);
    expect(rows[0].delta * rows[0].close).toBeCloseTo(last.debug.spot.perpDeltaUsd, 2);
  });

  test('ha minden gyertya lezárt, egyik sem esik ki', () => {
    const later = buildRows(data, snapshots, { now: NOW + 2 * HOUR * 1000 });
    expect(later[0].t).toBe(T_OPEN);
    expect(later).toHaveLength(history.length);
  });
});

describe('verdictText: a nyers irányt a kombinált delta adja', () => {
  const { verdictText, WATERFALL_LABELS } = require('./dashboardData');
  const snap = (deltaPct, orderFlow) => ({ momentum: 0.03, missing: [], components: { deltaPct }, debug: { score: { orderFlow } } });

  test('pozitív kombinált delta + negatív order-flow z: nem „eladói agresszió dominál"', () => {
    const t = verdictText(snap(0.0041, -0.4), 'új long pozíciók');
    expect(t).toMatch(/vevői oldalon áll, de a szokásos szinthez képest gyengébb/);
    expect(t).not.toMatch(/Az eladói agresszió dominál/);
  });
  test('egyező irány: nincs megjegyzés; negatív delta eladói', () => {
    expect(verdictText(snap(0.01, 0.5), '')).not.toMatch(/de a szokásos/);
    expect(verdictText(snap(-0.01, -0.5), '')).toMatch(/eladói oldalon áll\./);
  });
  test('a waterfall oszlop neve a csillapítás', () => {
    expect(WATERFALL_LABELS.liq).toBe('Likvidációs csillapítás');
  });
});
