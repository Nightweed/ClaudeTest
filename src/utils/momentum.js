// SOL momentum számítási réteg (sol-momentum-spec.md alapján).
// Csak tiszta függvények, nincs benne fetch.

export const CONFIG = {
  zWindow: 50, // rolling z-score ablak (gyertya)
  divWindow: 20, // divergencia / abszorpció / CVD meredekség ablak
  deadband: 0.25, // OI kvadráns holtsáv a rolling szórás többszöröse
  zClamp: 3,
  volumeUnit: 'BASE', // BASE: v SOL-ban van (-> USD = v * c); USD: már USD
  absorptionZ: 2,
  liqZDamp: 2, // efölött csillapítjuk a flow-t
  liqDampFactor: 0.5,
  crowdingFree: 1, // funding z eddig nem büntet
  orderFlowMix: { deltaPct: 0.6, cvdSlope: 0.4 },
  // kezdő feltételezések, backtesttel hangolandók
  weights: { w1: 0.5, w2: 0.25, w3: 0.15, w4: 0.1 },
};

// ---------- statisztikai alapok ----------

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const std = (xs) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

export const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Az utolsó érték z-score-ja az utolsó `windowSize` értékhez képest.
export const calculateZScore = (values, windowSize = CONFIG.zWindow) => {
  const w = values.slice(-windowSize);
  if (w.length < 2) return 0;
  const s = std(w);
  return s > 0 ? (w[w.length - 1] - mean(w)) / s : 0;
};

const isNum = (x) => typeof x === 'number' && !Number.isNaN(x);

// Rolling z-score minden pontra; null/NaN bemenetre null (hiányzó adat).
export const rollingZ = (values, windowSize = CONFIG.zWindow) =>
  values.map((v, i) => {
    if (!isNum(v)) return null;
    const w = values.slice(Math.max(0, i - windowSize + 1), i + 1).filter(isNum);
    return calculateZScore(w, windowSize);
  });

export const linearRegression = (values) => {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0 };
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });
  const slope = num / den;
  return { slope, intercept: yMean - slope * xMean };
};

// ---------- 3.1 order flow ----------

export const calculateDelta = (bv, v) => 2 * bv - v;

export const calculateDeltaPct = (delta, v) => (v > 0 ? delta / v : 0);

export const calculateCVD = (deltas) => {
  let sum = 0;
  return deltas.map((d) => (sum += d));
};

// Gyertyánkénti order flow egy piacra. A cvd a piac saját egységében van.
export const processCandles = (ohlcv, volumeUnit = CONFIG.volumeUnit) => {
  let cvd = 0;
  return ohlcv.map((c) => {
    const sellVol = c.v - c.bv;
    const delta = calculateDelta(c.bv, c.v);
    cvd += delta;
    const sellTx = c.tx - c.btx;
    const avgBuySize = c.btx > 0 ? c.bv / c.btx : 0;
    const avgSellSize = sellTx > 0 ? sellVol / sellTx : 0;
    const k = volumeUnit === 'BASE' ? c.c : 1;
    return {
      ...c,
      sellVol,
      delta,
      deltaPct: calculateDeltaPct(delta, c.v),
      cvd,
      sizeSkew: avgSellSize > 0 ? avgBuySize / avgSellSize : null,
      vUsd: c.v * k,
      deltaUsd: delta * k,
    };
  });
};

// Adat-validáció; hibák listáját adja. Ha nem üres, a piacot ki kell hagyni.
export const validateCandles = (candles) => {
  const errors = [];
  if (candles.some((c) => [c.t, c.c, c.v, c.bv, c.tx, c.btx].some((x) => !isNum(x)))) {
    errors.push('NaN vagy hiányzó érték');
  }
  if (candles.some((c) => c.bv < 0 || c.bv > c.v)) errors.push('bv > v (vagy negatív)');
  if (candles.some((c) => c.btx < 0 || c.btx > c.tx)) errors.push('btx > tx (vagy negatív)');
  if (candles.some((c, i) => i > 0 && c.t <= candles[i - 1].t)) {
    errors.push('az időbélyegek nem növekvők');
  }
  return errors;
};

// ---------- 3.2 divergencia / abszorpció ----------

// A bemenet már az ablakra szeletelt tömb.
export const detectDivergence = (closes, cvds, deltas) => {
  const priceSlope = linearRegression(closes).slope / (mean(closes) || 1);
  const avgAbsDelta = mean(deltas.map(Math.abs));
  const cvdSlope = avgAbsDelta > 0 ? linearRegression(cvds).slope / avgAbsDelta : 0;
  let divergence = null;
  if (priceSlope < 0 && cvdSlope > 0) divergence = 'BULLISH';
  else if (priceSlope > 0 && cvdSlope < 0) divergence = 'BEARISH';
  return { divergence, priceSlope, cvdSlope };
};

