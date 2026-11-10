import type { MarketCapCategory, OHLCV, Sector, Stock } from '@/types/stock';
import { calculateRSI } from '@/lib/indicators';

type SectorProfile = {
  sector: Sector;
  count: number;
  industries: string[];
  debtRange: [number, number];
  averagePe: number;
};

const SECTOR_PROFILES: SectorProfile[] = [
  {
    sector: 'Banking',
    count: 750,
    industries: ['Private Bank', 'Public Bank', 'NBFC'],
    debtRange: [5, 15],
    averagePe: 18.5,
  },
  {
    sector: 'IT',
    count: 600,
    industries: ['Software', 'IT Services', 'Semiconductors'],
    debtRange: [0, 0.5],
    averagePe: 25,
  },
  {
    sector: 'Pharma',
    count: 500,
    industries: ['Pharmaceuticals', 'Biotech'],
    debtRange: [0.1, 1.2],
    averagePe: 30,
  },
  {
    sector: 'FMCG',
    count: 400,
    industries: ['Consumer Goods', 'Food Products'],
    debtRange: [0, 0.5],
    averagePe: 35,
  },
  {
    sector: 'Auto',
    count: 350,
    industries: ['Automobiles', 'Auto Components'],
    debtRange: [0.3, 1.5],
    averagePe: 22,
  },
  {
    sector: 'Metal',
    count: 300,
    industries: ['Steel', 'Aluminium', 'Mining'],
    debtRange: [0.5, 2.5],
    averagePe: 12,
  },
  {
    sector: 'Energy',
    count: 300,
    industries: ['Oil & Gas', 'Renewables', 'Power'],
    debtRange: [0.8, 3],
    averagePe: 14,
  },
  {
    sector: 'Realty',
    count: 350,
    industries: ['Real Estate', 'REIT'],
    debtRange: [1, 3],
    averagePe: 20,
  },
  {
    sector: 'Telecom',
    count: 100,
    industries: ['Telecom Services'],
    debtRange: [1, 3],
    averagePe: 28,
  },
  {
    sector: 'Media',
    count: 100,
    industries: ['Entertainment', 'Broadcasting'],
    debtRange: [0.5, 2],
    averagePe: 28,
  },
  {
    sector: 'Infrastructure',
    count: 400,
    industries: ['Construction', 'Engineering'],
    debtRange: [0.5, 2],
    averagePe: 18,
  },
  {
    sector: 'Others',
    count: 850,
    industries: ['Chemicals', 'Textiles', 'Paper', 'Diversified'],
    debtRange: [0.2, 2.5],
    averagePe: 18,
  },
];

const PREFIXES = [
  'Nova',
  'Apex',
  'Vertex',
  'Orbit',
  'Zenith',
  'Pioneer',
  'Prime',
  'Summit',
  'Matrix',
  'Quantum',
  'Delta',
  'Blue',
  'Green',
  'Trident',
  'Sterling',
  'Crest',
  'Argo',
  'Vega',
  'Atlas',
  'Eagle',
];
const SUFFIXES = [
  'Tech',
  'Systems',
  'Industries',
  'Holdings',
  'Labs',
  'Finance',
  'Motors',
  'Pharma',
  'Energy',
  'Networks',
  'Infra',
  'Foods',
];
const CAP_BUCKETS: Array<{ category: MarketCapCategory; share: number; range: [number, number] }> =
  [
    { category: 'Large Cap', share: 0.02, range: [50000, 2000000] },
    { category: 'Mid Cap', share: 0.08, range: [10000, 49999] },
    { category: 'Small Cap', share: 0.3, range: [1000, 9999] },
    { category: 'Micro Cap', share: 0.6, range: [50, 999] },
  ];

const BETA_RANGES: Record<MarketCapCategory, [number, number]> = {
  'Large Cap': [0.5, 0.75],
  'Mid Cap': [0.75, 1.35],
  'Small Cap': [0.9, 2.1],
  'Micro Cap': [1.1, 2.5],
};

const PROMOTER_RANGES: Record<MarketCapCategory, [number, number]> = {
  'Large Cap': [40, 75],
  'Mid Cap': [30, 80],
  'Small Cap': [25, 85],
  'Micro Cap': [20, 90],
};

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function between(rand: () => number, [minimum, maximum]: [number, number]) {
  return minimum + rand() * (maximum - minimum);
}

