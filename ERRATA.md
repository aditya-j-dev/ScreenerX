# ERRATA.md — Deliberate Errors Identification & Corrections

This document identifies and corrects the three deliberate technical errors embedded in the project specification code snippets, as required by Section A11.3 (Bonus Challenge).

---

## Error 1: WebSocket Reconnection Memory Leak & Infinite Loop

- **Location**: Section A4.2 (`hooks/useWebSocket.ts` code snippet)
- **Category**: WebSocket Reconnection Logic

### Problem Description

In the PDF's `useRealtimeUpdates` hook snippet, the `ws.onclose` callback schedules a reconnection via `setTimeout(connect, delay)`:

```typescript
ws.onclose = () => {
  const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)];
  reconnectAttempt.current++;
  setTimeout(connect, delay);
};
```

When the component unmounts, the `useEffect` cleanup function calls `wsRef.current?.close()`. However, calling `close()` triggers the `onclose` handler, which schedules a new `setTimeout(connect, delay)`.

Because the timer ID is not tracked or cleared, and there is no check to verify if the hook is still mounted, the WebSocket reconnects continuously in the background even after the component is unmounted. This creates memory leaks and state updates on unmounted React components.

### Correction

Maintain an `isMounted` flag or track the `reconnectTimer` ID to clear it during cleanup, and suppress reconnection when `close()` is triggered intentionally by component unmount:

```typescript
const isMounted = useRef(true);
const timerRef = useRef<NodeJS.Timeout | null>(null);

useEffect(() => {
  isMounted.current = true;
  connect();
  return () => {
    isMounted.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    wsRef.current?.close();
  };
}, [connect]);

ws.onclose = () => {
  if (!isMounted.current) return; // Suppress reconnect on unmount
  setConnection('closed');
  const delay = RECONNECT_DELAYS[Math.min(attempt.current, RECONNECT_DELAYS.length - 1)];
  attempt.current++;
  timerRef.current = setTimeout(connect, delay);
};
```

---

## Error 2: EMA Indicator Seed Calculation & Warmup Period Error

- **Location**: Section A3.2 & A3.3 (`lib/indicators.ts` implementation)
- **Category**: Technical Indicator Mathematics

### Problem Description

In `lib/indicators.ts`, the Exponential Moving Average (`calculateEMA`) is implemented as:

```typescript
export function calculateEMA(values: number[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = Array(values.length).fill(undefined);
  if (!values.length) return out;
  const multiplier = 2 / (period + 1);
  let ema = values[0];
  out[0] = ema;
  for (let i = 1; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
    out[i] = ema;
  }
  return out;
}
```

In financial mathematics:

1. An $N$-period EMA requires at least $N$ historical price points before producing its first valid value. The first $N-1$ points must be `undefined`.
2. The initial seed value for an $N$-period EMA at index $N-1$ must be the **Simple Moving Average (SMA)** of the first $N$ prices.
3. Seeding `ema = values[0]` at index 0 distorts early EMA values significantly (e.g., a 26-period EMA starting on day 1 with day 1 price produces invalid technical signals).

### Correction

Initialize the first `period - 1` elements as `undefined`, compute the initial seed as `SMA(values[0...period-1])`, and apply the exponential multiplier formula for $i \ge \text{period}$:

```typescript
export function calculateEMA(values: number[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = Array(values.length).fill(undefined);
  if (values.length < period) return out;

  // Initial seed is the SMA of the first 'period' elements
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  let ema = sum / period;
  out[period - 1] = ema;

  const multiplier = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
    out[i] = ema;
  }
  return out;
}
```

---

## Error 3: TypeScript Union Type Mismatches & Missing React Imports

- **Location**: Section A1.3 & Section D Task 1.2 (`types/stock.ts` and `hooks/useStockScreener.ts`)
- **Category**: TypeScript Type Definitions & Imports

### Problem Description

1. **Missing React Hook Imports**: In Section A1.3 (`useStockScreener.ts`), `useMemo` and `useCallback` are used in the hook body, but neither is imported from `'react'`.
2. **Enum / Union Mismatches between Spec & Types**:
   - In Task 1.2, `macdSignal` is typed as `'Bullish' | 'Bearish' | 'Neutral'`, whereas Section A6.1 specifies `'Bullish Crossover' | 'Bearish Crossover' | 'Neutral'`.
   - `bollingerPosition` is typed as `'Above' | 'Within' | 'Below'`, whereas Section A6.1 specifies `'Above Upper' | 'Within Bands' | 'Below Lower'`.
   - `pe` is typed as `number | null`, but comparative operators (`gte`, `lte`) in `filterEngine.ts` evaluated `Number(null)` as `0`, misclassifying stocks with `null` P/E (unprofitable companies) as having a P/E of zero.

### Correction

Unify type definitions in `types/stock.ts` to match the exact string literals required by Section A6.1, add explicit type guards for `null` values in `filterEngine.ts`, and ensure all React hooks are imported:

```typescript
// types/stock.ts
export type MacdSignal = 'Bullish Crossover' | 'Bearish Crossover' | 'Neutral';
export type BollingerPosition = 'Above Upper' | 'Within Bands' | 'Below Lower';

export interface Stock {
  // ...
  macdSignal: MacdSignal;
  bollingerPosition: BollingerPosition;
  pe: number | null;
}
```

```typescript
// lib/filterEngine.ts - Explicit null check for numeric filters
function testFilter(stock: Stock, f: FilterConfig): boolean {
  const actual = stock[f.field];
  if (actual === null || actual === undefined) return false;
  // ... proceed with evaluation
}
```
