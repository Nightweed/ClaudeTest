import React from 'react';
import { useWidth, useHover, niceTicks, timeLabel } from './utils';
import { num } from '../../utils/format';

// Gyertyadiagram + alatta volumen-sáv. candles: [{ t, o, h, l, c, v, delta }]
export default function CandleChart({ candles, height = 320, priceFmt = (v) => num(v, 2) }) {
  const [ref, w] = useWidth();
  const { hover, hoverAt, clear } = useHover();
  const n = candles.length;
  if (!n) return <div ref={ref} className="chart-empty">Nincs adat</div>;

  const m = { l: 54, r: 12, t: 10, b: 22 };
  const volH = 54;
  const gap = 14;
  const iw = w - m.l - m.r;
  const ih = height - m.t - m.b - volH - gap;
  const lo0 = Math.min(...candles.map((c) => c.l));
  const hi0 = Math.max(...candles.map((c) => c.h));
  const pad = (hi0 - lo0) * 0.06 || 1;
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const vMax = Math.max(...candles.map((c) => c.v)) || 1;
  const slot = iw / n;
  const x = (i) => m.l + (i + 0.5) * slot;
  const y = (v) => m.t + ih * (1 - (v - lo) / (hi - lo));
  const volTop = m.t + ih + gap;
  const withDay = candles[n - 1].t - candles[0].t > 20 * 3600;
  const xTicks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1))))];
  const bw = Math.max(1.5, slot * 0.66);
  const up = (c) => c.c >= c.o;
  const hc = hover === null ? null : candles[hover];

  return (
    <div ref={ref} className="chart-wrap" onMouseLeave={clear}>
      <svg width={w} height={height} role="img" aria-label="Gyertyadiagram">
        {niceTicks(lo, hi).map((t) => (
          <g key={t}>
            <line className="grid" x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} />
            <text className="tick" x={m.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">{priceFmt(t)}</text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text key={i} className="tick" x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
            {timeLabel(candles[i].t, withDay)}
          </text>
        ))}
        {candles.map((c, i) => {
          const col = up(c) ? 'var(--pos)' : 'var(--neg)';
          const top = Math.min(y(c.o), y(c.c));
          return (
            <g key={c.t} opacity={hover === null || hover === i ? 1 : 0.6}>
              <line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1.5" />
              <rect x={x(i) - bw / 2} y={top} width={bw} height={Math.max(1.5, Math.abs(y(c.o) - y(c.c)))} rx="1.5" fill={col} />
              <rect x={x(i) - bw / 2} y={volTop + volH * (1 - c.v / vMax)} width={bw} height={Math.max(1, (volH * c.v) / vMax)} rx="1.5" fill={col} opacity="0.55" />
            </g>
          );
        })}
        <line className="axis" x1={m.l} x2={w - m.r} y1={volTop + volH} y2={volTop + volH} />
        <text className="tick" x={m.l - 8} y={volTop + 8} textAnchor="end">vol</text>
        {hc && (
          <g>
            <line className="cross" x1={x(hover)} x2={x(hover)} y1={m.t} y2={volTop + volH} />
            <line className="cross" x1={m.l} x2={w - m.r} y1={y(hc.c)} y2={y(hc.c)} />
          </g>
        )}
        <rect x={m.l} y={m.t} width={iw} height={ih + gap + volH} fill="transparent" onMouseMove={(e) => hoverAt(e, slot, n)} />
      </svg>
      {hc && (
        <div className="tooltip" style={{ left: x(hover), transform: `translateX(${x(hover) > w / 2 ? 'calc(-100% - 12px)' : '12px'})` }}>
          <div className="tooltip-time">{timeLabel(hc.t, true)}</div>
          {[['Open', priceFmt(hc.o)], ['High', priceFmt(hc.h)], ['Low', priceFmt(hc.l)], ['Close', priceFmt(hc.c)], ['Volumen', `${num(hc.v, 0)} SOL`], ['Delta', `${num(hc.delta, 0)} SOL`]].map(([k, v]) => (
            <div key={k} className="tooltip-row"><span>{k}</span><b>{v}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}
