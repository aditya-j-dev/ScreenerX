'use client';

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnPinningState,
  type ColumnSizingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { formatMarketCap, formatPriceINR, formatVolume, getRsiTone } from '@/lib/formatters';
import {
  getGridKeyboardAction,
  getNextFocusRegionIndex,
  getViewportRowCount,
  moveGridIndex,
} from '@/lib/gridKeyboard';
import { clampScrollRowIndex, VIRTUAL_OVERSCAN, VIRTUAL_ROW_HEIGHT } from '@/lib/virtualGrid';
import { useStockStore } from '@/stores/stockStore';
import type { Stock } from '@/types/stock';

const columnHelper = createColumnHelper<Stock>();

export interface StockTableHandle {
  scrollToRow: (index: number) => void;
}

interface ColumnContextMenu {
  columnId: string;
  x: number;
  y: number;
}

const STOCK_COLUMNS: Array<{ field: keyof Stock; header: string; size: number }> = [
  { field: 'symbol', header: 'Symbol', size: 120 },
  { field: 'companyName', header: 'Company', size: 180 },
  { field: 'sector', header: 'Sector', size: 110 },
  { field: 'industry', header: 'Industry', size: 140 },
  { field: 'marketCapCategory', header: 'Cap Category', size: 120 },
  { field: 'indexMembership', header: 'Indices', size: 170 },
  { field: 'lastPrice', header: 'LTP', size: 120 },
  { field: 'previousClose', header: 'Prev Close', size: 120 },
  { field: 'dayOpen', header: 'Open', size: 110 },
  { field: 'dayHigh', header: 'High', size: 110 },
  { field: 'dayLow', header: 'Low', size: 110 },
  { field: 'changePercent', header: '% Change', size: 110 },
  { field: 'changeAbsolute', header: 'Change', size: 110 },
  { field: 'volume', header: 'Volume', size: 120 },
  { field: 'avgVolume20D', header: '20D Avg Vol', size: 130 },
  { field: 'week52High', header: '52W High', size: 120 },
  { field: 'week52Low', header: '52W Low', size: 120 },
  { field: 'marketCap', header: 'Market Cap', size: 140 },
  { field: 'pe', header: 'P/E', size: 90 },
  { field: 'pb', header: 'P/B', size: 90 },
  { field: 'dividendYield', header: 'Div Yield', size: 110 },
  { field: 'eps', header: 'EPS', size: 100 },
  { field: 'roe', header: 'ROE', size: 90 },
  { field: 'roce', header: 'ROCE', size: 90 },
  { field: 'debtToEquity', header: 'Debt/Equity', size: 125 },
  { field: 'currentRatio', header: 'Current Ratio', size: 125 },
  { field: 'promoterHolding', header: 'Promoter %', size: 120 },
  { field: 'revenueGrowthYoY', header: 'Revenue Growth', size: 135 },
  { field: 'profitGrowthYoY', header: 'Profit Growth', size: 130 },
  { field: 'rsi14', header: 'RSI (14)', size: 100 },
  { field: 'sma50', header: 'SMA 50', size: 110 },
  { field: 'sma200', header: 'SMA 200', size: 110 },
  { field: 'beta', header: 'Beta', size: 90 },
  { field: 'atr', header: 'ATR', size: 100 },
  { field: 'macdSignal', header: 'MACD', size: 150 },
  { field: 'bollingerPosition', header: 'Bollinger', size: 140 },
  { field: 'volumeVsAvg', header: 'Vol vs Avg', size: 110 },
];

function formatValue(value: unknown) {
  if (value === null || value === undefined) return 'N/A';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'number') return value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return String(value);
}

/**
 * A price tick changes only this symbol's selector result, so Zustand does not rerender StockTable
 * or the other visible price cells when the WebSocket sends a batch.
 */
