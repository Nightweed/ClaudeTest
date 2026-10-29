// A nyers pontszám tagjaira bontása (a calculateMomentumScore képletével azonos algebra).
// A tagok összege pontosan score.raw; a MOMENTUM ennek a /3-a, −1…+1 közé vágva.
// A likvidációs csillapítás csak az order-flow tagot érinti (spec 3.4).

export const scoreWaterfall = (score, scoreInput, weights) => {
  const orderFlowUndamped = weights.w1 * score.orderFlow;
  const orderFlowDamped = score.liqDamp * orderFlowUndamped;
  const oi = weights.w2 * score.oiSignal * 3;
  const spot = weights.w3 * scoreInput.spotLead;
  const base = orderFlowDamped + oi + spot;
  return [
    { key: 'orderFlow', value: orderFlowUndamped },
    { key: 'oi', value: oi },
    { key: 'spot', value: spot },
    { key: 'liq', value: orderFlowDamped - orderFlowUndamped },
    { key: 'crowding', value: score.raw - base },
  ];
};
