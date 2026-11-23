import { calculateDelta, calculateDeltaPct, calculateCVD, byT, dropUnfinished, INTERVAL_SECONDS } from './momentum';
import { num, sgn, tone } from './format';

// Idő szerint összefűzi a forrásokat egy táblázatsorrá (legújabb elöl).
// Csak lezárt gyertyák kerülnek bele (ugyanaz a szűrés, mint a computeMomentum-ban), így a sorok és a
// snapshotok ugyanazon az utolsó időponton végződnek; a formálódó gyertya részleges delta-t mutatna.
export const buildRows = (d, snapshots = [], { interval = '1hour', now = Date.now() } = {}) => {
  const candles = dropUnfinished(d.ohlcv || [], now / 1000, INTERVAL_SECONDS[interval] ?? 3600);
  const snapByT = new Map(snapshots.map((s) => [s.t, s]));
  const oi = byT(d.oi);
  const funding = byT(d.funding);
  const liq = byT(d.liq);
  const lsr = byT(d.lsr);

  const deltas = candles.map((c) => calculateDelta(c.bv, c.v));
  const cvd = calculateCVD(deltas);

  return candles
    .map((c, i) => ({
      t: c.t,
      time: new Date(c.t * 1000).toLocaleString('hu-HU'),
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
      volume: c.v,
      buyVol: c.bv,
      tx: c.tx,
      buyTx: c.btx,
      delta: deltas[i],
      deltaPct: calculateDeltaPct(deltas[i], c.v),
      cvd: cvd[i],
      oiOpen: oi.get(c.t)?.o,
      oiClose: oi.get(c.t)?.c,
      fundingClose: funding.get(c.t)?.c,
      liqLong: liq.get(c.t)?.l,
      liqShort: liq.get(c.t)?.s,
      lsRatio: lsr.get(c.t)?.r,
      lsLong: lsr.get(c.t)?.l,
      lsShort: lsr.get(c.t)?.s,
      spotDeltaUsd: snapByT.get(c.t)?.debug.spot.spotDeltaUsd,
      spotCvd: snapByT.get(c.t)?.components.cvdSpot,
      spotLead: snapByT.get(c.t)?.components.spotLead,
    }))
    .reverse();
};

// A volumen egysége: a snapshot szerinti USD, különben a bázis asset (pl. SOL).
export const volumeLabel = (snap) => (snap?.volumeUnit === 'USD' ? 'USD' : snap?.asset ?? 'SOL');

export const LABELS = {
  STRONG_BULL: { name: 'Erős emelkedés', tone: 'pos' },
  BULL: { name: 'Emelkedés', tone: 'pos' },
  NEUTRAL: { name: 'Semleges', tone: 'neutral' },
  BEAR: { name: 'Esés', tone: 'neg' },
  STRONG_BEAR: { name: 'Erős esés', tone: 'neg' },
  INVALID: { name: 'Hiányzó adat', tone: 'neutral' },
};

export const WATERFALL_LABELS = {
  orderFlow: 'Order flow',
  oi: 'Open interest',
  spot: 'Spot lead',
  liq: 'Likvidációs csillapítás',
  crowding: 'Crowding',
};

export const verdictText = (snap, quadrantText) => {
  if (snap.momentum === null) return `Hiányzó adat (${snap.missing.join(', ')}) miatt nincs értelmezhető jel.`;
  // A nyers irányt a kombinált (perp+spot) delta előjele adja; az orderFlow z-score keverék (relatív a
  // saját átlagához), ezért előjele ellentmondhat a nyers iránynak.
  const { orderFlow } = snap.debug.score;
  const dp = snap.components.deltaPct;
  const buyers = dp > 0;
  let flow = dp === 0 || !Number.isFinite(dp)
    ? 'A vételi és eladási agresszió kiegyenlített'
    : `A kombinált (perp+spot) delta ${buyers ? 'vevői' : 'eladói'} oldalon áll`;
  if (Number.isFinite(dp) && dp !== 0 && Math.sign(orderFlow) === -Math.sign(dp)) {
    flow += `, de a szokásos szinthez képest ${buyers ? 'gyengébb' : 'erősebb'} (az order-flow tag ${buyers ? 'negatív' : 'pozitív'})`;
  }
  return `${flow}. ${quadrantText ? quadrantText.charAt(0).toUpperCase() + quadrantText.slice(1) : ''}.`;
};

// Az utolsó gyertya jelzései a snapshot valós értékeiből.
export const buildSignals = (snap) => {
  const c = snap.components;
  const si = snap.debug.scoreInput;
  const list = [];
  list.push({
    tone: tone(si.spotLead),
    title: `Spot lead ${sgn(c.spotLead)}`,
    text: c.spotLead < -1 ? 'A tőkeáttétel vezeti a mozgást, a spot elmarad.' : c.spotLead > 1 ? 'A spot vezeti a mozgást, ez egészségesebb.' : 'Egyik piac sem vezet egyértelműen (−1…+1 között).',
  });
  list.push({
    tone: c.divergence ? 'neg' : 'neutral',
    title: c.divergence ? `Divergencia: ${c.divergence}` : 'Nincs divergencia',
    text: c.absorption ? `${c.absorptionSide === 'BUY' ? 'Vételi' : 'Eladási'} abszorpció: nagy agresszió, de az ár alig mozdul (megfigyelés, nem fordulójel).` : 'Az ár és a CVD iránya nem mond ellent egymásnak, abszorpció sincs.',
  });
  list.push({
    tone: c.liqZ > 2 ? 'neg' : 'neutral',
    title: `Likvidáció z ${sgn(c.liqZ)}`,
    text: c.liqZ > 2 ? `Kényszerített flow${c.liqDirection === 'LONG' ? ' (long likvidáció dominál)' : c.liqDirection === 'SHORT' ? ' (short likvidáció dominál)' : ''}: az order-flow tag felére csökken.` : 'Nincs extrém kényszerzárás, a mozgás organikus.',
  });
  list.push({
    tone: 'neutral',
    title: `Funding z ${sgn(c.fundingZ)}`,
    text: Math.abs(c.fundingZ) > 1 ? 'Zsúfolt pozícionálás, ez levonást okozhat a pontszámból.' : 'Nincs zsúfoltság, nem vonunk le a pontszámból.',
  });
  if (c.sizeSkew != null) {
    list.push({
      tone: tone(c.sizeSkew - 1),
      title: `Méret-ferdeség ${num(c.sizeSkew, 2)}`,
      text: c.sizeSkew > 1 ? 'A vételi oldalon nagyobbak a kötések.' : 'Az eladási oldalon nagyobbak a kötések.',
    });
  }
  return list;
};

// A magyarázat sorait csoportonként fogja össze, a megjelenési sorrendet megtartva.
export const groupExplanation = (explanation) =>
  explanation.reduce((acc, r) => {
    const g = acc[acc.length - 1];
    if (g && g.name === r.group) g.rows.push(r);
    else acc.push({ name: r.group, rows: [r] });
    return acc;
  }, []);