const LivePriceCell = memo(
  function LivePriceCell({ symbol, initialPrice }: { symbol: string; initialPrice: number }) {
    const price = useStockStore((state) => state.livePrices.get(symbol)?.price ?? initialPrice);
    const previousPrice = useRef(price);
    const flashId = useRef(0);
    const [flash, setFlash] = useState<{ direction: 'up' | 'down'; id: number } | null>(null);

    useEffect(() => {
      if (previousPrice.current === price) return undefined;

      const direction = price > previousPrice.current ? 'up' : 'down';
      previousPrice.current = price;
      flashId.current += 1;
      setFlash({ direction, id: flashId.current });
      const timer = window.setTimeout(() => setFlash(null), 600);
      return () => window.clearTimeout(timer);
    }, [price]);

    const flashClass =
      flash?.direction === 'up'
        ? 'animate-flash-green bg-emerald-500/20 text-emerald-300 [animation-duration:600ms]'
        : flash?.direction === 'down'
          ? 'animate-flash-red bg-red-500/20 text-red-300 [animation-duration:600ms]'
          : '';

    return (
      <span
        key={flash?.id ?? 0}
        className={`inline-flex rounded px-1.5 py-0.5 font-mono transition-colors ${flashClass}`}
      >
        {formatPriceINR(price)}
      </span>
    );
  },
  (previous, next) =>
    previous.symbol === next.symbol && previous.initialPrice === next.initialPrice,
);

type StaticStockCellProps = {
  field: keyof Stock;
  stock: Stock;
  value: unknown;
  onToggleWatchlist: (symbol: string) => void;
};

/** Static cell content is isolated from row selection, scrolling state, and unrelated live-price ticks.
 *  Watchlist state is read with a per-symbol selector so only the affected symbol's star re-renders. */
const StaticStockCell = memo(
  function StaticStockCell({ field, stock, value, onToggleWatchlist }: StaticStockCellProps) {
    // Granular per-symbol selector: only re-renders this cell when THIS symbol's watchlist status changes.
    const isWatchlisted = useStockStore(
      (state) => state.watchlist instanceof Set && state.watchlist.has(stock.symbol),
    );
    if (field === 'symbol') {
      return (
        <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleWatchlist(stock.symbol);
            }}
            title={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
            aria-label={`${isWatchlisted ? 'Remove' : 'Add'} ${stock.symbol} ${isWatchlisted ? 'from' : 'to'} watchlist`}
            aria-pressed={isWatchlisted}
          >
            {isWatchlisted ? '★' : '☆'}
          </button>
          <span>{stock.symbol}</span>
        </div>
      );
    }
    if (field === 'changePercent') {
      const direction = stock.changePercent > 0 ? 'up' : stock.changePercent < 0 ? 'down' : 'flat';
      const colour =
        direction === 'up'
          ? 'text-emerald-400'
          : direction === 'down'
            ? 'text-red-400'
            : 'text-slate-400';
      const marker = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '—';
      return (
        <span className={`font-mono ${colour}`}>
          {marker} {Math.abs(stock.changePercent).toFixed(2)}%
        </span>
      );
    }
    if (field === 'volume' || field === 'avgVolume20D')
      return <span className="font-mono">{formatVolume(stock[field] as number)}</span>;
    if (field === 'rsi14') {
      const tone = getRsiTone(stock.rsi14);
      const colour =
        tone === 'overbought'
          ? 'bg-red-500/20 text-red-400'
          : tone === 'oversold'
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-amber-400/20 text-amber-300';
      return (
        <span className={`rounded px-1.5 py-0.5 font-mono ${colour}`}>
          {stock.rsi14.toFixed(1)}
        </span>
      );
    }
    if (field === 'marketCap')
      return <span className="font-mono">{formatMarketCap(stock.marketCap)}</span>;
    return <span className="block truncate">{formatValue(value)}</span>;
  },
  (previous, next) => {
    if (previous.field !== next.field) return false;
    if (previous.field === 'symbol') return previous.stock.symbol === next.stock.symbol;
    return Object.is(previous.value, next.value);
  },
);

export const StockTable = forwardRef<
  StockTableHandle,
  { stocks: Stock[]; onStockSelect?: () => void }
