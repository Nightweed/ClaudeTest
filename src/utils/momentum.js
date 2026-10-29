// SOL momentum számítási réteg (sol-momentum-spec.md alapján).
// Csak tiszta függvények, nincs benne fetch.
//
// Hiányzó adat elve: ha egy forrás konfigurálva van (van belőle adat), de egy gyertyánál
// hiányzik, a pontszám nem nulla lesz, hanem null (momentum: null, label: 'INVALID').
// Ha egy forrás egyáltalán nincs konfigurálva, a tagja kimarad, és figyelmeztetés jelzi.

export const CONFIG = {
  zWindow: 50, // rolling z-score ablak (gyertya = 1 óra)
  divWindow: 20, // divergencia / abszorpció / CVD meredekség ablak (óra)
  divMinWindow: 10, // divergenciához legalább ennyi gyertya kell
  divMinSlope: { price: 1e-4, cvd: 0.05 }, // ez alatti meredekség nem számít iránynak
  deadband: 0.25, // OI kvadráns holtsáv a rolling szórás többszöröse
  zClamp: 3,
  volumeUnit: 'BASE', // alapértelmezés, ha a piac nem közli: BASE: v a bázis asset-ben van (-> USD = v * c); USD: már USD
  absorptionZ: 2,
  absorptionWarmup: 20, // ennyi korábbi gyertya kell az abszorpció medián-ablakához
  liqZDamp: 2, // efölött csillapítjuk az order-flow tagot
  liqDampFactor: 0.5,
  crowdingFree: 1, // funding z eddig nem büntet
  orderFlowMix: { deltaPct: 0.6, cvdSlope: 0.4 },
  // kezdő feltételezések, backtesttel hangolandók
  weights: { w1: 0.5, w2: 0.25, w3: 0.15, w4: 0.1 },
};

// Gyertyahossz másodpercben; az interval kulcsa a dataFetcher-ben is ez.
export const INTERVAL_SECONDS = { '1hour': 3600 };

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

// Csak a már lezárt gyertyák maradnak: a formálódó (t + intervalSec > now) gyertya kiesik.
export const dropUnfinished = (candles, nowSec, intervalSec) =>
  (Array.isArray(candles) ? candles : []).filter((c) => !c || !(c.t + intervalSec > nowSec));

const FINITE_KEYS = ['t', 'o', 'c', 'v', 'bv', 'tx', 'btx'];

// Adat-validáció; hibák listáját adja. Ha nem üres, a piacot ki kell hagyni.
export const validateCandles = (candles) => {
  if (!Array.isArray(candles)) return ['nem tömb'];
  if (candles.some((c) => !c)) return ['hiányzó gyertya-objektum'];
  const errors = [];
  if (candles.some((c) => FINITE_KEYS.some((k) => !Number.isFinite(c[k])))) {
    errors.push('NaN vagy hiányzó érték');
  }
  if (candles.some((c) => c.o <= 0 || c.c <= 0)) errors.push('az ár nem pozitív');
  if (candles.some((c) => c.v < 0 || c.tx < 0)) errors.push('negatív volumen vagy kötésszám');
  if (candles.some((c) => c.bv < 0 || c.bv > c.v)) errors.push('bv > v (vagy negatív)');
  if (candles.some((c) => c.btx < 0 || c.btx > c.tx)) errors.push('btx > tx (vagy negatív)');
  if (candles.some((c, i) => i > 0 && c.t <= candles[i - 1].t)) {
    errors.push('az időbélyegek nem növekvők');
  }
  return errors;
};

// ---------- 3.2 divergencia / abszorpció ----------

