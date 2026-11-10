import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRealtimeUpdates, withJitter } from '../hooks/useWebSocket';
import { useStockStore } from '../stores/stockStore';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];
  static failConstruction = false;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  });

  constructor(public url: string) {
    if (MockWebSocket.failConstruction) throw new Error('Invalid WebSocket URL');
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  disconnect() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
  fail() {
    this.onerror?.();
  }
}

describe('useRealtimeUpdates WebSocket lifecycle', () => {
  let animationFrames: FrameRequestCallback[];
  let nextAnimationFrameId: number;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    MockWebSocket.failConstruction = false;
    animationFrames = [];
    nextAnimationFrameId = 1;
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        animationFrames.push(callback);
        const id = nextAnimationFrameId;
        nextAnimationFrameId += 1;
        return id;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    useStockStore.setState({ connection: 'connecting', livePrices: new Map() });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function RealtimeHookHarness() {
    useRealtimeUpdates();
    return null;
  }

  function renderRealtimeHook(strict = false) {
    const container = document.createElement('div');
    const root: Root = createRoot(container);
    document.body.appendChild(container);
    act(() =>
      root.render(
        strict ? (
          <StrictMode>
            <RealtimeHookHarness />
          </StrictMode>
        ) : (
          <RealtimeHookHarness />
        ),
      ),
    );
    return {
      unmount: () =>
        act(() => {
          root.unmount();
          container.remove();
        }),
    };
  }

  function runPendingAnimationFrame() {
    const callback = animationFrames.shift();
    if (callback) callback(0);
  }

  it('establishes a socket connection with the configured default URL', () => {
    const { unmount } = renderRealtimeHook();
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:3001');
    unmount();
  });

  it('marks the stream open when the socket opens', () => {
    const { unmount } = renderRealtimeHook();
    act(() => MockWebSocket.instances[0].open());
    expect(useStockStore.getState().connection).toBe('open');
    unmount();
  });

  it('batches multiple incoming price updates into one animation frame', () => {
    const { unmount } = renderRealtimeHook();
    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.message({ symbol: 'BA0001', price: 101, change: 1, changePercent: 1, timestamp: 1 });
      socket.message({ symbol: 'BA0002', price: 202, change: 2, changePercent: 1, timestamp: 2 });
    });

    expect(animationFrames).toHaveLength(1);
    act(runPendingAnimationFrame);
    expect(useStockStore.getState().livePrices.get('BA0001')?.price).toBe(101);
    expect(useStockStore.getState().livePrices.get('BA0002')?.price).toBe(202);
    unmount();
  });

  it('keeps only the latest tick for a symbol within a frame batch', () => {
    const { unmount } = renderRealtimeHook();
    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.message({ symbol: 'BA0001', price: 101, change: 1, changePercent: 1, timestamp: 1 });
      socket.message({ symbol: 'BA0001', price: 103, change: 3, changePercent: 3, timestamp: 2 });
      runPendingAnimationFrame();
    });

    expect(useStockStore.getState().livePrices.get('BA0001')?.price).toBe(103);
    unmount();
  });

  it('shows disconnected and schedules a jittered first retry after a close', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { unmount } = renderRealtimeHook();
    act(() => MockWebSocket.instances[0].disconnect());

    expect(useStockStore.getState().connection).toBe('closed');
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(999));
    expect(MockWebSocket.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(useStockStore.getState().connection).toBe('reconnecting');
    unmount();
  });

  it('uses a 20% random spread around every exponential-backoff delay', () => {
    expect(withJitter(1000, () => 0)).toBe(800);
    expect(withJitter(1000, () => 1)).toBe(1200);
    expect(withJitter(8000, () => 0.5)).toBe(8000);
    expect(withJitter(16000, () => 1)).toBe(16000);
  });

  it('closes a failed socket and begins the reconnect lifecycle', () => {
    const { unmount } = renderRealtimeHook();
    const socket = MockWebSocket.instances[0];
    act(() => socket.fail());

    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(useStockStore.getState().connection).toBe('closed');
    expect(vi.getTimerCount()).toBe(1);
    unmount();
  });

  it('reconnects immediately when the browser returns online', () => {
    const { unmount } = renderRealtimeHook();
    act(() => MockWebSocket.instances[0].disconnect());
    expect(vi.getTimerCount()).toBe(1);

    act(() => window.dispatchEvent(new Event('online')));
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(useStockStore.getState().connection).toBe('reconnecting');
    unmount();
  });

  it('cleans up the socket, retry timer, and pending animation frame on unmount', () => {
    const { unmount } = renderRealtimeHook();
    const socket = MockWebSocket.instances[0];
    act(() =>
      socket.message({ symbol: 'BA0001', price: 101, change: 1, changePercent: 1, timestamp: 1 }),
    );
    act(() => socket.disconnect());

    unmount();
    expect(socket.readyState).toBe(MockWebSocket.CLOSED);
    expect(vi.getTimerCount()).toBe(0);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('ignores malformed messages without interrupting valid ticks', () => {
    const { unmount } = renderRealtimeHook();
    const socket = MockWebSocket.instances[0];
    const tick = { symbol: 'A', price: 100, change: 1, changePercent: 1, timestamp: 10 };
    act(() => {
      socket.onmessage?.({ data: '{broken' });
      for (const bad of [
        null,
        [],
        {},
        { ...tick, price: -1 },
        { ...tick, price: '100' },
        { ...tick, change: null },
        { ...tick, timestamp: -1 },
        { ...tick, symbol: ' ' },
      ])
        socket.message(bad);
    });
    expect(animationFrames).toHaveLength(0);
    act(() => {
      socket.message(tick);
      runPendingAnimationFrame();
    });
    expect(useStockStore.getState().livePrices.get('A')?.price).toBe(100);
    unmount();
  });

  it('rejects older and duplicate ticks both before and after a frame flush', () => {
    const { unmount } = renderRealtimeHook();
    const socket = MockWebSocket.instances[0];
    const tick = { symbol: 'A', price: 100, change: 1, changePercent: 1, timestamp: 10 };
    act(() => {
      socket.message(tick);
      socket.message({ ...tick, price: 50, timestamp: 9 });
      runPendingAnimationFrame();
      socket.message({ ...tick, price: 60 });
      socket.message({ ...tick, price: 70, timestamp: 8 });
    });
    expect(animationFrames).toHaveLength(0);
    expect(useStockStore.getState().livePrices.get('A')?.price).toBe(100);
    unmount();
  });

  it('caps repeated retries and resets backoff after a successful connection', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { unmount } = renderRealtimeHook();
    for (const delay of [1000, 2000, 4000, 8000, 16000, 16000]) {
      const count = MockWebSocket.instances.length;
      act(() => MockWebSocket.instances[count - 1].disconnect());
      act(() => vi.advanceTimersByTime(delay - 1));
      expect(MockWebSocket.instances).toHaveLength(count);
      act(() => vi.advanceTimersByTime(1));
      expect(MockWebSocket.instances).toHaveLength(count + 1);
    }
    act(() => MockWebSocket.instances.at(-1)!.open());
    act(() => MockWebSocket.instances.at(-1)!.disconnect());
    const count = MockWebSocket.instances.length;
    act(() => vi.advanceTimersByTime(1000));
    expect(MockWebSocket.instances).toHaveLength(count + 1);
    unmount();
  });

  it('ignores retired socket callbacks after an online reconnect', () => {
    const { unmount } = renderRealtimeHook();
    const old = MockWebSocket.instances[0];
    const lateOpen = old.onopen!;
    const lateClose = old.onclose!;
    const lateMessage = old.onmessage!;
    act(() => {
      old.disconnect();
      window.dispatchEvent(new Event('online'));
    });
    act(() => {
      lateOpen();
      lateClose();
      lateMessage({
        data: JSON.stringify({ symbol: 'A', price: 1, change: 0, changePercent: 0, timestamp: 1 }),
      });
      window.dispatchEvent(new Event('online'));
    });
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
    expect(animationFrames).toHaveLength(0);
    expect(useStockStore.getState().connection).toBe('reconnecting');
    unmount();
  });

  it('isolates StrictMode effect replay and closes the remaining socket on unmount', () => {
    const { unmount } = renderRealtimeHook(true);
    expect(MockWebSocket.instances).toHaveLength(2);
    const [retired, current] = MockWebSocket.instances;
    expect(retired.close).toHaveBeenCalledTimes(1);
    expect(retired.onclose).toBeNull();
    act(() => current.open());
    const lateClose = current.onclose!;
    const lateMessage = current.onmessage!;
    unmount();
    act(() => {
      lateClose();
      lateMessage({
        data: JSON.stringify({ symbol: 'A', price: 1, change: 0, changePercent: 0, timestamp: 1 }),
      });
      vi.advanceTimersByTime(20000);
    });
    expect(current.close).toHaveBeenCalledTimes(1);
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
    expect(animationFrames).toHaveLength(0);
  });

  it('schedules only one batch when requestAnimationFrame returns zero', () => {
    nextAnimationFrameId = 0;
    const { unmount } = renderRealtimeHook();
    act(() => {
      for (let i = 0; i < 100; i++)
        MockWebSocket.instances[0].message({
          symbol: `A${i}`,
          price: 1,
          change: 0,
          changePercent: 0,
          timestamp: 1,
        });
    });
    expect(animationFrames).toHaveLength(1);
    act(runPendingAnimationFrame);
    expect(useStockStore.getState().livePrices.size).toBe(100);
    unmount();
  });

  it('uses the configured WebSocket URL', () => {
    vi.stubEnv('NEXT_PUBLIC_WS_URL', 'wss://stream.example.test/prices');
    const { unmount } = renderRealtimeHook();
    expect(MockWebSocket.instances[0].url).toBe('wss://stream.example.test/prices');
    unmount();
  });

  it('recovers from constructor failures and cancels retries on unmount', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    MockWebSocket.failConstruction = true;
    const { unmount } = renderRealtimeHook();
    expect(useStockStore.getState().connection).toBe('closed');
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(MockWebSocket.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(1);
    MockWebSocket.failConstruction = false;
    act(() => vi.advanceTimersByTime(2000));
    expect(MockWebSocket.instances).toHaveLength(1);
    act(() => MockWebSocket.instances[0].open());
    expect(useStockStore.getState().connection).toBe('open');
    act(() => MockWebSocket.instances[0].disconnect());
    unmount();
    act(() => vi.advanceTimersByTime(30000));
    expect(vi.getTimerCount()).toBe(0);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('schedules only one retry for duplicate close callbacks', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { unmount } = renderRealtimeHook();
    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.disconnect();
      socket.disconnect();
      socket.fail();
    });
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });

  it('commits a 5,000-symbol burst once per frame and coalesces newer ticks', () => {
    const { unmount } = renderRealtimeHook();
    act(() => MockWebSocket.instances[0].open());
    const notify = vi.fn();
    const unsubscribe = useStockStore.subscribe(notify);
    try {
      act(() => {
        for (let i = 0; i < 5000; i++)
          MockWebSocket.instances[0].message({
            symbol: `STOCK${i}`,
            price: 100,
            change: 1,
            changePercent: 1,
            timestamp: 1,
          });
        MockWebSocket.instances[0].message({
          symbol: 'STOCK0',
          price: 102,
          change: 3,
          changePercent: 3,
          timestamp: 2,
        });
      });
      expect(notify).not.toHaveBeenCalled();
      expect(animationFrames).toHaveLength(1);
      act(runPendingAnimationFrame);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(useStockStore.getState().livePrices.size).toBe(5000);
      expect(useStockStore.getState().livePrices.get('STOCK0')?.price).toBe(102);
      act(() => {
        MockWebSocket.instances[0].message({
          symbol: 'STOCK0',
          price: 103,
          change: 4,
          changePercent: 4,
          timestamp: 3,
        });
        runPendingAnimationFrame();
      });
      expect(notify).toHaveBeenCalledTimes(2);
      expect(useStockStore.getState().livePrices.get('STOCK0')?.price).toBe(103);
    } finally {
      unsubscribe();
      unmount();
    }
  });

  it('does not commit pending prices if a cancelled frame fires after unmount', () => {
    const { unmount } = renderRealtimeHook();
    act(() =>
      MockWebSocket.instances[0].message({
        symbol: 'A',
        price: 100,
        change: 1,
        changePercent: 1,
        timestamp: 1,
      }),
    );
    const frame = animationFrames[0];
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    act(() => {
      frame(0);
      window.dispatchEvent(new Event('online'));
    });
    expect(useStockStore.getState().livePrices.size).toBe(0);
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
