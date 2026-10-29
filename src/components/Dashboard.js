import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMarketData } from '../hooks/useMarketData';
import { groupExplanation } from '../utils/dashboardData';
import { Card } from './ui';
import OverviewTab from './OverviewTab';
import CalcTab from './CalcTab';
import './Dashboard.css';

const DEFAULT_SYMBOL = 'SOLUSDT_PERP.A'; // Binance SOL perp
const DEFAULT_SPOTS = 'SOLUSD.A,SOLUSDC.A,SOLUSDT.F'; // Binance SOL/USDT, SOL/USDC + SOL/USDT (F) spot, vesszővel elválasztva
const INTERVAL = '1hour'; // csak egy órás gyertyákkal számolunk
const REFRESH_MS = 5 * 60 * 1000; // ennyinként friss adatot kérünk le

function Dashboard() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [spotSymbols, setSpotSymbols] = useState(DEFAULT_SPOTS);
  const [tab, setTab] = useState('overview');
  const { fetchData, loading, errors, calcWarnings, rows, snaps, explanation, cache } = useMarketData();
  const started = useRef(false);
  const latest = useRef({ symbol, spotSymbols, fetchData });
  latest.current = { symbol, spotSymbols, fetchData };

  // Induláskor lekérjük az adatokat, utána 5 percenként friss lekérés (gyorsítótár kihagyásával).
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      latest.current.fetchData(DEFAULT_SYMBOL, DEFAULT_SPOTS, INTERVAL);
    }
    const id = setInterval(() => {
      const { symbol: s, spotSymbols: sp, fetchData: load } = latest.current;
      load(s, sp, INTERVAL, true);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

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
        {cache && <span className="muted">Utolsó frissítés: {new Date(cache.at).toLocaleTimeString('hu-HU')}</span>}
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
          <p>{loading ? 'A lekérés a rate limit miatt egy kis időt vehet igénybe.' : 'Az oldal indulásakor automatikusan lekéri az adatokat, utána 5 percenként frissíti.'}</p>
        </Card>
      )}

      {last && lastRow && (
        <>
          {tab === 'overview' && (
            <OverviewTab last={last} lastRow={lastRow} view={view} snapView={snapView} explanation={explanation} />
          )}
          {tab === 'calc' && <CalcTab groups={groups} />}

          <footer className="foot">Forrás: Coinalyze, {symbol} és spot: {spotSymbols}. Intervallum: {INTERVAL}.</footer>
        </>
      )}
    </div>
  );
}

export default Dashboard;