// A bemenet már az ablakra szeletelt tömb. A holtsávon belüli meredekség nem ad irányt.
export const detectDivergence = (closes, cvds, deltas, cfg = CONFIG) => {
  const priceSlope = linearRegression(closes).slope / (mean(closes) || 1);
  const avgAbsDelta = mean(deltas.map(Math.abs));
  const cvdSlope = avgAbsDelta > 0 ? linearRegression(cvds).slope / avgAbsDelta : 0;
  const { price: minPrice, cvd: minCvd } = cfg.divMinSlope;
  let divergence = null;
  if (priceSlope < -minPrice && cvdSlope > minCvd) divergence = 'BULLISH';
  else if (priceSlope > minPrice && cvdSlope < -minCvd) divergence = 'BEARISH';
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

export const QUADRANT_SCORE = {
  NEW_LONGS: 1,
  SHORT_COVERING: 0.5,
  NEW_SHORTS: -1,
  LONG_LIQUIDATION: -0.5,
  NEUTRAL: 0,
};

// ---------- 5. kompozit momentum ----------

export const getLabel = (m) => {
  if (m === null) return 'INVALID';
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
  // A likvidációs csillapítás csak az order-flow tagot érinti (spec 3.4), az OI és a spot tag nem.
  const liqDamp = liqZ > cfg.liqZDamp ? cfg.liqDampFactor : 1;
  const base = w1 * liqDamp * orderFlow + w2 * oiSignal * 3 + w3 * spotLead;
  const s = Math.sign(base);
  const raw = base - w4 * s * Math.max(0, fundingZ * s - cfg.crowdingFree);
  const momentum = clamp(raw / 3, -1, 1);
  return { momentum, label: getLabel(momentum), orderFlow, oiSignal, liqDamp, raw };
};

// ---------- 4. aggregálás SOL szintre ----------

export const byT = (rows = []) => new Map(rows.map((r) => [r.t, r]));
const sumBy = (rows, f) => rows.reduce((a, r) => a + f(r), 0);

// Nem véges számot tartalmazó pontok kiesnek; a kiesett darabszámot a hívó jelzi.
const finiteRows = (rows, keys) =>
  (Array.isArray(rows) ? rows : []).filter((r) => r && keys.every((k) => Number.isFinite(r[k])));

const prepareMarket = (m, cfg, warnings) => {
  const ohlcv = Array.isArray(m.ohlcv) ? m.ohlcv : [];
  if (!ohlcv.length) {
    warnings.push(`${m.symbol}: nincs OHLCV adat, kihagyva`);
    return null;
  }
  const errors = validateCandles(ohlcv);
  if (errors.length) {
    warnings.push(`${m.symbol} kihagyva: ${errors.join(', ')}`);
    return null;
  }
  const unit = m.volumeUnit || cfg.volumeUnit;
  const rows = processCandles(ohlcv, unit);

  const feed = (label, raw, keys) => {
    const clean = finiteRows(raw, keys);
    const dropped = (Array.isArray(raw) ? raw.length : 0) - clean.length;
    if (dropped) warnings.push(`${m.symbol}: ${dropped} hibás ${label} pont eldobva`);
    return clean;
  };
  const oi = feed('OI', m.oi, ['t', 'o', 'c']);
  const liq = feed('likvidációs', m.liq, ['t', 'l', 's']);

  return {
    symbol: m.symbol,
    volumeUnit: unit,
    byT: byT(rows),
    oiByT: byT(oi),
    oiNativeByT: byT(feed('natív OI', m.oiNative, ['t', 'o', 'c'])),
    fundingByT: byT(feed('funding', m.funding, ['t', 'c'])),
    predByT: byT(feed('predFunding', m.predFunding, ['t', 'c'])),
    liqByT: byT(liq),
    lsrByT: byT(feed('long/short', m.lsr, ['t', 'r'])),
    hasLiq: liq.length > 0,
    lastOI: oi.length ? oi[oi.length - 1].c : 0,
  };
};

// OI-val súlyozott átlag. Ha a piacok bármelyikéből hiányzik az érték, a teljes átlag null.
const oiWeighted = (markets, t, getter) => {
  if (!markets.length) return null;
  const vals = markets.map((m) => ({ v: getter(m), w: m.oiByT.get(t)?.c ?? 0 }));
  if (vals.some((x) => !isNum(x.v))) return null;
  const wSum = sumBy(vals, (x) => x.w);
  if (wSum > 0) return sumBy(vals, (x) => x.v * x.w) / wSum;
  return mean(vals.map((x) => x.v));
};

const aggregateAt = (t, perps, spots, feeds) => {
  const pm = perps.filter((m) => m.byT.has(t));
  const sm = spots.filter((m) => m.byT.has(t));
  const pRows = pm.map((m) => m.byT.get(t));
  const sRows = sm.map((m) => m.byT.get(t));
  const spotComplete = sm.length === spots.length;

  // dOI: piaconként a pozíciómennyiség (natív OI) változása, ami nem függ az ártól.
  // Az összesítés súlya a USD-OI. Ha egy OI-s piacnak hiányzik a pont, nincs dOI (null).
  let dSum = 0;
  let wSum = 0;
  let oiComplete = true;
  pm.filter((m) => m.oiByT.size > 0).forEach((m) => {
    const usd = m.oiByT.get(t);
    const nat = m.oiNativeByT.get(t);
    const natOk = !feeds.oiNative || (nat && nat.o > 0);
    if (!usd || !(usd.o > 0) || !natOk) {
      oiComplete = false;
      return;
    }
    const pct = feeds.oiNative ? (nat.c - nat.o) / nat.o : (usd.c - usd.o) / usd.o;
    dSum += usd.o * pct;
    wSum += usd.o;
  });
  const dOI = oiComplete && wSum > 0 ? dSum / wSum : null;

  // Likvidáció: csak akkor összegezünk, ha minden likvidációs adatos perpnek van pontja.
  const liqRows = pm.filter((m) => m.hasLiq).map((m) => m.liqByT.get(t));
  const liqComplete = liqRows.length > 0 && liqRows.every(Boolean);
  const liqL = liqComplete ? sumBy(liqRows, (r) => r.l) : null;
  const liqS = liqComplete ? sumBy(liqRows, (r) => r.s) : null;

  const perpVUsd = sumBy(pRows, (r) => r.vUsd);
  const perpDeltaUsd = sumBy(pRows, (r) => r.deltaUsd);

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
    perpDeltaUsd,
    perpVUsd,
    // Ha egy várt spot piacnak hiányzik a gyertyája, a spot értékek null (nem 0).
    spotDeltaUsd: spotComplete ? sumBy(sRows, (r) => r.deltaUsd) : null,
    spotVUsd: spotComplete ? sumBy(sRows, (r) => r.vUsd) : null,
    dOI,
    oiMarkets: perps.filter((m) => m.oiByT.has(t)).length,
    fundingMarkets: perps.filter((m) => m.fundingByT.has(t)).length,
    liqMarkets: perps.filter((m) => m.liqByT.has(t)).length,
    liqL,
    liqS,
    netLiqUsd: liqComplete ? liqS - liqL : null,
    liqRatio: liqComplete && perpVUsd > 0 ? (liqL + liqS) / perpVUsd : null,
    funding: oiWeighted(pm.filter((m) => m.fundingByT.size > 0), t, (m) => m.fundingByT.get(t)?.c),
    predFunding: oiWeighted(pm.filter((m) => m.predByT.size > 0), t, (m) => m.predByT.get(t)?.c),
    lsr: oiWeighted(pm.filter((m) => m.lsrByT.size > 0), t, (m) => m.lsrByT.get(t)?.r),
    sizeSkew: avgSell > 0 ? avgBuy / avgSell : null,
  };
};

