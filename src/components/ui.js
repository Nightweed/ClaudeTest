import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY } from '../utils/glossary';

// Információs ikon: egérrel fölé víve, billentyűzettel fókuszba véve vagy koppintásra magyarázatot ad.
// Vagy `id` (a glossary kulcsa) vagy közvetlen `text`.
export function Info({ id, text }) {
  const body = text || GLOSSARY[id];
  const ref = useRef(null);
  const tipId = useId();
  const [pos, setPos] = useState(null);

  const open = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 12));
    // Ha az ikon a képernyő alsó felében van, a buborék fölé kerül.
    const above = r.top > window.innerHeight / 2;
    setPos(above ? { left, width, bottom: window.innerHeight - r.top + 8 } : { left, width, top: r.bottom + 8 });
  };
  const close = () => setPos(null);

  useEffect(() => {
    if (!pos) return undefined;
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  if (!body) return null;
  return (
    <>
      <button
        type="button"
        ref={ref}
        className="info"
        aria-label="Magyarázat"
        aria-describedby={pos ? tipId : undefined}
        aria-expanded={!!pos}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        onClick={(e) => {
          e.preventDefault(); // a summary-n belül ne nyissa/csukja a csoportot
          e.stopPropagation();
          if (pos) close();
          else open();
        }}
      >
        i
      </button>
      {pos &&
        createPortal(
          <div id={tipId} role="tooltip" className="info-pop" style={pos}>
            {body}
          </div>,
          document.body
        )}
    </>
  );
}

export function Card({ className = '', children }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Section({ n, title, sub, info, children }) {
  return (
    <section className="section">
      <h2 className="section-title">{n && <span className="section-n">{n}</span>}{title}{info && <Info id={info} />}</h2>
      {sub && <p className="section-sub">{sub}</p>}
      {children}
    </section>
  );
}
