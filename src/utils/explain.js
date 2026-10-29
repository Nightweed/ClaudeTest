// Az utolsó gyertya számításának lépésenkénti, magyarázott felbontása a táblázathoz.
// Csak megjelenítési segéd: a számokat a momentum.js adja.
import { QUADRANT_SCORE, calculateDeltaPct } from './momentum';

const f = (x, d = 3) => (typeof x === 'number' && !Number.isNaN(x) ? Number(x.toFixed(d)).toLocaleString('hu-HU', { maximumFractionDigits: d }) : '–');
const pct = (x, d = 3) => (typeof x === 'number' && Number.isFinite(x) ? `${f(x * 100, d)}%` : '–');

const QUADRANT_TEXT = {
  NEW_LONGS: 'ár fel + OI fel: új long pozíciók nyílnak (erős emelkedés)',
  SHORT_COVERING: 'ár fel + OI le: short fedezés (gyengébb emelkedés)',
  NEW_SHORTS: 'ár le + OI fel: új short pozíciók nyílnak (erős esés)',
  LONG_LIQUIDATION: 'ár le + OI le: long pozíciók zárnak (gyengébb esés)',
  NEUTRAL: 'a változás a holtsávon belül van, nincs jel',
};

// candle: nyers OHLCV gyertya, oi: nyers OI pont ugyanarra az időre, snap: computeMomentum snapshotja
export const buildExplanation = (snap, candle, oi) => {
  const c = snap.components;
  const { scoreInput: si, score, weights: w, orderFlowMix: mix, spot, missing } = snap.debug;
  const unit = snap.volumeUnit === 'USD' ? 'USD' : snap.asset;
  const sellVol = candle.v - candle.bv;
  const delta = 2 * candle.bv - candle.v;
  const dPrice = candle.o > 0 ? (candle.c - candle.o) / candle.o : 0;
  // Csillapítás csak az order-flow tagra; hiányzó adatnál nincs érvényes alap (NaN -> '–').
  const valid = snap.valid;
  const base = valid
    ? w.w1 * score.liqDamp * score.orderFlow + w.w2 * score.oiSignal * 3 + w.w3 * si.spotLead
    : NaN;
  const coverage = snap.coverage;

  return [
    { group: 'Nyers adat', name: 'Idő', formula: '', values: '', result: new Date(snap.t * 1000).toLocaleString('hu-HU'), text: 'Az utolsó lezárt gyertya, erre számolunk. A formálódó gyertya nem számít bele.' },
    { group: 'Nyers adat', name: 'Gyertya (o / c)', formula: '', values: '', result: `${f(candle.o)} → ${f(candle.c)}`, text: 'Nyitó és záró ár.' },
    { group: 'Nyers adat', name: 'Volumen (v)', formula: '', values: '', result: `${f(candle.v, 2)} ${unit}`, text: 'Teljes forgalom a gyertyában.' },
    { group: 'Nyers adat', name: 'Vételi volumen (bv)', formula: '', values: '', result: `${f(candle.bv, 2)} ${unit}`, text: 'Az agresszív (piaci) vételek volumene.' },
    { group: 'Nyers adat', name: 'Kötések (tx / btx)', formula: '', values: '', result: `${candle.tx} / ${candle.btx}`, text: 'Összes kötésszám / ebből vételi.' },
    { group: 'Nyers adat', name: 'Open interest (o → c)', formula: '', values: '', result: oi ? `${f(oi.o, 0)} → ${f(oi.c, 0)} USD` : '–', text: 'Nyitott pozíciók értéke USD-ben a gyertya elején és végén.' },

    { group: 'Order flow', name: 'Eladási volumen', formula: 'v − bv', values: `${f(candle.v, 2)} − ${f(candle.bv, 2)}`, result: f(sellVol, 2), text: 'Ami nem vételi, az agresszív eladás.' },
    { group: 'Order flow', name: 'Delta', formula: '2·bv − v', values: `2·${f(candle.bv, 2)} − ${f(candle.v, 2)}`, result: f(delta, 2), text: 'Vételi mínusz eladási agresszió. Pozitív: a vevők nyomnak.' },
    { group: 'Order flow', name: 'Delta % (perp)', formula: 'delta / v', values: `${f(delta, 2)} / ${f(candle.v, 2)}`, result: pct(calculateDeltaPct(delta, candle.v), 2), text: `Csak a perp piac, ${unit}-ban (ez szerepel a táblázat Delta % oszlopában).` },
    { group: 'Order flow', name: 'Delta % (kombinált)', formula: '(perp + spot delta USD) / (perp + spot volumen USD)', values: `(${f(spot.perpDeltaUsd, 0)} + ${f(spot.spotDeltaUsd, 0)}) / (${f(spot.perpVUsd, 0)} + ${f(spot.spotVUsd, 0)})`, result: pct(c.deltaPct, 2), text: 'Ebből készül a z-score, ezért térhet el a perp értéktől.' },
    { group: 'Order flow', name: 'Delta z-score', formula: '(kombinált Delta % − átlag) / szórás, 50 gyertya', values: '', result: f(si.deltaPctZ, 2), text: 'Az utolsó kombinált delta % mennyire szokatlan az elmúlt 50 gyertyához képest (−3…+3).' },
    { group: 'Order flow', name: 'CVD (perp, USD)', formula: 'Σ delta · ár, az ablak elejétől', values: '', result: f(c.cvdPerp, 0), text: 'Kumulált vételi/eladási nyomás. Emelkedő CVD: tartós vásárlói dominancia.' },
    { group: 'Order flow', name: 'CVD meredekség z', formula: 'regresszió meredekség / átl. |delta|, majd z', values: '', result: f(si.cvdSlopeZ, 2), text: 'A CVD trendje az utolsó 20 gyertyán, normalizálva. Pozitív: a CVD emelkedik.' },
    { group: 'Order flow', name: 'Méret-ferdeség', formula: 'átl. vételi méret / átl. eladási méret', values: '', result: f(c.sizeSkew, 2), text: '>1: a vételi oldalon nagyobbak a kötések (nagyobb szereplők vesznek).' },

    { group: 'Divergencia', name: 'Ár vs CVD divergencia', formula: 'sign(ár meredekség) ≠ sign(CVD meredekség), holtsávval', values: '', result: c.divergence || 'nincs', text: 'BULLISH: az ár esik, de a CVD emelkedik. BEARISH: az ár emelkedik, de a CVD esik. A holtsávon belüli meredekség nem ad irányt.' },
    { group: 'Divergencia', name: 'Abszorpció', formula: '|delta z| > 2 és kicsi ármozgás, legalább 20 korábbi gyertya', values: '', result: c.absorption ? 'igen' : 'nem', text: 'Nagy agresszió, de az ár alig mozdul: valaki felszívja az ordereket.' },

    { group: 'Open interest', name: 'Ármozgás', formula: '(c − o) / o', values: `(${f(candle.c)} − ${f(candle.o)}) / ${f(candle.o)}`, result: pct(dPrice), text: 'A gyertya ármozgása.' },
    { group: 'Open interest', name: 'OI változás', formula: 'súlyozott Σ (natív OI.c − natív OI.o) / natív OI.o', values: '', result: pct(c.dOIPct), text: 'A pozíciómennyiség változása piacok szerint, USD-OI súllyal. Az árfolyam nem torzítja.' },
    { group: 'Open interest', name: 'Kvadráns', formula: 'ár iránya × OI iránya (holtsávval)', values: '', result: c.oiQuadrant, text: QUADRANT_TEXT[c.oiQuadrant] },
    { group: 'Open interest', name: 'OI jel (oiSignal)', formula: 'kvadráns pont · min(|z(dOI)|, 3) / 3', values: `${QUADRANT_SCORE[c.oiQuadrant]} · min(|${f(si.dOIZ, 2)}|, 3) / 3`, result: f(score.oiSignal, 3), text: 'NEW_LONGS +1, SHORT_COVERING +0,5, NEW_SHORTS −1, LONG_LIQ −0,5, szorozva az OI-változás szokatlanságával.' },

    { group: 'Likvidáció / funding', name: 'Likvidáció z', formula: 'z((long+short likvidáció) / perp forgalom USD)', values: '', result: f(c.liqZ, 2), text: '>2: kényszerített flow, az order-flow tag felére csökken.' },
    { group: 'Likvidáció / funding', name: 'Funding z', formula: 'z(funding)', values: '', result: f(c.fundingZ, 2), text: 'Zsúfoltság: erősen pozitív = túl sok long (nem irányjel).' },
    { group: 'Spot', name: 'Piacok (perp / spot)', formula: '', values: '', result: `${coverage.perpMarkets}/${coverage.perpExpected} · ${coverage.spotMarkets}/${coverage.spotExpected}`, text: 'Hány piac adott gyertyát ennél az időpontnál a várt piacokból.' },
    { group: 'Spot', name: 'Adatforrások', formula: '', values: '', result: `OI ${coverage.oiMarkets} · funding ${coverage.fundingMarkets} · likvidáció ${coverage.liqMarkets}`, text: `Hány perp piachoz érkezett ténylegesen adat. Teljes: ${coverage.complete ? 'igen' : 'nem'}.` },
    { group: 'Spot', name: 'Spot delta (USD)', formula: 'Σ (2·bv − v) · ár, spot piacokon', values: '', result: f(spot.spotDeltaUsd, 0), text: 'Az összes spot piac vételi mínusz eladási agressziója USD-ben.' },
    { group: 'Spot', name: 'Perp delta (USD)', formula: 'Σ (2·bv − v) · ár, perp piacokon', values: '', result: f(spot.perpDeltaUsd, 0), text: 'Ugyanez a perp piacokon.' },
    { group: 'Spot', name: 'Spot CVD (USD)', formula: 'Σ spot delta, az ablak elejétől', values: '', result: f(c.cvdSpot, 0), text: 'Kumulált spot vételi/eladási nyomás.' },
    { group: 'Spot', name: 'Spot lead', formula: 'z(spot delta) − z(perp delta)', values: `${f(spot.spotZ, 2)} − ${f(spot.perpZ, 2)}`, result: f(c.spotLead, 2), text: '>+1: a spot vezeti a mozgást (egészségesebb). <−1: a tőkeáttétel vezeti.' },

    { group: 'Kompozit', name: 'Order flow pontszám', formula: `${mix.deltaPct}·deltaZ + ${mix.cvdSlope}·cvdSlopeZ`, values: `${mix.deltaPct}·${f(si.deltaPctZ, 2)} + ${mix.cvdSlope}·${f(si.cvdSlopeZ, 2)}`, result: f(score.orderFlow, 3), text: 'Az order flow két összetevőjének súlyozott összege.' },
    { group: 'Kompozit', name: 'Likvidációs csillapítás', formula: 'liqZ > 2 ? 0,5 : 1 (csak az order-flow tagra)', values: `liqZ = ${f(si.liqZ, 2)}`, result: f(score.liqDamp, 2), text: 'Kényszerített mozgásnál az order-flow tagot felére vesszük. Az OI és a spot tag érintetlen.' },
    { group: 'Kompozit', name: 'Alap pontszám', formula: `${w.w1}·csillapítás·orderFlow + ${w.w2}·oiSignal·3 + ${w.w3}·spotLead`, values: valid ? `${w.w1}·${f(score.liqDamp, 2)}·${f(score.orderFlow, 2)} + ${w.w2}·${f(score.oiSignal, 2)}·3 + ${w.w3}·${f(si.spotLead, 2)}` : '', result: f(base, 3), text: 'A súlyok kezdő feltételezések, a CONFIG-ban hangolhatók.' },
    { group: 'Kompozit', name: 'Crowding levonás', formula: `${w.w4} · irány · max(0, fundingZ · irány − 1)`, values: valid ? `${w.w4} · ${Math.sign(base)} · max(0, ${f(si.fundingZ, 2)} · ${Math.sign(base)} − 1)` : '', result: f(base - score.raw, 3), text: 'Ha a funding ugyanabba az irányba túlzsúfolt, csökkenti a pontszámot.' },
    { group: 'Kompozit', name: 'Nyers pontszám', formula: 'alap − crowding', values: valid ? `${f(base, 3)} − ${f(base - score.raw, 3)}` : '', result: f(score.raw, 3), text: '' },
    { group: 'Kompozit', name: 'MOMENTUM', formula: 'clamp(nyers / 3, −1, +1)', values: valid ? `${f(score.raw, 3)} / 3` : '', result: valid ? `${f(snap.momentum, 3)} → ${snap.label}` : `érvénytelen (hiányzó adat: ${missing.join(', ')})`, text: valid ? '>0,5 erős bull · 0,2…0,5 bull · ±0,2 semleges · −0,5…−0,2 bear · <−0,5 erős bear' : 'Hiányzó forrás esetén nem számolunk pontszámot, nullát sem adunk helyette.' },
  ];
};
