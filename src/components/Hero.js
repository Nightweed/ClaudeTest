import React from 'react';
import { Card } from './ui';
import { Gauge } from './charts';
import { LABELS, verdictText } from '../utils/dashboardData';
import { compact, sgn, pct, tone } from '../utils/format';

export default function Hero({ last, quadrantText }) {
  const c = last.components;
  const si = last.debug.scoreInput;
  const { score } = last.debug;
  const lab = LABELS[last.label];
  const kpis = [
    { k: 'Momentum', v: sgn(last.momentum, 3), t: tone(last.momentum), d: `${lab.name}: −0,2 és +0,2 között semleges, ±0,5 felett erős a jel.` },
    { k: 'Nyers pontszám', v: sgn(score.raw, 3), t: tone(score.raw), d: 'A súlyozott összeg a crowding levonás után. Ennek a harmada a momentum.' },
    { k: 'Delta z / Funding z', v: `${sgn(si.deltaPctZ)}  /  ${sgn(si.fundingZ)}`, t: tone(si.deltaPctZ), d: 'A kombinált delta % szokatlansága az elmúlt 50 gyertyához képest, és a funding zsúfoltsága.' },
    { k: 'OI változás / perp CVD', v: `${pct(c.dOIPct, 3)}  /  ${compact(c.cvdPerp, 2)}`, t: tone(c.dOIPct), d: 'A nyitott pozíciók változása a gyertyában, és a kumulált perp delta USD-ben.' },
  ];
  return (
    <div className="hero">
      <Card className="hero-gauge">
        <Gauge value={last.momentum} />
        <span className={`pill pill-${lab.tone}`}>{last.label.replace('_', ' ')} · {lab.name}</span>
        <p className="hero-text">{verdictText(last, quadrantText)}</p>
      </Card>
      <div className="kpis">
        {kpis.map((x) => (
          <Card key={x.k} className={`kpi kpi-${x.t}`}>
            <div className="eyebrow">{x.k}</div>
            <div className="kpi-v">{x.v}</div>
            <p>{x.d}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
