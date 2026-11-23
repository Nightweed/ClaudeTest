import { num, sgn } from './format';

describe('num: nulla előjel nélkül', () => {
  test('−0 és a kerekítéskor nullára jövő érték „0"', () => {
    expect(num(-0, 1)).toBe('0');
    expect(num(-1e-12, 1)).toBe('0');
    expect(num(-0.04, 1)).toBe('0');
  });
  test('valódi negatív érték marad negatív, nem véges érték „–"', () => {
    expect(num(-0.5, 1)).toBe('-0,5');
    expect(num(NaN)).toBe('–');
    expect(sgn(-1e-12, 2)).toBe('−0');
  });
});
