// Az utolsó gyertyák nyers Coinalyze mezői és a két kártya értékeinek összevetése. Futtatás:
//   npx sucrase-node scripts/check-last-candle.js
// Csak olvas (a kulcsot a .env-ből, nem írja ki). Perp + spot OHLCV, ~6 óra.
import fs from 'fs';
import { computeMomentum, dropUnfinished, processCandles } from '../src/utils/momentum';

const PERP = 'SOLUSDT_PERP.A';
const SPOTS = ['SOLUSD.A', 'SOLUSDC.A', 'SOLUSDT.F'];
const BASE = 'https://api.coinalyze.net/v1';
const key = (fs.readFileSync('.env', 'utf8').match(/REACT_APP_COINALYZE_API_KEY=(.*)/) || [])[1]?.trim();
if (!key) throw new Error('Hiányzik a REACT_APP_COINALYZE_API_KEY a .env-ből');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ohlcv = async (symbol, hours = 60) => {
  const to = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({ symbols: symbol, interval: '1hour', from: String(to - hours * 3600), to: String(to) });
  const res = await fetch(`${BASE}/ohlcv-history?${params}`, { headers: { api_key: key } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  await sleep(1600);
  return (await res.json())[0]?.history || [];
};
const fmt = (t) => new Date(t * 1000).toLocaleString('hu-HU');
const n = (x, d = 2) => Number(x).toLocaleString('hu-HU', { maximumFractionDigits: d });

(async () => {
  const perp = await ohlcv(PERP);
  const spots = [];
  for (const s of SPOTS) spots.push({ symbol: s, ohlcv: await ohlcv(s) });
  const nowSec = Date.now() / 1000;
  console.log(`Most: ${fmt(nowSec)} | nyers perp gyertya: ${perp.length}, utolsó t: ${fmt(perp[perp.length - 1].t)}`);

  console.log('\nPerp, utolsó 3 nyers gyertya (a formálódó jelölve):');
  processCandles(perp.slice(-3)).forEach((c) => {
    const open = c.t + 3600 > nowSec;
    console.log(
      `${fmt(c.t)}${open ? ' [FORMÁLÓDÓ]' : ' [lezárt]  '} v=${n(c.v)} bv=${n(c.bv)} sell=${n(c.sellVol)} ` +
        `delta=${n(c.delta)} SOL, c=${n(c.c, 3)}, deltaUsd=${n(c.deltaUsd, 0)} USD`
    );
  });

  const closed = dropUnfinished(perp, nowSec, 3600);
  const { snapshots } = computeMomentum({ perps: [{ symbol: PERP, ohlcv: perp }], spots });
  const s = snapshots[snapshots.length - 1];
  console.log('\nSnapshot (USD-kártya forrása):');
  console.log(`  t=${fmt(s.t)} perpDeltaUsd=${n(s.debug.spot.perpDeltaUsd, 0)} spotDeltaUsd=${n(s.debug.spot.spotDeltaUsd, 0)}`);
  console.log(`  utolsó lezárt nyers gyertya t=${fmt(closed[closed.length - 1].t)}, nyers utolsó t=${fmt(perp[perp.length - 1].t)}`);
  console.log(s.t === perp[perp.length - 1].t ? 'EGYEZIK: nincs formálódó gyertya a nyers adatban' : 'ELTÉR: a nyers sorozat egy formálódó gyertyával hosszabb a snapshotnál');
})().catch((e) => { console.error('Hiba:', e.message); process.exit(1); });