>(function StockTable({ stocks, onStockSelect }, ref) {
  const parentRef = useRef<HTMLDivElement>(null);
  const selected = useStockStore((state) => state.selectedSymbol);
  const setSelected = useStockStore((state) => state.setSelected);
  const setSort = useStockStore((state) => state.setSort);
  const sort = useStockStore((state) => state.sortConfig);
  const toggleWatchlist = useStockStore((state) => state.toggleWatchlist);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>({ left: ['symbol'] });
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [columnContextMenu, setColumnContextMenu] = useState<ColumnContextMenu | null>(null);
  const columns = useMemo(
    () =>
      STOCK_COLUMNS.map(
        (definition) =>
          columnHelper.accessor(definition.field, {
            header: definition.header,
            size: definition.size,
            minSize: 80,
            enableResizing: true,
            cell: (info) => {
              const { field } = definition;
              const stock = info.row.original;
              if (field === 'lastPrice') {
                return <LivePriceCell symbol={stock.symbol} initialPrice={stock.lastPrice} />;
              }
              return (
                <StaticStockCell
                  field={field}
                  stock={stock}
                  value={info.getValue()}
                  onToggleWatchlist={toggleWatchlist}
                />
              );
            },
          }) as ColumnDef<Stock, unknown>,
      ),
    [toggleWatchlist],
  );

  const table = useReactTable({
    data: stocks,
    columns,
    state: { columnPinning, columnSizing },
    onColumnPinningChange: setColumnPinning,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  });
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => VIRTUAL_ROW_HEIGHT,
    overscan: VIRTUAL_OVERSCAN,
  });
  const visibleColumns = table.getVisibleLeafColumns();
  const pinnedColumns = useMemo(
    () => visibleColumns.filter((column) => column.getIsPinned() === 'left'),
    [visibleColumns],
  );
  const scrollableColumns = useMemo(
    () => visibleColumns.filter((column) => column.getIsPinned() !== 'left'),
    [visibleColumns],
  );
  const pinnedWidth = useMemo(
    () => pinnedColumns.reduce((width, column) => width + column.getSize(), 0),
    [pinnedColumns],
  );
  // Row virtualization alone still mounted all 37 columns for every buffered row. Virtualizing
  // the horizontal axis keeps only the columns in (or close to) the viewport in the DOM.
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: scrollableColumns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => scrollableColumns[index]?.getSize() ?? 100,
    overscan: 3,
  });
  useEffect(() => {
    columnVirtualizer.measure();
  }, [columnSizing, columnVirtualizer]);
  const scrollToRow = useCallback(
    (index: number) => {
      const rowIndex = clampScrollRowIndex(index, rows.length);
      if (rowIndex !== null) virtualizer.scrollToIndex(rowIndex, { align: 'auto' });
    },
    [rows.length, virtualizer],
  );

  useImperativeHandle(ref, () => ({ scrollToRow }), [scrollToRow]);

  const selectRow = (index: number, columnIndex = activeColumnIndex) => {
    setSelectedIndex(index);
    setActiveColumnIndex(columnIndex);
    setSelected(rows[index].original.symbol);
    onStockSelect?.();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = getGridKeyboardAction(event.key, event.shiftKey);
      const isEditableControl = ['INPUT', 'SELECT', 'TEXTAREA'].includes(
        (event.target as HTMLElement)?.tagName,
      );
      if (isEditableControl && action !== 'focus-next-region' && action !== 'focus-previous-region')
        return;
      const filterPanel = document.getElementById('filter-panel');
      const chartPanel = document.getElementById('chart-panel');
      const grid = parentRef.current;
      const target = event.target as Node;

      if (
        (action === 'focus-next-region' || action === 'focus-previous-region') &&
        filterPanel &&
        chartPanel &&
        grid
      ) {
        const focusOrder = [filterPanel, grid, chartPanel];
        const currentRegion = focusOrder.findIndex((region) => region.contains(target));
        if (currentRegion >= 0) {
          event.preventDefault();
          const nextRegion = getNextFocusRegionIndex(
            currentRegion,
            event.shiftKey,
            focusOrder.length,
          );
          focusOrder[nextRegion].focus();
          return;
        }
      }

      if (action === 'toggle-help') {
        event.preventDefault();
        setShowHelpModal((visible) => !visible);
        return;
      }
      if (!rows.length) return;
      if (action === 'move-row-down' || action === 'move-row-up') {
        event.preventDefault();
        setSelectedIndex((current) => {
          const next = moveGridIndex(current, action === 'move-row-down' ? 1 : -1, rows.length);
          scrollToRow(next);
          return next;
        });
        return;
      }
      if (action === 'move-column-right' || action === 'move-column-left') {
        event.preventDefault();
        setActiveColumnIndex((current) =>
          moveGridIndex(current, action === 'move-column-right' ? 1 : -1, visibleColumns.length),
        );
        return;
      }
      if (action === 'first-row') {
        event.preventDefault();
        setSelectedIndex(0);
        scrollToRow(0);
        return;
      }
      if (action === 'last-row') {
        event.preventDefault();
        const lastRow = rows.length - 1;
        setSelectedIndex(lastRow);
        scrollToRow(lastRow);
        return;
      }
      if (action === 'page-down' || action === 'page-up') {
        event.preventDefault();
        const pageSize = getViewportRowCount(
          parentRef.current?.clientHeight ?? 560,
          VIRTUAL_ROW_HEIGHT,
        );
        const direction = action === 'page-down' ? 1 : -1;
        setSelectedIndex((current) => {
          const next = moveGridIndex(current, pageSize * direction, rows.length);
          scrollToRow(next);
          return next;
        });
        return;
      }
      if (action === 'open-chart' && rows[selectedIndex]) {
        event.preventDefault();
        setSelected(rows[selectedIndex].original.symbol);
      }
      if (action === 'toggle-watchlist' && rows[selectedIndex]) {
        event.preventDefault();
        toggleWatchlist(rows[selectedIndex].original.symbol);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rows, scrollToRow, selectedIndex, setSelected, toggleWatchlist, visibleColumns.length]);

  useEffect(() => {
    const activeColumn = visibleColumns[activeColumnIndex];
    if (!activeColumn || activeColumn.getIsPinned() === 'left') return;
    const scrollableIndex = scrollableColumns.findIndex((column) => column.id === activeColumn.id);
    if (scrollableIndex >= 0) columnVirtualizer.scrollToIndex(scrollableIndex, { align: 'auto' });
  }, [activeColumnIndex, columnVirtualizer, scrollableColumns, visibleColumns]);

  useEffect(() => {
    const closeContextMenu = () => setColumnContextMenu(null);
    window.addEventListener('click', closeContextMenu);
    return () => window.removeEventListener('click', closeContextMenu);
  }, []);

  const toggleColumnPin = (columnId: string) => {
    if (columnId === 'symbol') return;
    const column = table.getColumn(columnId);
    if (column?.getIsPinned() === 'left') column.pin(false);
    else column?.pin('left');
    setColumnContextMenu(null);
  };

  return (
    <div className="relative">
      <div id="grid-status" role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        Showing {stocks.length} of 5,000 stocks.
      </div>
      <div
        id="stock-grid"
        ref={parentRef}
        role="grid"
        aria-label="Real-time Stock Screener Grid"
        aria-rowcount={rows.length + 1}
        aria-colcount={columns.length}
        aria-activedescendant={
          rows[selectedIndex]
            ? `grid-cell-${rows[selectedIndex].id}-${activeColumnIndex}`
            : undefined
        }
        tabIndex={0}
        className="h-[560px] overflow-auto rounded-xl border border-slate-800 bg-slate-950 shadow-inner focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
      >
        <div
          role="row"
          className="sticky top-0 z-20 h-9 border-b border-slate-800 bg-slate-900/95 text-xs font-semibold text-slate-400 backdrop-blur"
          style={{ width: table.getTotalSize(), position: 'sticky' }}
        >
          {table
            .getHeaderGroups()[0]
            .headers.filter((header) => header.column.getIsPinned() === 'left')
            .map((header) => {
              const isPinned = header.column.getIsPinned() === 'left';
              return (
                <div
                  key={header.id}
                  role="columnheader"
                  aria-sort={
                    sort.field === header.column.id
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setColumnContextMenu({
                      columnId: header.column.id,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  className={`absolute top-0 flex h-9 min-w-0 items-center border-r border-slate-800 ${isPinned ? 'z-30 bg-slate-900 border-r-cyan-400/30 shadow-[3px_0_6px_rgba(2,6,23,0.65)]' : ''}`}
                  style={{
                    left: header.column.getStart('left'),
                    width: header.getSize(),
                    position: isPinned ? 'sticky' : 'absolute',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSort(header.column.id as keyof Stock)}
                    className="min-w-0 flex-1 truncate px-3 text-left hover:text-white"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {sort.field === header.column.id && (
                      <span className="ml-1 text-cyan-400">
                        {sort.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${header.column.columnDef.header as string} column`}
                    aria-valuemin={header.column.columnDef.minSize ?? 80}
                    aria-valuenow={header.column.getSize()}
                    tabIndex={0}
                    onDoubleClick={() => header.column.resetSize()}
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                      event.preventDefault();
                      const change = event.key === 'ArrowRight' ? 10 : -10;
                      setColumnSizing((sizes) => ({
                        ...sizes,
                        [header.column.id]: Math.max(
                          header.column.columnDef.minSize ?? 80,
                          header.column.getSize() + change,
                        ),
                      }));
                    }}
                    className="h-full w-2 cursor-col-resize touch-none hover:bg-cyan-400/60 focus:bg-cyan-400/60 focus:outline-none"
                    title="Drag to resize column; use Left and Right Arrow keys to resize"
                  />
                </div>
              );
            })}
          {columnVirtualizer.getVirtualItems().map((virtualColumn) => {
            const column = scrollableColumns[virtualColumn.index];
            const header = table
              .getHeaderGroups()[0]
              .headers.find((item) => item.column.id === column.id);
            if (!header) return null;
            return (
              <div
                key={header.id}
                role="columnheader"
                aria-sort={
                  sort.field === header.column.id
                    ? sort.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                onContextMenu={(event) => {
                  event.preventDefault();
                  setColumnContextMenu({
                    columnId: header.column.id,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
                className="absolute top-0 flex h-9 min-w-0 items-center border-r border-slate-800 bg-slate-900/95"
                style={{ left: pinnedWidth + virtualColumn.start, width: virtualColumn.size }}
              >
                <button
                  type="button"
                  onClick={() => setSort(header.column.id as keyof Stock)}
                  className="min-w-0 flex-1 truncate px-3 text-left hover:text-white"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {sort.field === header.column.id && (
                    <span className="ml-1 text-cyan-400">
                      {sort.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize ${header.column.columnDef.header as string} column`}
                  aria-valuemin={header.column.columnDef.minSize ?? 80}
                  aria-valuenow={header.column.getSize()}
                  tabIndex={0}
                  onDoubleClick={() => header.column.resetSize()}
                  onMouseDown={header.getResizeHandler()}
                  onTouchStart={header.getResizeHandler()}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                    event.preventDefault();
                    const change = event.key === 'ArrowRight' ? 10 : -10;
                    setColumnSizing((sizes) => ({
                      ...sizes,
                      [header.column.id]: Math.max(
                        header.column.columnDef.minSize ?? 80,
                        header.column.getSize() + change,
                      ),
                    }));
                  }}
                  className="h-full w-2 cursor-col-resize touch-none hover:bg-cyan-400/60 focus:bg-cyan-400/60 focus:outline-none"
                  title="Drag to resize column; use Left and Right Arrow keys to resize"
                />
              </div>
            );
          })}
        </div>
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: table.getTotalSize(),
            minWidth: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            const isSelected =
              selected === row.original.symbol || selectedIndex === virtualRow.index;
            const rowBackground = isSelected
              ? 'bg-cyan-950'
              : virtualRow.index % 2
                ? 'bg-slate-900'
                : 'bg-slate-950';
            const cellsByColumnId = new Map(
              row.getVisibleCells().map((cell) => [cell.column.id, cell]),
            );
            const renderCell = (
              cell: ReturnType<typeof row.getVisibleCells>[number],
              cellIndex: number,
              left: number,
              width: number,
            ) => {
              const isPinned = cell.column.getIsPinned() === 'left';
              const isActiveCell =
                selectedIndex === virtualRow.index && activeColumnIndex === cellIndex;
              return (
                <div
                  id={`grid-cell-${row.id}-${cellIndex}`}
                  key={cell.id}
                  role="gridcell"
                  data-active-cell={isActiveCell || undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectRow(virtualRow.index, cellIndex);
                  }}
                  className={`absolute top-0 h-9 min-w-0 overflow-hidden border-r border-slate-900/70 px-3 py-2 text-xs ${isActiveCell ? 'bg-slate-400/[0.03] ring-1 ring-inset ring-slate-500/45' : ''} ${isPinned ? `z-10 ${rowBackground} border-r-cyan-400/30 shadow-[3px_0_6px_rgba(2,6,23,0.65)]` : ''}`}
                  style={{
                    left,
                    width,
                    position: isPinned ? 'sticky' : 'absolute',
                    willChange: isPinned ? 'transform' : undefined,
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              );
            };
            return (
              <div
                key={row.id}
                role="row"
                aria-rowindex={virtualRow.index + 2}
                aria-selected={isSelected}
                onClick={() => selectRow(virtualRow.index)}
                className={`absolute left-0 h-9 [will-change:transform] border-b border-slate-900/80 text-sm cursor-pointer hover:bg-slate-700/50 ${rowBackground} ${isSelected ? 'border-l-2 border-l-cyan-400' : ''}`}
                style={{
                  width: table.getTotalSize(),
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {pinnedColumns.map((column) => {
                  const cell = cellsByColumnId.get(column.id);
                  const cellIndex = visibleColumns.findIndex(
                    (visibleColumn) => visibleColumn.id === column.id,
                  );
                  return cell
                    ? renderCell(cell, cellIndex, column.getStart('left'), column.getSize())
                    : null;
                })}
                {columnVirtualizer.getVirtualItems().map((virtualColumn) => {
                  const column = scrollableColumns[virtualColumn.index];
                  const cell = cellsByColumnId.get(column.id);
                  const cellIndex = visibleColumns.findIndex(
                    (visibleColumn) => visibleColumn.id === column.id,
                  );
                  return cell
                    ? renderCell(
                        cell,
                        cellIndex,
                        pinnedWidth + virtualColumn.start,
                        virtualColumn.size,
                      )
                    : null;
                })}
              </div>
            );
          })}
        </div>
        <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400">
          <span>
            Showing <strong className="text-white">{stocks.length.toLocaleString()}</strong>{' '}
            filtered stocks
          </span>
          <span>Fast-scroll buffer: {VIRTUAL_OVERSCAN} rows · Press ? for shortcuts</span>
        </div>
      </div>
      {columnContextMenu && (
        <div
          role="menu"
          className="fixed z-50 min-w-40 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl"
          style={{ left: columnContextMenu.x, top: columnContextMenu.y }}
        >
          {columnContextMenu.columnId === 'symbol' ? (
            <span className="block px-3 py-2 text-xs text-slate-400">Symbol is always pinned</span>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => toggleColumnPin(columnContextMenu.columnId)}
              className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-800"
            >
              {table.getColumn(columnContextMenu.columnId)?.getIsPinned() === 'left'
                ? 'Unpin column'
                : 'Pin to left'}
            </button>
          )}
        </div>
      )}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold">Keyboard Shortcuts</h3>
              <button
                type="button"
                aria-label="Close keyboard shortcuts"
                onClick={() => setShowHelpModal(false)}
              >
                ✕
              </button>
            </div>
            <dl className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="flex justify-between">
                <dt>Move active cell</dt>
                <dd>↑ ↓ ← →</dd>
              </div>
              <div className="flex justify-between">
                <dt>First / last row</dt>
                <dd>Home / End</dd>
              </div>
              <div className="flex justify-between">
                <dt>Move one viewport</dt>
                <dd>Page Up / Down</dd>
              </div>
              <div className="flex justify-between">
                <dt>Open selected stock chart</dt>
                <dd>Enter</dd>
              </div>
              <div className="flex justify-between">
                <dt>Toggle watchlist</dt>
                <dd>Space</dd>
              </div>
              <div className="flex justify-between">
                <dt>Move between regions</dt>
                <dd>Tab / Shift + Tab</dd>
              </div>
              <div className="flex justify-between">
                <dt>Toggle this guide</dt>
                <dd>?</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
});
