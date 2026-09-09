'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { cacheStockUniverse, getCachedStockUniverse } from '@/lib/stockCache';
import type { Stock } from '@/types/stock';

export function useStockData() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const refreshAfterReconnect = () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
    };
    window.addEventListener('online', refreshAfterReconnect);
    return () => window.removeEventListener('online', refreshAfterReconnect);
  }, [queryClient]);

  return useQuery<Stock[]>({
    queryKey: ['stocks'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/stocks');
        if (!response.ok) throw new Error('Failed to load stocks');
        const payload = await response.json();
        await cacheStockUniverse(payload.data);
        return payload.data;
      } catch (error) {
        const cachedStocks = await getCachedStockUniverse();
        if (cachedStocks?.length) return cachedStocks;
        throw error;
      }
    },
    staleTime: 300000,
  });
}
