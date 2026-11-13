// Historikus kiértékelés valós Coinalyze-adaton. Futtatás:
//   npx sucrase-node scripts/backtest.js [órák száma, alap 1500] [költség bps, alap 10]
// Az API-kulcsot a .env-ből olvassa (nem írja ki). Csak olvas, semmit nem módosít.
import fs from 'fs';
import { computeMomentum } from '../src/utils/momentum';
import { runBacktest, correlationMatrix, informationCoefficient } from '../src/utils/backtest';

const PERP = 'SOLUSDT_PERP.A';
const SPOTS = ['SOLUSD.A', 'SOLUSDC.A', 'SOLUSDT.F'];
const HOURS = Number(process.argv[2]) || 1500;
const COST_BPS = Number(process.argv[3]) || 10;
const BASE = 'https://api.coinalyze.net/v1';

const key = (fs.readFileSync('.env', 'utf8').match(/REACT_APP_COINALYZE_API_KEY=(.*)/) || [])[1]?.trim();
if (!key) throw new Error('Hiányzik a REACT_APP_COINALYZE_API_KEY a .env-ből');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (path, retries = 3) => {
  const res = await fetch(`${BASE}/${path}`, { headers: { api_key: key } });
  if (res.status === 429 && retries > 0) {
    await sleep((Number(res.headers.get('Retry-After')) || 5) * 1000);
    return get(path, retries - 1);
  }
  if (!res.ok) throw new Error(`API ${res.status} (${path.split('?')[0]})`);
  return res.json();
};
const hist = async (endpoint, symbol, extra = {}) => {
  const to = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({ symbols: symbol, interval: '1hour', from: String(to - HOURS * 3600), to: String(to), ...extra });
  const json = await get(`${endpoint}?${params}`);
  await sleep(1600); // 40/perc alatt maradunk
  return json[0]?.history || [];
};

const pct = (x) => (x === null || x === undefined ? '   -  ' : `${(x * 100).toFixed(2)}%`.padStart(7));
const num = (x) => (x === null || x === undefined ? '  -  ' : x.toFixed(2).padStart(6));

(async () => {
  console.log(`Lekérés: ${PERP} + ${SPOTS.length} spot, ${HOURS} óra`);
  const units = {};
  (await get('future-markets')).forEach((m) => {
    if (m.symbol === PERP) units[PERP] = String(m.oi_lq_vol_denominated_in).toUpperCase() === 'QUOTE_ASSET' ? 'USD' : 'BASE';
  });
  const perp = {
    symbol: PERP,
    volumeUnit: units[PERP],
    ohlcv: await hist('ohlcv-history', PERP),
    oi: await hist('open-interest-history', PERP, { convert_to_usd: 'true' }),
    oiNative: await hist('open-interest-history', PERP, { convert_to_usd: 'false' }),
    funding: await hist('funding-rate-history', PERP),
    liq: await hist('liquidation-history', PERP, { convert_to_usd: 'true' }),
    lsr: await hist('long-short-ratio-history', PERP),
  };
  const spots = [];
  for (const s of SPOTS) spots.push({ symbol: s, ohlcv: await hist('ohlcv-history', s) });
  console.log(`Kapott gyertya: perp ${perp.ohlcv.length}, spot ${spots.map((s) => s.ohlcv.length).join('/')}`);

  const { snapshots, warnings } = computeMomentum({ perps: [perp], spots });
  const valid = snapshots.filter((s) => s.valid);
  const full = valid.filter((s) => !s.warnings.some((w) => w.startsWith('z-score ablak')));
  console.log(`Snapshot: ${snapshots.length}, érvényes: ${valid.length}, bemelegedés után: ${full.length}`);
  [...new Set(warnings)].forEach((w) => console.log(`  figyelmeztetés: ${w}`));

  // a z-ablak bemelegedése előtti pontok kimaradnak, hogy ne torzítsák az eredményt
  const sample = full;
  const res = runBacktest(sample, { costBps: COST_BPS });
  console.log(`\nKöltség: ${COST_BPS} bps oda-vissza, funding NINCS beszámítva (ráta egysége nincs megerősítve)\n`);
  Object.entries(res.horizons).forEach(([h, r]) => {
    console.log(`== ${h} órás előretekintés ==`);
    console.log('csoport      n   találat  átl.nettó  medián   átl.MFE  átl.MAE  legrosszabb MAE');
    const line = (name, s) =>
      console.log(`${name.padEnd(11)}${String(s.n).padStart(4)}  ${pct(s.hitRate)}  ${pct(s.meanNet)}  ${pct(s.medianNet)}  ${pct(s.meanMfe)}  ${pct(s.meanMae)}  ${pct(s.worstMae)}`);
    line('összes', r.all);
    line('long', r.long);
    line('short', r.short);
    Object.entries(r.byLabel).forEach(([l, s]) => line(l, s));
    console.log(`alapvonal (minden gyertyán long): n=${r.baselineLong.n}, találat ${pct(r.baselineLong.hitRate)}, átl. nettó ${pct(r.baselineLong.meanNet)}\n`);
  });

  console.log('Információs együttható (korreláció az előre hozammal):');
  [1, 3, 6, 12].forEach((h) => {
    const ic = informationCoefficient(sample, h);
    console.log(`  ${String(h).padStart(2)}h: ` + Object.entries(ic).map(([k, v]) => `${k} ${num(v)}`).join(' | '));
  });

  console.log('\nTagok közti korreláció (dupla beszámítás):');
  const m = correlationMatrix(sample);
  const ks = Object.keys(m);
  console.log(''.padEnd(11) + ks.map((k) => k.slice(0, 9).padStart(10)).join(''));
  ks.forEach((a) => console.log(a.padEnd(11) + ks.map((b) => num(m[a][b]).padStart(10)).join('')));

  const labels = {};
  sample.forEach((s) => { labels[s.label] = (labels[s.label] || 0) + 1; });
  console.log('\nCímkék eloszlása:', labels);
})().catch((e) => { console.error('Hiba:', e.message); process.exit(1); });
