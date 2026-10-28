// A nyers pontszám tagjaira bontása (a calculateMomentumScore képletével azonos algebra).
// A tagok összege pontosan score.raw; a MOMENTUM ennek a /3-a, −1…+1 közé vágva.

export const scoreWaterfall = (score, scoreInput, weights) => {
  const orderFlow = weights.w1 * score.orderFlow;
  const oi = weights.w2 * score.oiSignal * 3;
  const spot = weights.w3 * scoreInput.spotLead;
  const undamped = orderFlow + oi + spot;
  const base = score.liqDamp * undamped;
  return [
    { key: 'orderFlow', value: orderFlow },
    { key: 'oi', value: oi },
    { key: 'spot', value: spot },
    { key: 'liq', value: base - undamped },
    { key: 'crowding', value: score.raw - base },
  ];
};
