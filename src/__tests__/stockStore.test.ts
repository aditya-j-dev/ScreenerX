import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStockStore } from '../stores/stockStore';

describe('Zustand Stock Store State Management', () => {
  beforeEach(() => {
    useStockStore.getState().clearFilters();
    useStockStore.getState().setSelected(null);
    useStockStore.setState({ livePrices: new Map(), watchlist: new Set() });
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
});