// ---------- fő belépési pont ----------

// perps: [{ symbol, ohlcv, oi, oiNative, funding, predFunding, liq, lsr, volumeUnit? }]
// spots: [{ symbol, ohlcv, volumeUnit? }]
// now: az aktuális idő ms-ben; az ennél későbbi (még formálódó) gyertyák kimaradnak.
// Visszaad: { snapshots: MomentumSnapshot[], warnings: string[] }
export const computeMomentum = ({
  perps = [],
  spots = [],
  interval = '1hour',
  asset = 'SOL',
  config = {},
  now = Date.now(),
}) => {
  const cfg = {
    ...CONFIG,
    ...config,
    weights: { ...CONFIG.weights, ...config.weights },
    orderFlowMix: { ...CONFIG.orderFlowMix, ...config.orderFlowMix },
  };
  const warnings = [];
  const nowSec = now / 1000;
  const intervalSec = INTERVAL_SECONDS[interval] ?? 3600;
  const closed = (m) => ({ ...m, ohlcv: dropUnfinished(m.ohlcv, nowSec, intervalSec) });

  const P = perps
    .map((m) => prepareMarket(closed(m), cfg, warnings))
    .filter(Boolean)
    .sort((a, b) => b.lastOI - a.lastOI);
  const S = spots.map((m) => prepareMarket(closed(m), cfg, warnings)).filter(Boolean);

  if (!P.length) {
    warnings.push('Nincs használható perp piac');
    return { snapshots: [], warnings };
  }

  // Melyik forrás van egyáltalán konfigurálva (van belőle adat). Ha nincs, a tag kimarad.
  const feeds = {
    spot: S.length > 0,
    oi: P.some((m) => m.oiByT.size > 0),
    oiNative: P.some((m) => m.oiNativeByT.size > 0),
    funding: P.some((m) => m.fundingByT.size > 0),
    liq: P.some((m) => m.hasLiq),
  };
  if (!feeds.spot) warnings.push('Nincs spot adat: a spotLead 0-nak van véve');
  if (!feeds.oi) warnings.push('Nincs OI adat: a kvadráns NEUTRAL, a dOI kimarad');
  else if (!feeds.oiNative) warnings.push('Nincs natív OI adat: a kvadráns USD-OI-ból számolódik (ár-torzított)');
  if (!feeds.funding) warnings.push('Nincs funding adat: a crowding kimarad');
  if (!feeds.liq) warnings.push('Nincs likvidációs adat: a liqDamp kimarad');

  const timeline = [...new Set(P.flatMap((m) => [...m.byT.keys()]))].sort((a, b) => a - b);
  const agg = timeline.map((t) => aggregateAt(t, P, S, feeds));

  // kumulált sorozatok (az ablak elejétől); a hiányzó spot gyertya a spot CVD-t adott pontban null-ra teszi
  let cvdPerp = 0;
  let cvdSpot = 0;
  agg.forEach((a) => {
    cvdPerp += a.perpDeltaUsd;
    cvdSpot += a.spotDeltaUsd ?? 0;
    a.cvdPerp = cvdPerp;
    a.cvdSpot = a.spotDeltaUsd === null ? null : cvdSpot;
    a.cvdComb = cvdPerp + cvdSpot;
    a.deltaComb = a.spotDeltaUsd === null ? null : a.perpDeltaUsd + a.spotDeltaUsd;
    const v = a.perpVUsd + (a.spotVUsd ?? 0);
    a.deltaPct = a.deltaComb === null ? null : v > 0 ? a.deltaComb / v : 0;
    a.movePct = a.price.o > 0 ? (a.price.c - a.price.o) / a.price.o : 0;
  });

  const N = cfg.divWindow;
  const slopeNorm = agg.map((_, i) => {
    if (i < 2) return 0;
    const win = agg.slice(Math.max(0, i - N + 1), i + 1);
    if (win.some((a) => a.deltaComb === null)) return null;
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
  const zn = (z) => (isNum(z) ? zc(z) : null);

  const snapshots = agg.map((a, i) => {
    const dWin = agg.slice(Math.max(0, i - N + 1), i + 1);
    const zWin = agg.slice(Math.max(0, i - Z + 1), i + 1);
    // abszorpció: a medián a vizsgált gyertya nélkül, csak korábbi gyertyákból
    const prevWin = agg.slice(Math.max(0, i - N), i);

    const div =
      dWin.length >= cfg.divMinWindow && dWin.every((x) => x.deltaComb !== null)
        ? detectDivergence(
            dWin.map((x) => x.price.c),
            dWin.map((x) => x.cvdComb),
            dWin.map((x) => x.deltaComb),
            cfg
          )
        : { divergence: null };

    const oiQuadrant = isNum(a.dOI)
      ? getOIQuadrant(
          a.movePct,
          a.dOI,
          cfg.deadband * std(zWin.map((x) => x.movePct)),
          cfg.deadband * std(zWin.map((x) => x.dOI).filter(isNum))
        )
      : 'NEUTRAL';

    const spotLead = !feeds.spot
      ? 0
      : isNum(a.spotDeltaUsd) && isNum(spotZ[i])
        ? zc(spotZ[i]) - zc(perpZ[i])
        : null;

    // Hiányzó, de konfigurált forrás: a pontszám érvénytelen.
    const missing = [];
    if (spotLead === null) missing.push('spot');
    if (!isNum(deltaPctZ[i])) missing.push('delta');
    if (!isNum(slopeZ[i])) missing.push('CVD meredekség');
    if (feeds.oi && !isNum(a.dOI)) missing.push('OI');
    if (feeds.funding && !isNum(fundingZ[i])) missing.push('funding');
    if (feeds.liq && !isNum(liqZ[i])) missing.push('likvidáció');

    const scoreInput = {
      deltaPctZ: zn(deltaPctZ[i]),
      cvdSlopeZ: zn(slopeZ[i]),
      oiQuadrant,
      dOIZ: zn(dOIZ[i]),
      spotLead,
      liqZ: liqZ[i] ?? null,
      fundingZ: zn(fundingZ[i]),
    };
    const score =
      missing.length === 0
        ? calculateMomentumScore(scoreInput, cfg)
        : { momentum: null, label: 'INVALID', raw: null, orderFlow: null, oiSignal: null, liqDamp: null };

    const snapWarnings = [...warnings];
    if (i < Z - 1) snapWarnings.push(`z-score ablak nincs betelve (${i + 1}/${Z})`);
    if (missing.length) snapWarnings.push(`hiányzó adat: ${missing.join(', ')}, a momentum nem értelmezhető`);

    return {
      asset,
      interval,
      t: a.t,
      price: a.price.c,
      volumeUnit: P[0].volumeUnit,
      momentum: score.momentum,
      label: score.label,
      valid: missing.length === 0,
      missing,
      components: {
        deltaPct: a.deltaPct,
        cvdPerp: a.cvdPerp,
        cvdSpot: a.cvdSpot,
        cvdSlopeZ: zn(slopeZ[i]),
        divergence: div.divergence,
        absorption:
          prevWin.length >= cfg.absorptionWarmup &&
          detectAbsorption(deltaPctZ[i] ?? 0, a.movePct, prevWin.map((x) => x.movePct), cfg.absorptionZ),
        oiQuadrant,
        dOIPct: a.dOI,
        netLiqUsd: a.netLiqUsd,
        liqZ: liqZ[i],
        fundingZ: zn(fundingZ[i]),
        predFundingZ: zn(predZ[i]),
        lsrZ: zn(lsrZ[i]),
        spotLead,
        sizeSkew: a.sizeSkew,
      },
      coverage: {
        perpExpected: P.length,
        spotExpected: S.length,
        perpMarkets: a.perpMarkets,
        spotMarkets: a.spotMarkets,
        oiMarkets: a.oiMarkets,
        fundingMarkets: a.fundingMarkets,
        liqMarkets: a.liqMarkets,
        complete:
          a.perpMarkets === P.length &&
          a.spotMarkets === S.length &&
          (!feeds.oi || a.oiMarkets === P.length) &&
          (!feeds.funding || a.fundingMarkets === P.length) &&
          (!feeds.liq || a.liqMarkets === P.length),
      },
      warnings: snapWarnings,
      // köztes értékek a magyarázó nézethez
      debug: {
        scoreInput,
        score,
        weights: cfg.weights,
        orderFlowMix: cfg.orderFlowMix,
        missing,
        spot: {
          spotDeltaUsd: a.spotDeltaUsd,
          perpDeltaUsd: a.perpDeltaUsd,
          perpVUsd: a.perpVUsd,
          spotVUsd: a.spotVUsd,
          spotZ: zn(spotZ[i]),
          perpZ: zn(perpZ[i]),
        },
      },
    };
  });

  return { snapshots, warnings };
};
