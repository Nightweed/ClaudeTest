import { rateLimitedFetch } from './rateLimit';
import { INTERVAL_SECONDS } from '../utils/momentum';

const API_KEY = process.env.REACT_APP_COINALYZE_API_KEY;
// A böngésző CORS miatt nem hívhatja közvetlenül; a dev szerver proxyja (package.json) továbbítja.
const API_BASE_URL = '/v1';
const CACHE_TTL_MS = 10 * 60 * 1000;
// Az API az oi_lq_vol_denominated_in mezőben BASE_ASSET / QUOTE_ASSET értéket ad; ezt képezzük a belső BASE / USD nevekre.
const UNIT_MAP = { BASE_ASSET: 'BASE', QUOTE_ASSET: 'USD' };

const requireKey = () => {
  if (!API_KEY) {
    throw new Error('API key not configured. Please set REACT_APP_COINALYZE_API_KEY in .env');
  }
};

const getJson = async (path) => {
  requireKey();
  const response = await rateLimitedFetch(`${API_BASE_URL}/${path}`, {
    headers: { api_key: API_KEY },
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }
  return response.json();
};

// Egy szimbólum history tömbjét adja vissza növekvő időrendben.
const fetchHistory = async (endpoint, symbol, interval, limit, extraParams = {}) => {
  const to = Math.floor(Date.now() / 1000);
  const from = to - INTERVAL_SECONDS[interval] * limit;
  const params = new URLSearchParams({
    symbols: symbol,
    interval,
    from: String(from),
    to: String(to),
    ...extraParams,
  });
  const json = await getJson(`${endpoint}?${params}`);
  return json[0]?.history || [];
};

// t, o, h, l, c, v, bv, tx, btx
export const fetchOHLCVHistory = (symbol, interval = '1hour', limit = 200) =>
  fetchHistory('ohlcv-history', symbol, interval, limit);

// t, o, h, l, c; USD-ben (súlyozáshoz)
export const fetchOpenInterestHistory = (symbol, interval = '1hour', limit = 200) =>
  fetchHistory('open-interest-history', symbol, interval, limit, { convert_to_usd: 'true' });

// t, o, h, l, c; a piac natív egységében (pozíciómennyiség, ár-független dOI-hoz)
export const fetchOpenInterestNativeHistory = (symbol, interval = '1hour', limit = 200) =>
  fetchHistory('open-interest-history', symbol, interval, limit, { convert_to_usd: 'false' });

// t, o, h, l, c
export const fetchFundingRateHistory = (symbol, interval = '1hour', limit = 200) =>
  fetchHistory('funding-rate-history', symbol, interval, limit);

// t, l (long liq), s (short liq)
export const fetchLiquidationHistory = (symbol, interval = '1hour', limit = 200) =>
  fetchHistory('liquidation-history', symbol, interval, limit, { convert_to_usd: 'true' });

// t, r, l, s
export const fetchLongShortRatioHistory = (symbol, interval = '1hour', limit = 200) =>
  fetchHistory('long-short-ratio-history', symbol, interval, limit);

// Perp piaclista: symbol -> 'BASE' | 'USD', az oi_lq_vol_denominated_in mező alapján.
// Ismeretlen értéket kihagyunk, így a hívó figyelmeztetni tud rá. A spot piacoknak nincs ilyen mezőjük,
// ezért nem kérjük le őket: a számítás alapértelmezetten BASE-t vesz.
let unitCache = null;
export const fetchVolumeUnits = async () => {
  if (unitCache && Date.now() - unitCache.at < CACHE_TTL_MS) return unitCache.units;
  const future = await getJson('future-markets');
  const units = {};
  (Array.isArray(future) ? future : []).forEach((m) => {
    const unit = UNIT_MAP[String(m?.oi_lq_vol_denominated_in ?? '').toUpperCase()];
    if (m?.symbol && unit) units[m.symbol] = unit;
  });
  unitCache = { at: Date.now(), units };
  return units;
};
