import React, { useEffect, useState } from 'react';
import { Section } from './ui';

// Két oszlop fölött széles képernyőn; keskenyen egy oszlop. A csoportok váltakozva kerülnek az oszlopokba
// (1. bal, 2. jobb, 3. bal, ...), így a kinyitott csoport csak a saját oszlopát nyújtja, nincs hézag a szomszéd alatt.
const WIDE = '(min-width: 1000px)';

const useIsWide = () => {
  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(WIDE) : null;
  const [wide, setWide] = useState(query ? query.matches : false);
  useEffect(() => {
    if (!query) return undefined;
    const onChange = (e) => setWide(e.matches);
    setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [query]);
  return wide;
};

const Group = ({ g }) => (
  <details className="card group">
    <summary>{g.name}</summary>
    {g.rows.map((r) => (
      <div key={r.name} className="step">
        <div className="step-row"><b>{r.name}</b><em>{r.result}</em></div>
        {r.text && <p>{r.text}</p>}
        {r.formula && <code>{r.formula}{r.values ? `  →  ${r.values}` : ''}</code>}
      </div>
    ))}
  </details>
);

export default function CalcTab({ groups }) {
  const wide = useIsWide();
  const cols = wide ? [groups.filter((_, i) => i % 2 === 0), groups.filter((_, i) => i % 2 === 1)] : [groups];
  return (
    <Section n="" title="Számítás lépésről lépésre" sub="Minden eredmény a képletével és a behelyettesített számokkal. Kattints egy csoportra a kinyitáshoz.">
      <div className="steps">
        {cols.map((col, ci) => (
          <div className="steps-col" key={ci}>
            {col.map((g) => (
              <Group key={g.name} g={g} />
            ))}
          </div>
        ))}
      </div>
    </Section>
  );
}
