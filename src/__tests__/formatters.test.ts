import { describe, expect, it } from 'vitest';
import { formatMarketCap, formatPriceINR, formatVolume, getRsiTone } from '../lib/formatters';

describe('data-grid formatters', () => {
  it('formats prices as INR with two decimals', () => {
    expect(formatPriceINR(123456.7)).toBe('₹1,23,456.70');
  });

  it.each([
    [800, '800'],
    [8_200, '8.2K'],
    [4_500_000, '45L'],
    [12_000_000, '1.2Cr'],
  ])('formats volume %i as %s', (value, expected) => {
    expect(formatVolume(value)).toBe(expected);
  });

  it.each([
    [850, '850 Cr'],
    [50_000, '50K Cr'],
    [2_000_000, '20L Cr'],
  ])('formats market cap %i as %s', (value, expected) => {
    expect(formatMarketCap(value)).toBe(expected);
  });

  it('categorizes RSI ranges at the required boundaries', () => {
    expect(getRsiTone(29.9)).toBe('oversold');
    expect(getRsiTone(30)).toBe('neutral');
    expect(getRsiTone(70)).toBe('neutral');
    expect(getRsiTone(70.1)).toBe('overbought');
  });
});
