export const num = (v, d = 2) =>
  Number.isFinite(v) ? v.toLocaleString('hu-HU', { maximumFractionDigits: d }) : '–';

export const compact = (v, d = 1) =>
  new Intl.NumberFormat('hu-HU', { notation: 'compact', maximumFractionDigits: d }).format(v);

export const sgn = (v, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v), d)}`;

export const pct = (v, d = 2) => `${sgn(v * 100, d)}%`;

export const tone = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : 'neutral');
