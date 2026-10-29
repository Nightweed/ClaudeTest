import React from 'react';
import { Section } from './ui';

export default function CalcTab({ groups }) {
  return (
    <Section n="" title="Számítás lépésről lépésre" sub="Minden eredmény a képletével és a behelyettesített számokkal. Kattints egy csoportra a kinyitáshoz.">
      <div className="steps">
        {groups.map((g, i) => (
          <details key={g.name} className="card group" open={i === 0}>
            <summary>{g.name}</summary>
            {g.rows.map((r) => (
              <div key={r.name} className="step">
                <div className="step-row"><b>{r.name}</b><em>{r.result}</em></div>
                {r.text && <p>{r.text}</p>}
                {r.formula && <code>{r.formula}{r.values ? `  →  ${r.values}` : ''}</code>}
              </div>
            ))}
          </details>
        ))}
      </div>
    </Section>
  );
}
