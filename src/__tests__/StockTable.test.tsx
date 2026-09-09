import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMockStocks } from '../lib/mockData';
import { useStockStore } from '../stores/stockStore';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: {
    count: number;
    horizontal?: boolean;
    estimateSize: (index: number) => number;
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: Math.min(options.count, options.horizontal ? 6 : 3) }, (_, index) => ({
        index,
        start: Array.from({ length: index }, (_, item) => options.estimateSize(item)).reduce(
          (sum, size) => sum + size,
          0,
        ),
        size: options.estimateSize(index),
      })),
    getTotalSize: () =>
      Array.from({ length: options.count }, (_, index) => options.estimateSize(index)).reduce(
        (sum, size) => sum + size,
        0,
      ),
    scrollToIndex: vi.fn(),
    measure: vi.fn(),
  }),
}));

describe('StockTable and cell renderers', () => {
  beforeEach(() => {
    act(() =>
      useStockStore.setState({
        selectedSymbol: null,
        watchlist: new Set(),
        sortConfig: { field: 'marketCap', direction: 'desc' },
        livePrices: new Map(),
      }),
    );
  });

  it('renders formatted cells, selects rows, toggles watchlist, and sorts', async () => {
    const { StockTable } = await import('../components/DataGrid/StockTable');
    const [first, second] = generateMockStocks(2);
    first.lastPrice = 1234.5;
    const onStockSelect = vi.fn();
    render(<StockTable stocks={[first, second]} onStockSelect={onStockSelect} />);

    expect(screen.getByText(first.symbol)).toBeInTheDocument();
    expect(screen.getByText('₹1,234.50')).toBeInTheDocument();

    fireEvent.click(screen.getByText(first.symbol));
    expect(useStockStore.getState().selectedSymbol).toBe(first.symbol);
    expect(onStockSelect).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: `Add ${first.symbol} to watchlist` }));
    expect(useStockStore.getState().watchlist.has(first.symbol)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Company' }));
    expect(useStockStore.getState().sortConfig.field).toBe('companyName');
  });
});
