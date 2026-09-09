import { describe, it, expect } from 'vitest';
import {
  calculateSMA,
  calculateEMA,
  calculateBollinger,
  calculateRSI,
  calculateVolumeProfile,
} from '../lib/indicators';

describe('Technical Indicator Calculations', () => {
  const samplePrices = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];

  describe('SMA (Simple Moving Average)', () => {
    it('calculates 5-period SMA correctly', () => {
      const sma = calculateSMA(samplePrices, 5);
      expect(sma[0]).toBeUndefined();
      expect(sma[3]).toBeUndefined();
      expect(sma[4]).toBe(14); // (10+12+14+16+18)/5 = 14
      expect(sma[9]).toBe(24); // (20+22+24+26+28)/5 = 24
    });

    it('returns undefined array when dataset length < period', () => {
      const sma = calculateSMA([10, 20], 5);
      expect(sma).toEqual([undefined, undefined]);
    });

    it('uses every value when the period is one', () => {
      expect(calculateSMA([3, 7, 11], 1)).toEqual([3, 7, 11]);
    });
  });

  describe('EMA (Exponential Moving Average)', () => {
    it('calculates EMA with proper warmup and SMA seed', () => {
      const ema = calculateEMA(samplePrices, 5);
      // First period-1 (4) items should be undefined
      expect(ema[0]).toBeUndefined();
      expect(ema[3]).toBeUndefined();
      // Seed at index 4 is SMA(5) = 14
      expect(ema[4]).toBe(14);
      // Index 5 uses exponential multiplier: multiplier = 2/6 = 1/3; EMA = (20 - 14)*(1/3) + 14 = 16
      expect(ema[5]).toBeCloseTo(16);
    });

    it('returns only warmup values when there is not enough data for the EMA seed', () => {
      expect(calculateEMA([10, 20], 3)).toEqual([undefined, undefined]);
    });
  });

  describe('Bollinger Bands', () => {
    it('calculates middle, upper, and lower bands', () => {
      const bb = calculateBollinger(samplePrices, 5, 2);
      expect(bb[0]).toBeUndefined();
      const last = bb[9];
      expect(last).toBeDefined();
      if (last) {
        expect(last.middle).toBe(24);
        expect(last.upper).toBeGreaterThan(last.middle);
        expect(last.lower).toBeLessThan(last.middle);
      }
    });

    it('uses the population standard deviation in a known five-value window', () => {
      // Mean = 14; variance = (16 + 4 + 0 + 4 + 16) / 5 = 8.
      const band = calculateBollinger([10, 12, 14, 16, 18], 5, 2)[4];
      expect(band?.middle).toBe(14);
      expect(band?.upper).toBeCloseTo(14 + 2 * Math.sqrt(8));
      expect(band?.lower).toBeCloseTo(14 - 2 * Math.sqrt(8));
    });

    it('collapses all bands to the same value for constant prices', () => {
      expect(calculateBollinger([10, 10, 10, 10, 10], 5, 2)[4]).toEqual({
        middle: 10,
        upper: 10,
        lower: 10,
      });
    });
  });

  describe('RSI (Relative Strength Index)', () => {
    it('returns undefined for periods < 14', () => {
      const rsi = calculateRSI(samplePrices, 14);
      expect(rsi.every((v) => v === undefined)).toBe(true);
    });

    it('calculates RSI values between 0 and 100 for sufficient data', () => {
      const extendedPrices = Array.from(
        { length: 30 },
        (_, i) => 100 + i * 2 + (i % 2 === 0 ? 3 : -3),
      );
      const rsi = calculateRSI(extendedPrices, 14);
      expect(rsi[14]).toBeGreaterThanOrEqual(0);
      expect(rsi[14]).toBeLessThanOrEqual(100);
    });

    it('returns 100 after a period containing only gains', () => {
      expect(calculateRSI([1, 2, 3, 4, 5], 4)[4]).toBe(100);
    });

    it('returns 0 after a period containing only losses', () => {
      expect(calculateRSI([5, 4, 3, 2, 1], 4)[4]).toBe(0);
    });

    it('returns 50 when the initial average gain equals the average loss', () => {
      // Four changes: +2, -2, +2, -2. Average gain and loss are both 1.
      expect(calculateRSI([100, 102, 100, 102, 100], 4)[4]).toBe(50);
    });
  });

  describe('Volume Profile', () => {
    it('distributes volume into price buckets', () => {
      const candles = [
        { time: 1, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { time: 2, open: 105, high: 115, low: 95, close: 110, volume: 2000 },
      ];
      const profile = calculateVolumeProfile(candles, 5);
      expect(profile.length).toBe(5);
      expect(profile[0]).toHaveProperty('price');
      expect(profile[0]).toHaveProperty('volume');
    });

    it('places volume in the exact bucket determined by each closing price', () => {
      const candles = [
        { time: 1, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { time: 2, open: 105, high: 115, low: 95, close: 110, volume: 2000 },
      ];
      const profile = calculateVolumeProfile(candles, 5);

      expect(profile.map((bucket) => bucket.price)).toEqual([92.5, 97.5, 102.5, 107.5, 112.5]);
      expect(profile.map((bucket) => bucket.volume)).toEqual([0, 0, 0, 1000, 2000]);
    });

    it('preserves total traded volume across all buckets', () => {
      const candles = [
        { time: 1, open: 10, high: 12, low: 8, close: 9, volume: 120 },
        { time: 2, open: 9, high: 15, low: 9, close: 15, volume: 380 },
      ];
      expect(
        calculateVolumeProfile(candles, 4).reduce((total, bucket) => total + bucket.volume, 0),
      ).toBe(500);
    });

    it('returns no buckets for an empty candle list', () => {
      expect(calculateVolumeProfile([], 5)).toEqual([]);
    });
  });
});