export const detectAbsorption = (deltaPctZ, movePct, recentMovesPct, absorptionZ = CONFIG.absorptionZ) =>
  Math.abs(deltaPctZ) > absorptionZ &&
  Math.abs(movePct) < median(recentMovesPct.map(Math.abs)) / 2;

// ---------- 3.3 OI + ár kvadráns ----------

export const getOIQuadrant = (dPricePct, dOIPct, priceDead = 0, oiDead = 0) => {
  if (Math.abs(dPricePct) <= priceDead || Math.abs(dOIPct) <= oiDead) return 'NEUTRAL';
  if (dPricePct > 0) return dOIPct > 0 ? 'NEW_LONGS' : 'SHORT_COVERING';
  return dOIPct > 0 ? 'NEW_SHORTS' : 'LONG_LIQUIDATION';
};

const QUADRANT_SCORE = {
  NEW_LONGS: 1,
  SHORT_COVERING: 0.5,
  NEW_SHORTS: -1,
  LONG_LIQUIDATION: -0.5,
  NEUTRAL: 0,
};

// ---------- 5. kompozit momentum ----------

export const getLabel = (m) => {
  if (m > 0.5) return 'STRONG_BULL';
  if (m > 0.2) return 'BULL';
  if (m >= -0.2) return 'NEUTRAL';
  if (m >= -0.5) return 'BEAR';
  return 'STRONG_BEAR';
};

// Bemenet: már [-3, 3]-ra vágott z-score-ok.
export const calculateMomentumScore = (
  { deltaPctZ, cvdSlopeZ, oiQuadrant, dOIZ, spotLead, liqZ, fundingZ },
  cfg = CONFIG
) => {
  const { w1, w2, w3, w4 } = cfg.weights;
  const orderFlow = cfg.orderFlowMix.deltaPct * deltaPctZ + cfg.orderFlowMix.cvdSlope * cvdSlopeZ;
  const oiSignal = QUADRANT_SCORE[oiQuadrant] * (Math.min(Math.abs(dOIZ), 3) / 3);
  const liqDamp = liqZ > cfg.liqZDamp ? cfg.liqDampFactor : 1;
  const base = liqDamp * (w1 * orderFlow + w2 * oiSignal * 3 + w3 * spotLead);
  const s = Math.sign(base);
  const raw = base - w4 * s * Math.max(0, fundingZ * s - cfg.crowdingFree);
  const momentum = clamp(raw / 3, -1, 1);
  return { momentum, label: getLabel(momentum), orderFlow, oiSignal, liqDamp, raw };
};

// ---------- 4. aggregálás SOL szintre ----------

const byT = (rows = []) => new Map(rows.map((r) => [r.t, r]));
const sumBy = (rows, f) => rows.reduce((a, r) => a + f(r), 0);

const prepareMarket = (m, cfg, warnings) => {
  const ohlcv = m.ohlcv || [];
  if (!ohlcv.length) {
    warnings.push(`${m.symbol}: nincs OHLCV adat, kihagyva`);
    return null;
  }
  const errors = validateCandles(ohlcv);
  if (errors.length) {
    warnings.push(`${m.symbol} kihagyva: ${errors.join(', ')}`);
    return null;
  }
  const rows = processCandles(ohlcv, m.volumeUnit || cfg.volumeUnit);
  return {
    symbol: m.symbol,
    byT: byT(rows),
    oiByT: byT(m.oi),
    fundingByT: byT(m.funding),
    predByT: byT(m.predFunding),
    liqByT: byT(m.liq),
    lsrByT: byT(m.lsr),
    hasLiq: Boolean(m.liq && m.liq.length),
    lastOI: m.oi && m.oi.length ? m.oi[m.oi.length - 1].c : 0,
  };
};

// OI-val súlyozott átlag; ha nincs OI, egyszerű átlag.
const oiWeighted = (markets, t, getter) => {
  const vals = markets
    .map((m) => ({ v: getter(m), w: m.oiByT.get(t)?.c ?? 0 }))
    .filter((x) => isNum(x.v));
  if (!vals.length) return null;
  const wSum = sumBy(vals, (x) => x.w);
  if (wSum > 0) return sumBy(vals, (x) => x.v * x.w) / wSum;
  return mean(vals.map((x) => x.v));
};

