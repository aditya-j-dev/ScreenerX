'use client';
import { useEffect } from 'react';
import { useStockStore } from '../stores/stockStore';
import type { PriceUpdate } from '../types/stock';

const delays = [1000, 2000, 4000, 8000, 16000];
export const withJitter = (delay: number, random: () => number = Math.random) =>
  Math.min(16000, Math.round(delay * (0.8 + random() * 0.4)));

function parsePriceUpdate(data: unknown): PriceUpdate | null {
  if (typeof data !== 'string') return null;
  try {
    const value: unknown = JSON.parse(data);
    if (!value || typeof value !== 'object') return null;
    const tick = value as Record<string, unknown>;
    if (
      typeof tick.symbol !== 'string' ||
      !tick.symbol.trim() ||
      typeof tick.price !== 'number' ||
      !Number.isFinite(tick.price) ||
      tick.price <= 0 ||
      typeof tick.change !== 'number' ||
      !Number.isFinite(tick.change) ||
      typeof tick.changePercent !== 'number' ||
      !Number.isFinite(tick.changePercent) ||
      typeof tick.timestamp !== 'number' ||
      !Number.isFinite(tick.timestamp) ||
      tick.timestamp < 0
    )
      return null;
    return {
      symbol: tick.symbol,
      price: tick.price,
      change: tick.change,
      changePercent: tick.changePercent,
      timestamp: tick.timestamp,
    };
  } catch {
    return null;
  }
}

export function useRealtimeUpdates() {
  const batch = useStockStore((s) => s.batchUpdatePrices);
  const setConnection = useStockStore((s) => s.setConnection);
  useEffect(() => {
    // Each effect owns its resources, including during React StrictMode replay.
    let disposed = false;
    let socket: WebSocket | null = null;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let frame: number | null = null;
    const pending = new Map<string, PriceUpdate>();

    function flush() {
      frame = null;
      if (disposed || !pending.size) return;
      batch(new Map(pending));
      pending.clear();
    }
    function retry() {
      if (disposed || timer !== null) return;
      setConnection('closed');
      const delay = delays[Math.min(attempt++, delays.length - 1)];
      timer = setTimeout(() => {
        timer = null;
        connect(true);
      }, withJitter(delay));
    }
    function connect(reconnecting = false) {
      if (disposed || socket !== null) return;
      setConnection(reconnecting ? 'reconnecting' : 'connecting');
      let ws: WebSocket;
      try {
        ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001');
      } catch {
        retry();
        return;
      }
      socket = ws;
      const active = () => !disposed && socket === ws;
      ws.onopen = () => {
        if (!active()) return;
        attempt = 0;
        setConnection('open');
      };
      ws.onmessage = (event) => {
        if (!active()) return;
        const tick = parsePriceUpdate(event.data);
        if (!tick) return;
        const previous =
          pending.get(tick.symbol) ?? useStockStore.getState().livePrices.get(tick.symbol);
        if (previous && tick.timestamp <= previous.timestamp) return;
        pending.set(tick.symbol, tick);
        if (frame === null) frame = requestAnimationFrame(flush);
      };
      ws.onclose = () => {
        if (!active()) return;
        socket = null;
        retry();
      };
      ws.onerror = () => {
        if (!active()) return;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
      };
    }
    function online() {
      if (disposed || socket !== null) return;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      connect(true);
    }
    connect();
    window.addEventListener('online', online);
    return () => {
      disposed = true;
      window.removeEventListener('online', online);
      if (timer !== null) clearTimeout(timer);
      if (frame !== null) cancelAnimationFrame(frame);
      pending.clear();
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        socket.close();
        socket = null;
      }
    };
  }, [batch, setConnection]);
}
