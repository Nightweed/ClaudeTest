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
