'use client';

import { create } from 'zustand';
import { enableMapSet } from 'immer';
import { createJSONStorage, devtools, persist, type PersistStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { FilterConfig, PriceUpdate, SortConfig, Stock } from '../types/stock';

enableMapSet();

type SavedWatchlist = { watchlist: string[] };

// Immer preserves the Set reference on unrelated updates. Reuse its JSON-safe
// projection, then skip storage before JSON.stringify or synchronous setItem.
let projectedWatchlist: Set<string> | undefined;
let projectedSymbols: string[] = [];
const jsonStorage = createJSONStorage<SavedWatchlist>(() => localStorage);
let lastSavedSymbols: string[] | undefined;
const watchlistStorage: PersistStorage<SavedWatchlist> | undefined = jsonStorage && {
  getItem: (name) => {
    lastSavedSymbols = undefined;
    return jsonStorage.getItem(name);
  },
  setItem: (name, value) => {
    if (value.state.watchlist === lastSavedSymbols) return;
    jsonStorage.setItem(name, value);
    lastSavedSymbols = value.state.watchlist;
  },
  removeItem: (name) => {
    lastSavedSymbols = undefined;
    return jsonStorage.removeItem(name);
  },
};

export type LivePrice = PriceUpdate & {
  updatedAt: number;
  observedHigh: number;
  observedLow: number;
};
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
  applyPreset: (filters: ReadonlyArray<Omit<FilterConfig, 'enabled'>>) => void;
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
          applyPreset: (filters) =>
            set({
              activeFilters: filters.map((filter) => ({
                ...filter,
                value: Array.isArray(filter.value) ? filter.value.slice() : filter.value,
                enabled: true,
              })),
            }),
          setSortConfig: (sortConfig) => set({ sortConfig }),
          setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
          batchUpdatePrices: (updates) =>
            set((state) => {
              const updatedAt = Date.now();
              updates.forEach((update, symbol) => {
                const previous = state.livePrices.get(symbol);
                state.livePrices.set(symbol, {
                  ...update,
                  updatedAt,
                  observedHigh: Math.max(previous?.observedHigh ?? update.price, update.price),
                  observedLow: Math.min(previous?.observedLow ?? update.price, update.price),
                });
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
          storage: watchlistStorage,
          partialize: (state) => {
            if (state.watchlist !== projectedWatchlist) {
              projectedWatchlist = state.watchlist;
              projectedSymbols = Array.from(state.watchlist);
            }
            return { watchlist: projectedSymbols };
          },
          merge: (persistedState, currentState) => {
            // Restore only the persisted domain and preserve the Set contract before notifying listeners.
            const saved = persistedState as { watchlist?: unknown } | null | undefined;
            if (!Array.isArray(saved?.watchlist)) return currentState;
            return {
              ...currentState,
              watchlist: new Set(
                saved.watchlist.filter(
                  (symbol): symbol is string => typeof symbol === 'string' && symbol.length > 0,
                ),
              ),
            };
          },
        },
      ),
      { enabled: process.env.NODE_ENV === 'development', name: 'StockScreenerStore' },
    ),
  ),
);
