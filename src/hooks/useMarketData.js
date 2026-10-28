import { useState } from 'react';
import {
  fetchOHLCVHistory,
  fetchOpenInterestHistory,
  fetchFundingRateHistory,
  fetchLiquidationHistory,
  fetchLongShortRatioHistory,
} from '../services/dataFetcher';
import { computeMomentum } from '../utils/momentum';
import { buildExplanation } from '../utils/explain';
import { buildRows } from '../utils/dashboardData';

const CACHE_TTL_MS = 10 * 60 * 1000; // ennyi ideig nem töltjük újra ugyanazokat az adatokat

const SOURCES = [
  { key: 'ohlcv', name: 'OHLCV', fetch: fetchOHLCVHistory },
  { key: 'oi', name: 'Open interest', fetch: fetchOpenInterestHistory },
  { key: 'funding', name: 'Funding', fetch: fetchFundingRateHistory },
  { key: 'liq', name: 'Likvidáció', fetch: fetchLiquidationHistory },
  { key: 'lsr', name: 'Long/short ratio', fetch: fetchLongShortRatioHistory },
];

// Adatlekérés, gyorsítótárral és a számítás eredményeivel.
export function useMarketData() {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);
  const [rows, setRows] = useState([]);
  const [explanation, setExplanation] = useState([]);
  const [calcWarnings, setCalcWarnings] = useState([]);
  const [snaps, setSnaps] = useState([]);
  const [cache, setCache] = useState(null); // utolsó sikeres lekérés: { key, at, data, spots }

  const fetchData = async (symbol, spotSymbols, interval, force = false) => {
    const key = [symbol, spotSymbols, interval].join('|');
    const cached = !force && cache && cache.key === key && Date.now() - cache.at < CACHE_TTL_MS ? cache : null;

    setLoading(true);
    setErrors([]);
    setRows([]);
    setExplanation([]);
    setCalcWarnings([]);
    setSnaps([]);

    let data = cached?.data;
    let spots = cached?.spots;
    const errs = [];
    if (!cached) {
      // Egymás után hívjuk, a rate limiter úgyis sorba állítja; egy hibás forrás nem viszi el a többit.
      data = {};
      for (const src of SOURCES) {
        try {
          data[src.key] = await src.fetch(symbol, interval);
        } catch (err) {
          errs.push(`${src.name}: ${err.message}`);
        }
      }
      // Spot piacok: csak OHLCV kell
      spots = [];
      for (const s of spotSymbols.split(',').map((x) => x.trim()).filter(Boolean)) {
        try {
          spots.push({ symbol: s, ohlcv: await fetchOHLCVHistory(s, interval) });
        } catch (err) {
          errs.push(`Spot ${s}: ${err.message}`);
        }
      }
    }
    setErrors(errs);
    // Csak hibamentes lekérést tárolunk, hogy a hiányos adat ne ragadjon be a gyorsítótárba.
    if (!cached && errs.length === 0) {
      setCache({ key, at: Date.now(), data, spots });
    }

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
    setSnaps(snapshots);

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

  return { fetchData, loading, errors, calcWarnings, rows, snaps, explanation, cache };
}
