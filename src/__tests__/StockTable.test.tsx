import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMockStocks } from '../lib/mockData';
import { sortStocks } from '../lib/filterEngine';
import { useStockStore } from '../stores/stockStore';

const virtualWindow = vi.hoisted(() => ({ columns: 6 }));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: {
    count: number;
    horizontal?: boolean;
    estimateSize: (index: number) => number;
  }) => ({
    getVirtualItems: () =>
      Array.from(
        { length: Math.min(options.count, options.horizontal ? virtualWindow.columns : 3) },
        (_, index) => ({
          index,
          start: Array.from({ length: index }, (_, item) => options.estimateSize(item)).reduce(
            (sum, size) => sum + size,
            0,
          ),
          size: options.estimateSize(index),
        }),
      ),
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
    virtualWindow.columns = 6;
    act(() =>
      useStockStore.setState({
        selectedSymbol: null,
        watchlist: new Set(),
        sortConfig: { field: 'marketCap', direction: 'desc' },
        livePrices: new Map(),
      }),
    );
  });

  it('exposes row and column positions and keyboard column options', async () => {
    const { StockTable } = await import('../components/DataGrid/StockTable');
    render(<StockTable stocks={generateMockStocks(2)} totalCount={5000} />);
    const grid = screen.getByRole('grid');
    expect(grid).toHaveAttribute('aria-rowcount', '3');
    expect(grid).toHaveAccessibleDescription(/Showing 2 of 5,000 stocks/);
    const headers = screen.getAllByRole('columnheader');
    expect(headers[0]).toHaveAttribute('aria-colindex', '1');
    const cell = screen.getAllByRole('gridcell')[0];
    expect(cell).toHaveAttribute('aria-colindex', '1');
    const company = screen.getByRole('button', { name: 'Company' });
    company.focus();
    fireEvent.keyDown(company, { key: 'F10', shiftKey: true });
    expect(screen.getByRole('menu', { name: 'Column options' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Pin to left' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(company).toHaveFocus();
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

  it('updates live change cells and restarts a 300ms price flash without changing other rows', async () => {
    const { StockTable } = await import('../components/DataGrid/StockTable');
    vi.useFakeTimers();
    virtualWindow.columns = 13;
    const stocks = generateMockStocks(2);
    const { container, unmount } = render(<StockTable stocks={stocks} />);
    try {
      const rows = container.querySelectorAll(
        '[role="row"][aria-rowindex]:not([aria-rowindex="1"])',
      );
      const otherText = rows[1].textContent;
      const tick = (price: number, change: number, timestamp: number) =>
        act(() =>
          useStockStore.getState().batchUpdatePrices(
            new Map([
              [
                stocks[0].symbol,
                {
                  symbol: stocks[0].symbol,
                  price,
                  change,
                  changePercent: change,
                  timestamp,
                },
              ],
            ]),
          ),
        );
      tick(stocks[0].lastPrice + 10, 10, 1);
      expect(rows[0].querySelector('.animate-flash-green')).not.toBeNull();
      expect(within(rows[0] as HTMLElement).getByText('\u25b2 10.00%')).toHaveClass(
        'text-emerald-400',
      );
      expect(within(rows[0] as HTMLElement).getByText('\u25b2 \u20b910.00')).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(200));
      tick(stocks[0].lastPrice - 5, -5, 2);
      expect(rows[0].querySelector('.animate-flash-red')).not.toBeNull();
      expect(within(rows[0] as HTMLElement).getByText('\u25bc 5.00%')).toHaveClass('text-red-400');
      act(() => vi.advanceTimersByTime(299));
      expect(rows[0].querySelector('.animate-flash-red')).not.toBeNull();
      act(() => vi.advanceTimersByTime(1));
      expect(rows[0].querySelector('[class*="animate-flash"]')).toBeNull();
      tick(stocks[0].lastPrice - 5, 0, 3);
      expect(rows[0].querySelector('[class*="animate-flash"]')).toBeNull();
      expect(within(rows[0] as HTMLElement).getByText('\u2014 0.00%')).toHaveClass(
        'text-neutral-400',
      );
      expect(rows[1].textContent).toBe(otherText);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it('cycles real row ordering through ascending, descending and original order', async () => {
    const { StockTable } = await import('../components/DataGrid/StockTable');
    const stocks = generateMockStocks(3).map((stock, index) => ({
      ...stock,
      companyName: ['Zulu', 'Alpha', 'Mike'][index],
    }));
    useStockStore.setState({ sortConfig: { field: null, direction: null } });
    // Use the same external sorting contract as Screener; do not sort inside StockTable.
    function SortedGrid() {
      const sort = useStockStore((state) => state.sortConfig);
      const sorted =
        sort.field && sort.direction ? sortStocks(stocks, sort.field, sort.direction) : stocks;
      return <StockTable stocks={sorted} />;
    }
    const { container } = render(<SortedGrid />);
    const symbols = () =>
      Array.from(
        container.querySelectorAll('[role="row"][aria-rowindex]:not([aria-rowindex="1"])'),
      ).map((row) => stocks.find((stock) => row.textContent?.includes(stock.symbol))?.symbol);
    const header = screen.getByRole('button', { name: 'Company' });
    const ariaHeader = header.closest('[role="columnheader"]')!;
    expect(symbols()).toEqual(stocks.map((stock) => stock.symbol));
    expect(ariaHeader).toHaveAttribute('aria-sort', 'none');
    fireEvent.click(header);
    expect(symbols()).toEqual([stocks[1].symbol, stocks[2].symbol, stocks[0].symbol]);
    expect(ariaHeader).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(header);
    expect(symbols()).toEqual([stocks[0].symbol, stocks[2].symbol, stocks[1].symbol]);
    expect(ariaHeader).toHaveAttribute('aria-sort', 'descending');
    fireEvent.click(header);
    expect(symbols()).toEqual(stocks.map((stock) => stock.symbol));
    expect(ariaHeader).toHaveAttribute('aria-sort', 'none');
  });

  it('keeps exactly one selected stock after rows are reordered', async () => {
    const { StockTable } = await import('../components/DataGrid/StockTable');
    const stocks = generateMockStocks(3);
    const { container, rerender } = render(<StockTable stocks={stocks} />);
    expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(0);
    fireEvent.click(screen.getByText(stocks[0].symbol));
    rerender(<StockTable stocks={[stocks[2], stocks[1], stocks[0]]} />);
    const selectedRows = container.querySelectorAll('[role="row"][aria-selected="true"]');
    expect(selectedRows).toHaveLength(1);
    expect(selectedRows[0]).toHaveTextContent(stocks[0].symbol);
    expect(selectedRows[0].querySelector('[role="gridcell"]')?.id).toBe(
      `grid-cell-${stocks[0].symbol}-0`,
    );
  });

  it('resizes a column by dragging and resets its width on double click', async () => {
    const { StockTable } = await import('../components/DataGrid/StockTable');
    render(<StockTable stocks={generateMockStocks(2)} />);
    const resize = screen.getByRole('separator', { name: 'Resize Company column' });
    const header = resize.closest('[role="columnheader"]')!;
    expect(header).toHaveStyle({ width: '180px' });
    fireEvent.mouseDown(resize, { clientX: 180, button: 0 });
    fireEvent.mouseMove(document, { clientX: 240 });
    fireEvent.mouseUp(document, { clientX: 240 });
    expect(header).toHaveStyle({ width: '240px' });
    expect(resize).toHaveAttribute('aria-valuenow', '240');
    fireEvent.doubleClick(resize);
    expect(header).toHaveStyle({ width: '180px' });
  });

  it('handles grid navigation, chart selection and watchlist shortcuts only on the grid', async () => {
    const { StockTable } = await import('../components/DataGrid/StockTable');
    const stocks = generateMockStocks(3);
    const onStockSelect = vi.fn();
    render(
      <>
        <button type="button">Outside</button>
        <StockTable stocks={stocks} onStockSelect={onStockSelect} />
      </>,
    );
    const grid = screen.getByRole('grid');
    const outside = screen.getByRole('button', { name: 'Outside' });
    Object.defineProperty(grid, 'clientHeight', { configurable: true, value: 560 });
    outside.focus();
    fireEvent.keyDown(outside, { key: 'ArrowDown' });
    fireEvent.keyDown(outside, { key: 'Enter' });
    fireEvent.keyDown(outside, { key: ' ' });
    fireEvent.keyDown(outside, { key: '?' });
    expect(useStockStore.getState().selectedSymbol).toBeNull();
    expect(useStockStore.getState().watchlist.size).toBe(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    grid.focus();
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(grid.getAttribute('aria-activedescendant')).toBe(`grid-cell-${stocks[1].symbol}-0`);
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(grid.getAttribute('aria-activedescendant')).toBe(`grid-cell-${stocks[1].symbol}-1`);
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(useStockStore.getState().selectedSymbol).toBe(stocks[1].symbol);
    expect(onStockSelect).toHaveBeenCalledOnce();
    fireEvent.keyDown(grid, { key: ' ' });
    expect(useStockStore.getState().watchlist.has(stocks[1].symbol)).toBe(true);
    fireEvent.keyDown(grid, { key: 'End' });
    expect(grid.getAttribute('aria-activedescendant')).toBe(`grid-cell-${stocks[2].symbol}-1`);
    fireEvent.keyDown(grid, { key: 'Home' });
    expect(grid.getAttribute('aria-activedescendant')).toBe(`grid-cell-${stocks[0].symbol}-1`);
    fireEvent.keyDown(grid, { key: 'PageDown' });
    expect(grid.getAttribute('aria-activedescendant')).toBe(`grid-cell-${stocks[2].symbol}-1`);
    fireEvent.keyDown(grid, { key: 'PageUp' });
    expect(grid.getAttribute('aria-activedescendant')).toBe(`grid-cell-${stocks[0].symbol}-1`);
  });

  it('preserves native controls and Tab order through filter inputs', async () => {
    const { StockTable } = await import('../components/DataGrid/StockTable');
    const user = userEvent.setup();
    render(
      <>
        <div id="filter-panel">
          <input aria-label="First filter" />
          <input aria-label="Second filter" />
        </div>
        <StockTable stocks={generateMockStocks(2)} />
        <div id="chart-panel" tabIndex={-1} />
      </>,
    );
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'First filter' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Second filter' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('grid')).toHaveFocus();
    const sortButton = screen.getByRole('button', { name: 'Company' });
    sortButton.focus();
    await user.keyboard('{Enter}');
    expect(useStockStore.getState().sortConfig.field).toBe('companyName');
    expect(useStockStore.getState().selectedSymbol).toBeNull();
    const resize = screen.getByRole('separator', { name: 'Resize Company column' });
    resize.focus();
    await user.keyboard('{ArrowRight}');
    expect(resize).toHaveAttribute('aria-valuenow', '190');
    expect(screen.getByRole('grid').getAttribute('aria-activedescendant')).toMatch(/-0$/);
  });

  it('clamps the active row when filtering shrinks or empties the results', async () => {
    const { StockTable } = await import('../components/DataGrid/StockTable');
    const stocks = generateMockStocks(100);
    const { rerender } = render(<StockTable stocks={stocks} />);
    const grid = screen.getByRole('grid');
    grid.focus();
    fireEvent.keyDown(grid, { key: 'End' });
    rerender(<StockTable stocks={stocks.slice(0, 2)} />);
    expect(grid).toHaveAttribute('aria-activedescendant', `grid-cell-${stocks[1].symbol}-0`);
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(useStockStore.getState().selectedSymbol).toBe(stocks[1].symbol);
    rerender(<StockTable stocks={[]} />);
    expect(grid).not.toHaveAttribute('aria-activedescendant');
    expect(() => fireEvent.keyDown(grid, { key: 'Enter' })).not.toThrow();
  });

  it('focuses and contains the shortcut dialog, then restores focus on Escape or close', async () => {
    const { StockTable } = await import('../components/DataGrid/StockTable');
    const user = userEvent.setup();
    render(<StockTable stocks={generateMockStocks(2)} />);
    const grid = screen.getByRole('grid');
    grid.focus();
    await user.keyboard('?');
    const close = screen.getByRole('button', { name: 'Close keyboard shortcuts' });
    expect(close).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(grid).toHaveFocus();
    await user.keyboard('?');
    await user.click(screen.getByRole('button', { name: 'Close keyboard shortcuts' }));
    expect(grid).toHaveFocus();
  });

  it('formats monetary columns with INR and two decimal places', async () => {
    virtualWindow.columns = 50;
    const { StockTable } = await import('../components/DataGrid/StockTable');
    const stock = {
      ...generateMockStocks(1)[0],
      lastPrice: 1234.5,
      previousClose: 1200,
      dayOpen: 1201.1,
      dayHigh: 1250,
      dayLow: 1190,
      week52High: 2000,
      week52Low: 900,
      eps: -12.5,
      sma50: 1100,
      sma200: 1050,
      atr: 25,
    };
    render(<StockTable stocks={[stock]} />);
    for (const text of [
      '\u20b91,234.50',
      '\u20b91,200.00',
      '\u20b91,201.10',
      '\u20b91,250.00',
      '\u20b91,190.00',
      '\u20b92,000.00',
      '\u20b9900.00',
      '\u20b9-12.50',
      '\u20b91,100.00',
      '\u20b91,050.00',
      '\u20b925.00',
    ]) {
      expect(screen.getByText(text)).toHaveClass('font-mono', 'tabular-nums');
    }
  });

  it('renders change direction, volume, market cap and RSI boundary colors', async () => {
    virtualWindow.columns = 50;
    const { StockTable } = await import('../components/DataGrid/StockTable');
    const stocks = generateMockStocks(3).map((stock, index) => ({
      ...stock,
      changePercent: [1.25, -2.5, 0][index],
      changeAbsolute: [10, -20, 0][index],
      rsi14: [29.9, 70, 70.1][index],
      volume: 12000000,
      marketCap: 2000000,
    }));
    const { container, rerender } = render(<StockTable stocks={stocks} />);
    const rows = container.querySelectorAll<HTMLElement>(
      '[role="row"][aria-rowindex]:not([aria-rowindex="1"])',
    );
    const expectations = [
      ['\u25b2 1.25%', '\u25b2 \u20b910.00', 'text-emerald-400', '29.9', 'bg-emerald-500/20'],
      ['\u25bc 2.50%', '\u25bc \u20b920.00', 'text-red-400', '70.0', 'bg-amber-400/20'],
      ['\u2014 0.00%', '\u2014 \u20b90.00', 'text-neutral-400', '70.1', 'bg-red-500/20'],
    ];
    expectations.forEach(([percent, absolute, changeClass, rsi, rsiClass], index) => {
      const row = within(rows[index]);
      expect(row.getByText(percent)).toHaveClass(changeClass);
      expect(row.getByText(absolute)).toHaveClass(changeClass);
      expect(row.getByText(rsi)).toHaveClass(rsiClass);
      expect(row.getByText('1.2Cr')).toBeInTheDocument();
      expect(row.getByText('20L Cr')).toBeInTheDocument();
    });
    rerender(<StockTable stocks={[{ ...stocks[0], rsi14: 30 }]} />);
    expect(screen.getByText('30.0')).toHaveClass('bg-amber-400/20');
  });
});
