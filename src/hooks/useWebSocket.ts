'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useStockStore } from '../stores/stockStore';
import type { PriceUpdate } from '../types/stock';
const delays = [1000, 2000, 4000, 8000, 16000];
export const withJitter = (delay: number, random: () => number = Math.random) =>
  Math.round(delay * (0.8 + random() * 0.4));
export function useRealtimeUpdates() {
  const wsRef = useRef<WebSocket | null>(null);
  const attempt = useRef(0);
  const pending = useRef<Map<string, PriceUpdate>>(new Map());
  const raf = useRef<number | null>(null);
  const isMounted = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batch = useStockStore((s) => s.batchUpdatePrices),
    setConnection = useStockStore((s) => s.setConnection);
  const flush = useCallback(() => {
    if (pending.current.size) {
      batch(new Map(pending.current));
      pending.current.clear();
    }
    raf.current = null;
  }, [batch]);
  const connect = useCallback(
    (isReconnect = false) => {
      setConnection(isReconnect ? 'reconnecting' : 'connecting');
      const ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001');
      ws.onopen = () => {
        if (!isMounted.current) return;
        attempt.current = 0;
        setConnection('open');
      };
      ws.onmessage = (e) => {
        if (!isMounted.current) return;
        const d = JSON.parse(e.data) as PriceUpdate;
        pending.current.set(d.symbol, d);
        if (!raf.current) raf.current = requestAnimationFrame(flush);
      };
      ws.onclose = () => {
        if (!isMounted.current) return;
        setConnection('closed');
        const baseDelay = delays[Math.min(attempt.current, delays.length - 1)];
        attempt.current++;
        timerRef.current = setTimeout(() => connect(true), withJitter(baseDelay));
      };
      ws.onerror = () => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
      };
      wsRef.current = ws;
    },
    [flush, setConnection],
  );
  useEffect(() => {
    isMounted.current = true;
    connect();
    const reconnectAfterNetworkRestore = () => {
      if (
        !isMounted.current ||
        wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING
      )
        return;
      if (timerRef.current) clearTimeout(timerRef.current);
      connect(true);
    };
    window.addEventListener('online', reconnectAfterNetworkRestore);
    return () => {
      isMounted.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      if (raf.current) cancelAnimationFrame(raf.current);
      window.removeEventListener('online', reconnectAfterNetworkRestore);
    };
  }, [connect]);
}