const aggregateAt = (t, perps, spots) => {
  const pm = perps.filter((m) => m.byT.has(t));
  const sm = spots.filter((m) => m.byT.has(t));
  const pRows = pm.map((m) => m.byT.get(t));
  const sRows = sm.map((m) => m.byT.get(t));

  const oiPts = pm.map((m) => m.oiByT.get(t)).filter(Boolean);
  const oiO = sumBy(oiPts, (x) => x.o);
  const oiC = sumBy(oiPts, (x) => x.c);

  const perpVUsd = sumBy(pRows, (r) => r.vUsd);
  const hasLiq = pm.some((m) => m.hasLiq);
  const liqL = sumBy(pm, (m) => m.liqByT.get(t)?.l ?? 0);
  const liqS = sumBy(pm, (m) => m.liqByT.get(t)?.s ?? 0);

  const bv = sumBy(pRows, (r) => r.bv);
  const btx = sumBy(pRows, (r) => r.btx);
  const sellVol = sumBy(pRows, (r) => r.sellVol);
  const sellTx = sumBy(pRows, (r) => r.tx - r.btx);
  const avgBuy = btx > 0 ? bv / btx : 0;
  const avgSell = sellTx > 0 ? sellVol / sellTx : 0;

  return {
    t,
    price: pRows[0], // a perp lista OI szerint rendezett: az első a legnagyobb
    perpMarkets: pm.length,
    spotMarkets: sm.length,
    perpDeltaUsd: sumBy(pRows, (r) => r.deltaUsd),
    perpVUsd,
    spotDeltaUsd: sumBy(sRows, (r) => r.deltaUsd),
    spotVUsd: sumBy(sRows, (r) => r.vUsd),
    dOI: oiO > 0 ? (oiC - oiO) / oiO : null,
    liqL: hasLiq ? liqL : null,
    liqS: hasLiq ? liqS : null,
    liqRatio: hasLiq && perpVUsd > 0 ? (liqL + liqS) / perpVUsd : null,
    funding: oiWeighted(pm, t, (m) => m.fundingByT.get(t)?.c),
    predFunding: oiWeighted(pm, t, (m) => m.predByT.get(t)?.c),
    lsr: oiWeighted(pm, t, (m) => m.lsrByT.get(t)?.r),
    sizeSkew: avgSell > 0 ? avgBuy / avgSell : null,
  };
};

// ---------- fő belépési pont ----------

