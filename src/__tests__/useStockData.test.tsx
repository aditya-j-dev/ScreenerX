import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStockData } from '../hooks/useStockData';
import { generateMockStocks } from '../lib/mockData';

const cache = vi.hoisted(() => ({ save: vi.fn(), load: vi.fn() }));
vi.mock('../lib/stockCache', () => ({
  cacheStockUniverse: cache.save,
  getCachedStockUniverse: cache.load,
}));

describe('stock data offline recovery', () => {
  const stocks = generateMockStocks(2);
  let client: QueryClient;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    client = new QueryClient();
    cache.save.mockReset().mockResolvedValue(undefined);
    cache.load.mockReset().mockResolvedValue(undefined);
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: stocks }) });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    onlineManager.setOnline(true);
  });
  afterEach(() => {
    client.clear();
    onlineManager.setOnline(true);
    vi.unstubAllGlobals();
  });
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  it('uses fresh network data despite an IndexedDB write failure', async () => {
    cache.save.mockRejectedValue(new Error('quota'));
    const { result } = renderHook(() => useStockData(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(stocks));
    expect(result.current.isCached).toBe(false);
    expect(cache.load).not.toHaveBeenCalled();
  });
  it('loads cached data immediately when mounted offline, then refreshes on reconnect', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    onlineManager.setOnline(false);
    const old = [{ ...stocks[0], lastPrice: 1 }];
    cache.load.mockResolvedValue(old);
    const { result } = renderHook(() => useStockData(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(old));
    expect(result.current.isCached).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(result.current.data).toEqual(stocks));
    expect(result.current.isCached).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('marks cached fallback stale even when navigator reports online', async () => {
    fetchMock.mockRejectedValue(new Error('server unreachable'));
    cache.load.mockResolvedValue(stocks);
    const { result } = renderHook(() => useStockData(), { wrapper });
    await waitFor(() => expect(result.current.isCached).toBe(true));
    expect(result.current.data).toEqual(stocks);
  });
  it('exposes an error rather than hanging when offline with no saved data', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useStockData(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.fetchStatus).toBe('idle');
  });
  it('preserves the fetch error when IndexedDB also fails', async () => {
    const error = new Error('network failed');
    fetchMock.mockRejectedValue(error);
    cache.load.mockRejectedValue(new Error('storage blocked'));
    const { result } = renderHook(() => useStockData(), { wrapper });
    await waitFor(() => expect(result.current.error).toBe(error));
  });
  it('rejects a malformed API envelope and falls back to saved data', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: null }) });
    cache.load.mockResolvedValue(stocks);
    const { result } = renderHook(() => useStockData(), { wrapper });
    await waitFor(() => expect(result.current.isCached).toBe(true));
    expect(cache.save).not.toHaveBeenCalled();
  });
});
