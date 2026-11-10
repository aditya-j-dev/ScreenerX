import { describe, expect, it } from 'vitest';
import {
  aggregateCalendarWeeks,
  formatIntradayTime,
  generateIntradayHistory,
  selectTimeframe,
} from '../lib/chartData';
import { generateHistory, generateMockStocks, generateRecentCloses } from '../lib/mockData';
import type { ChartTimeframe } from '../lib/chartData';

const stock = generateMockStocks(1)[0];

describe('chart source data', () => {
  it('formats the intraday session in IST independently of host timezone', () => {
    expect(formatIntradayTime(Date.UTC(2026, 10, 9, 3, 45) / 1000)).toBe('09:15');
    expect(formatIntradayTime(Date.UTC(2026, 10, 9, 9, 55) / 1000)).toBe('15:25');
  });
  it('generates the requested weekday sessions in order with valid OHLCV', () => {
    const history = generateHistory(stock, 1260);
    expect(history).toHaveLength(1260);
    history.forEach((candle, index) => {
      expect([0, 6]).not.toContain(new Date(candle.time * 1000).getUTCDay());
      expect(candle.high).toBeGreaterThanOrEqual(Math.max(candle.open, candle.close));
      expect(candle.low).toBeLessThanOrEqual(Math.min(candle.open, candle.close));
      expect(candle.low).toBeGreaterThan(0);
      expect(Number.isInteger(candle.volume)).toBe(true);
      if (index) expect(candle.time).toBeGreaterThan(history[index - 1].time);
    });
    expect(history[history.length - 1]).toMatchObject({
      open: stock.dayOpen,
      close: stock.lastPrice,
      volume: stock.volume,
    });
    expect((history[1259].time - history[0].time) / 86400).toBeGreaterThan(1700);
  });

  it('shares the same recent candles across requested history lengths and recent-price inputs', () => {
    const year = generateHistory(stock, 252);
    expect(generateHistory(stock, 1260).slice(-252)).toEqual(year);
    const closes = generateRecentCloses(stock.id, stock.lastPrice);
    year.slice(-61).forEach((candle, index) => expect(candle.close).toBeCloseTo(closes[index], 8));
    expect(generateHistory(stock, 0)).toEqual([]);
    expect(generateHistory(stock, -1)).toEqual([]);
  });

  it('creates 75 deterministic five-minute candles preserving daily OHLCV totals', () => {
    const day = generateHistory(stock, 1)[0];
    const intraday = generateIntradayHistory(day);
    expect(intraday).toHaveLength(75);
    expect(intraday[0].time).toBe(day.time + 3 * 3600 + 45 * 60);
    expect(intraday[74].time).toBe(day.time + 9 * 3600 + 55 * 60);
    expect(intraday[0].open).toBe(day.open);
    expect(intraday[74].close).toBe(day.close);
    expect(Math.max(...intraday.map((c) => c.high))).toBe(day.high);
    expect(Math.min(...intraday.map((c) => c.low))).toBe(day.low);
    expect(intraday.reduce((sum, c) => sum + c.volume, 0)).toBe(day.volume);
    intraday.forEach((c, index) => {
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
      if (index) expect(c.time - intraday[index - 1].time).toBe(300);
    });
    expect(generateIntradayHistory(day)).toEqual(intraday);
  });

  it('groups by calendar week even when the input begins midweek', () => {
    const data = [
      { time: Date.UTC(2026, 10, 5) / 1000, open: 10, high: 14, low: 8, close: 12, volume: 100 },
      { time: Date.UTC(2026, 10, 6) / 1000, open: 12, high: 15, low: 9, close: 13, volume: 200 },
      { time: Date.UTC(2026, 10, 9) / 1000, open: 13, high: 16, low: 11, close: 15, volume: 300 },
    ];
    expect(aggregateCalendarWeeks(data)).toEqual([
      { time: data[0].time, open: 10, high: 15, low: 8, close: 13, volume: 300 },
      data[2],
    ]);
    expect(data[0].volume).toBe(100);
  });

  it.each([
    ['1D', 75],
    ['1W', 5],
    ['1M', 21],
    ['3M', 63],
    ['1Y', 252],
  ] as [ChartTimeframe, number][])('selects %s data with %i candles', (timeframe, count) => {
    expect(selectTimeframe(generateHistory(stock, 1260), timeframe)).toHaveLength(count);
    expect(selectTimeframe([], timeframe)).toEqual([]);
  });

  it('aggregates the 5Y source without losing volume or its latest close', () => {
    const daily = generateHistory(stock, 1260);
    const weekly = selectTimeframe(daily, '5Y');
    expect(weekly.length).toBeGreaterThanOrEqual(252);
    expect(weekly.length).toBeLessThanOrEqual(253);
    expect(weekly.reduce((sum, c) => sum + c.volume, 0)).toBe(
      daily.reduce((sum, c) => sum + c.volume, 0),
    );
    expect(weekly[weekly.length - 1].close).toBe(stock.lastPrice);
  });
});
