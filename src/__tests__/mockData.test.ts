import { describe, expect, it } from 'vitest';
import { aggregateOHLCV, generateMockStocks, generateRecentCloses } from '../lib/mockData';

const stocks = generateMockStocks();

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function correlation(first: number[], second: number[]) {
  const firstMean = mean(first);
  const secondMean = mean(second);
  const numerator = first.reduce(
    (sum, value, index) => sum + (value - firstMean) * (second[index] - secondMean),
    0,
  );
  const denominator = Math.sqrt(
    first.reduce((sum, value) => sum + (value - firstMean) ** 2, 0) *
      second.reduce((sum, value) => sum + (value - secondMean) ** 2, 0),
  );
  return numerator / denominator;
}

describe('mock Indian equity universe', () => {
  it('creates the required 5,000-stock market-cap distribution', () => {
    expect(stocks).toHaveLength(5000);
    expect(stocks.filter((stock) => stock.marketCapCategory === 'Large Cap')).toHaveLength(100);
    expect(stocks.filter((stock) => stock.marketCapCategory === 'Mid Cap')).toHaveLength(400);
    expect(stocks.filter((stock) => stock.marketCapCategory === 'Small Cap')).toHaveLength(1500);
    expect(stocks.filter((stock) => stock.marketCapCategory === 'Micro Cap')).toHaveLength(3000);
  });

  it('uses the documented sector-weighted distribution', () => {
    expect(stocks.filter((stock) => stock.sector === 'Banking')).toHaveLength(750);
    expect(stocks.filter((stock) => stock.sector === 'IT')).toHaveLength(600);
    expect(stocks.filter((stock) => stock.sector === 'Pharma')).toHaveLength(500);
    expect(stocks.filter((stock) => stock.sector === 'Infrastructure')).toHaveLength(400);
  });

  it('correlates market cap with beta and promoter holding', () => {
    const largeCaps = stocks.filter((stock) => stock.marketCapCategory === 'Large Cap');
    expect(
      correlation(
        stocks.map((stock) => stock.marketCap),
        stocks.map((stock) => stock.beta),
      ),
    ).toBeLessThan(-0.25);
    expect(largeCaps.every((stock) => stock.beta >= 0.5 && stock.beta <= 1.2)).toBe(true);
    expect(
      largeCaps.every((stock) => stock.promoterHolding >= 40 && stock.promoterHolding <= 75),
    ).toBe(true);
  });

  it('derives P/E and debt/equity from growth and sector', () => {
    const highGrowthPe = mean(
      stocks.filter((stock) => stock.revenueGrowthYoY > 25).map((stock) => stock.pe ?? 0),
    );
    const decliningPe = mean(
      stocks.filter((stock) => stock.revenueGrowthYoY <= 0).map((stock) => stock.pe ?? 0),
    );
    const bankingDebt = mean(
      stocks.filter((stock) => stock.sector === 'Banking').map((stock) => stock.debtToEquity),
    );
    const itDebt = mean(
      stocks.filter((stock) => stock.sector === 'IT').map((stock) => stock.debtToEquity),
    );

    expect(highGrowthPe).toBeGreaterThan(decliningPe);
    expect(bankingDebt).toBeGreaterThan(5);
    expect(itDebt).toBeLessThan(0.5);
  });

  it('derives RSI from recent closes and correlates it with five-day returns', () => {
    const positive: number[] = [];
    const negative: number[] = [];
    for (const stock of stocks) {
      const closes = generateRecentCloses(stock.id, stock.lastPrice);
      // Independent Wilder smoothing reference, rather than invoking calculateRSI again.
      let gain = 0;
      let loss = 0;
      for (let index = 1; index < closes.length; index++) {
        const change = closes[index] - closes[index - 1];
        if (index <= 14) {
          gain += Math.max(0, change) / 14;
          loss += Math.max(0, -change) / 14;
        } else {
          gain = (gain * 13 + Math.max(0, change)) / 14;
          loss = (loss * 13 + Math.max(0, -change)) / 14;
        }
      }
      const expected = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
      expect(Math.abs(stock.rsi14 - expected)).toBeLessThanOrEqual(0.0051);
      expect(closes[closes.length - 1]).toBeCloseTo(stock.lastPrice, 8);
      expect(stock.previousClose).toBeCloseTo(closes[closes.length - 2], 2);
      const fiveDayReturn = closes[closes.length - 1] / closes[closes.length - 6] - 1;
      (fiveDayReturn > 0 ? positive : negative).push(stock.rsi14);
    }
    expect(mean(positive)).toBeGreaterThan(50);
    expect(mean(negative)).toBeLessThan(50);
  });

  it('distributes every cap category across sectors rather than tying caps to sector order', () => {
    for (const category of ['Large Cap', 'Mid Cap', 'Small Cap', 'Micro Cap']) {
      const sectors = new Set(
        stocks.filter((stock) => stock.marketCapCategory === category).map((stock) => stock.sector),
      );
      expect(sectors.size).toBe(12);
    }
  });

  it('assigns bounded, non-overlapping mock indices within their cap categories', () => {
    const indices = [
      ['NIFTY 50', 50, 'Large Cap'],
      ['NIFTY Next 50', 50, 'Large Cap'],
      ['BSE Sensex', 30, 'Large Cap'],
      ['NIFTY Midcap 100', 100, 'Mid Cap'],
      ['NIFTY Smallcap 250', 250, 'Small Cap'],
    ] as const;
    for (const [name, count, category] of indices) {
      const members = stocks.filter((stock) => stock.indexMembership.includes(name));
      expect(members).toHaveLength(count);
      expect(members.every((stock) => stock.marketCapCategory === category)).toBe(true);
    }
    expect(
      stocks.some(
        (stock) =>
          stock.indexMembership.includes('NIFTY 50') &&
          stock.indexMembership.includes('NIFTY Next 50'),
      ),
    ).toBe(false);
    expect(
      stocks
        .filter((stock) => stock.indexMembership.includes('BSE Sensex'))
        .every((stock) => stock.indexMembership.includes('NIFTY 50')),
    ).toBe(true);
  });

  it('keeps generated financial fields and memberships deterministic', () => {
    const withoutTimestamp = (records: typeof stocks) =>
      records.map(({ updatedAt, ...stock }) => stock);
    expect(withoutTimestamp(generateMockStocks())).toEqual(withoutTimestamp(stocks));
  });

  it('labels volume multiples according to their actual numeric ratios', () => {
    for (const stock of stocks) {
      const ratio = stock.volume / stock.avgVolume20D;
      const expected = ratio >= 3 ? '3x' : ratio >= 2 ? '2x' : ratio >= 1 ? 'Above' : 'Below';
      expect(stock.volumeVsAvg).toBe(expected);
    }
    expect(stocks.some((stock) => stock.volumeVsAvg === '3x')).toBe(true);
  });

  it.each([0, 1, 2, 50])(
    'handles a smaller universe of %i records without duplicate symbols or memberships',
    (count) => {
      const small = generateMockStocks(count);
      expect(small).toHaveLength(count);
      expect(new Set(small.map((stock) => stock.symbol)).size).toBe(count);
      expect(
        small.every(
          (stock) => new Set(stock.indexMembership).size === stock.indexMembership.length,
        ),
      ).toBe(true);
    },
  );

  it('correlates RSI and volume with daily price movement on average', () => {
    const positiveRsi = mean(
      stocks.filter((stock) => stock.changePercent > 0).map((stock) => stock.rsi14),
    );
    const negativeRsi = mean(
      stocks.filter((stock) => stock.changePercent < 0).map((stock) => stock.rsi14),
    );
    const bigMoveVolume = mean(
      stocks
        .filter((stock) => Math.abs(stock.changePercent) >= 2)
        .map((stock) => stock.volume / stock.avgVolume20D),
    );
    const calmVolume = mean(
      stocks
        .filter((stock) => Math.abs(stock.changePercent) < 2)
        .map((stock) => stock.volume / stock.avgVolume20D),
    );

    expect(positiveRsi).toBeGreaterThan(50);
    expect(negativeRsi).toBeLessThan(50);
    expect(bigMoveVolume).toBeGreaterThan(calmVolume);
  });

  it('aggregates daily candles into truthful weekly OHLCV candles for the five-year view', () => {
    const daily = [
      { time: 1, open: 10, high: 13, low: 9, close: 12, volume: 100 },
      { time: 2, open: 12, high: 15, low: 11, close: 14, volume: 200 },
      { time: 3, open: 14, high: 16, low: 10, close: 11, volume: 300 },
    ];

    expect(aggregateOHLCV(daily, 2)).toEqual([
      { time: 2, open: 10, high: 15, low: 9, close: 14, volume: 300 },
      { time: 3, open: 14, high: 16, low: 10, close: 11, volume: 300 },
    ]);
  });
});
