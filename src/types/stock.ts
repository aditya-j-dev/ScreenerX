export type Sector =
  | 'IT'
  | 'Banking'
  | 'Pharma'
  | 'Auto'
  | 'FMCG'
  | 'Metal'
  | 'Energy'
  | 'Realty'
  | 'Telecom'
  | 'Infrastructure'
  | 'Media'
  | 'Others';

export type MarketCapCategory = 'Large Cap' | 'Mid Cap' | 'Small Cap' | 'Micro Cap';
export type MacdSignal = 'Bullish Crossover' | 'Bearish Crossover' | 'Neutral';
export type BollingerPosition = 'Above Upper' | 'Within Bands' | 'Below Lower';
export type VolumeVsAverage = 'Below' | 'Above' | '2x' | '3x';

/** The complete financial-record contract defined in PDF Task 1.2. */
export interface Stock {
  id: number;
  symbol: string;
  companyName: string;
  sector: Sector;
  industry: string;
  marketCapCategory: MarketCapCategory;
  indexMembership: string[];

  // Price data
  lastPrice: number;
  previousClose: number;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  changePercent: number;
  changeAbsolute: number;
  volume: number;
  avgVolume20D: number;
  week52High: number;
  week52Low: number;

  // Fundamentals
  marketCap: number;
  pe: number | null;
  pb: number;
  dividendYield: number;
  eps: number;
  roe: number;
  roce: number;
  debtToEquity: number;
  currentRatio: number;
  promoterHolding: number;
  revenueGrowthYoY: number;
  profitGrowthYoY: number;

  // Technicals
  rsi14: number;
  sma50: number;
  sma200: number;
  beta: number;
  atr: number;
  macdSignal: MacdSignal;
  bollingerPosition: BollingerPosition;
  volumeVsAvg: VolumeVsAverage;

  // UI-derived state used by the current application.
  priceVsSma50: 'Above' | 'Below';
  priceVsSma200: 'Above' | 'Below';
  watchlist: boolean;
  recentlyUpdated: boolean;
  updatedAt: number;
}

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'notIn'
  | 'contains'
  | 'startsWith';

export type FilterValue = number | string | boolean | number[] | string[];

export interface FilterConfig {
  id: string;
  field: keyof Stock;
  operator: FilterOperator;
  value: FilterValue;
  enabled: boolean;
  group?: 'AND' | 'OR';
}

export interface SortConfig {
  field: keyof Stock | null;
  direction: 'asc' | 'desc' | null;
}

export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceUpdate {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: number;
}