function rounded(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function repeatProfiles(count: number) {
  const scale = count / 5000;
  const profiles = SECTOR_PROFILES.flatMap((profile) =>
    Array.from({ length: Math.round(profile.count * scale) }, () => profile),
  );

  while (profiles.length < count)
    profiles.push(SECTOR_PROFILES[profiles.length % SECTOR_PROFILES.length]);
  const result = profiles.slice(0, count);
  // Independent seeded shuffle prevents cap-bucket order from determining sector.
  const random = seededRandom(2026);
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/** Synthetic recent closes for the universe RSI, with a persistent trend plus daily noise.
 * These are not exchange data; chart OHLCV generation is a separate mock model. */
export function generateRecentCloses(id: number, lastPrice: number): number[] {
  const random = seededRandom(id * 7919);
  const trend = between(random, [-0.012, 0.012]);
  const closes = [100];
  for (let index = 1; index <= 60; index++) {
    closes.push(closes[index - 1] * (1 + trend + between(random, [-0.025, 0.025])));
  }
  const scale = lastPrice / closes[closes.length - 1];
  return closes.map((close) => close * scale);
}

/** Rank-based mock membership, not official exchange eligibility or actual constituents. */
function assignIndexMembership(stocks: Stock[]) {
  const ranked = (category: MarketCapCategory) =>
    stocks
      .filter((stock) => stock.marketCapCategory === category)
      .sort((a, b) => b.marketCap - a.marketCap);
  const largeCaps = ranked('Large Cap');
  largeCaps.slice(0, 50).forEach((stock) => stock.indexMembership.push('NIFTY 50'));
  largeCaps.slice(50, 100).forEach((stock) => stock.indexMembership.push('NIFTY Next 50'));
  largeCaps.slice(0, 30).forEach((stock) => stock.indexMembership.push('BSE Sensex'));
  ranked('Mid Cap')
    .slice(0, 100)
    .forEach((stock) => stock.indexMembership.push('NIFTY Midcap 100'));
  ranked('Small Cap')
    .slice(0, 250)
    .forEach((stock) => stock.indexMembership.push('NIFTY Smallcap 250'));
}

function capBucketFor(index: number, count: number) {
  let cursor = 0;
  for (const bucket of CAP_BUCKETS) {
    const bucketSize =
      bucket.category === 'Micro Cap' ? count - cursor : Math.round(count * bucket.share);
    if (index < cursor + bucketSize) return bucket;
    cursor += bucketSize;
  }
  return CAP_BUCKETS[CAP_BUCKETS.length - 1];
}

function peForGrowth(rand: () => number, growth: number, sectorAverage: number) {
  if (growth > 25) return rounded(between(rand, [20, 80]));
  if (growth <= 0) return rand() < 0.2 ? null : rounded(between(rand, [-10, 15]));
  return rounded(Math.max(5, sectorAverage + between(rand, [-8, 8])));
}

export function generateMockStocks(count = 5000): Stock[] {
  const rand = seededRandom(42);
  const now = Date.now();
  const sectorProfiles = repeatProfiles(count);

  const stocks: Stock[] = Array.from({ length: count }, (_, index) => {
    const profile = sectorProfiles[index];
    const capBucket = capBucketFor(index, count);
    const marketCap = Math.round(between(rand, capBucket.range));
    const lastPrice = rounded(between(rand, [50, Math.min(5000, 150 + Math.sqrt(marketCap) * 4)]));
    const recentCloses = generateRecentCloses(index + 1, lastPrice);
    const previousClose = rounded(recentCloses[recentCloses.length - 2]);
    const changePercent = rounded(((lastPrice - previousClose) / previousClose) * 100);
    const changeAbsolute = rounded(lastPrice - previousClose);
    const dayOpen = rounded(previousClose * (1 + between(rand, [-0.01, 0.01])));
    const dayHigh = rounded(Math.max(lastPrice, dayOpen) * (1 + between(rand, [0.002, 0.03])));
    const dayLow = rounded(Math.min(lastPrice, dayOpen) * (1 - between(rand, [0.002, 0.03])));
    const avgVolume20D = Math.round(between(rand, [10000, 5000000]));
    const hasLargeMove = Math.abs(changePercent) >= 2;
    const volume = Math.round(avgVolume20D * between(rand, hasLargeMove ? [1.5, 4] : [0.6, 1.3]));
    const revenueGrowthYoY = rounded(between(rand, [-20, 60]));
    const rsiValues = calculateRSI(recentCloses, 14);
    const rsi14 = rounded(rsiValues[rsiValues.length - 1]!);
    const sma50 = rounded(
      lastPrice * (changePercent >= 0 ? between(rand, [0.88, 0.99]) : between(rand, [1.01, 1.12])),
    );
    const sma200 = rounded(
      lastPrice * (changePercent >= 0 ? between(rand, [0.8, 1]) : between(rand, [1, 1.2])),
    );
    const beta = rounded(between(rand, BETA_RANGES[capBucket.category]));
    const promoterHolding = rounded(between(rand, PROMOTER_RANGES[capBucket.category]));
    const week52Low = rounded(lastPrice * between(rand, [0.65, 0.9]));
    const week52High = rounded(lastPrice * between(rand, [1.05, 1.6]));
    const priceVsSma50 = lastPrice >= sma50 ? 'Above' : 'Below';
    const priceVsSma200 = lastPrice >= sma200 ? 'Above' : 'Below';
    const volumeVsAvg =
      volume >= avgVolume20D * 3
        ? '3x'
        : volume >= avgVolume20D * 2
          ? '2x'
          : volume >= avgVolume20D
            ? 'Above'
            : 'Below';
    const symbol = `${profile.sector.slice(0, 2).toUpperCase()}${String(index + 1).padStart(4, '0')}`;

    return {
      id: index + 1,
      symbol,
      companyName: `${PREFIXES[index % PREFIXES.length]} ${SUFFIXES[(index * 3) % SUFFIXES.length]}`,
      sector: profile.sector,
      industry: profile.industries[index % profile.industries.length],
      marketCap,
      marketCapCategory: capBucket.category,
      indexMembership: [],
      lastPrice,
      previousClose,
      dayOpen,
      dayHigh,
      dayLow,
      changePercent,
      changeAbsolute,
      volume,
      avgVolume20D,
      week52High,
      week52Low,
      pe: peForGrowth(rand, revenueGrowthYoY, profile.averagePe),
      pb: rounded(between(rand, [0.4, 15])),
      dividendYield: rounded(between(rand, [0, 12])),
      eps: rounded(between(rand, [-20, 500])),
      roe: rounded(between(rand, [-15, 30])),
      roce: rounded(between(rand, [-10, 40])),
      debtToEquity: rounded(between(rand, profile.debtRange)),
      currentRatio: rounded(between(rand, [0.4, 4])),
      promoterHolding,
      revenueGrowthYoY,
      profitGrowthYoY: rounded(revenueGrowthYoY + between(rand, [-15, 20])),
      rsi14,
      sma50,
      sma200,
      beta,
      atr: rounded(lastPrice * between(rand, [0.005, 0.05])),
      macdSignal:
        changePercent > 1
          ? 'Bullish Crossover'
          : changePercent < -1
            ? 'Bearish Crossover'
            : 'Neutral',
      bollingerPosition: rsi14 > 70 ? 'Above Upper' : rsi14 < 30 ? 'Below Lower' : 'Within Bands',
      volumeVsAvg,
      priceVsSma50,
      priceVsSma200,
      watchlist: index < 12,
      recentlyUpdated: false,
      updatedAt: now,
    };
  });
  assignIndexMembership(stocks);
  return stocks;
}

export function generateHistory(stock: Stock, days = 252): OHLCV[] {
  const count = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
  if (!count) return [];
  const recent = generateRecentCloses(stock.id, stock.lastPrice);
  const closesAgo = [...recent].reverse();
  const random = seededRandom(stock.id * 97);
  while (closesAgo.length <= count) {
    closesAgo.push(
      Math.max(0.01, closesAgo[closesAgo.length - 1] / (1 + between(random, [-0.03, 0.03]))),
    );
  }
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  const candles: OHLCV[] = [];
  for (let ago = 0; ago < count; ago++) {
    // Weekday simulation only: exchange holidays are not modeled.
    while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
    const candleRandom = seededRandom(stock.id * 193 + ago * 997);
    const open = ago === 0 ? stock.dayOpen : closesAgo[ago + 1];
    const close = ago === 0 ? stock.lastPrice : closesAgo[ago];
    candles.push({
      time: Math.floor(date.getTime() / 1000),
      open,
      close,
      high:
        ago === 0
          ? Math.max(stock.dayHigh, open, close)
          : Math.max(open, close) * (1 + candleRandom() * 0.025),
      low:
        ago === 0
          ? Math.min(stock.dayLow, open, close)
          : Math.min(open, close) * (1 - candleRandom() * 0.025),
      volume:
        ago === 0 ? stock.volume : Math.round(stock.avgVolume20D * (0.5 + candleRandom() * 2)),
    });
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return candles.reverse();
}

/** Combines consecutive trading-day candles into one OHLCV candle without losing price extremes or volume. */
export function aggregateOHLCV(data: OHLCV[], tradingDaysPerCandle: number): OHLCV[] {
  if (tradingDaysPerCandle <= 1) return [...data];

  const aggregated: OHLCV[] = [];
  for (let start = 0; start < data.length; start += tradingDaysPerCandle) {
    const period = data.slice(start, start + tradingDaysPerCandle);
    const first = period[0];
    const last = period[period.length - 1];
    if (!first || !last) continue;

    aggregated.push({
      time: last.time,
      open: first.open,
      high: Math.max(...period.map((candle) => candle.high)),
      low: Math.min(...period.map((candle) => candle.low)),
      close: last.close,
      volume: period.reduce((total, candle) => total + candle.volume, 0),
    });
  }

  return aggregated;
}
