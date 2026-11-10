import { seededRandom } from '@/lib/mockData';
import type { OHLCV } from '@/types/stock';

export type ChartTimeframe = '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y';

const intradayClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
export function formatIntradayTime(timestamp: number): string {
  return intradayClock.format(new Date(timestamp * 1000));
}

/** Synthetic five-minute bars, not recorded exchange ticks. Preserve daily OHLCV totals. */
export function generateIntradayHistory(day: OHLCV): OHLCV[] {
  const count = 75; // 09:15-15:30 IST, five-minute intervals.
  const random = seededRandom(day.time + Math.round(day.open * 100));
  const weights = Array.from({ length: count }, () => 0.5 + random());
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let remainingVolume = day.volume;
  let open = day.open;
  return weights.map((weight, index) => {
    const fraction = (index + 1) / count;
    const close =
      index === count - 1
        ? day.close
        : Math.min(
            day.high,
            Math.max(
              day.low,
              day.open +
                (day.close - day.open) * fraction +
                (random() - 0.5) * (day.high - day.low) * 0.2,
            ),
          );
    const volume =
      index === count - 1 ? remainingVolume : Math.floor((day.volume * weight) / totalWeight);
    remainingVolume -= volume;
    const candle = {
      time: day.time + (3 * 60 + 45 + index * 5) * 60,
      open,
      close,
      volume,
      high: index === 25 ? day.high : Math.max(open, close),
      low: index === 50 ? day.low : Math.min(open, close),
    };
    open = close;
    return candle;
  });
}

/** Aggregate calendar weeks (Monday start), retaining partial first/last weeks. */
export function aggregateCalendarWeeks(data: OHLCV[]): OHLCV[] {
  const weeks = new Map<number, OHLCV>();
  for (const candle of data) {
    const date = new Date(candle.time * 1000);
    const monday = candle.time - ((date.getUTCDay() + 6) % 7) * 86400;
    const existing = weeks.get(monday);
    if (existing) {
      existing.high = Math.max(existing.high, candle.high);
      existing.low = Math.min(existing.low, candle.low);
      existing.close = candle.close;
      existing.volume += candle.volume;
    } else weeks.set(monday, { ...candle });
  }
  return [...weeks.values()];
}

export function selectTimeframe(data: OHLCV[], timeframe: ChartTimeframe): OHLCV[] {
  if (!data.length) return [];
  if (timeframe === '1D') return generateIntradayHistory(data[data.length - 1]);
  const days: Record<Exclude<ChartTimeframe, '1D'>, number> = {
    '1W': 5,
    '1M': 21,
    '3M': 63,
    '1Y': 252,
    '5Y': 1260,
  };
  const selected = data.slice(-days[timeframe]);
  return timeframe === '5Y' ? aggregateCalendarWeeks(selected) : selected;
}
