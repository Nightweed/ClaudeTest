import React, { useState } from 'react';
import {
  fetchOHLCVHistory,
  fetchOpenInterestHistory,
  fetchFundingRateHistory,
  fetchLiquidationHistory,
  fetchLongShortRatioHistory,
} from '../services/dataFetcher';
import { calculateDelta, calculateDeltaPct, calculateCVD, computeMomentum } from '../utils/momentum';
import { buildExplanation } from '../utils/explain';
import './Dashboard.css';

const DEFAULT_SYMBOL = 'SOLUSDT_PERP.A'; // Binance SOL perp
const DEFAULT_SPOTS = 'SOLUSD.A,SOLUSDC.A,SOLUSDT.F'; // Binance SOL/USDT, SOL/USDC + SOL/USDT (F) spot, vesszővel elválasztva
const INTERVALS = ['5min', '15min', '1hour'];

const SOURCES = [
  { key: 'ohlcv', name: 'OHLCV', fetch: fetchOHLCVHistory },
  { key: 'oi', name: 'Open interest', fetch: fetchOpenInterestHistory },
  { key: 'funding', name: 'Funding', fetch: fetchFundingRateHistory },
  { key: 'liq', name: 'Likvidáció', fetch: fetchLiquidationHistory },
  { key: 'lsr', name: 'Long/short ratio', fetch: fetchLongShortRatioHistory },
];

const byT = (rows = []) => new Map(rows.map((r) => [r.t, r]));

