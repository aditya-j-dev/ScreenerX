import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OHLCV, Stock } from '../types/stock';
import { generateMockStocks } from '../lib/mockData';
import { useStockStore } from '../stores/stockStore';

const fixture = vi.hoisted(() => ({
  stocks: [] as Stock[],
  renders: 0,
  gridRenders: 0,
  online: true,
  cached: false,
  error: null as Error | null,
}));
vi.mock('../hooks/useWebSocket', () => ({ useRealtimeUpdates: () => {} }));
vi.mock('../hooks/useStockData', () => ({
  useStockData: () => ({
    data: fixture.stocks,
    isLoading: false,
    error: fixture.error,
    isCached: fixture.cached,
  }),
}));
vi.mock('../hooks/useNetworkStatus', () => ({ useNetworkStatus: () => fixture.online }));
vi.mock('next/dynamic', () => ({
  default: () =>
    function ChartProbe({ symbol, data }: { symbol: string; data: OHLCV[] }) {
      fixture.renders++;
      return (
        <output data-testid="chart-data">
          {JSON.stringify({ symbol, candle: data.at(-1), count: data.length })}
        </output>
      );
    },
}));
vi.mock('../components/DataGrid/StockTable', () => ({
  StockTable: ({ stocks }: { stocks: Stock[] }) => {
    fixture.gridRenders++;
    return (
      <div>
        {stocks.map((stock) => (
          <button
            key={stock.symbol}
            onClick={() => useStockStore.getState().setSelected(stock.symbol)}
          >
            {stock.symbol}
          </button>
        ))}
      </div>
    );
  },
}));
import { Screener } from '../components/Screener';

describe('Screener live chart wiring', () => {
  beforeEach(() => {
    useStockStore.setState(useStockStore.getInitialState(), true);
    fixture.stocks = generateMockStocks(2);
    fixture.renders = 0;
    fixture.gridRenders = 0;
    fixture.online = true;
    fixture.cached = false;
    fixture.error = null;
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('announces current results and contains filter dialog focus until dismissed', () => {
    render(<Screener />);
    expect(screen.getByRole('status')).toHaveTextContent('Showing 2 of 2 stocks');
    const trigger = screen.getByRole('button', { name: 'Filters' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Stock filters' });
    const close = screen.getByRole('button', { name: 'Close filters' });
    expect(close).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const enabled = dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled)',
    );
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(enabled[enabled.length - 1]).toHaveFocus();
    fireEvent.keyDown(enabled[enabled.length - 1], { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    act(() =>
      useStockStore.getState().addFilter({
        id: 'none',
        field: 'lastPrice',
        operator: 'lt',
        value: 0,
        enabled: true,
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Showing 0 of 2 stocks');
  });

  it('moves focus to the chart panel after opening a stock', async () => {
    render(<Screener />);
    fireEvent.click(screen.getByRole('button', { name: fixture.stocks[0].symbol }));
    await vi.waitFor(() => expect(document.getElementById('chart-panel')).toHaveFocus());
  });

  it('warns about saved data while online and clears the warning after refresh', () => {
    fixture.cached = true;
    const { rerender } = render(<Screener />);
    expect(screen.getByText('Showing saved data - prices may be stale')).toBeInTheDocument();
    fixture.cached = false;
    rerender(<Screener />);
    expect(screen.queryByText(/prices may be stale/)).not.toBeInTheDocument();
    fixture.online = false;
    rerender(<Screener />);
    expect(screen.getByText('Working offline - prices may be stale')).toBeInTheDocument();
  });

  it('explains a missing offline cache and keeps existing rows on a refresh failure', () => {
    fixture.online = false;
    fixture.error = new Error('Offline');
    fixture.stocks = [];
    const { rerender } = render(<Screener />);
    expect(screen.getByRole('alert')).toHaveTextContent('No offline stock data available');
    fixture.online = true;
    fixture.stocks = generateMockStocks(2);
    rerender(<Screener />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: fixture.stocks[0].symbol })).toBeInTheDocument();
    expect(screen.getByText('Showing saved data - prices may be stale')).toBeInTheDocument();
  });

  it('updates the selected latest candle, retains extrema and restores the correct symbol after switching', () => {
    render(<Screener />);
    const [a, b] = fixture.stocks;
    fireEvent.click(screen.getByRole('button', { name: a.symbol }));
    const read = () => JSON.parse(screen.getByTestId('chart-data').textContent!);
    const initial = read();
    const tick = (stock: Stock, price: number, timestamp: number) =>
      act(() => {
        useStockStore.getState().batchUpdatePrices(
          new Map([
            [
              stock.symbol,
              {
                symbol: stock.symbol,
                price,
                change: price - stock.previousClose,
                changePercent: (price / stock.previousClose - 1) * 100,
                timestamp,
              },
            ],
          ]),
        );
      });
    const renders = fixture.renders;
    const gridRenders = fixture.gridRenders;
    tick(b, b.lastPrice + 100, 1);
    expect(fixture.renders).toBe(renders);
    expect(read()).toEqual(initial);
    const high = a.dayHigh + 100;
    const low = Math.max(0.1, a.dayLow / 2);
    tick(a, high, 2);
    tick(a, low, 3);
    tick(a, a.lastPrice, 4);
    expect(read()).toEqual({
      symbol: a.symbol,
      count: 1260,
      candle: {
        ...initial.candle,
        close: a.lastPrice,
        high,
        low,
      },
    });
    expect(fixture.gridRenders).toBe(gridRenders);
    fireEvent.click(screen.getByRole('button', { name: b.symbol }));
    expect(read().symbol).toBe(b.symbol);
    expect(read().candle.close).toBe(b.lastPrice + 100);
    fireEvent.click(screen.getByRole('button', { name: a.symbol }));
    expect(read().candle).toMatchObject({ high, low, close: a.lastPrice });
    fireEvent.click(screen.getByRole('button', { name: /^Clear$/ }));
    expect(screen.queryByTestId('chart-data')).not.toBeInTheDocument();
  });
});
