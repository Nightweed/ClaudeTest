import React, { useId } from 'react';
import { useWidth, useHover, niceTicks, timeLabel, linePath } from './utils';
import { compact } from '../../utils/format';

// times: unix másodpercek; series: [{ name, color, values }] ugyanolyan hosszú tömbökkel.
// bars: oszlopdiagram, az első sorozat előjel szerint kék (+) / piros (−).
export default function TimeChart({ times, series, bars = false, area = false, height = 220, fmt = compact, refLines = [], tipFmt }) {
  const [ref, w] = useWidth();
  const { hover, hoverAt, clear } = useHover();
  const gid = useId();
  const m = { l: 54, r: 12, t: 10, b: 22 };
  const iw = w - m.l - m.r;
  const ih = height - m.t - m.b;
  const n = times.length;
  const vals = series.flatMap((s) => s.values).filter(Number.isFinite);

  if (!n || !vals.length) {
    return <div ref={ref} className="chart-empty">Nincs adat</div>;
  }

  let lo = Math.min(...vals, ...refLines.map((r) => r.y), ...(bars ? [0] : []));
  let hi = Math.max(...vals, ...refLines.map((r) => r.y), ...(bars ? [0] : []));
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad;
  hi += pad;

  const slot = iw / n;
  const x = (i) => m.l + (i + 0.5) * slot;
  const y = (v) => m.t + ih * (1 - (v - lo) / (hi - lo));
  const ticks = niceTicks(lo, hi);
  const withDay = times[n - 1] - times[0] > 20 * 3600;
  const xTicks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1))))];
  const tip = tipFmt || fmt;

  return (
    <div ref={ref} className="chart-wrap" onMouseLeave={clear}>
      <svg width={w} height={height} role="img">
        {area && (
          <defs>
            <linearGradient id={`${gid}-a`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={series[0].color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={series[0].color} stopOpacity="0" />
            </linearGradient>
          </defs>
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} />
            <text className="tick" x={m.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">{fmt(t)}</text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text key={i} className="tick" x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
            {timeLabel(times[i], withDay)}
          </text>
        ))}
        {bars && <line className="axis" x1={m.l} x2={w - m.r} y1={y(0)} y2={y(0)} />}
        {refLines.map((r) => (
          <g key={r.y}>
            <line className="ref" x1={m.l} x2={w - m.r} y1={y(r.y)} y2={y(r.y)} />
            {r.label && <text className="ref-label" x={w - m.r - 4} y={y(r.y) - 4} textAnchor="end">{r.label}</text>}
          </g>
        ))}

        {bars
          ? series[0].values.map((v, i) =>
              Number.isFinite(v) ? (
                <rect
                  key={times[i]}
                  x={x(i) - Math.max(1, slot * 0.34)}
                  width={Math.max(1, slot * 0.68)}
                  y={Math.min(y(v), y(0))}
                  height={Math.max(1, Math.abs(y(v) - y(0)))}
                  rx={Math.min(2, slot * 0.3)}
                  fill={v >= 0 ? 'var(--pos)' : 'var(--neg)'}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              ) : null
            )
          : series.map((s, si) => (
              <g key={s.name}>
                {area && si === 0 && (
                  <path
                    d={`${linePath(s.values, x, y)}L${x(n - 1)},${m.t + ih}L${x(0)},${m.t + ih}Z`}
                    fill={`url(#${gid}-a)`}
                  />
                )}
                <path d={linePath(s.values, x, y)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </g>
            ))}

        {hover !== null && (
          <g>
            <line className="cross" x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ih} />
            {!bars &&
              series.map((s) =>
                Number.isFinite(s.values[hover]) ? (
                  <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r="4.5" fill={s.color} className="dot" />
                ) : null
              )}
          </g>
        )}
        <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" onMouseMove={(e) => hoverAt(e, slot, n)} />
      </svg>

      {hover !== null && (
        <div className="tooltip" style={{ left: x(hover), transform: `translateX(${x(hover) > w / 2 ? 'calc(-100% - 12px)' : '12px'})` }}>
          <div className="tooltip-time">{timeLabel(times[hover], true)}</div>
          {series.map((s) => {
            const v = s.values[hover];
            return (
              <div key={s.name} className="tooltip-row">
                <i style={{ background: bars ? (v >= 0 ? 'var(--pos)' : 'var(--neg)') : s.color }} />
                <span>{s.name}</span>
                <b>{Number.isFinite(v) ? tip(v) : '–'}</b>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
