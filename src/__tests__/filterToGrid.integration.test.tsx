import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Stock } from '../types/stock';
import { generateMockStocks } from '../lib/mockData';
import { useStockStore } from '../stores/stockStore';

const fixture = vi.hoisted(() => ({ stocks: [] as Stock[] }));
// Keep the production filter/store/sort/table wiring. Substitute only external
// data/transport, canvas loading and viewport geometry, which jsdom lacks.
vi.mock('../hooks/useStockData', () => ({
  useStockData: () => ({ data: fixture.stocks, isLoading: false, error: null, isCached: false }),
}));
vi.mock('../hooks/useWebSocket', () => ({ useRealtimeUpdates: () => {} }));
vi.mock('../hooks/useNetworkStatus', () => ({ useNetworkStatus: () => true }));
vi.mock('next/dynamic', () => ({
  default: () =>
    function ChartProbe({ symbol }: { symbol: string }) {
      return <output data-testid="selected-chart">{symbol}</output>;
    },
}));
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: {
    count: number;
    horizontal?: boolean;
    estimateSize: (index: number) => number;
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: Math.min(options.count, options.horizontal ? 7 : 10) }, (_, index) => ({
        index,
        start: Array.from({ length: index }, (_, item) => options.estimateSize(item)).reduce(
          (a, b) => a + b,
          0,
        ),
        size: options.estimateSize(index),
      })),
    getTotalSize: () =>
      Array.from({ length: options.count }, (_, index) => options.estimateSize(index)).reduce(
        (a, b) => a + b,
        0,
      ),
    scrollToIndex: vi.fn(),
    measure: vi.fn(),
  }),
}));
import { Screener } from '../components/Screener';

function stockRows() {
  return within(screen.getByRole('grid'))
    .getAllByRole('row')
    .filter((row) => row.getAttribute('aria-rowindex') !== '1');
}

describe('production filter-to-grid workflow', () => {
  beforeEach(() => {
    act(() => useStockStore.setState(useStockStore.getInitialState(), true));
    fixture.stocks = generateMockStocks(2).map((stock, index) => ({
      ...stock,
      pe: index ? 35 : 10,
      marketCap: index ? 200 : 100,
      companyName: index ? 'Zeta Industries' : 'Alpha Industries',
    }));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('applies and clears P/E filters through the actual screener and sorts real table rows', async () => {
    const user = userEvent.setup();
    render(<Screener />);
    expect(stockRows()).toHaveLength(2);
    expect(stockRows()[0]).toHaveTextContent(fixture.stocks[1].symbol);
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.type(screen.getByRole('spinbutton', { name: 'P/E maximum' }), '20');
    await user.keyboard('{Escape}');
    expect(stockRows()).toHaveLength(1);
    expect(stockRows()[0]).toHaveTextContent(fixture.stocks[0].symbol);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 2 stocks');
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('button', { name: 'Clear All Filters' }));
    await user.keyboard('{Escape}');
    expect(stockRows()).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Company' }));
    expect(stockRows()[0]).toHaveTextContent(fixture.stocks[0].symbol);
    expect(screen.getByRole('columnheader', { name: /Company/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await user.click(screen.getByRole('button', { name: 'Company' }));
    expect(stockRows()[0]).toHaveTextContent(fixture.stocks[1].symbol);
  });

  it('filters using the actual watchlist cell and opens the remaining stock chart', async () => {
    const user = userEvent.setup();
    render(<Screener />);
    const stock = fixture.stocks[0];
    await user.click(screen.getByRole('button', { name: `Add ${stock.symbol} to watchlist` }));
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByRole('switch', { name: 'Watchlist Only' }));
    await user.keyboard('{Escape}');
    expect(stockRows()).toHaveLength(1);
    expect(stockRows()[0]).toHaveTextContent(stock.symbol);
    await user.click(within(screen.getByRole('grid')).getByText(stock.symbol));
    expect(screen.getByTestId('selected-chart')).toHaveTextContent(stock.symbol);
    await vi.waitFor(() => expect(document.getElementById('chart-panel')).toHaveFocus());
    expect(useStockStore.getState().selectedSymbol).toBe(stock.symbol);
  });
});
