'use client';
import { useQuery } from '@tanstack/react-query';
import { cacheStockUniverse, getCachedStockUniverse } from '@/lib/stockCache';
import type { Stock } from '@/types/stock';

export function useStockData() {
  const query = useQuery<{ stocks: Stock[]; fromCache: boolean }>({
    queryKey: ['stocks'],
    // Run the cache fallback even if the browser already reports offline at mount.
    networkMode: 'always',
    refetchOnReconnect: 'always',
    retry: false,
    queryFn: async () => {
      try {
        if (!navigator.onLine) throw new Error('Offline');
        const response = await fetch('/api/stocks');
        if (!response.ok) throw new Error('Failed to load stocks');
        const payload = await response.json();
        if (!Array.isArray(payload?.data)) throw new Error('Invalid stock universe');
        // Storage quota/privacy failures must not discard a successful network response.
        try {
          await cacheStockUniverse(payload.data);
        } catch {
          /* Cache is best effort. */
        }
        return { stocks: payload.data, fromCache: false };
      } catch (error) {
        try {
          const cachedStocks = await getCachedStockUniverse();
          if (cachedStocks?.length) return { stocks: cachedStocks, fromCache: true };
        } catch {
          /* Preserve the original fetch error if storage is unavailable. */
        }
        throw error;
      }
    },
    staleTime: 300000,
  });
  return { ...query, data: query.data?.stocks, isCached: query.data?.fromCache ?? false };
}
