import React from 'react';

const ZONES = [
  { from: -1, to: -0.5, color: 'var(--neg-strong)', name: 'Erős esés' },
  { from: -0.5, to: -0.2, color: 'var(--neg)', name: 'Esés' },
  { from: -0.2, to: 0.2, color: 'var(--neutral)', name: 'Semleges' },
  { from: 0.2, to: 0.5, color: 'var(--pos)', name: 'Emelkedés' },
  { from: 0.5, to: 1, color: 'var(--pos-strong)', name: 'Erős emelkedés' },
];

// −1…+1 közötti momentum pontszám félkör-műszere.
export default function Gauge({ value }) {
  const cx = 130;
  const cy = 120;
  const r = 96;
  const ang = (v) => (Math.PI * (v + 1)) / 2;
  const pt = (v, rad = r) => [cx - rad * Math.cos(ang(v)), cy - rad * Math.sin(ang(v))];
  const gap = 0.012;
  const arc = (a, b) => {
    const [x1, y1] = pt(a + gap);
    const [x2, y2] = pt(b - gap);
    return `M${x1},${y1}A${r},${r} 0 0 1 ${x2},${y2}`;
  };
  const v = Math.max(-1, Math.min(1, value));
  const [nx, ny] = pt(v, r - 26);
  return (
    <svg viewBox="0 0 260 140" className="gauge" role="img" aria-label={`Momentum: ${value.toFixed(2)}`}>
      {ZONES.map((z) => (
        <path key={z.name} d={arc(z.from, z.to)} stroke={z.color} strokeWidth="16" fill="none" strokeLinecap="butt" opacity="0.9" />
      ))}
      <line x1={cx} y1={cy} x2={nx} y2={ny} className="needle" />
      <circle cx={cx} cy={cy} r="7" className="needle-hub" />
      <text x={cx - r} y={cy + 18} className="tick" textAnchor="middle">−1</text>
      <text x={cx} y={cy - r - 10} className="tick" textAnchor="middle">0</text>
      <text x={cx + r} y={cy + 18} className="tick" textAnchor="middle">+1</text>
    </svg>
  );
}
