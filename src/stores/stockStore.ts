'use client';

import { create } from 'zustand';
import { enableMapSet } from 'immer';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { FilterConfig, PriceUpdate, SortConfig, Stock } from '../types/stock';

enableMapSet();

export type LivePrice = PriceUpdate & { updatedAt: number };
export type ConnectionStatus = 'connecting' | 'reconnecting' | 'open' | 'closed';

interface StockStore {
  activeFilters: FilterConfig[];
  sortConfig: SortConfig;
  selectedSymbol: string | null;
  livePrices: Map<string, LivePrice>;
  watchlist: Set<string>;
  connection: ConnectionStatus;
  addFilter: (filter: FilterConfig) => void;
  removeFilter: (id: string) => void;
  clearAllFilters: () => void;
  setSortConfig: (sortConfig: SortConfig) => void;
  setSelectedSymbol: (symbol: string | null) => void;
  batchUpdatePrices: (updates: Map<string, PriceUpdate>) => void;
  toggleWatchlist: (symbol: string) => void;
  setConnection: (connection: ConnectionStatus) => void;
  clearFilters: () => void;
  setSort: (field: keyof Stock) => void;
  setSelected: (symbol: string | null) => void;
}

export const useStockStore = create<StockStore>()(
  immer(
    devtools(
      persist(
        (set) => ({
          activeFilters: [],
          sortConfig: { field: 'marketCap', direction: 'desc' },
          selectedSymbol: null,
          livePrices: new Map(),
          watchlist: new Set(),
          connection: 'connecting',
          addFilter: (filter) =>
            set((state) => {
              state.activeFilters = [
                ...state.activeFilters.filter((item) => item.id !== filter.id),
                filter,
              ];
            }),
          removeFilter: (id) =>
            set((state) => {
              state.activeFilters = state.activeFilters.filter((filter) => filter.id !== id);
            }),
          clearAllFilters: () =>
            set((state) => {
              state.activeFilters = [];
            }),
          setSortConfig: (sortConfig) => set({ sortConfig }),
          setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
          batchUpdatePrices: (updates) =>
            set((state) => {
              const updatedAt = Date.now();
              updates.forEach((update, symbol) => {
                state.livePrices.set(symbol, { ...update, updatedAt });
              });
            }),
          toggleWatchlist: (symbol) =>
            set((state) => {
              if (state.watchlist.has(symbol)) state.watchlist.delete(symbol);
              else state.watchlist.add(symbol);
            }),
          setConnection: (connection) => set({ connection }),
          clearFilters: () =>
            set((state) => {
              state.activeFilters = [];
            }),
          setSort: (field) =>
            set((state) => {
              const { sortConfig } = state;
              if (sortConfig.field !== field || sortConfig.direction === null)
                state.sortConfig = { field, direction: 'asc' };
              else if (sortConfig.direction === 'asc')
                state.sortConfig = { field, direction: 'desc' };
              else state.sortConfig = { field: null, direction: null };
            }),
          setSelected: (selectedSymbol) => set({ selectedSymbol }),
        }),
        {
          name: 'stock-screener',
          partialize: (state) => ({ watchlist: Array.from(state.watchlist) }),
          onRehydrateStorage: () => (state) => {
            if (state && Array.isArray(state.watchlist)) state.watchlist = new Set(state.watchlist);
          },
        },
      ),
      { enabled: process.env.NODE_ENV === 'development', name: 'StockScreenerStore' },
    ),
  ),
);
