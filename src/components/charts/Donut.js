import React from 'react';
import { num } from '../../utils/format';

// Vételi / eladási arány gyűrű. buy és sell azonos egységben (unit: SOL vagy USD).
export default function Donut({ buy, sell, unit = 'SOL' }) {
  const total = buy + sell;
  const r = 54;
  const circ = 2 * Math.PI * r;
  const buyLen = total > 0 ? (buy / total) * circ : 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" role="img" aria-label="Vételi és eladási volumen aránya">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--neg)" strokeWidth="16" />
        <circle
          cx="70" cy="70" r={r} fill="none" stroke="var(--pos)" strokeWidth="16"
          strokeDasharray={`${Math.max(0, buyLen - 2)} ${circ}`} transform="rotate(-90 70 70)"
        />
        <text x="70" y="68" textAnchor="middle" className="donut-big">{total > 0 ? `${Math.round((buy / total) * 100)}%` : '–'}</text>
        <text x="70" y="86" textAnchor="middle" className="tick">vétel</text>
      </svg>
      <div className="legend">
        <span><i style={{ background: 'var(--pos)' }} />Vételi {num(buy, 0)} {unit}</span>
        <span><i style={{ background: 'var(--neg)' }} />Eladási {num(sell, 0)} {unit}</span>
      </div>
    </div>
  );
}
