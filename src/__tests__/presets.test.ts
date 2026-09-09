import { describe, expect, it } from 'vitest';
import { SCREENER_PRESETS } from '../lib/presets';
import { filterStocks } from '../lib/filterEngine';
import { generateMockStocks } from '../lib/mockData';

const stocks = generateMockStocks();

function preset(name: string) {
  const result = SCREENER_PRESETS.find((item) => item.name === name);
  if (!result) throw new Error(`Missing ${name} preset`);
  return result;
}

describe('PDF screener presets', () => {
  it('defines every required preset', () => {
    expect(SCREENER_PRESETS.map((item) => item.name)).toEqual([
      'Value Stocks',
      'Growth Momentum',
      'Large Cap Quality',
      'Technical Breakout',
    ]);
  });

  it('uses the exact Value Stocks criteria', () => {
    expect(
      preset('Value Stocks').filters.map(({ field, operator, value }) => ({
        field,
        operator,
        value,
      })),
    ).toEqual([
      { field: 'pe', operator: 'lt', value: 15 },
      { field: 'roe', operator: 'gt', value: 15 },
      { field: 'debtToEquity', operator: 'lt', value: 0.5 },
      { field: 'dividendYield', operator: 'gt', value: 2 },
    ]);
  });

  it('uses the exact Growth Momentum criteria', () => {
    expect(
      preset('Growth Momentum').filters.map(({ field, operator, value }) => ({
        field,
        operator,
        value,
      })),
    ).toEqual([
      { field: 'revenueGrowthYoY', operator: 'gt', value: 20 },
      { field: 'profitGrowthYoY', operator: 'gt', value: 20 },
      { field: 'rsi14', operator: 'between', value: [40, 70] },
      { field: 'priceVsSma50', operator: 'eq', value: 'Above' },
    ]);
  });

  it('uses 20,000 Cr for Large Cap Quality', () => {
    expect(preset('Large Cap Quality').filters).toContainEqual({
      id: 'marketCap',
      field: 'marketCap',
      operator: 'gt',
      value: 20000,
    });
  });

  it('defines all four Technical Breakout criteria', () => {
    expect(preset('Technical Breakout').filters.map((filter) => filter.field)).toEqual([
      'priceVsSma200',
      'rsi14',
      'volumeVsAvg',
      'bollingerPosition',
    ]);
  });

  it.each(SCREENER_PRESETS)(
    '$name produces only stocks satisfying every configured criterion',
    (definition) => {
      const results = filterStocks(
        stocks,
        definition.filters.map((filter) => ({ ...filter, enabled: true })),
      );
      expect(results.length).toBeGreaterThan(0);
      expect(
        results.every(
          (stock) =>
            filterStocks(
              [stock],
              definition.filters.map((filter) => ({ ...filter, enabled: true })),
            ).length === 1,
        ),
      ).toBe(true);
    },
  );
});
