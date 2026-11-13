// Historikus kiértékelés a computeMomentum snapshotjaira (7. szakasz). Csak tiszta függvények.
//
// Alapelvek:
// - Belépés a jel gyertyájának záróárán (a snapshot `price` = a gyertya zárása; a jel a zárásra ismert).
// - Előretekintés h gyertyával később; csak akkor számít, ha az idősor h gyertyán át folytonos (nincs lyuk).
// - Az átlagos/maximális kedvezőtlen elmozdulás (MAE) és kedvező elmozdulás (MFE) a ZÁRÓárakból készül
//   (a snapshot nem hordoz high/low-t), ezért alulbecsüli a gyertyán belüli kilengést.
// - Költség: oda-vissza díj (bps) + a tartás alatti funding. Funding-fizetés: long fizet pozitív rátánál,
//   short kap; a `fundingByT` gyertyánkénti (óránkénti) rátát vár tizedes törtben.
// - Paramétert itt nem optimalizálunk; a küszöbök a getLabel() címkéi.

import { mean, median } from './momentum';

export const DEFAULT_HORIZONS = [1, 3, 6, 12];
const INTERVAL_SEC = 3600;

export const labelDirection = (label) => {
  if (label === 'BULL' || label === 'STRONG_BULL') return 1;
  if (label === 'BEAR' || label === 'STRONG_BEAR') return -1;
  return 0; // NEUTRAL és INVALID nem ad jelet
};

// A h gyertyával későbbi index, ha az idősor addig folytonos; különben null.
const futureIndex = (snaps, i, h) => {
  const j = i + h;
  if (j >= snaps.length) return null;
  return snaps[j].t - snaps[i].t === h * INTERVAL_SEC ? j : null;
};

// Egy jel kimenetele h gyertyára; null, ha nincs folytonos jövő.
export const evaluateSignal = (snaps, i, h, { costBps = 0, fundingByT = null } = {}) => {
  const dir = labelDirection(snaps[i].label);
  const j = futureIndex(snaps, i, h);
  if (!dir || j === null) return null;
  const p0 = snaps[i].price;
  if (!(p0 > 0)) return null;

  let mfe = -Infinity;
  let mae = Infinity;
  for (let k = i + 1; k <= j; k++) {
    const r = dir * (snaps[k].price / p0 - 1);
    mfe = Math.max(mfe, r);
    mae = Math.min(mae, r);
  }
  const gross = dir * (snaps[j].price / p0 - 1);

  // a tartás alatti gyertyák funding-rátái (t_i+1 .. t_j); hiányzó ráta 0, de jelezzük
  let funding = 0;
  let fundingMissing = 0;
  if (fundingByT) {
    for (let k = i + 1; k <= j; k++) {
      const r = fundingByT.get(snaps[k].t);
      if (Number.isFinite(r)) funding += -dir * r; // long fizet pozitív rátánál (-r), short kap (+r)
      else fundingMissing += 1;
    }
  }
  const net = gross - costBps / 1e4 + funding;
  return { dir, gross, net, mfe, mae, fundingMissing };
};

const summarize = (outs) => {
  const n = outs.length;
  if (!n) return { n: 0, hitRate: null, meanGross: null, meanNet: null, medianNet: null, meanMfe: null, meanMae: null, worstMae: null };
  const net = outs.map((o) => o.net);
  return {
    n,
    hitRate: outs.filter((o) => o.net > 0).length / n,
    meanGross: mean(outs.map((o) => o.gross)),
    meanNet: mean(net),
    medianNet: median(net),
    meanMfe: mean(outs.map((o) => o.mfe)),
    meanMae: mean(outs.map((o) => o.mae)),
    worstMae: Math.min(...outs.map((o) => o.mae)),
  };
};

