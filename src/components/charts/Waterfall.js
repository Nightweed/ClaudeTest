import React from 'react';
import { useWidth, niceTicks } from './utils';
import { num } from '../../utils/format';

// Waterfall: items [{ label, value }] lépések, a végén az összeg-oszlop.
export default function Waterfall({ items, totalLabel = 'Nyers pontszám', height = 260 }) {
  const [ref, w] = useWidth();
  const m = { l: 40, r: 12, t: 22, b: 34 };
  const iw = w - m.l - m.r;
  const ih = height - m.t - m.b;
  let run = 0;
  const bars = items.map((it) => {
    const from = run;
    run += it.value;
    return { ...it, from, to: run };
  });
  bars.push({ label: totalLabel, value: run, from: 0, to: run, total: true });
  const all = bars.flatMap((b) => [b.from, b.to, 0]);
  const lo = Math.min(...all) - 0.15;
  const hi = Math.max(...all) + 0.15;
  const slot = iw / bars.length;
  const y = (v) => m.t + ih * (1 - (v - lo) / (hi - lo));
  return (
    <div ref={ref} className="chart-wrap">
      <svg width={w} height={height} role="img" aria-label="A pontszám tagjai">
        {niceTicks(lo, hi, 4).map((t) => (
          <g key={t}>
            <line className="grid" x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} />
            <text className="tick" x={m.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">{num(t, 1)}</text>
          </g>
        ))}
        <line className="axis" x1={m.l} x2={w - m.r} y1={y(0)} y2={y(0)} />
        {bars.map((b, i) => {
          const cx = m.l + (i + 0.5) * slot;
          const bw = Math.min(64, slot * 0.6);
          const top = Math.min(y(b.from), y(b.to));
          const col = b.total ? 'var(--ink)' : b.value >= 0 ? 'var(--pos)' : 'var(--neg)';
          return (
            <g key={b.label}>
              {i > 0 && !b.total && <line className="ref" x1={cx - slot} x2={cx - bw / 2} y1={y(b.from)} y2={y(b.from)} />}
              <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(2, Math.abs(y(b.from) - y(b.to)))} rx="4" fill={col} opacity={b.total ? 0.85 : 1} />
              <text className="wf-val" x={cx} y={top - 6} textAnchor="middle">{b.value > 0 && !b.total ? '+' : ''}{num(b.value, 2)}</text>
              <text className="tick" x={cx} y={height - 12} textAnchor="middle">{b.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
