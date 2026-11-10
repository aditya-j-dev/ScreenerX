import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStockStore } from '../stores/stockStore';
import { SCREENER_PRESETS } from '../lib/presets';

describe('Zustand Stock Store State Management', () => {
  beforeEach(() => {
    localStorage.clear();
    useStockStore.setState(useStockStore.getInitialState(), true);
  });

  it('adds and removes active filters correctly', () => {
    const store = useStockStore.getState();
    store.addFilter({ id: 'pe', field: 'pe', operator: 'lte', value: 20, enabled: true });
    expect(useStockStore.getState().activeFilters.length).toBe(1);

    store.removeFilter('pe');
    expect(useStockStore.getState().activeFilters.length).toBe(0);
  });

  it('toggles watchlist symbols correctly', () => {
    const store = useStockStore.getState();
    store.toggleWatchlist('TCS001');
    expect(useStockStore.getState().watchlist.has('TCS001')).toBe(true);

    store.toggleWatchlist('TCS001');
    expect(useStockStore.getState().watchlist.has('TCS001')).toBe(false);
  });

  it('batches live price updates correctly', () => {
    const store = useStockStore.getState();
    const updates = new Map([
      [
        'TCS001',
        { symbol: 'TCS001', price: 3500.5, change: 10, changePercent: 0.3, timestamp: Date.now() },
      ],
    ]);
    store.batchUpdatePrices(updates);

    const price = useStockStore.getState().livePrices.get('TCS001');
    expect(price).toBeDefined();
    expect(price?.price).toBe(3500.5);
    expect(typeof price?.updatedAt).toBe('number');
  });

  it('retains observed high and low across batches while keeping the latest close', () => {
    for (const [timestamp, price] of [100, 120, 80, 105].entries()) {
      useStockStore.getState().batchUpdatePrices(
        new Map([
          [
            'A',
            {
              symbol: 'A',
              price,
              change: price - 100,
              changePercent: price - 100,
              timestamp,
            },
          ],
        ]),
      );
    }
    expect(useStockStore.getState().livePrices.get('A')).toMatchObject({
      price: 105,
      observedHigh: 120,
      observedLow: 80,
    });
  });

  it('timestamps every batch of live price updates', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    useStockStore
      .getState()
      .batchUpdatePrices(
        new Map([
          [
            'INFY001',
            { symbol: 'INFY001', price: 1800, change: 5, changePercent: 0.28, timestamp: 1 },
          ],
        ]),
      );

    expect(useStockStore.getState().livePrices.get('INFY001')?.updatedAt).toBe(1_700_000_000_000);
    vi.restoreAllMocks();
  });

  it('exposes the PDF-specified store actions', () => {
    const store = useStockStore.getState();
    store.addFilter({ id: 'roe', field: 'roe', operator: 'gte', value: 15, enabled: true });
    store.clearAllFilters();
    store.setSortConfig({ field: 'pe', direction: 'asc' });
    store.setSelectedSymbol('TCS001');

    expect(useStockStore.getState().activeFilters).toEqual([]);
    expect(useStockStore.getState().sortConfig).toEqual({ field: 'pe', direction: 'asc' });
    expect(useStockStore.getState().selectedSymbol).toBe('TCS001');
  });

  it('cycles a column through ascending, descending, and no sort', () => {
    const store = useStockStore.getState();
    store.setSort('symbol');
    expect(useStockStore.getState().sortConfig).toEqual({ field: 'symbol', direction: 'asc' });

    store.setSort('symbol');
    expect(useStockStore.getState().sortConfig).toEqual({ field: 'symbol', direction: 'desc' });

    store.setSort('symbol');
    expect(useStockStore.getState().sortConfig).toEqual({ field: null, direction: null });
  });

  it('persists only the watchlist as JSON-safe symbols', () => {
    const store = useStockStore.getState();
    store.addFilter({ id: 'pe', field: 'pe', operator: 'lte', value: 20, enabled: true });
    store.setSelected('TCS001');
    store.setConnection('open');
    store.toggleWatchlist('TCS001');
    const saved = JSON.parse(localStorage.getItem('stock-screener')!);
    expect(saved.state).toEqual({ watchlist: ['TCS001'] });
  });

  it('skips storage writes for live ticks and UI updates but saves watchlist changes', async () => {
    const write = vi.spyOn(Storage.prototype, 'setItem');
    try {
      const store = useStockStore.getState();
      store.toggleWatchlist('TCS001');
      expect(write).toHaveBeenCalledTimes(1);
      for (let timestamp = 0; timestamp < 20; timestamp++) {
        store.batchUpdatePrices(
          new Map([
            [
              'TCS001',
              {
                symbol: 'TCS001',
                price: 100 + timestamp,
                change: timestamp,
                changePercent: timestamp,
                timestamp,
              },
            ],
          ]),
        );
      }
      store.setConnection('open');
      store.setSelected('TCS001');
      store.setSort('symbol');
      store.clearFilters();
      expect(write).toHaveBeenCalledTimes(1);
      store.toggleWatchlist('INFY001');
      expect(write).toHaveBeenCalledTimes(2);
      await useStockStore.persist.rehydrate();
      expect(useStockStore.getState().watchlist).toEqual(new Set(['TCS001', 'INFY001']));
      useStockStore.getState().toggleWatchlist('TCS001');
      expect(JSON.parse(localStorage.getItem('stock-screener')!).state.watchlist).toEqual([
        'INFY001',
      ]);
      useStockStore.persist.clearStorage();
      expect(localStorage.getItem('stock-screener')).toBeNull();
      useStockStore.getState().setConnection('closed');
      expect(JSON.parse(localStorage.getItem('stock-screener')!).state.watchlist).toEqual([
        'INFY001',
      ]);
    } finally {
      write.mockRestore();
    }
  });

  it('replaces all previous filters in one notification when applying a preset', () => {
    const store = useStockStore.getState();
    store.addFilter({
      id: 'watchlist',
      field: 'watchlist',
      operator: 'eq',
      value: true,
      enabled: true,
    });
    store.toggleWatchlist('KEEP001');
    store.setSelected('KEEP001');
    const listener = vi.fn();
    const unsubscribe = useStockStore.subscribe(listener);
    try {
      store.applyPreset(SCREENER_PRESETS[1].filters);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(useStockStore.getState().activeFilters).toEqual(
        SCREENER_PRESETS[1].filters.map((filter) => ({ ...filter, enabled: true })),
      );
      expect(useStockStore.getState().watchlist).toEqual(new Set(['KEEP001']));
      expect(useStockStore.getState().selectedSymbol).toBe('KEEP001');
      const originalRsi = SCREENER_PRESETS[1].filters.find((filter) => filter.field === 'rsi14')!;
      const appliedRsi = useStockStore
        .getState()
        .activeFilters.find((filter) => filter.field === 'rsi14')!;
      expect(appliedRsi.value).not.toBe(originalRsi.value);
    } finally {
      unsubscribe();
    }
  });

  it('restores watchlist membership as a Set before notifying subscribers', async () => {
    localStorage.setItem(
      'stock-screener',
      JSON.stringify({
        state: { watchlist: ['TCS001', 'INFY001'] },
        version: 0,
      }),
    );
    const publishedTypes: boolean[] = [];
    const unsubscribe = useStockStore.subscribe((state) => {
      publishedTypes.push(state.watchlist instanceof Set);
    });
    try {
      await useStockStore.persist.rehydrate();
      expect(publishedTypes.length).toBeGreaterThan(0);
      expect(publishedTypes.every(Boolean)).toBe(true);
      expect(useStockStore.getState().watchlist).toEqual(new Set(['TCS001', 'INFY001']));
      useStockStore.getState().toggleWatchlist('TCS001');
      expect(useStockStore.getState().watchlist).toEqual(new Set(['INFY001']));
    } finally {
      unsubscribe();
    }
  });

  it('ignores non-watchlist persisted state and validates restored symbols', async () => {
    const before = useStockStore.getState();
    localStorage.setItem(
      'stock-screener',
      JSON.stringify({
        state: {
          watchlist: ['TCS001', 'TCS001', null, 42, ''],
          connection: 'open',
          selectedSymbol: 'STALE',
          livePrices: {},
          activeFilters: [],
          toggleWatchlist: null,
        },
        version: 0,
      }),
    );
    await useStockStore.persist.rehydrate();
    const restored = useStockStore.getState();
    expect(restored.watchlist).toEqual(new Set(['TCS001']));
    expect(restored.connection).toBe(before.connection);
    expect(restored.selectedSymbol).toBe(before.selectedSymbol);
    expect(restored.livePrices).toBe(before.livePrices);
    expect(restored.toggleWatchlist).toBe(before.toggleWatchlist);
  });

  it.each([null, {}, { watchlist: {} }])(
    'keeps a valid runtime store for malformed persisted state %j',
    async (state) => {
      useStockStore.getState().toggleWatchlist('KEEP001');
      localStorage.setItem('stock-screener', JSON.stringify({ state, version: 0 }));
      await useStockStore.persist.rehydrate();
      expect(useStockStore.getState().watchlist).toEqual(new Set(['KEEP001']));
      expect(useStockStore.getState().livePrices).toBeInstanceOf(Map);
    },
  );
});