// Alapvonal: ugyanazon horizonton MINDEN gyertyán long belépés (jelszűrés nélkül), ugyanazzal a költséggel.
// Ha a jelek nem verik, a jelnek nincs többletértéke a piac irányához képest.
const baseline = (snaps, h, opts) => {
  const outs = [];
  for (let i = 0; i < snaps.length; i++) {
    const j = futureIndex(snaps, i, h);
    if (j === null || !(snaps[i].price > 0)) continue;
    const g = snaps[j].price / snaps[i].price - 1;
    outs.push({ gross: g, net: g - (opts.costBps || 0) / 1e4, mfe: 0, mae: 0 });
  }
  return outs.length ? { n: outs.length, hitRate: outs.filter((o) => o.net > 0).length / outs.length, meanNet: mean(outs.map((o) => o.net)) } : { n: 0, hitRate: null, meanNet: null };
};

// Fő kiértékelés. Csak érvényes (valid) snapshotok. Visszaad horizontonként: összes jel, címkénként, alapvonal.
export const runBacktest = (snapshots, opts = {}) => {
  const horizons = opts.horizons || DEFAULT_HORIZONS;
  const snaps = [...snapshots].filter((s) => s.valid && Number.isFinite(s.price)).sort((a, b) => a.t - b.t);
  const result = { totalSnapshots: snapshots.length, usedSnapshots: snaps.length, horizons: {} };
  horizons.forEach((h) => {
    const outs = [];
    const byLabel = {};
    snaps.forEach((s, i) => {
      const o = evaluateSignal(snaps, i, h, opts);
      if (!o) return;
      outs.push(o);
      (byLabel[s.label] = byLabel[s.label] || []).push(o);
    });
    result.horizons[h] = {
      all: summarize(outs),
      long: summarize(outs.filter((o) => o.dir > 0)),
      short: summarize(outs.filter((o) => o.dir < 0)),
      byLabel: Object.fromEntries(Object.entries(byLabel).map(([k, v]) => [k, summarize(v)])),
      baselineLong: baseline(snaps, h, opts),
      fundingMissing: outs.reduce((a, o) => a + o.fundingMissing, 0),
    };
  });
  return result;
};

// ---------- korreláció ----------

export const pearson = (xs, ys) => {
  const pts = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = pts.length;
  if (n < 3) return null;
  const mx = mean(pts.map((p) => p[0]));
  const my = mean(pts.map((p) => p[1]));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  pts.forEach(([x, y]) => {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  });
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null; // nulla szórásnál nincs korreláció
};

// A pontszám bemeneti tagjai (iránnyal megadva, mint a pontszámba mennek).
export const SCORE_INPUT_KEYS = ['deltaPctZ', 'cvdSlopeZ', 'dOIZ', 'spotLead', 'fundingZ', 'liqZ'];

// Tagok közti páronkénti korreláció: a magas érték dupla beszámításra utal.
export const correlationMatrix = (snapshots, keys = SCORE_INPUT_KEYS) => {
  const snaps = snapshots.filter((s) => s.valid);
  const col = (k) => snaps.map((s) => s.debug.scoreInput[k]);
  const m = {};
  keys.forEach((a) => {
    m[a] = {};
    keys.forEach((b) => {
      m[a][b] = a === b ? 1 : pearson(col(a), col(b));
    });
  });
  return m;
};

// Információs együttható: a tag (és a pontszám) korrelációja a h gyertyás előre hozammal (irány nélkül, nyers).
export const informationCoefficient = (snapshots, h, keys = SCORE_INPUT_KEYS) => {
  const snaps = [...snapshots].filter((s) => s.valid && Number.isFinite(s.price)).sort((a, b) => a.t - b.t);
  const fwd = snaps.map((s, i) => {
    const j = futureIndex(snaps, i, h);
    return j === null ? null : snaps[j].price / s.price - 1;
  });
  const out = { momentum: pearson(snaps.map((s) => s.momentum), fwd) };
  keys.forEach((k) => {
    out[k] = pearson(snaps.map((s) => s.debug.scoreInput[k]), fwd);
  });
  return out;
};
