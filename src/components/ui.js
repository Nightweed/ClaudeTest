import React from 'react';

export function Card({ className = '', children }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Section({ n, title, sub, children }) {
  return (
    <section className="section">
      <h2 className="section-title">{n && <span className="section-n">{n}</span>}{title}</h2>
      {sub && <p className="section-sub">{sub}</p>}
      {children}
    </section>
  );
}
