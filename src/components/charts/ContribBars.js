import React from 'react';
import { num } from '../../utils/format';

// Vízszintes, nullától induló sávok: [{ label, hint, value }]
export default function ContribBars({ items }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <div className="contrib">
      {items.map((i) => (
        <div key={i.label} className="contrib-row">
          <div className="contrib-name">
            <b>{i.label}</b>
            <span>{i.hint}</span>
          </div>
          <div className="contrib-track">
            <div className="contrib-zero" />
            <div
              className="contrib-bar"
              style={{
                width: `${(Math.abs(i.value) / max) * 50}%`,
                [i.value >= 0 ? 'left' : 'right']: '50%',
                background: i.value >= 0 ? 'var(--pos)' : 'var(--neg)',
              }}
            />
          </div>
          <div className="contrib-val">{i.text ?? `${i.value > 0 ? '+' : ''}${num(i.value, 2)}`}</div>
        </div>
      ))}
    </div>
  );
}
