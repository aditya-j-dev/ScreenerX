import { act } from 'react';
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function RealtimeHookHarness() {
    useRealtimeUpdates();
    return null;
  }

  function renderRealtimeHook() {
    const container = document.createElement('div');
    const root: Root = createRoot(container);
    document.body.appendChild(container);
    act(() => root.render(<RealtimeHookHarness />));
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
    expect(socket.close).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