// perps: [{ symbol, ohlcv, oi, funding, predFunding, liq, lsr, volumeUnit? }]
// spots: [{ symbol, ohlcv, volumeUnit? }]
// Visszaad: { snapshots: MomentumSnapshot[], warnings: string[] }
export const computeMomentum = ({ perps = [], spots = [], interval = '5min', asset = 'SOL', config = {} }) => {
  const cfg = {
    ...CONFIG,
    ...config,
    weights: { ...CONFIG.weights, ...config.weights },
    orderFlowMix: { ...CONFIG.orderFlowMix, ...config.orderFlowMix },
  };
  const warnings = [];

  const P = perps
    .map((m) => prepareMarket(m, cfg, warnings))
    .filter(Boolean)
    .sort((a, b) => b.lastOI - a.lastOI);
  const S = spots.map((m) => prepareMarket(m, cfg, warnings)).filter(Boolean);

  if (!P.length) {
    warnings.push('Nincs használható perp piac');
    return { snapshots: [], warnings };
  }
  if (!S.length) warnings.push('Nincs spot adat: a spotLead 0-nak van véve');
  if (!P.some((m) => m.fundingByT.size)) warnings.push('Nincs funding adat: a crowding kimarad');
  if (!P.some((m) => m.hasLiq)) warnings.push('Nincs likvidációs adat: a liqDamp kimarad');

  const timeline = [...new Set(P.flatMap((m) => [...m.byT.keys()]))].sort((a, b) => a - b);
  const agg = timeline.map((t) => aggregateAt(t, P, S));

  // kumulált sorozatok (az ablak elejétől)
  let cvdPerp = 0;
  let cvdSpot = 0;
  agg.forEach((a) => {
    cvdPerp += a.perpDeltaUsd;
    cvdSpot += a.spotDeltaUsd;
    a.cvdPerp = cvdPerp;
    a.cvdSpot = cvdSpot;
    a.cvdComb = cvdPerp + cvdSpot;
    a.deltaComb = a.perpDeltaUsd + a.spotDeltaUsd;
    const v = a.perpVUsd + a.spotVUsd;
    a.deltaPct = v > 0 ? a.deltaComb / v : 0;
    a.movePct = a.price.o > 0 ? (a.price.c - a.price.o) / a.price.o : 0;
  });

  const N = cfg.divWindow;
  const slopeNorm = agg.map((_, i) => {
    if (i < 2) return 0;
    const win = agg.slice(Math.max(0, i - N + 1), i + 1);
    const avgAbs = mean(win.map((a) => Math.abs(a.deltaComb)));
    return avgAbs > 0 ? linearRegression(win.map((a) => a.cvdComb)).slope / avgAbs : 0;
  });

  const Z = cfg.zWindow;
  const deltaPctZ = rollingZ(agg.map((a) => a.deltaPct), Z);
  const slopeZ = rollingZ(slopeNorm, Z);
  const dOIZ = rollingZ(agg.map((a) => a.dOI), Z);
  const spotZ = rollingZ(agg.map((a) => a.spotDeltaUsd), Z);
  const perpZ = rollingZ(agg.map((a) => a.perpDeltaUsd), Z);
  const liqZ = rollingZ(agg.map((a) => a.liqRatio), Z);
  const fundingZ = rollingZ(agg.map((a) => a.funding), Z);
  const predZ = rollingZ(agg.map((a) => a.predFunding), Z);
  const lsrZ = rollingZ(agg.map((a) => a.lsr), Z);

  const zc = (z) => clamp(z ?? 0, -cfg.zClamp, cfg.zClamp);

  const snapshots = agg.map((a, i) => {
    const dWin = agg.slice(Math.max(0, i - N + 1), i + 1);
    const zWin = agg.slice(Math.max(0, i - Z + 1), i + 1);

    const div = dWin.length >= 5
      ? detectDivergence(dWin.map((x) => x.price.c), dWin.map((x) => x.cvdComb), dWin.map((x) => x.deltaComb))
      : { divergence: null };

    const oiQuadrant = isNum(a.dOI)
      ? getOIQuadrant(
          a.movePct,
          a.dOI,
          cfg.deadband * std(zWin.map((x) => x.movePct)),
          cfg.deadband * std(zWin.map((x) => x.dOI).filter(isNum))
        )
      : 'NEUTRAL';

    const scoreInput = {
      deltaPctZ: zc(deltaPctZ[i]),
      cvdSlopeZ: zc(slopeZ[i]),
      oiQuadrant,
      dOIZ: zc(dOIZ[i]),
      spotLead: S.length ? zc(spotZ[i]) - zc(perpZ[i]) : 0,
      liqZ: liqZ[i] ?? 0,
      fundingZ: zc(fundingZ[i]),
    };
    const score = calculateMomentumScore(scoreInput, cfg);

    const snapWarnings = [...warnings];
    if (i < Z - 1) snapWarnings.push(`z-score ablak nincs betelve (${i + 1}/${Z})`);
    if (!isNum(a.dOI)) snapWarnings.push('nincs OI adat ennél a gyertyánál');

    return {
      asset,
      interval,
      t: a.t,
      price: a.price.c,
      momentum: score.momentum,
      label: score.label,
      components: {
        deltaPct: a.deltaPct,
        cvdPerp: a.cvdPerp,
        cvdSpot: a.cvdSpot,
        cvdSlopeZ: zc(slopeZ[i]),
        divergence: div.divergence,
        absorption: detectAbsorption(
          deltaPctZ[i] ?? 0,
          a.movePct,
          dWin.map((x) => x.movePct),
          cfg.absorptionZ
        ),
        oiQuadrant,
        dOIPct: a.dOI ?? 0,
        netLiqUsd: isNum(a.liqS) ? a.liqS - a.liqL : 0,
        liqZ: liqZ[i] ?? 0,
        fundingZ: zc(fundingZ[i]),
        predFundingZ: zc(predZ[i]),
        lsrZ: isNum(lsrZ[i]) ? zc(lsrZ[i]) : null,
        spotLead: S.length ? zc(spotZ[i]) - zc(perpZ[i]) : 0,
        sizeSkew: a.sizeSkew,
      },
      coverage: { perpMarkets: a.perpMarkets, spotMarkets: a.spotMarkets },
      warnings: snapWarnings,
      // köztes értékek a magyarázó nézethez
      debug: {
        scoreInput,
        score,
        weights: cfg.weights,
        orderFlowMix: cfg.orderFlowMix,
        spot: {
          spotDeltaUsd: a.spotDeltaUsd,
          perpDeltaUsd: a.perpDeltaUsd,
          spotZ: zc(spotZ[i]),
          perpZ: zc(perpZ[i]),
        },
      },
    };
  });

  return { snapshots, warnings };
};
