import { rateLimitedFetch } from './rateLimit';

const API_KEY = process.env.REACT_APP_COINALYZE_API_KEY;
// A böngésző CORS miatt nem hívhatja közvetlenül; a dev szerver proxyja (package.json) továbbítja.
const API_BASE_URL = '/v1';

// Csak az egy órás gyertyák kellenek, minden számítás ebből készül.
const INTERVAL_SECONDS = {
  '1hour': 3600,
};

// Egy szimbólum history tömbjét adja vissza növekvő időrendben.
const fetchHistory = async (endpoint, symbol, interval, limit, extraParams = {}) => {
  if (!API_KEY) {
    throw new Error('API key not configured. Please set REACT_APP_COINALYZE_API_KEY in .env');
  }

  const to = Math.floor(Date.now() / 1000);
  const from = to - INTERVAL_SECONDS[interval] * limit;
  const params = new URLSearchParams({
    symbols: symbol,
    interval,
    from: String(from),
    to: String(to),
    ...extraParams,
  });

  const response = await rateLimitedFetch(`${API_BASE_URL}/${endpoint}?${params}`, {
    headers: { api_key: API_KEY },
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  return json[0]?.history || [];
};

// t, o, h, l, c, v, bv, tx, btx
export const fetchOHLCVHistory = (symbol, interval = '1hour', limit = 200) =>
  fetchHistory('ohlcv-history', symbol, interval, limit);

// t, o, h, l, c
export const fetchOpenInterestHistory = (symbol, interval = '1hour', limit = 200) =>
  fetchHistory('open-interest-history', symbol, interval, limit, { convert_to_usd: 'true' });

// t, o, h, l, c
export const fetchFundingRateHistory = (symbol, interval = '1hour', limit = 200) =>
  fetchHistory('funding-rate-history', symbol, interval, limit);

// t, l (long liq), s (short liq)
export const fetchLiquidationHistory = (symbol, interval = '1hour', limit = 200) =>
  fetchHistory('liquidation-history', symbol, interval, limit, { convert_to_usd: 'true' });

// t, r, l, s
export const fetchLongShortRatioHistory = (symbol, interval = '1hour', limit = 200) =>
  fetchHistory('long-short-ratio-history', symbol, interval, limit);
