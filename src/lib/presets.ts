import type { FilterConfig } from '../types/stock';

export const SCREENER_PRESETS: Array<{ name: string; filters: Omit<FilterConfig, 'enabled'>[] }> = [
  {
    name: 'Value Stocks',
    filters: [
      { id: 'pe', field: 'pe', operator: 'lt', value: 15 },
      { id: 'roe', field: 'roe', operator: 'gt', value: 15 },
      { id: 'debtToEquity', field: 'debtToEquity', operator: 'lt', value: 0.5 },
      { id: 'dividendYield', field: 'dividendYield', operator: 'gt', value: 2 },
    ],
  },
  {
    name: 'Growth Momentum',
    filters: [
      { id: 'revenueGrowthYoY', field: 'revenueGrowthYoY', operator: 'gt', value: 20 },
      { id: 'profitGrowthYoY', field: 'profitGrowthYoY', operator: 'gt', value: 20 },
      { id: 'rsi14', field: 'rsi14', operator: 'between', value: [40, 70] },
      { id: 'priceVsSma50', field: 'priceVsSma50', operator: 'eq', value: 'Above' },
    ],
  },
  {
    name: 'Large Cap Quality',
    filters: [
      { id: 'marketCap', field: 'marketCap', operator: 'gt', value: 20000 },
      { id: 'roce', field: 'roce', operator: 'gt', value: 15 },
      { id: 'promoterHolding', field: 'promoterHolding', operator: 'gt', value: 50 },
    ],
  },
  {
    name: 'Technical Breakout',
    filters: [
      { id: 'priceVsSma200', field: 'priceVsSma200', operator: 'eq', value: 'Above' },
      { id: 'rsi14', field: 'rsi14', operator: 'between', value: [50, 70] },
      { id: 'volumeVsAvg', field: 'volumeVsAvg', operator: 'in', value: ['2x', '3x'] },
      {
        id: 'bollingerPosition',
        field: 'bollingerPosition',
        operator: 'eq',
        value: 'Within Bands',
      },
    ],
  },
];
