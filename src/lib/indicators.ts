import type { OHLCV } from '@/types/stock';

export function calculateSMA(values: number[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = Array(values.length).fill(undefined);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}
export function calculateEMA(values: number[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = Array(values.length).fill(undefined);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ema = sum / period;
  out[period - 1] = ema;
  const multiplier = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
    out[i] = ema;
  }
  return out;
}
export function calculateBollinger(values: number[], period = 20, deviations = 2) {
  const sma = calculateSMA(values, period);
  return values.map((_, i) => {
    if (sma[i] === undefined) return undefined;
    const slice = values.slice(i - period + 1, i + 1);
    const mean = sma[i]!;
    const sd = Math.sqrt(slice.reduce((a, v) => a + (v - mean) ** 2, 0) / period);
    return { middle: mean, upper: mean + deviations * sd, lower: mean - deviations * sd };
  });
}
export function calculateRSI(values: number[], period = 14): (number | undefined)[] {
  const out: (number | undefined)[] = Array(values.length).fill(undefined);
  if (values.length <= period) return out;
  let gains = 0,
    losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    gains += Math.max(0, d);
    losses += Math.max(0, -d);
  }
  let avgGain = gains / period,
    avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}
export function calculateVolumeProfile(candles: OHLCV[], buckets = 18) {
  if (!candles.length) return [];
  const min = Math.min(...candles.map((c) => c.low)),
    max = Math.max(...candles.map((c) => c.high));
  const step = (max - min || 1) / buckets;
  const volumes = Array(buckets).fill(0) as number[];
  for (const c of candles) {
    const idx = Math.min(buckets - 1, Math.floor((c.close - min) / step));
    volumes[idx] += c.volume;
  }
  return volumes.map((volume, i) => ({ price: min + step * (i + 0.5), volume }));
}
