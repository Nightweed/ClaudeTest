export const processCVDData = (rawCVDData) => {
  if (!rawCVDData || !Array.isArray(rawCVDData)) {
    return { data: [], summary: {} };
  }

  const data = rawCVDData.map((point) => ({
    timestamp: point.timestamp,
    cvd: point.cumulative_volume_delta || 0,
    buyVolume: point.buy_volume || 0,
    sellVolume: point.sell_volume || 0,
  }));

  const cvdValues = data.map((d) => d.cvd);
  const summary = {
    current: cvdValues[cvdValues.length - 1] || 0,
    highest: Math.max(...cvdValues),
    lowest: Math.min(...cvdValues),
    average: cvdValues.reduce((a, b) => a + b, 0) / cvdValues.length || 0,
  };

  return { data, summary };
};

export const processOIData = (rawOIData) => {
  if (!rawOIData || !Array.isArray(rawOIData)) {
    return { data: [], summary: {} };
  }

  const data = rawOIData.map((point) => ({
    timestamp: point.timestamp,
    oi: point.open_interest || 0,
    longOI: point.long_oi || 0,
    shortOI: point.short_oi || 0,
  }));

  const oiValues = data.map((d) => d.oi);
  const summary = {
    current: oiValues[oiValues.length - 1] || 0,
    highest: Math.max(...oiValues),
    lowest: Math.min(...oiValues),
    average: oiValues.reduce((a, b) => a + b, 0) / oiValues.length || 0,
  };

  return { data, summary };
};

export const calculateOrderFlowMetrics = (cvdData, oiData) => {
  if (!cvdData || !cvdData.data || !oiData || !oiData.data) {
    return {};
  }

  const latestCVD = cvdData.summary.current;
  const latestOI = oiData.summary.current;
  const cvdTrend = cvdData.summary.current - (cvdData.data[cvdData.data.length - 2]?.cvd || 0);
  const oiTrend = oiData.summary.current - (oiData.data[oiData.data.length - 2]?.oi || 0);

  return {
    cvdValue: latestCVD.toFixed(2),
    oiValue: latestOI.toFixed(2),
    cvdTrend: cvdTrend > 0 ? '+' + cvdTrend.toFixed(2) : cvdTrend.toFixed(2),
    oiTrend: oiTrend > 0 ? '+' + oiTrend.toFixed(2) : oiTrend.toFixed(2),
    signal: calculateSignal(cvdTrend, oiTrend, latestCVD, latestOI),
  };
};

const calculateSignal = (cvdTrend, oiTrend, cvdValue, oiValue) => {
  let score = 0;

  if (cvdTrend > 0) score += 1;
  if (oiTrend > 0) score += 1;
  if (cvdValue > 0) score += 0.5;
  if (oiValue > 0) score += 0.5;

  if (score > 2) return 'BULLISH';
  if (score < 1) return 'BEARISH';
  return 'NEUTRAL';
};

export const formatNumber = (num) => {
  if (!num) return '0';
  if (Math.abs(num) >= 1e6) {
    return (num / 1e6).toFixed(2) + 'M';
  }
  if (Math.abs(num) >= 1e3) {
    return (num / 1e3).toFixed(2) + 'K';
  }
  return num.toFixed(2);
};