// Idő szerint összefűzi a forrásokat egy táblázatsorrá (legújabb elöl).
const buildRows = (d, snapshots = []) => {
  const snapByT = new Map(snapshots.map((s) => [s.t, s]));
  const oi = byT(d.oi);
  const funding = byT(d.funding);
  const liq = byT(d.liq);
  const lsr = byT(d.lsr);

  const deltas = (d.ohlcv || []).map((c) => calculateDelta(c.bv, c.v));
  const cvd = calculateCVD(deltas);

  return (d.ohlcv || [])
    .map((c, i) => ({
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

const COLUMNS = [
  ['time', 'Idő'],
  ['open', 'Open'],
  ['high', 'High'],
  ['low', 'Low'],
  ['close', 'Close'],
  ['volume', 'Volume'],
  ['buyVol', 'Buy vol'],
  ['tx', 'Tx'],
  ['buyTx', 'Buy tx'],
  ['delta', 'Delta'],
  ['deltaPct', 'Delta %'],
  ['cvd', 'CVD'],
  ['oiOpen', 'OI open'],
  ['oiClose', 'OI close'],
  ['fundingClose', 'Funding'],
  ['liqLong', 'Liq long'],
  ['liqShort', 'Liq short'],
  ['lsRatio', 'L/S ratio'],
  ['lsLong', 'L/S long'],
  ['lsShort', 'L/S short'],
  ['spotDeltaUsd', 'Spot delta USD'],
  ['spotCvd', 'Spot CVD USD'],
  ['spotLead', 'Spot lead'],
];

const fmt = (key, v) => {
  if (v === undefined || v === null) return '–';
  if (typeof v !== 'number') return v;
  if (key === 'deltaPct') return `${(v * 100).toFixed(1)}%`;
  return Number.isInteger(v) ? v : v.toLocaleString('hu-HU', { maximumFractionDigits: 4 });
};

function Dashboard() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [spotSymbols, setSpotSymbols] = useState(DEFAULT_SPOTS);
  const [interval, setIntervalValue] = useState('5min');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);
  const [rows, setRows] = useState([]);
  const [explanation, setExplanation] = useState([]);
  const [calcWarnings, setCalcWarnings] = useState([]);

  const handleFetch = async () => {
    setLoading(true);
    setErrors([]);
    setRows([]);
    setExplanation([]);
    setCalcWarnings([]);

    // Egymás után hívjuk, a rate limiter úgyis sorba állítja; egy hibás forrás nem viszi el a többit.
    const data = {};
    const errs = [];
    for (const src of SOURCES) {
      try {
        data[src.key] = await src.fetch(symbol, interval);
      } catch (err) {
        errs.push(`${src.name}: ${err.message}`);
      }
    }
    // Spot piacok: csak OHLCV kell
    const spots = [];
    for (const s of spotSymbols.split(',').map((x) => x.trim()).filter(Boolean)) {
      try {
        spots.push({ symbol: s, ohlcv: await fetchOHLCVHistory(s, interval) });
      } catch (err) {
        errs.push(`Spot ${s}: ${err.message}`);
      }
    }
    setErrors(errs);

    let snapshots = [];
    let warnings = [];
    if (data.ohlcv?.length) {
      ({ snapshots, warnings } = computeMomentum({
        perps: [{ symbol, ohlcv: data.ohlcv, oi: data.oi, funding: data.funding, liq: data.liq, lsr: data.lsr }],
        spots,
        interval,
      }));
    }
    setRows(buildRows(data, snapshots));

    if (data.ohlcv?.length) {
      setCalcWarnings(warnings);
      const snap = snapshots[snapshots.length - 1];
      if (snap) {
        const candle = data.ohlcv.find((c) => c.t === snap.t);
        const oiPoint = (data.oi || []).find((p) => p.t === snap.t);
        setExplanation(buildExplanation(snap, candle, oiPoint));
      }
    }
    setLoading(false);
  };

  return (
    <div className="dashboard-container">
      <h1>SOL adatok</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={symbol} onChange={(e) => setSymbol(e.target.value)} disabled={loading} title="Perp szimbólum" />
        <input
          value={spotSymbols}
          onChange={(e) => setSpotSymbols(e.target.value)}
          disabled={loading}
          title="Spot szimbólumok, vesszővel elválasztva"
          style={{ width: 260 }}
        />
        <select value={interval} onChange={(e) => setIntervalValue(e.target.value)} disabled={loading}>
          {INTERVALS.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
        <button onClick={handleFetch} disabled={loading}>
          {loading ? 'Töltés...' : 'Frissítés'}
        </button>
      </div>

      {errors.map((e) => (
        <div key={e} className="error-box">{e}</div>
      ))}

      {explanation.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2>Számítás az utolsó gyertyára</h2>
          {calcWarnings.map((w) => (
            <div key={w} style={{ color: '#ffb300', fontSize: 13 }}>⚠ {w}</div>
          ))}
          <table style={{ borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
            <thead>
              <tr>
                {['Lépés', 'Képlet', 'Behelyettesítve', 'Eredmény', 'Magyarázat'].map((h) => (
                  <th key={h} style={{ background: '#222', padding: '4px 10px', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {explanation.map((r, i) => (
                <React.Fragment key={r.name}>
                  {(i === 0 || explanation[i - 1].group !== r.group) && (
                    <tr>
                      <td colSpan={5} style={{ background: '#2d2d44', padding: '4px 10px', fontWeight: 'bold' }}>{r.group}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ padding: '3px 10px', borderBottom: '1px solid #333', whiteSpace: 'nowrap' }}>{r.name}</td>
                    <td style={{ padding: '3px 10px', borderBottom: '1px solid #333', fontFamily: 'monospace' }}>{r.formula}</td>
                    <td style={{ padding: '3px 10px', borderBottom: '1px solid #333', fontFamily: 'monospace' }}>{r.values}</td>
                    <td style={{ padding: '3px 10px', borderBottom: '1px solid #333', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{r.result}</td>
                    <td style={{ padding: '3px 10px', borderBottom: '1px solid #333', color: '#aaa' }}>{r.text}</td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflow: 'auto', maxHeight: '75vh' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                {COLUMNS.map(([key, label]) => (
                  <th
                    key={key}
                    style={{ position: 'sticky', top: 0, background: '#222', padding: '4px 8px', textAlign: 'right' }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.time}>
                  {COLUMNS.map(([key]) => (
                    <td key={key} style={{ padding: '2px 8px', textAlign: 'right', borderBottom: '1px solid #333' }}>
                      {fmt(key, r[key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
