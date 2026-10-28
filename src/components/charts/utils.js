import { useEffect, useRef, useState } from 'react';

export const useWidth = () => {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.clientWidth || 600);
    const ro = new ResizeObserver(([e]) => setW(Math.max(220, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
};

// Egérpozícióból a legközelebbi oszlop indexe (slot szélességű sávok).
export const useHover = () => {
  const [hover, setHover] = useState(null);
  const hoverAt = (e, slot, n) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.min(n - 1, Math.max(0, Math.floor((e.clientX - r.left) / slot))));
  };
  return { hover, hoverAt, clear: () => setHover(null) };
};

export const niceTicks = (min, max, n = 4) => {
  const span = max - min || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) ticks.push(+v.toFixed(12));
  return ticks;
};

export const timeLabel = (t, withDay) => {
  const d = new Date(t * 1000);
  const hm = d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  return withDay ? `${d.getMonth() + 1}.${d.getDate()}. ${hm}` : hm;
};

export const linePath = (values, x, y) => {
  let d = '';
  let open = false;
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) {
      open = false;
      return;
    }
    d += `${open ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    open = true;
  });
  return d;
};
