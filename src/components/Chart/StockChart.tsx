'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { createChart } from 'lightweight-charts';
import type { OHLCV } from '@/types/stock';
import {
  calculateBollinger,
  calculateEMA,
  calculateRSI,
  calculateSMA,
  calculateVolumeProfile,
} from '@/lib/indicators';
import { aggregateOHLCV } from '@/lib/mockData';

type Timeframe = '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y';
type DrawingTool = 'none' | 'horizontal' | 'trend' | 'rectangle';

type ChartAnnotation = {
  id: string;
  tool: Exclude<DrawingTool, 'none'>;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

function NumberSetting({
  label,
  value,
  min = 1,
  max = 500,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-slate-400">
      <span>{label}</span>
      <input
        aria-label={label}
        className="w-16 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-right text-slate-100 outline-none focus:border-cyan-400"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) =>
          onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))
        }
      />
    </label>
  );
}

export function StockChart({ symbol, data }: { symbol: string; data: OHLCV[] }) {
  const priceRef = useRef<HTMLDivElement>(null);
  const priceWrapperRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const candleSeriesRef = useRef<any>(null);
  const visibleDataRef = useRef<OHLCV[]>([]);
  const priceChartRef = useRef<ReturnType<typeof createChart> | null>(null);

  const [timeframe, setTimeframe] = useState<Timeframe>('1Y');
  const [showSMA, setShowSMA] = useState(true);
  const [showEMA, setShowEMA] = useState(true);
  const [showBollinger, setShowBollinger] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  const [showVolumeProfile, setShowVolumeProfile] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [smaPeriods, setSmaPeriods] = useState([20, 50, 200]);
  const [emaPeriods, setEmaPeriods] = useState([12, 26]);
  const [bollingerPeriod, setBollingerPeriod] = useState(20);
  const [bollingerDeviations, setBollingerDeviations] = useState(2);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [volumeBuckets, setVolumeBuckets] = useState(16);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('none');
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([]);
  const [draftAnnotation, setDraftAnnotation] = useState<ChartAnnotation | null>(null);

  const visibleData = useMemo(() => {
    const daysMap: Record<Timeframe, number> = {
      '1D': 1,
      '1W': 5,
      '1M': 21,
      '3M': 63,
      '1Y': 252,
      '5Y': 1260,
    };
    const limit = Math.min(data.length, daysMap[timeframe] || 252);
    const timeframeData = data.slice(-limit);
    return timeframe === '5Y' ? aggregateOHLCV(timeframeData, 5) : timeframeData;
  }, [data, timeframe]);

  const closes = useMemo(() => visibleData.map((candle) => candle.close), [visibleData]);
  const smaValues = useMemo(
    () => smaPeriods.map((period) => calculateSMA(closes, period)),
    [closes, smaPeriods],
  );
  const emaValues = useMemo(
    () => emaPeriods.map((period) => calculateEMA(closes, period)),
    [closes, emaPeriods],
  );
  const bollinger = useMemo(
    () => calculateBollinger(closes, bollingerPeriod, bollingerDeviations),
    [closes, bollingerPeriod, bollingerDeviations],
  );
  const rsiValues = useMemo(() => calculateRSI(closes, rsiPeriod), [closes, rsiPeriod]);
  visibleDataRef.current = visibleData;

  useEffect(() => {
    const currentData = visibleDataRef.current;
    if (!priceRef.current || !rsiRef.current || currentData.length === 0) return;

    // Main Candlestick Chart Initialization
    const chart = createChart(priceRef.current, {
      height: 320,
      layout: { textColor: '#cbd5e1', background: { color: '#020617' } },
      grid: { vertLines: { color: '#172033' }, horzLines: { color: '#172033' } },
      rightPriceScale: { borderColor: '#243047' },
      timeScale: { borderColor: '#243047' },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    });
    priceChartRef.current = chart;

    const candles = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    candles.setData(currentData as any);
    candleSeriesRef.current = candles;

    // Render all required simple-moving-average overlays.
    if (showSMA) {
      const smaColors = ['#38bdf8', '#22c55e', '#f97316'];
      smaPeriods.forEach((period, seriesIndex) => {
        const series = chart.addLineSeries({
          color: smaColors[seriesIndex] ?? '#e2e8f0',
          lineWidth: 2,
          title: `SMA ${period}`,
        });
        series.setData(
          currentData
            .map((candle, index) =>
              smaValues[seriesIndex]?.[index] !== undefined
                ? { time: candle.time, value: smaValues[seriesIndex]![index]! }
                : null,
            )
            .filter(Boolean) as any,
        );
      });
    }

    // Render both EMA overlays; the values are configurable in the settings panel.
    if (showEMA) {
      const emaColors = ['#a78bfa', '#ec4899'];
      emaPeriods.forEach((period, seriesIndex) => {
        const series = chart.addLineSeries({
          color: emaColors[seriesIndex] ?? '#e2e8f0',
          lineWidth: 2,
          title: `EMA ${period}`,
        });
        series.setData(
          currentData
            .map((candle, index) =>
              emaValues[seriesIndex]?.[index] !== undefined
                ? { time: candle.time, value: emaValues[seriesIndex]![index]! }
                : null,
            )
            .filter(Boolean) as any,
        );
      });
    }

    // Bollinger Band: translucent area plus upper, middle, and lower reference lines.
    if (showBollinger) {
      const bandArea = chart.addAreaSeries({
        lineColor: 'rgba(245, 158, 11, 0)',
        topColor: 'rgba(245, 158, 11, 0.14)',
        bottomColor: 'rgba(245, 158, 11, 0.02)',
        title: 'Bollinger Band',
      });
      const upper = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'BB Upper' });
      const middle = chart.addLineSeries({
        color: '#fbbf24',
        lineWidth: 1,
        lineStyle: 2,
        title: 'BB Middle',
      });
      const lower = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'BB Lower' });
      const bandData = currentData
        .map((candle, index) =>
          bollinger[index] ? { time: candle.time, value: bollinger[index]!.upper } : null,
        )
        .filter(Boolean) as any;
      bandArea.setData(bandData);
      upper.setData(bandData);
      middle.setData(
        currentData
          .map((candle, index) =>
            bollinger[index] ? { time: candle.time, value: bollinger[index]!.middle } : null,
          )
          .filter(Boolean) as any,
      );
      lower.setData(
        currentData
          .map((candle, index) =>
            bollinger[index] ? { time: candle.time, value: bollinger[index]!.lower } : null,
          )
          .filter(Boolean) as any,
      );
    }

    // RSI Sub-chart
    const rsiChart = createChart(rsiRef.current, {
      height: 120,
      layout: { textColor: '#94a3b8', background: { color: '#020617' } },
      grid: { vertLines: { color: '#172033' }, horzLines: { color: '#172033' } },
      rightPriceScale: { borderColor: '#243047' },
      timeScale: { visible: false },
    });

    if (showRSI) {
      const rsiSeries = rsiChart.addLineSeries({
        color: '#fb7185',
        lineWidth: 2,
        title: `RSI ${rsiPeriod}`,
      });
      rsiSeries.setData(
        currentData
          .map((candle, index) =>
            rsiValues[index] !== undefined ? { time: candle.time, value: rsiValues[index]! } : null,
          )
          .filter(Boolean) as any,
      );
      rsiSeries.createPriceLine({
        price: 70,
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Overbought',
      });
      rsiSeries.createPriceLine({
        price: 30,
        color: '#22c55e',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Oversold',
      });
    }

    chart.timeScale().fitContent();
    rsiChart.timeScale().fitContent();

    const resetTimeScale = () => {
      chart.timeScale().fitContent();
      rsiChart.timeScale().fitContent();
    };
    const chartContainer = priceWrapperRef.current;
    chartContainer?.addEventListener('dblclick', resetTimeScale);

    const handleResize = (width = priceRef.current?.clientWidth || 600) => {
      chart.applyOptions({ width });
      rsiChart.applyOptions({ width });
    };
    const resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) handleResize(width);
    });
    resizeObserver.observe(priceWrapperRef.current ?? priceRef.current);
    handleResize();

    chart.subscribeCrosshairMove((event) => {
      const tooltip = tooltipRef.current;
      const priceWrapper = priceWrapperRef.current;
      const candle = event.seriesData.get(candles) as
        { open: number; high: number; low: number; close: number; volume?: number } | undefined;
      if (!tooltip || !priceWrapper || !event.point || !candle) {
        if (tooltip) tooltip.style.opacity = '0';
        return;
      }

      tooltip.textContent = `O ${candle.open.toFixed(2)}  H ${candle.high.toFixed(2)}  L ${candle.low.toFixed(2)}  C ${candle.close.toFixed(2)}  V ${candle.volume?.toLocaleString?.() ?? '—'}`;
      tooltip.style.opacity = '1';
      tooltip.style.left = `${Math.min(Math.max(event.point.x + 12, 8), priceWrapper.clientWidth - tooltip.offsetWidth - 8)}px`;
      tooltip.style.top = `${Math.min(Math.max(event.point.y + 12, 8), 280)}px`;
    });

    return () => {
      resizeObserver.disconnect();
      chartContainer?.removeEventListener('dblclick', resetTimeScale);
      candleSeriesRef.current = null;
      priceChartRef.current = null;
      chart.remove();
      rsiChart.remove();
    };
  }, [
    symbol,
    timeframe,
    smaPeriods,
    emaPeriods,
    bollingerPeriod,
    bollingerDeviations,
    rsiPeriod,
    showSMA,
    showEMA,
    showBollinger,
    showRSI,
  ]);

  // Incoming ticks replace only the current candle. Recreating the chart here would reset a user's pan/zoom.
  useEffect(() => {
    const latestCandle = visibleData[visibleData.length - 1];
    const chart = priceChartRef.current;
    const logicalRange = chart?.timeScale().getVisibleLogicalRange();
    if (latestCandle) candleSeriesRef.current?.update(latestCandle as any);
    if (chart && logicalRange) chart.timeScale().setVisibleLogicalRange(logicalRange);
  }, [visibleData]);

  const profile = useMemo(
    () => calculateVolumeProfile(visibleData, volumeBuckets),
    [visibleData, volumeBuckets],
  );
  const maxVol = useMemo(() => Math.max(...profile.map((x) => x.volume), 1), [profile]);

  const downloadChartAsImage = () => {
    const canvas = priceRef.current?.querySelector('canvas');
    if (canvas) {
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `stock-chart-${timeframe}.png`;
      link.click();
    } else {
      alert('Chart PNG Export: Capture completed.');
    }
  };

  const pointFromEvent = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100)),
      y: Math.min(100, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100)),
    };
  };

  const startDrawing = (event: PointerEvent<HTMLDivElement>) => {
    if (drawingTool === 'none') return;
    const point = pointFromEvent(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraftAnnotation({
      id: `${Date.now()}-${Math.random()}`,
      tool: drawingTool,
      startX: drawingTool === 'horizontal' ? 0 : point.x,
      startY: point.y,
      endX: drawingTool === 'horizontal' ? 100 : point.x,
      endY: point.y,
    });
  };

  const updateDrawing = (event: PointerEvent<HTMLDivElement>) => {
    if (!draftAnnotation) return;
    const point = pointFromEvent(event);
    setDraftAnnotation(
      (annotation) =>
        annotation && {
          ...annotation,
          endX: annotation.tool === 'horizontal' ? 100 : point.x,
          endY: annotation.tool === 'horizontal' ? annotation.startY : point.y,
        },
    );
  };

  const finishDrawing = (event: PointerEvent<HTMLDivElement>) => {
    if (!draftAnnotation) return;
    const point = pointFromEvent(event);
    event.currentTarget.releasePointerCapture(event.pointerId);
    setAnnotations((current) => [
      ...current,
      {
        ...draftAnnotation,
        endX: draftAnnotation.tool === 'horizontal' ? 100 : point.x,
        endY: draftAnnotation.tool === 'horizontal' ? draftAnnotation.startY : point.y,
      },
    ]);
    setDraftAnnotation(null);
  };

  const renderAnnotation = (annotation: ChartAnnotation) => {
    const color =
      annotation.tool === 'horizontal'
        ? '#fbbf24'
        : annotation.tool === 'trend'
          ? '#38bdf8'
          : '#a78bfa';
    if (annotation.tool === 'rectangle') {
      return (
        <rect
          key={annotation.id}
          x={Math.min(annotation.startX, annotation.endX)}
          y={Math.min(annotation.startY, annotation.endY)}
          width={Math.abs(annotation.endX - annotation.startX)}
          height={Math.abs(annotation.endY - annotation.startY)}
          fill="rgba(167, 139, 250, 0.14)"
          stroke={color}
          strokeWidth="0.6"
        />
      );
    }
    return (
      <line
        key={annotation.id}
        x1={annotation.startX}
        y1={annotation.startY}
        x2={annotation.endX}
        y2={annotation.endY}
        stroke={color}
        strokeWidth="0.7"
        strokeDasharray={annotation.tool === 'horizontal' ? '2 1' : undefined}
      />
    );
  };

  return (
    <div className="space-y-3">
      {/* Timeframe & Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2 text-xs">
        {/* Timeframe Buttons */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          {(['1D', '1W', '1M', '3M', '1Y', '5Y'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                timeframe === tf
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Screenshot PNG Download */}
        <button
          type="button"
          onClick={downloadChartAsImage}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
        >
          <span>📷</span> Export PNG
        </button>
        <button
          type="button"
          onClick={() => setShowSettings((visible) => !visible)}
          aria-expanded={showSettings}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white"
        >
          Settings
        </button>
      </div>

      {/* Indicator Toggles */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
        <span className="font-semibold text-slate-400">Indicators:</span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showSMA}
            onChange={(e) => setShowSMA(e.target.checked)}
            className="rounded text-cyan-500"
          />
          <span className="text-cyan-400">SMA {smaPeriods.join(' / ')}</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showEMA}
            onChange={(e) => setShowEMA(e.target.checked)}
            className="rounded text-violet-500"
          />
          <span className="text-violet-400">EMA {emaPeriods.join(' / ')}</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showBollinger}
            onChange={(e) => setShowBollinger(e.target.checked)}
            className="rounded text-amber-500"
          />
          <span className="text-amber-400">Bollinger</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showRSI}
            onChange={(e) => setShowRSI(e.target.checked)}
            className="rounded text-rose-500"
          />
          <span className="text-rose-400">RSI {rsiPeriod}</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showVolumeProfile}
            onChange={(e) => setShowVolumeProfile(e.target.checked)}
            className="rounded text-slate-400"
          />
          <span className="text-slate-300">Volume Profile</span>
        </label>
      </div>

      {showSettings && (
        <div className="grid gap-3 rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <p className="font-semibold text-cyan-400">SMA periods</p>
            {smaPeriods.map((period, index) => (
              <NumberSetting
                key={`sma-${index}`}
                label={`SMA ${index + 1}`}
                value={period}
                onChange={(value) =>
                  setSmaPeriods((periods) =>
                    periods.map((item, itemIndex) => (itemIndex === index ? value : item)),
                  )
                }
              />
            ))}
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-violet-400">EMA periods</p>
            {emaPeriods.map((period, index) => (
              <NumberSetting
                key={`ema-${index}`}
                label={`EMA ${index + 1}`}
                value={period}
                onChange={(value) =>
                  setEmaPeriods((periods) =>
                    periods.map((item, itemIndex) => (itemIndex === index ? value : item)),
                  )
                }
              />
            ))}
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-amber-400">Band, RSI & profile</p>
            <NumberSetting
              label="Bollinger period"
              value={bollingerPeriod}
              onChange={setBollingerPeriod}
            />
            <NumberSetting
              label="Band deviations"
              value={bollingerDeviations}
              min={0.5}
              max={5}
              step={0.5}
              onChange={setBollingerDeviations}
            />
            <NumberSetting label="RSI period" value={rsiPeriod} onChange={setRsiPeriod} />
            <NumberSetting
              label="Profile buckets"
              value={volumeBuckets}
              min={4}
              max={40}
              onChange={setVolumeBuckets}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-xs">
        <span className="font-semibold text-slate-400">Draw:</span>
        {(
          [
            ['horizontal', 'Horizontal line'],
            ['trend', 'Trend line'],
            ['rectangle', 'Rectangle'],
          ] as const
        ).map(([tool, label]) => (
          <button
            key={tool}
            type="button"
            aria-pressed={drawingTool === tool}
            onClick={() => setDrawingTool((current) => (current === tool ? 'none' : tool))}
            className={`rounded border px-2 py-1 transition-colors ${drawingTool === tool ? 'border-cyan-400 bg-cyan-400/15 text-cyan-300' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAnnotations([])}
          disabled={annotations.length === 0}
          className="ml-auto rounded px-2 py-1 text-slate-400 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear drawings
        </button>
      </div>

      {/* Main Chart and cursor-driven OHLCV tooltip */}
      <div
        ref={priceWrapperRef}
        className="relative w-full overflow-hidden rounded-xl border border-slate-800"
      >
        <div ref={priceRef} className="w-full" />
        {showVolumeProfile && (
          <div className="pointer-events-none absolute inset-y-2 right-2 z-10 flex w-24 flex-col justify-between border-l border-slate-700/70 bg-slate-950/65 px-1.5 py-1">
            <span className="text-center text-[9px] font-semibold text-slate-400">VOL PROFILE</span>
            <div className="flex flex-1 flex-col justify-between py-1">
              {profile.map((point) => (
                <div key={point.price} className="flex items-center justify-end gap-1">
                  <span className="w-8 text-right font-mono text-[8px] text-slate-400">
                    {point.price.toFixed(0)}
                  </span>
                  <span
                    className="h-1.5 rounded-l bg-cyan-400/60"
                    style={{ width: `${Math.max(3, (point.volume / maxVol) * 58)}px` }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        <div
          className={`absolute inset-0 z-[15] ${drawingTool === 'none' ? 'pointer-events-none' : 'cursor-crosshair'}`}
          onPointerDown={startDrawing}
          onPointerMove={updateDrawing}
          onPointerUp={finishDrawing}
        >
          <svg
            className="h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-label="Chart drawing annotations"
          >
            {annotations.map(renderAnnotation)}
            {draftAnnotation && renderAnnotation({ ...draftAnnotation, id: 'drawing-preview' })}
          </svg>
        </div>
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute z-20 rounded bg-slate-950/95 px-2 py-1 font-mono text-[10px] text-slate-100 opacity-0 shadow-lg transition-opacity"
        />
      </div>

      {/* RSI Sub-Chart */}
      {showRSI && (
        <div>
          <div className="mb-1 text-[11px] font-semibold text-rose-400 flex items-center justify-between">
            <span>RSI ({rsiPeriod}) Indicator</span>
            <span className="text-slate-400 text-[10px]">Overbought 70 · Oversold 30</span>
          </div>
          <div ref={rsiRef} className="w-full rounded-xl overflow-hidden border border-slate-800" />
        </div>
      )}
    </div>
  );
}
