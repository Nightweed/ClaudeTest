import React from 'react';
import { Card, Section } from './ui';
import Hero from './Hero';
import { TimeChart, CandleChart, Donut, Waterfall, ContribBars } from './charts';
import { scoreWaterfall } from '../utils/waterfall';
import { WATERFALL_LABELS, buildSignals, volumeLabel } from '../utils/dashboardData';
import { compact, num, sgn, pct } from '../utils/format';

export default function OverviewTab({ last, lastRow, view, snapView, explanation }) {
  const quadrantText = explanation.find((r) => r.name === 'Kvadráns')?.text;
  const unit = volumeLabel(last);
  return (
    <>
      <Hero last={last} quadrantText={quadrantText} />

      <Section n="01" title="Agresszió és delta" sub="Ki az agresszív fél: a vevők vagy az eladók, és melyik piacon.">
        <div className="grid g-1-2">
          <Card>
            <h3>Vételi / eladási volumen</h3>
            <p className="sub">Az utolsó gyertya perp forgalma, {unit}-ban.</p>
            <Donut buy={lastRow.buyVol} sell={lastRow.volume - lastRow.buyVol} unit={unit} />
            <p className="note">
              Delta (perp): <b>{sgn(lastRow.delta, 2)} {unit}</b>, ez a forgalom <b>{pct(lastRow.deltaPct, 2)}</b>-a. A pontszám a perp és a spot együttes (kombinált) delta %-ából számol, ezért az érték eltérhet.
            </p>
          </Card>
          <Card>
            <h3>Delta gyertyánként</h3>
            <p className="sub">Vételi mínusz eladási agresszió, perp, {unit}. Kék: a vevők nyomnak, piros: az eladók.</p>
            <TimeChart times={view.map((r) => r.t)} series={[{ name: 'Delta', values: view.map((r) => r.delta) }]} bars tipFmt={(v) => `${num(v, 0)} ${unit}`} />
          </Card>
        </div>
        <Card className="mt">
          <h3>Perp és spot delta az utolsó gyertyában</h3>
          <p className="sub">USD-ben. Ha a perp sokkal erősebb, a tőkeáttétel vezeti a mozgást.</p>
          <ContribBars
            items={[
              { label: 'Perp', hint: 'Határidős piac', value: last.debug.spot.perpDeltaUsd, text: compact(last.debug.spot.perpDeltaUsd, 2) },
              { label: 'Spot', hint: 'Azonnali piacok együtt', value: last.debug.spot.spotDeltaUsd, text: compact(last.debug.spot.spotDeltaUsd, 2) },
            ]}
          />
        </Card>
      </Section>

      <Section n="02" title="Így áll össze a pontszám" sub="A nyers pontszám tagjai. A momentum ennek a harmada, −1 és +1 közé vágva.">
        <Card>
          {last.valid ? (
            <Waterfall items={scoreWaterfall(last.debug.score, last.debug.scoreInput, last.debug.weights).map((t) => ({ label: WATERFALL_LABELS[t.key], value: t.value }))} />
          ) : (
            <p className="sub">Az utolsó gyertyánál hiányzik adat ({last.missing.join(', ')}), ezért nincs pontszám.</p>
          )}
          <p className="note">
            Nyers pontszám <b>{sgn(last.debug.score.raw, 3)}</b> ÷ 3 = <b>{sgn(last.momentum, 3)}</b>. A likvidációs oszlop csak akkor nem nulla, ha a likvidáció z-score 2 felett van, és ekkor csak az order-flow tagot csökkenti; a crowding csak akkor, ha a funding ugyanabba az irányba zsúfolt.
          </p>
        </Card>
      </Section>

      <Section n="03" title="Árfolyam és idősorok" sub="A gyertyák, a momentum és a mögötte lévő piaci adatok ugyanazon az időtengelyen.">
        <Card>
          <h3>SOL perp gyertyák</h3>
          <p className="sub">Kék gyertya: a zárás a nyitás felett, piros: alatta. Alul a volumen.</p>
          <CandleChart candles={view.map((r) => ({ t: r.t, o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume, delta: r.delta }))} />
        </Card>
        <div className="grid g-2 mt">
          <Card>
            <h3>Momentum alakulása</h3>
            <p className="sub">A szaggatott vonalak a sávhatárok: ±0,2 felett irányjel, ±0,5 felett erős.</p>
            <TimeChart
              times={snapView.map((s) => s.t)}
              series={[{ name: 'Momentum', color: 'var(--pos)', values: snapView.map((s) => s.momentum) }]}
              area
              fmt={(v) => num(v, 2)}
              refLines={[{ y: 0.5, label: '+0,5' }, { y: 0.2, label: '+0,2' }, { y: -0.2, label: '−0,2' }, { y: -0.5, label: '−0,5' }]}
            />
          </Card>
          <Card>
            <h3>Perp és spot CVD</h3>
            <p className="sub">Kumulált delta USD-ben az ablak elejétől. Ha a spot vezet, az egészségesebb.</p>
            <div className="legend"><span><i style={{ background: 'var(--s1)' }} />Perp</span><span><i style={{ background: 'var(--s2)' }} />Spot</span></div>
            <TimeChart
              times={snapView.map((s) => s.t)}
              series={[
                { name: 'Perp CVD', color: 'var(--s1)', values: snapView.map((s) => s.components.cvdPerp) },
                { name: 'Spot CVD', color: 'var(--s2)', values: snapView.map((s) => s.components.cvdSpot) },
              ]}
              tipFmt={(v) => `${compact(v, 2)} $`}
            />
          </Card>
          <Card>
            <h3>Open interest</h3>
            <p className="sub">A nyitott pozíciók értéke USD-ben a gyertya végén.</p>
            <TimeChart times={view.map((r) => r.t)} series={[{ name: 'OI', color: 'var(--s1)', values: view.map((r) => r.oiClose) }]} area tipFmt={(v) => `${compact(v, 2)} $`} />
          </Card>
          <Card>
            <h3>Funding</h3>
            <p className="sub">Kék: pozitív (a longok fizetnek), piros: negatív. Túl magas érték zsúfolt pozícionálást jelez.</p>
            <TimeChart times={view.map((r) => r.t)} series={[{ name: 'Funding', values: view.map((r) => r.fundingClose) }]} bars fmt={(v) => num(v, 4)} tipFmt={(v) => num(v, 5)} />
          </Card>
          <Card>
            <h3>Nettó likvidáció</h3>
            <p className="sub">Short mínusz long likvidáció. Kék: a shortokat likvidálták, piros: a longokat.</p>
            <TimeChart times={snapView.map((s) => s.t)} series={[{ name: 'Short − long', values: snapView.map((s) => s.components.netLiqUsd) }]} bars tipFmt={(v) => `${compact(v, 2)} $`} />
          </Card>
        </div>
      </Section>

      <Section n="04" title="Jelzések" sub="Az utolsó gyertya jelzései a tényleges értékekkel.">
        <Card>
          <ul className="signals">
            {buildSignals(last).map((s) => (
              <li key={s.title}>
                <i className={`dot dot-${s.tone}`} />
                <span><b>{s.title}</b> {s.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      </Section>
    </>
  );
}
