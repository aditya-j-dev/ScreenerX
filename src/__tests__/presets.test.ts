import { describe, expect, it } from 'vitest';
import { SCREENER_PRESETS } from '../lib/presets';
import { filterStocks } from '../lib/filterEngine';
import { generateMockStocks } from '../lib/mockData';
import type { Stock } from '../types/stock';

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
    expect(
      preset('Large Cap Quality').filters.map(({ field, operator, value }) => ({
        field,
        operator,
        value,
      })),
    ).toEqual([
      { field: 'marketCap', operator: 'gt', value: 20000 },
      { field: 'roce', operator: 'gt', value: 15 },
      { field: 'promoterHolding', operator: 'gt', value: 50 },
    ]);
  });

  it('defines all four Technical Breakout criteria', () => {
    expect(
      preset('Technical Breakout').filters.map(({ field, operator, value }) => ({
        field,
        operator,
        value,
      })),
    ).toEqual([
      { field: 'priceVsSma200', operator: 'eq', value: 'Above' },
      { field: 'rsi14', operator: 'between', value: [50, 70] },
      { field: 'volumeVsAvg', operator: 'in', value: ['2x', '3x'] },
      { field: 'bollingerPosition', operator: 'eq', value: 'Within Bands' },
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
      const references: Record<string, (stock: Stock) => boolean> = {
        'Value Stocks': (s) =>
          s.pe !== null && s.pe < 15 && s.roe > 15 && s.debtToEquity < 0.5 && s.dividendYield > 2,
        'Growth Momentum': (s) =>
          s.revenueGrowthYoY > 20 &&
          s.profitGrowthYoY > 20 &&
          s.rsi14 >= 40 &&
          s.rsi14 <= 70 &&
          s.lastPrice > s.sma50,
        'Large Cap Quality': (s) => s.marketCap > 20000 && s.roce > 15 && s.promoterHolding > 50,
        'Technical Breakout': (s) =>
          s.lastPrice > s.sma200 &&
          s.rsi14 >= 50 &&
          s.rsi14 <= 70 &&
          s.volume >= 2 * s.avgVolume20D &&
          s.bollingerPosition === 'Within Bands',
      };
      expect(results.map((stock) => stock.symbol)).toEqual(
        stocks.filter(references[definition.name]).map((stock) => stock.symbol),
      );
    },
  );

  it('excludes exact strict Value Stocks thresholds and missing P/E', () => {
    const matching = { ...stocks[0], pe: 10, roe: 20, debtToEquity: 0.2, dividendYield: 3 };
    const records = [
      matching,
      { ...matching, pe: 15 },
      { ...matching, roe: 15 },
      { ...matching, debtToEquity: 0.5 },
      { ...matching, dividendYield: 2 },
      { ...matching, pe: null },
    ];
    expect(
      filterStocks(
        records,
        preset('Value Stocks').filters.map((filter) => ({ ...filter, enabled: true })),
      ),
    ).toEqual([matching]);
  });

  it('includes RSI boundaries but excludes growth thresholds in Growth Momentum', () => {
    const matching = {
      ...stocks[0],
      revenueGrowthYoY: 30,
      profitGrowthYoY: 30,
      rsi14: 40,
      priceVsSma50: 'Above' as const,
    };
    const upper = { ...matching, rsi14: 70 };
    const records = [
      matching,
      upper,
      { ...matching, rsi14: 39.99 },
      { ...matching, rsi14: 70.01 },
      { ...matching, revenueGrowthYoY: 20 },
      { ...matching, profitGrowthYoY: 20 },
      { ...matching, priceVsSma50: 'Below' as const },
    ];
    expect(
      filterStocks(
        records,
        preset('Growth Momentum').filters.map((filter) => ({ ...filter, enabled: true })),
      ),
    ).toEqual([matching, upper]);
  });

  it('excludes each exact Large Cap Quality threshold', () => {
    const matching = { ...stocks[0], marketCap: 30000, roce: 20, promoterHolding: 60 };
    const records = [
      matching,
      { ...matching, marketCap: 20000 },
      { ...matching, roce: 15 },
      { ...matching, promoterHolding: 50 },
    ];
    expect(
      filterStocks(
        records,
        preset('Large Cap Quality').filters.map((filter) => ({ ...filter, enabled: true })),
      ),
    ).toEqual([matching]);
  });

  it('requires all four Technical Breakout conditions and accepts both volume buckets', () => {
    const matching = {
      ...stocks[0],
      rsi14: 50,
      priceVsSma200: 'Above' as const,
      volumeVsAvg: '2x' as const,
      bollingerPosition: 'Within Bands' as const,
    };
    const upper = { ...matching, rsi14: 70, volumeVsAvg: '3x' as const };
    const records = [
      matching,
      upper,
      { ...matching, rsi14: 49.99 },
      { ...matching, rsi14: 70.01 },
      { ...matching, priceVsSma200: 'Below' as const },
      { ...matching, volumeVsAvg: 'Above' as const },
      { ...matching, bollingerPosition: 'Above Upper' as const },
    ];
    expect(
      filterStocks(
        records,
        preset('Technical Breakout').filters.map((filter) => ({ ...filter, enabled: true })),
      ),
    ).toEqual([matching, upper]);
  });
});
