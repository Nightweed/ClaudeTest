import React, { useMemo, useState } from 'react';
import { useMarketData } from '../hooks/useMarketData';
import { groupExplanation } from '../utils/dashboardData';
import { Card } from './ui';
import OverviewTab from './OverviewTab';
import CalcTab from './CalcTab';
import './Dashboard.css';

const DEFAULT_SYMBOL = 'SOLUSDT_PERP.A'; // Binance SOL perp
const DEFAULT_SPOTS = 'SOLUSD.A,SOLUSDC.A,SOLUSDT.F'; // Binance SOL/USDT, SOL/USDC + SOL/USDT (F) spot, vesszővel elválasztva
const INTERVALS = ['5min', '15min', '1hour'];

function Dashboard() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [spotSymbols, setSpotSymbols] = useState(DEFAULT_SPOTS);
  const [interval, setIntervalValue] = useState('5min');
  const [tab, setTab] = useState('overview');
  const { fetchData, loading, errors, calcWarnings, rows, snaps, explanation, cache } = useMarketData();

  const chron = useMemo(() => [...rows].reverse(), [rows]);
  const last = snaps[snaps.length - 1];
  const lastRow = chron[chron.length - 1];
  const view = chron.slice(-120);
  const snapView = snaps.slice(-120);
  const groups = groupExplanation(explanation);

  return (
    <div className="dashboard-container">
      <div className="ambient" aria-hidden="true" />
      <div className="sweep" aria-hidden="true" />
      <nav className="topnav" role="tablist" aria-label="Oldalak">
        {[['overview', 'Áttekintés'], ['calc', 'Számítás lépésről lépésre']].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>

      <header className="head">
        <div>
          <div className="eyebrow accent">SOL / ORDER-FLOW HUD</div>
          <h1>SOL piaci pulzus</h1>
          <p className="head-sub">Agresszív vétel és eladás, nyitott pozíciók és funding egy képben, a számítás minden lépésével.</p>
        </div>
        {last && (
          <div className="stamp">
            <span>Utolsó gyertya</span>
            <b>{new Date(last.t * 1000).toLocaleString('hu-HU')}</b>
          </div>
        )}
      </header>

      <div className="controls">
        <div className="seg" role="group" aria-label="Időtáv">
          {INTERVALS.map((i) => (
            <button key={i} aria-pressed={interval === i} onClick={() => setIntervalValue(i)} disabled={loading}>{i}</button>
          ))}
        </div>
        <button className="btn" onClick={() => fetchData(symbol, spotSymbols, interval)} disabled={loading}>{loading ? 'Töltés...' : 'Lekérés'}</button>
        <button className="btn primary" onClick={() => fetchData(symbol, spotSymbols, interval, true)} disabled={loading} title="Friss adatok lekérése a gyorsítótár kihagyásával">Frissítés</button>
        {cache && <span className="muted">Utolsó lekérés: {new Date(cache.at).toLocaleTimeString('hu-HU')}</span>}
        <details className="settings">
          <summary>Szimbólumok</summary>
          <div className="settings-body">
            <label>Perp<input value={symbol} onChange={(e) => setSymbol(e.target.value)} disabled={loading} /></label>
            <label>Spot (vesszővel)<input value={spotSymbols} onChange={(e) => setSpotSymbols(e.target.value)} disabled={loading} /></label>
          </div>
        </details>
      </div>

      {errors.map((e) => (
        <div key={e} className="error-box">{e}</div>
      ))}
      {calcWarnings.map((w) => (
        <div key={w} className="warn-box">⚠ {w}</div>
      ))}

      {!last && (
        <Card className="empty">
          <h2>{loading ? 'Adatok töltése...' : 'Még nincs adat'}</h2>
          <p>{loading ? 'A lekérés a rate limit miatt egy kis időt vehet igénybe.' : 'Nyomd meg a Lekérés gombot, és a dashboard feltöltődik az utolsó gyertya számításával.'}</p>
        </Card>
      )}

      {last && lastRow && (
        <>
          {tab === 'overview' && (
            <OverviewTab last={last} lastRow={lastRow} view={view} snapView={snapView} explanation={explanation} />
          )}
          {tab === 'calc' && <CalcTab groups={groups} />}

          <footer className="foot">Forrás: Coinalyze, {symbol} és spot: {spotSymbols}. Intervallum: {interval}.</footer>
        </>
      )}
    </div>
  );
}

export default Dashboard;
