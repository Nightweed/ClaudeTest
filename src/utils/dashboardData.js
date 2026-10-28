import { calculateDelta, calculateDeltaPct, calculateCVD, byT } from './momentum';
import { num, sgn, tone } from './format';

// Idő szerint összefűzi a forrásokat egy táblázatsorrá (legújabb elöl).
export const buildRows = (d, snapshots = []) => {
  const snapByT = new Map(snapshots.map((s) => [s.t, s]));
  const oi = byT(d.oi);
  const funding = byT(d.funding);
  const liq = byT(d.liq);
  const lsr = byT(d.lsr);

  const deltas = (d.ohlcv || []).map((c) => calculateDelta(c.bv, c.v));
  const cvd = calculateCVD(deltas);

  return (d.ohlcv || [])
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

export const LABELS = {
  STRONG_BULL: { name: 'Erős emelkedés', tone: 'pos' },
  BULL: { name: 'Emelkedés', tone: 'pos' },
  NEUTRAL: { name: 'Semleges', tone: 'neutral' },
  BEAR: { name: 'Esés', tone: 'neg' },
  STRONG_BEAR: { name: 'Erős esés', tone: 'neg' },
};

export const WATERFALL_LABELS = {
  orderFlow: 'Order flow',
  oi: 'Open interest',
  spot: 'Spot lead',
  liq: 'Likvidáció',
  crowding: 'Crowding',
};

export const verdictText = (snap, quadrantText) => {
  const { orderFlow } = snap.debug.score;
  const flow = orderFlow < 0 ? 'Az eladói agresszió dominál' : 'A vevői agresszió dominál';
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
    text: c.absorption ? 'Abszorpció: nagy agresszió, de az ár alig mozdul.' : 'Az ár és a CVD iránya nem mond ellent egymásnak, abszorpció sincs.',
  });
  list.push({
    tone: c.liqZ > 2 ? 'neg' : 'neutral',
    title: `Likvidáció z ${sgn(c.liqZ)}`,
    text: c.liqZ > 2 ? 'Kényszerített flow: a pontszám felére csökken.' : 'Nincs extrém kényszerzárás, a mozgás organikus.',
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
