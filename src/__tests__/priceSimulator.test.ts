import { describe, expect, it } from 'vitest';
import {
  combineSectorShock,
  gaussianRandom,
  marketHoursVolatilityMultiplier,
  simulateNextPrice,
} from '../lib/priceSimulator';
import { seededRandom } from '../lib/mockData';

describe('simulation mathematics', () => {
  it('uses the exponential GBM step, drift correction and positive price floor', () => {
    expect(simulateNextPrice(100, 0.2, 0.1, 1, 0)).toBeCloseTo(108.3287067675, 8);
    expect(simulateNextPrice(100, 0, 0, 1, 10)).toBe(100);
    expect(simulateNextPrice(100, 0.2, 0.1, 1, -100)).toBe(0.1);
    expect(Number.isFinite(gaussianRandom(() => 0))).toBe(true);
  });
  it('produces approximately 0.6 pairwise sector correlation with independent residuals', () => {
    const random = seededRandom(99);
    const pairs = Array.from({ length: 20000 }, () => {
      const common = gaussianRandom(random);
      return [
        combineSectorShock(common, 0.6, gaussianRandom(random)),
        combineSectorShock(common, 0.6, gaussianRandom(random)),
      ];
    });
    const meanA = pairs.reduce((sum, [a]) => sum + a, 0) / pairs.length;
    const meanB = pairs.reduce((sum, [, b]) => sum + b, 0) / pairs.length;
    const covariance = pairs.reduce((sum, [a, b]) => sum + (a - meanA) * (b - meanB), 0);
    const varianceA = pairs.reduce((sum, [a]) => sum + (a - meanA) ** 2, 0);
    const varianceB = pairs.reduce((sum, [, b]) => sum + (b - meanB) ** 2, 0);
    expect(covariance / Math.sqrt(varianceA * varianceB)).toBeCloseTo(0.6, 1);
    expect(combineSectorShock(2, 0, 3)).toBe(3);
    expect(combineSectorShock(2, 1, 3)).toBe(2);
  });
  it.each([-1, 1.1, NaN])('rejects invalid sector correlation %s', (correlation) => {
    expect(() => combineSectorShock(0, correlation, 0)).toThrow(RangeError);
  });
  it.each([
    ['2026-11-09T03:44:00Z', 1],
    ['2026-11-09T03:45:00Z', 1.6],
    ['2026-11-09T04:15:00Z', 0.7],
    ['2026-11-09T09:30:00Z', 1.6],
    ['2026-11-09T10:00:00Z', 1],
    ['2026-11-07T04:00:00Z', 1],
  ])('uses session volatility at %s', (date, expected) => {
    expect(marketHoursVolatilityMultiplier(new Date(date))).toBe(expected);
  });
});
