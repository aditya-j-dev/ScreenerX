import type { MarketCapCategory, OHLCV, Sector, Stock } from '@/types/stock';

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
const INDICES = [
  'NIFTY 50',
  'NIFTY Next 50',
  'NIFTY Midcap 100',
  'NIFTY Smallcap 250',
  'BSE Sensex',
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
  return profiles.slice(0, count);
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

  return Array.from({ length: count }, (_, index) => {
    const profile = sectorProfiles[index];
    const capBucket = capBucketFor(index, count);
    const marketCap = Math.round(between(rand, capBucket.range));
    const lastPrice = rounded(between(rand, [50, Math.min(5000, 150 + Math.sqrt(marketCap) * 4)]));
    const changePercent = rounded(between(rand, [-5, 5]));
    const previousClose = rounded(lastPrice / (1 + changePercent / 100));
    const changeAbsolute = rounded(lastPrice - previousClose);
    const dayOpen = rounded(previousClose * (1 + between(rand, [-0.01, 0.01])));
    const dayHigh = rounded(Math.max(lastPrice, dayOpen) * (1 + between(rand, [0.002, 0.03])));
    const dayLow = rounded(Math.min(lastPrice, dayOpen) * (1 - between(rand, [0.002, 0.03])));
    const avgVolume20D = Math.round(between(rand, [10000, 5000000]));
    const hasLargeMove = Math.abs(changePercent) >= 2;
    const volume = Math.round(avgVolume20D * between(rand, hasLargeMove ? [1.5, 3] : [0.6, 1.3]));
    const revenueGrowthYoY = rounded(between(rand, [-20, 60]));
    const rsi14 = rounded(
      changePercent >= 0 ? between(rand, [50.1, 85]) : between(rand, [15, 49.9]),
    );
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
      volume >= avgVolume20D * 2.5
        ? '3x'
        : volume >= avgVolume20D * 1.5
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
      indexMembership:
        capBucket.category === 'Large Cap'
          ? ['NIFTY 50', 'BSE Sensex']
          : INDICES.filter(() => rand() > 0.7),
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
}

export function generateHistory(stock: Stock, days = 252): OHLCV[] {
  const rand = seededRandom(stock.id * 97);
  let close = stock.lastPrice * (0.65 + rand() * 0.2);
  const start = Math.floor(Date.now() / 86400000) - days;

  return Array.from({ length: days }, (_, index) => {
    const open = close;
    close = Math.max(1, close * (1 + (rand() - 0.48) * 0.06));
    const high = Math.max(open, close) * (1 + rand() * 0.025);
    const low = Math.min(open, close) * (1 - rand() * 0.025);
    return {
      time: (start + index) * 86400,
      open,
      high,
      low,
      close,
      volume: Math.round(50000 + rand() * 1000000),
    };
  });
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
