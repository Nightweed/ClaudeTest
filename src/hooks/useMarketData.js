import { useState } from 'react';
import {
  fetchOHLCVHistory,
  fetchOpenInterestHistory,
  fetchOpenInterestNativeHistory,
  fetchFundingRateHistory,
  fetchLiquidationHistory,
  fetchLongShortRatioHistory,
  fetchVolumeUnits,
} from '../services/dataFetcher';
import { computeMomentum } from '../utils/momentum';
import { buildExplanation } from '../utils/explain';
import { buildRows } from '../utils/dashboardData';

const CACHE_TTL_MS = 10 * 60 * 1000; // ennyi ideig nem töltjük újra ugyanazokat az adatokat

const SOURCES = [
  { key: 'ohlcv', name: 'OHLCV', fetch: fetchOHLCVHistory },
  { key: 'oi', name: 'Open interest', fetch: fetchOpenInterestHistory },
  { key: 'oiNative', name: 'Natív OI', fetch: fetchOpenInterestNativeHistory },
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
  const [cache, setCache] = useState(null); // utolsó sikeres lekérés: { key, at, data, spots, perpUnit }

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
    let perpUnit = cached?.perpUnit;
    const errs = [];
    if (!cached) {
      // Volumenegység piaconként (SOL-ban vagy USD-ben jön a volumen)
      let units = {};
      try {
        units = await fetchVolumeUnits();
      } catch (err) {
        errs.push(`Piacmeta: ${err.message}`);
      }
      perpUnit = units[symbol];

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
          spots.push({ symbol: s, volumeUnit: units[s], ohlcv: await fetchOHLCVHistory(s, interval) });
        } catch (err) {
          errs.push(`Spot ${s}: ${err.message}`);
        }
      }
    }
    setErrors(errs);
    // Csak hibamentes lekérést tárolunk, hogy a hiányos adat ne ragadjon be a gyorsítótárba.
    if (!cached && errs.length === 0) {
      setCache({ key, at: Date.now(), data, spots, perpUnit });
    }

    let snapshots = [];
    let warnings = [];
    if (data.ohlcv?.length) {
      ({ snapshots, warnings } = computeMomentum({
        perps: [{
          symbol,
          volumeUnit: perpUnit,
          ohlcv: data.ohlcv,
          oi: data.oi,
          oiNative: data.oiNative,
          funding: data.funding,
          liq: data.liq,
          lsr: data.lsr,
        }],
        spots,
        interval,
      }));
      // Ha a perp piac egysége ismeretlen, a számítás BASE-nek veszi; ezt jelezzük. (A spotoknál a BASE a várt alapérték, nincs rá figyelmeztetés.)
      const unitWarnings = perpUnit ? [] : [`${symbol}: ismeretlen volumenegység, BASE-nek vesszük`];
      warnings = [...unitWarnings, ...warnings];
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
