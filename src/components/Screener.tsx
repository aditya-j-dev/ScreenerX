'use client';

import dynamic from 'next/dynamic';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { FilterPanel } from '@/components/FilterPanel/FilterPanel';
import { StockTable } from '@/components/DataGrid/StockTable';
import { FeatureErrorBoundary } from '@/components/ErrorBoundary';
import { useStockData } from '@/hooks/useStockData';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useRealtimeUpdates } from '@/hooks/useWebSocket';
import { filterStocks, sortStocks } from '@/lib/filterEngine';
import { generateHistory } from '@/lib/mockData';
import { useStockStore } from '@/stores/stockStore';

const EMPTY_LIVE_PRICES = new Map();
const StockChart = dynamic(
  () => import('@/components/Chart/StockChart').then((module) => module.StockChart),
  {
    ssr: false,
    loading: () => <div className="h-[430px] animate-pulse rounded-lg bg-slate-800/60" />,
  },
);

export function Screener() {
  useRealtimeUpdates();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'grid' | 'chart'>('grid');
  const chartPanelRef = useRef<HTMLElement>(null);
  const touchStartX = useRef<number | null>(null);
  const isSingleTouchSwipe = useRef(false);
  const revealChart = useCallback(() => {
    setMobileView('chart');
    window.requestAnimationFrame(() => {
      const chartPanel = chartPanelRef.current;
      if (!chartPanel) return;
      window.scrollTo({
        top: chartPanel.getBoundingClientRect().top + window.scrollY - 16,
        behavior: 'smooth',
      });
      chartPanel.focus({ preventScroll: true });
    });
  }, []);
  const startMobileSwipe = (event: ReactTouchEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const startX = event.touches[0]?.clientX;
    const startedAtScreenEdge =
      startX !== undefined && (startX < 28 || startX > window.innerWidth - 28);
    if (
      event.touches.length !== 1 ||
      (!startedAtScreenEdge && target.closest('canvas, #stock-grid'))
    ) {
      isSingleTouchSwipe.current = false;
      return;
    }
    touchStartX.current = startX ?? null;
    isSingleTouchSwipe.current = true;
  };
  const trackMobileSwipe = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) isSingleTouchSwipe.current = false;
  };
  const finishMobileSwipe = (event: ReactTouchEvent<HTMLDivElement>) => {
    const startX = touchStartX.current;
    const endX = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (
      !isSingleTouchSwipe.current ||
      startX === null ||
      endX === undefined ||
      Math.abs(endX - startX) < 64
    )
      return;
    setMobileView(endX < startX ? 'chart' : 'grid');
  };
  const isOnline = useNetworkStatus();

  const { data = [], isLoading, error } = useStockData();
  const filters = useStockStore((state) => state.activeFilters);
  const sort = useStockStore((state) => state.sortConfig);
  const selected = useStockStore((state) => state.selectedSymbol);
  // This granular selector updates the chart only when its selected symbol receives a tick.
  const selectedLivePrice = useStockStore((state) =>
    selected ? state.livePrices.get(selected) : undefined,
  );
  const connection = useStockStore((state) => state.connection);
  const setSelected = useStockStore((state) => state.setSelected);
  const watchlist = useStockStore((state) => state.watchlist);
  const recentlyUpdatedFilterActive = filters.some(
    (filter) => filter.field === 'recentlyUpdated' && filter.value === true && filter.enabled,
  );
  const livePrices = useStockStore((state) =>
    recentlyUpdatedFilterActive ? state.livePrices : EMPTY_LIVE_PRICES,
  );

  const filterableStocks = useMemo(
    () =>
      data.map((stock) => ({
        ...stock,
        watchlist: watchlist.has(stock.symbol),
        recentlyUpdated: recentlyUpdatedFilterActive
          ? livePrices.has(stock.symbol)
          : stock.recentlyUpdated,
      })),
    [data, livePrices, recentlyUpdatedFilterActive, watchlist],
  );

  const filtered = useMemo(() => {
    const matches = filterStocks(filterableStocks, filters);
    return sort.field && sort.direction ? sortStocks(matches, sort.field, sort.direction) : matches;
  }, [filterableStocks, filters, sort]);

  const selectedStock = selected
    ? filterableStocks.find((stock) => stock.symbol === selected)
    : undefined;

  // A row selection opens its detail view, so move keyboard and screen-reader context there too.
  useEffect(() => {
    if (!selected) return undefined;
    revealChart();
    return undefined;
  }, [revealChart, selected]);
  // Five years of daily candles give the chart enough source data for its 5Y weekly view.
  const history = useMemo(
    () => (selectedStock ? generateHistory(selectedStock, 1260) : []),
    [selectedStock],
  );
  const chartData = useMemo(() => {
    if (!selectedLivePrice || history.length === 0) return history;
    const previousCandle = history[history.length - 1];
    if (!previousCandle) return history;
    const updatedCandle = {
      ...previousCandle,
      close: selectedLivePrice.price,
      high: Math.max(previousCandle.high, selectedLivePrice.price),
      low: Math.min(previousCandle.low, selectedLivePrice.price),
    };
    return [...history.slice(0, -1), updatedCandle];
  }, [history, selectedLivePrice]);
  const connectionIndicator =
    connection === 'open'
      ? { colour: 'bg-emerald-400', label: 'LIVE STREAM' }
      : connection === 'reconnecting'
        ? { colour: 'bg-amber-400', label: 'RECONNECTING' }
        : connection === 'closed'
          ? { colour: 'bg-red-400', label: 'DISCONNECTED' }
          : { colour: 'bg-amber-400', label: 'CONNECTING' };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Loading 5,000+ stocks…
      </div>
    );
  }

  if (error) {
    return <div className="p-10 text-red-400">Unable to load stock universe.</div>;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {!isOnline && (
        <div
          role="status"
          className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-sm font-medium text-amber-200"
        >
          Working offline - prices may be stale
        </div>
      )}
      <header className="border-b border-slate-800 bg-slate-950/90 px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Pulse<span className="text-cyan-400">Screener</span>
            </h1>
            <p className="text-xs text-slate-400">Real-time equity analytics terminal</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className={`h-2 w-2 rounded-full ${connectionIndicator.colour}`} />
            {connectionIndicator.label}
            <span className="rounded-full border border-slate-700 px-2 py-1">
              {filtered.length.toLocaleString()} matches
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1800px] space-y-4 p-4">
        <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm font-medium text-slate-200 hover:border-cyan-500 hover:text-cyan-300"
          >
            <span>🎛️</span> Filters
            <span className="rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-xs text-cyan-300">
              {filters.length}
            </span>
          </button>
          <span className="text-xs text-slate-400">
            Showing{' '}
            <span className="font-semibold text-cyan-300">{filtered.length.toLocaleString()}</span>{' '}
            of {data.length.toLocaleString()} stocks
          </span>
        </div>

        {filtersOpen && (
          <>
            <button
              type="button"
              aria-label="Close filters"
              onClick={() => setFiltersOpen(false)}
              className="fixed inset-0 z-40 cursor-default bg-slate-950/55"
            />
            <div className="fixed left-3 top-16 z-50 w-[calc(100vw-1.5rem)] max-w-80 sm:left-4 sm:top-20">
              <FilterPanel
                matchingCount={filtered.length}
                totalCount={data.length}
                onClose={() => setFiltersOpen(false)}
              />
            </div>
          </>
        )}

        <div
          className="sticky top-0 z-30 -mx-4 flex items-center gap-2 border-y border-slate-800 bg-slate-950/95 px-4 py-2 backdrop-blur md:hidden"
          role="group"
          aria-label="Mobile screener view"
        >
          <button
            type="button"
            aria-pressed={mobileView === 'grid'}
            onClick={() => setMobileView('grid')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold ${mobileView === 'grid' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-300'}`}
          >
            Grid
          </button>
          <button
            type="button"
            aria-pressed={mobileView === 'chart'}
            onClick={() => setMobileView('chart')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold ${mobileView === 'chart' ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 text-slate-300'}`}
          >
            Chart
          </button>
          <span className="hidden text-[10px] text-slate-400 sm:inline">Swipe to switch</span>
        </div>

        <div
          onTouchStart={startMobileSwipe}
          onTouchMove={trackMobileSwipe}
          onTouchEnd={finishMobileSwipe}
        >
          <section className={`min-w-0 ${mobileView === 'chart' ? 'hidden md:block' : ''}`}>
            <FeatureErrorBoundary>
              <StockTable stocks={filtered} onStockSelect={revealChart} />
            </FeatureErrorBoundary>
          </section>

          <section
            id="chart-panel"
            ref={chartPanelRef}
            tabIndex={-1}
            aria-labelledby="chart-panel-title"
            className={`rounded-xl border border-slate-800 bg-slate-900 p-3 focus:outline-none focus:ring-2 focus:ring-cyan-400/70 sm:p-4 ${mobileView === 'grid' ? 'hidden md:block' : ''}`}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 id="chart-panel-title" className="font-semibold">
                  {selectedStock?.symbol ?? 'Select a stock'}
                </h2>
                {selectedStock ? (
                  <p className="text-xs text-slate-400">
                    {selectedStock.companyName} <span className="mx-1 text-slate-400">•</span>{' '}
                    <span className="font-semibold text-emerald-400">
                      ₹
                      {(selectedLivePrice?.price ?? selectedStock.lastPrice).toLocaleString(
                        'en-IN',
                        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                      )}
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">
                    Candlestick + SMA + EMA + Bollinger + RSI + Volume Profile
                  </p>
                )}
              </div>
              {selectedStock && (
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
            {selectedStock ? (
              <FeatureErrorBoundary>
                <StockChart symbol={selectedStock.symbol} data={chartData} />
              </FeatureErrorBoundary>
            ) : (
              <div className="flex h-[430px] items-center justify-center text-slate-400">
                Click a stock row to inspect its chart.
              </div>
            )}
          </section>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <Metric title="Universe" value="5,000+" />
          <Metric title="Filter target" value="< 200ms" />
          <Metric title="Sort target" value="< 150ms" />
          <Metric title="Scroll target" value="> 55 FPS" />
        </section>
      </div>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs text-slate-400">{title}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
