import { CONFIG, calculateMomentumScore } from './momentum';
import { scoreWaterfall } from './waterfall';

describe('pontszám waterfall', () => {
  const inputs = [
    { deltaPctZ: -1.2, cvdSlopeZ: -2.75, oiQuadrant: 'LONG_LIQUIDATION', dOIZ: -0.31, spotLead: -0.66, liqZ: 0, fundingZ: -0.51 },
    { deltaPctZ: 2, cvdSlopeZ: 1, oiQuadrant: 'NEW_LONGS', dOIZ: 3, spotLead: 1, liqZ: 3, fundingZ: 2.5 },
    { deltaPctZ: -2, cvdSlopeZ: -1, oiQuadrant: 'NEW_SHORTS', dOIZ: 3, spotLead: -1, liqZ: 0, fundingZ: -2 },
  ];

  test.each(inputs)('a tagok összege = nyers pontszám (%#)', (input) => {
    const score = calculateMomentumScore(input);
    const sum = scoreWaterfall(score, input, CONFIG.weights).reduce((a, t) => a + t.value, 0);
    expect(sum).toBeCloseTo(score.raw, 10);
  });
});

// Véletlen bemenetek: a crowding tag a maradék (raw − base), ezért külön ellenőrizzük, hogy
// tényleg csak a képletből adódó értéket tartalmazza, és az összeg nem rejt el hibát.
describe('pontszám waterfall, véletlen bemenetek', () => {
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const z = () => rnd() * 6 - 3;
  const quadrants = ['NEW_LONGS', 'NEW_SHORTS', 'SHORT_COVERING', 'LONG_LIQUIDATION', 'NEUTRAL'];

  test('2000 eset: összeg, likvidációs és crowding tag a képlet szerint', () => {
    const { w1, w2, w3, w4 } = CONFIG.weights;
    for (let n = 0; n < 2000; n++) {
      const input = {
        deltaPctZ: z(), cvdSlopeZ: z(), dOIZ: z(), spotLead: z() - z(), // spotLead tartománya [-6, 6]
        oiQuadrant: quadrants[Math.floor(rnd() * quadrants.length)],
        liqZ: rnd() * 5, fundingZ: z(),
      };
      const score = calculateMomentumScore(input);
      const wf = Object.fromEntries(scoreWaterfall(score, input, CONFIG.weights).map((t) => [t.key, t.value]));

      expect(Object.values(wf).reduce((a, v) => a + v, 0)).toBeCloseTo(score.raw, 9);

      // független újraszámolás a tagokra
      const of = CONFIG.orderFlowMix.deltaPct * input.deltaPctZ + CONFIG.orderFlowMix.cvdSlope * input.cvdSlopeZ;
      expect(wf.orderFlow).toBeCloseTo(w1 * of, 9);
      expect(wf.spot).toBeCloseTo(w3 * input.spotLead, 9);
      // likvidáció: csak 2 felett nem nulla, és csak csökkent (a csillapítás 0,5-szörös)
      if (input.liqZ > CONFIG.liqZDamp) expect(wf.liq).toBeCloseTo(-0.5 * w1 * of, 9);
      else expect(wf.liq).toBeCloseTo(0, 12);
      // crowding: sosem növeli a pontszám nagyságát, és 1-ig (crowdingFree) nulla
      const base = wf.orderFlow + wf.oi + wf.spot + wf.liq;
      const s = Math.sign(base);
      const expected = -w4 * s * Math.max(0, input.fundingZ * s - CONFIG.crowdingFree);
      expect(wf.crowding).toBeCloseTo(expected, 9);
      expect(wf.crowding * s).toBeLessThanOrEqual(1e-12);
    }
  });
});
