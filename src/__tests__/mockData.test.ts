import { describe, expect, it } from 'vitest';
import { aggregateOHLCV, generateMockStocks } from '../lib/mockData';

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

  it('derives RSI and volume from daily price movement', () => {
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
