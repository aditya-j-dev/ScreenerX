'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  createChart,
  type Time,
  type ISeriesApi,
  type LineData,
  type WhitespaceData,
  type LogicalRange,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { OHLCV } from '@/types/stock';
import { composeChartPng, type ExportShape } from '@/lib/chartExport';
import {
  calculateBollinger,
  calculateEMA,
  calculateRSI,
  calculateSMA,
  calculateVolumeProfile,
} from '@/lib/indicators';
import {
  aggregateCalendarWeeks,
  formatIntradayTime,
  selectTimeframe,
  type ChartTimeframe,
} from '@/lib/chartData';

type Timeframe = ChartTimeframe;
type DrawingTool = 'none' | 'horizontal' | 'trend' | 'rectangle';

function lineData(candles: OHLCV[], values: (number | undefined)[]): (LineData | WhitespaceData)[] {
  // Whitespace bars retain the RSI chart's logical-time alignment during warmup.
  return candles.map((candle, index) =>
    values[index] === undefined
      ? { time: candle.time as UTCTimestamp }
      : { time: candle.time as UTCTimestamp, value: values[index]! },
  );
}

type ChartAnnotation = {
  id: string;
  tool: Exclude<DrawingTool, 'none'>;
  symbol: string;
  timeframe: Timeframe;
  startTime: number;
  startPrice: number;
  endTime: number;
  endPrice: number;
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
    <label className="flex items-center justify-between gap-2 text-neutral-400">
      <span>{label}</span>
      <input
        aria-label={label}
        className="w-16 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-1 text-right text-neutral-100 outline-none focus:border-emerald-400"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) =>
          onChange(
            Math.min(
              max,
              Math.max(
                min,
                step === 1
                  ? Math.round(Number(event.target.value) || min)
                  : Number(event.target.value) || min,
              ),
            ),
          )
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
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeriesRef = useRef<Array<{ key: string; series: ISeriesApi<'Line'> }>>([]);
  const lineValuesRef = useRef<Record<string, (number | undefined)[]>>({});
  const previousDataRef = useRef<OHLCV[]>([]);
  const savedRangeRef = useRef<{
    symbol: string;
    timeframe: Timeframe;
    range: LogicalRange | null;
  } | null>(null);
  const visibleDataRef = useRef<OHLCV[]>([]);
  const priceChartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const rsiChartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

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
  const [volumeBuckets, setVolumeBuckets] = useState(40);
  const [viewportRange, setViewportRange] = useState<LogicalRange | null>(null);
  const [overlayVersion, setOverlayVersion] = useState(0);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('none');
  const [annotations, setAnnotations] = useState<ChartAnnotation[]>([]);
  const [draftAnnotation, setDraftAnnotation] = useState<ChartAnnotation | null>(null);
  const drawingAreaRef = useRef<HTMLDivElement>(null);
  const drawingButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (drawingTool !== 'none') drawingAreaRef.current?.focus({ preventScroll: true });
    else if (document.activeElement === drawingAreaRef.current) drawingButtonRef.current?.focus();
  }, [drawingTool]);
  useEffect(() => {
    setDraftAnnotation(null);
    setDrawingTool('none');
    setExportError(null);
  }, [symbol, timeframe]);

  const visibleData = useMemo(() => selectTimeframe(data, timeframe), [data, timeframe]);
  const hasData = visibleData.length > 0;

  const indicatorSource = useMemo(
    () =>
      timeframe === '1D' ? visibleData : timeframe === '5Y' ? aggregateCalendarWeeks(data) : data,
    [data, timeframe, visibleData],
  );
  const { smaValues, emaValues, bollinger, rsiValues } = useMemo(() => {
    const closes = indicatorSource.map((candle) => candle.close);
    const indices = new Map(indicatorSource.map((candle, index) => [candle.time, index]));
    const align = <T,>(values: T[]) =>
      visibleData.map((candle) => values[indices.get(candle.time) ?? -1]);
    return {
      smaValues: showSMA ? smaPeriods.map((period) => align(calculateSMA(closes, period))) : [],
      emaValues: showEMA ? emaPeriods.map((period) => align(calculateEMA(closes, period))) : [],
      bollinger: showBollinger
        ? align(calculateBollinger(closes, bollingerPeriod, bollingerDeviations))
        : [],
      rsiValues: showRSI ? align(calculateRSI(closes, rsiPeriod)) : [],
    };
  }, [
    indicatorSource,
    visibleData,
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
  lineValuesRef.current = {
    ...Object.fromEntries(smaValues.map((values, index) => [`sma${index}`, values])),
    ...Object.fromEntries(emaValues.map((values, index) => [`ema${index}`, values])),
    upper: bollinger.map((band) => band?.upper),
    middle: bollinger.map((band) => band?.middle),
    lower: bollinger.map((band) => band?.lower),
    rsi: rsiValues,
  };
  visibleDataRef.current = visibleData;

  useEffect(() => {
    const currentData = visibleDataRef.current;
    if (!priceRef.current || currentData.length === 0) return;

    // Main Candlestick Chart Initialization
    const chart = createChart(priceRef.current, {
      height: 320,
      layout: { textColor: '#d4d4d4', background: { color: '#000000' } },
      grid: { vertLines: { color: '#173020' }, horzLines: { color: '#173020' } },
      rightPriceScale: { borderColor: '#254c31' },
      timeScale: {
        borderColor: '#254c31',
        timeVisible: timeframe === '1D',
        secondsVisible: false,
        tickMarkFormatter:
          timeframe === '1D'
            ? (time: Time) => (typeof time === 'number' ? formatIntradayTime(time) : null)
            : undefined,
      },
      localization:
        timeframe === '1D'
          ? {
              timeFormatter: (time: Time) =>
                typeof time === 'number' ? `${formatIntradayTime(time)} IST` : String(time),
            }
          : {},
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
    candles.setData(
      currentData.map((candle) => ({ ...candle, time: candle.time as UTCTimestamp })),
    );
    candleSeriesRef.current = candles;
    previousDataRef.current = currentData;

    lineSeriesRef.current = [];
    const addIndicator = (key: string, color: string, title: string) => {
      const series = chart.addLineSeries({ color, lineWidth: 2, title });
      series.setData(lineData(currentData, lineValuesRef.current[key]));
      lineSeriesRef.current.push({ key, series });
    };
    if (showSMA)
      smaPeriods.forEach((period, index) =>
        addIndicator(
          `sma${index}`,
          ['#34d399', '#22c55e', '#f97316'][index] ?? '#e2e8f0',
          `SMA ${period}`,
        ),
      );
    if (showEMA)
      emaPeriods.forEach((period, index) =>
        addIndicator(`ema${index}`, ['#a78bfa', '#ec4899'][index] ?? '#e2e8f0', `EMA ${period}`),
      );
    if (showBollinger) {
      addIndicator('upper', '#f59e0b', 'BB Upper');
      addIndicator('middle', '#fbbf24', 'BB Middle');
      addIndicator('lower', '#f59e0b', 'BB Lower');
    }
    // RSI Sub-chart
    const rsiChart =
      showRSI && rsiRef.current
        ? createChart(rsiRef.current, {
            height: 120,
            layout: { textColor: '#a3a3a3', background: { color: '#000000' } },
            grid: { vertLines: { color: '#173020' }, horzLines: { color: '#173020' } },
            rightPriceScale: { borderColor: '#254c31' },
            timeScale: { visible: false },
          })
        : null;
    rsiChartRef.current = rsiChart;

    if (rsiChart) {
      const rsiSeries = rsiChart.addLineSeries({
        color: '#fb7185',
        lineWidth: 2,
        title: `RSI ${rsiPeriod}`,
      });
      rsiSeries.setData(lineData(currentData, lineValuesRef.current.rsi));
      lineSeriesRef.current.push({ key: 'rsi', series: rsiSeries });
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

    const saved = savedRangeRef.current;
    if (saved?.symbol === symbol && saved.timeframe === timeframe && saved.range) {
      chart.timeScale().setVisibleLogicalRange(saved.range);
      rsiChart?.timeScale().setVisibleLogicalRange(saved.range);
    } else {
      chart.timeScale().fitContent();
      rsiChart?.timeScale().fitContent();
    }
    let syncingRange = false;
    const updateRange = (range: LogicalRange | null, fromRsi = false) => {
      if (syncingRange) return;
      setViewportRange(range);
      setOverlayVersion((value) => value + 1);
      if (!range) return;
      syncingRange = true;
      if (fromRsi) chart.timeScale().setVisibleLogicalRange(range);
      else rsiChart?.timeScale().setVisibleLogicalRange(range);
      syncingRange = false;
    };
    const priceRangeChanged = (range: LogicalRange | null) => updateRange(range);
    const rsiRangeChanged = (range: LogicalRange | null) => updateRange(range, true);
    chart.timeScale().subscribeVisibleLogicalRangeChange(priceRangeChanged);
    rsiChart?.timeScale().subscribeVisibleLogicalRangeChange(rsiRangeChanged);
    updateRange(chart.timeScale().getVisibleLogicalRange());

    const resetTimeScale = () => {
      chart.timeScale().fitContent();
      rsiChart?.timeScale().fitContent();
    };
    const chartContainer = priceWrapperRef.current;
    chartContainer?.addEventListener('dblclick', resetTimeScale);

    const handleResize = (width = priceRef.current?.clientWidth || 600) => {
      chart.applyOptions({ width });
      rsiChart?.applyOptions({ width });
      setOverlayVersion((value) => value + 1);
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
      const candle = visibleDataRef.current.find((point) => point.time === event.time);
      if (!tooltip || !priceWrapper || !event.point || !candle) {
        if (tooltip) tooltip.style.opacity = '0';
        return;
      }

      tooltip.textContent = `O ${candle.open.toFixed(2)}  H ${candle.high.toFixed(2)}  L ${candle.low.toFixed(2)}  C ${candle.close.toFixed(2)}  V ${candle.volume.toLocaleString('en-IN')}`;
      tooltip.style.opacity = '1';
      tooltip.style.left = `${Math.max(8, Math.min(event.point.x + 12, priceWrapper.clientWidth - tooltip.offsetWidth - 8))}px`;
      tooltip.style.top = `${Math.min(Math.max(event.point.y + 12, 8), 280)}px`;
    });

    return () => {
      savedRangeRef.current = {
        symbol,
        timeframe,
        range: chart.timeScale().getVisibleLogicalRange(),
      };
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(priceRangeChanged);
      rsiChart?.timeScale().unsubscribeVisibleLogicalRangeChange(rsiRangeChanged);
      resizeObserver.disconnect();
      chartContainer?.removeEventListener('dblclick', resetTimeScale);
      candleSeriesRef.current = null;
      priceChartRef.current = null;
      rsiChartRef.current = null;
      lineSeriesRef.current = [];
      chart.remove();
      rsiChart?.remove();
    };
  }, [
    symbol,
    hasData,
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

  // Update existing instances; replacing a synthetic intraday path can also change earlier candles.
  useEffect(() => {
    const latestCandle = visibleData[visibleData.length - 1];
    const chart = priceChartRef.current;
    if (!chart || !latestCandle) return;
    const logicalRange = chart?.timeScale().getVisibleLogicalRange();
    const previous = previousDataRef.current;
    const latestOnly =
      previous.length === visibleData.length &&
      previous[previous.length - 1]?.time === latestCandle.time &&
      visibleData.slice(0, -1).every((candle, index) => {
        const old = previous[index];
        return (
          old?.time === candle.time &&
          old.open === candle.open &&
          old.high === candle.high &&
          old.low === candle.low &&
          old.close === candle.close &&
          old.volume === candle.volume
        );
      });
    if (latestOnly)
      candleSeriesRef.current?.update({ ...latestCandle, time: latestCandle.time as UTCTimestamp });
    else
      candleSeriesRef.current?.setData(
        visibleData.map((candle) => ({ ...candle, time: candle.time as UTCTimestamp })),
      );
    for (const { key, series } of lineSeriesRef.current) {
      const values = lineValuesRef.current[key];
      const latest = values[visibleData.length - 1];
      if (latestOnly && latest !== undefined)
        series.update({ time: latestCandle.time as UTCTimestamp, value: latest });
      else series.setData(lineData(visibleData, values));
    }
    previousDataRef.current = visibleData;
    if (logicalRange) chart.timeScale().setVisibleLogicalRange(logicalRange);
    setOverlayVersion((value) => value + 1);
  }, [visibleData, smaValues, emaValues, bollinger, rsiValues]);

  const profile = useMemo(() => {
    if (!showVolumeProfile) return [];
    const first = viewportRange ? Math.max(0, Math.floor(viewportRange.from)) : 0;
    const end = viewportRange
      ? Math.max(0, Math.min(visibleData.length, Math.ceil(viewportRange.to) + 1))
      : visibleData.length;
    return calculateVolumeProfile(visibleData.slice(first, end), volumeBuckets);
  }, [visibleData, volumeBuckets, viewportRange, showVolumeProfile]);
  const maxVol = useMemo(() => Math.max(...profile.map((x) => x.volume), 1), [profile]);
  const bandPolygon = useMemo(() => {
    void overlayVersion;
    const chart = priceChartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series || !showBollinger) return '';
    const upper: string[] = [],
      lower: string[] = [];
    visibleData.forEach((candle, index) => {
      const band = bollinger[index];
      if (!band) return;
      const x = chart.timeScale().timeToCoordinate(candle.time as UTCTimestamp);
      const top = series.priceToCoordinate(band.upper),
        bottom = series.priceToCoordinate(band.lower);
      if (x !== null && top !== null && bottom !== null) {
        upper.push(`${x},${top}`);
        lower.push(`${x},${bottom}`);
      }
    });
    return [...upper, ...lower.reverse()].join(' ');
  }, [visibleData, bollinger, showBollinger, overlayVersion]);

  const currentAnnotations = annotations.filter(
    (annotation) => annotation.symbol === symbol && annotation.timeframe === timeframe,
  );
  const projectAnnotation = (annotation: ChartAnnotation): ExportShape | null => {
    const chart = priceChartRef.current,
      series = candleSeriesRef.current;
    if (!chart || !series) return null;
    const x1 =
      annotation.tool === 'horizontal'
        ? 0
        : chart.timeScale().timeToCoordinate(annotation.startTime as UTCTimestamp);
    const x2 =
      annotation.tool === 'horizontal'
        ? chart.timeScale().width()
        : chart.timeScale().timeToCoordinate(annotation.endTime as UTCTimestamp);
    const y1 = series.priceToCoordinate(annotation.startPrice),
      y2 = series.priceToCoordinate(annotation.endPrice);
    if (x1 === null || x2 === null || y1 === null || y2 === null) return null;
    return {
      kind: annotation.tool === 'rectangle' ? 'rectangle' : 'line',
      x1,
      y1,
      x2,
      y2,
      color:
        annotation.tool === 'horizontal'
          ? '#fbbf24'
          : annotation.tool === 'trend'
            ? '#22c55e'
            : '#a78bfa',
    };
  };

  const downloadChartAsImage = () => {
    setExportError(null);
    try {
      const chart = priceChartRef.current;
      if (!chart) throw new Error('Chart is not ready');
      const main = chart.takeScreenshot();
      const width = priceRef.current?.clientWidth || main.width / (window.devicePixelRatio || 1);
      const image = composeChartPng({
        main,
        rsi: showRSI ? rsiChartRef.current?.takeScreenshot() : undefined,
        cssWidth: width,
        title: `${symbol} - ${timeframe}`,
        subtitle: [
          showSMA && `SMA ${smaPeriods.join('/')}`,
          showEMA && `EMA ${emaPeriods.join('/')}`,
          showBollinger && 'Bollinger',
          showRSI && `RSI ${rsiPeriod}`,
          showVolumeProfile && 'Volume Profile',
        ]
          .filter(Boolean)
          .join(' | '),
        band: bandPolygon
          ? bandPolygon.split(' ').map((point) => {
              const [x, y] = point.split(',').map(Number);
              return { x, y };
            })
          : [],
        profile: showVolumeProfile
          ? profile.flatMap((point) => {
              const y = candleSeriesRef.current?.priceToCoordinate(point.price);
              return y === null || y === undefined || y < 0 || y > 320
                ? []
                : [{ y, width: (point.volume / maxVol) * 86 }];
            })
          : [],
        shapes: currentAnnotations
          .map(projectAnnotation)
          .filter((shape): shape is ExportShape => shape !== null),
      });
      const link = document.createElement('a');
      link.href = image.toDataURL('image/png');
      link.download = `${symbol.replace(/[^a-zA-Z0-9._-]/g, '_')}-${timeframe}.png`;
      link.click();
    } catch {
      setExportError('Unable to export the chart. Wait for it to load and try again.');
    }
  };

  const pointFromEvent = (event: PointerEvent<HTMLDivElement>) => {
    const chart = priceChartRef.current,
      series = candleSeriesRef.current;
    if (!chart || !series || !priceRef.current) return null;
    const bounds = priceRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(chart.timeScale().width(), event.clientX - bounds.left));
    const y = Math.max(0, Math.min(320, event.clientY - bounds.top));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const time = chart.timeScale().coordinateToTime(x),
      price = series.coordinateToPrice(y);
    return typeof time === 'number' && price !== null && Number.isFinite(price)
      ? { time, price }
      : null;
  };
  const startDrawing = (event: PointerEvent<HTMLDivElement>) => {
    if (drawingTool === 'none' || event.button > 0) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraftAnnotation({
      id: `${Date.now()}-${Math.random()}`,
      tool: drawingTool,
      symbol,
      timeframe,
      startTime: point.time,
      endTime: point.time,
      startPrice: point.price,
      endPrice: point.price,
    });
  };
  const updateDrawing = (event: PointerEvent<HTMLDivElement>) => {
    if (!draftAnnotation) return;
    const point = pointFromEvent(event);
    if (point)
      setDraftAnnotation(
        (annotation) =>
          annotation && {
            ...annotation,
            endTime: point.time,
            endPrice: annotation.tool === 'horizontal' ? annotation.startPrice : point.price,
          },
      );
  };
  const finishDrawing = (event: PointerEvent<HTMLDivElement>) => {
    if (!draftAnnotation) return;
    const point = pointFromEvent(event);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (point)
      setAnnotations((current) => [
        ...current,
        {
          ...draftAnnotation,
          endTime: point.time,
          endPrice:
            draftAnnotation.tool === 'horizontal' ? draftAnnotation.startPrice : point.price,
        },
      ]);
    setDraftAnnotation(null);
    setDrawingTool('none');
  };
  const cancelDrawing = () => {
    setDraftAnnotation(null);
    setDrawingTool('none');
  };
  const renderAnnotation = (annotation: ChartAnnotation) => {
    const shape = projectAnnotation(annotation);
    if (!shape) return null;
    const shared = {
      'data-start-time': annotation.startTime,
      'data-start-price': annotation.startPrice,
      stroke: shape.color,
      strokeWidth: 2,
    };
    return shape.kind === 'rectangle' ? (
      <rect
        key={annotation.id}
        {...shared}
        x={Math.min(shape.x1, shape.x2)}
        y={Math.min(shape.y1, shape.y2)}
        width={Math.abs(shape.x2 - shape.x1)}
        height={Math.abs(shape.y2 - shape.y1)}
        fill="rgba(167,139,250,0.14)"
      />
    ) : (
      <line
        key={annotation.id}
        {...shared}
        x1={shape.x1}
        y1={shape.y1}
        x2={shape.x2}
        y2={shape.y2}
        strokeDasharray={annotation.tool === 'horizontal' ? '4 2' : undefined}
      />
    );
  };
  return (
    <div className="space-y-3">
      <p className="sr-only" role="note" aria-label="Chart summary">
        {symbol}, {timeframe} candlestick chart, {visibleData.length} candles.
        {hasData
          ? (() => {
              const latest = visibleData[visibleData.length - 1];
              return ` Latest candle: open ${latest.open.toFixed(2)}, high ${latest.high.toFixed(2)}, low ${latest.low.toFixed(2)}, close ${latest.close.toFixed(2)}, volume ${latest.volume.toLocaleString('en-IN')}.`;
            })()
          : ' No chart data available.'}
      </p>
      {/* Timeframe & Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2 text-xs">
        {/* Timeframe Buttons */}
        <div className="flex items-center gap-1 bg-black p-1 rounded-lg border border-neutral-800">
          {(['1D', '1W', '1M', '3M', '1Y', '5Y'] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              aria-pressed={timeframe === tf}
              onClick={() => setTimeframe(tf)}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                timeframe === tf
                  ? 'bg-emerald-700 text-white shadow-md'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
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
          disabled={!hasData}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-700 hover:text-white transition-colors"
        >
          <span>📷</span> Export PNG
        </button>
        <button
          type="button"
          onClick={() => setShowSettings((visible) => !visible)}
          aria-expanded={showSettings}
          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-700 hover:text-white"
        >
          Settings
        </button>
      </div>

      {exportError && (
        <p role="alert" className="text-xs text-red-400">
          {exportError}
        </p>
      )}
      <p className="text-[11px] text-neutral-400">
        {timeframe === '1D'
          ? 'Simulated 5-minute candles (09:15-15:30 IST).'
          : timeframe === '5Y'
            ? 'Weekly candles from 1,260 simulated weekday sessions.'
            : 'Daily candles; 1W / 1M / 3M / 1Y use 5 / 21 / 63 / 252 weekday sessions.'}{' '}
        Exchange holidays are not modeled.
      </p>

      {/* Indicator Toggles */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-300 bg-black/60 p-2 rounded-lg border border-neutral-800/80">
        <span className="font-semibold text-neutral-400">Indicators:</span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showSMA}
            onChange={(e) => setShowSMA(e.target.checked)}
            className="rounded text-emerald-500"
          />
          <span className="text-emerald-400">SMA {smaPeriods.join(' / ')}</span>
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
            className="rounded text-neutral-400"
          />
          <span className="text-neutral-300">Volume Profile</span>
        </label>
      </div>

      {showSettings && (
        <div className="grid gap-3 rounded-lg border border-neutral-700 bg-black p-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <p className="font-semibold text-emerald-400">SMA periods</p>
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
              min={30}
              max={50}
              onChange={setVolumeBuckets}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-black/60 p-2 text-xs">
        <span className="font-semibold text-neutral-400">Draw:</span>
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
            onClick={(event) => {
              drawingButtonRef.current = event.currentTarget;
              setDrawingTool((current) => (current === tool ? 'none' : tool));
            }}
            className={`rounded border px-2 py-1 transition-colors ${drawingTool === tool ? 'border-emerald-400 bg-emerald-400/15 text-emerald-300' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            setAnnotations((current) =>
              current.filter(
                (annotation) => annotation.symbol !== symbol || annotation.timeframe !== timeframe,
              ),
            )
          }
          disabled={currentAnnotations.length === 0}
          className="ml-auto rounded px-2 py-1 text-neutral-400 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear drawings
        </button>
      </div>

      {drawingTool !== 'none' && (
        <p id="drawing-keyboard-help" className="text-xs text-neutral-300">
          Press Enter to start at the middle candle, arrows to adjust the endpoint, Enter to save,
          or Escape to cancel.
        </p>
      )}

      {/* Main Chart and cursor-driven OHLCV tooltip */}
      <div
        ref={priceWrapperRef}
        onPointerMove={(event) => {
          if (event.buttons) setOverlayVersion((value) => value + 1);
        }}
        onPointerUp={() => setOverlayVersion((value) => value + 1)}
        onWheel={() => setOverlayVersion((value) => value + 1)}
        className="relative w-full overflow-hidden rounded-xl border border-neutral-800"
      >
        <div ref={priceRef} aria-hidden="true" className="w-full" />
        {showBollinger && bandPolygon && (
          <svg
            className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-hidden"
            aria-hidden="true"
          >
            <polygon points={bandPolygon} fill="rgba(245, 158, 11, 0.14)" />
          </svg>
        )}
        {showVolumeProfile && (
          <div
            aria-label="Volume profile"
            data-profile-volume={profile.reduce((total, point) => total + point.volume, 0)}
            className="pointer-events-none absolute inset-y-0 right-2 z-10 w-24 overflow-hidden border-l border-neutral-700/70"
          >
            <span className="absolute right-0 top-1 bg-black/75 text-[9px] font-semibold text-neutral-400">
              VOL PROFILE
            </span>
            {profile.map((point) => {
              const y = candleSeriesRef.current?.priceToCoordinate(point.price);
              if (y === null || y === undefined || y < 0 || y > 320) return null;
              return (
                <span
                  key={point.price}
                  title={`${point.price.toFixed(2)}: ${point.volume.toFixed(0)} volume`}
                  className="absolute right-0 h-1 rounded-l bg-emerald-400/60"
                  style={{ top: y - 2, width: `${(point.volume / maxVol) * 86}px` }}
                />
              );
            })}
          </div>
        )}{' '}
        <div
          ref={drawingAreaRef}
          className={`absolute inset-0 z-[15] ${drawingTool === 'none' ? 'pointer-events-none' : 'cursor-crosshair'}`}
          onPointerDown={startDrawing}
          onPointerMove={updateDrawing}
          onPointerUp={finishDrawing}
          onPointerCancel={cancelDrawing}
          tabIndex={drawingTool === 'none' ? -1 : 0}
          aria-label="Chart drawing area"
          role="group"
          aria-describedby={drawingTool !== 'none' ? 'drawing-keyboard-help' : undefined}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              cancelDrawing();
            }
            if (drawingTool === 'none' || !hasData) return;
            if (event.key === 'Enter') {
              event.preventDefault();
              if (draftAnnotation) {
                setAnnotations((current) => [...current, draftAnnotation]);
                cancelDrawing();
              } else {
                const candle = visibleData[Math.floor(visibleData.length / 2)];
                setDraftAnnotation({
                  id: `${Date.now()}-${Math.random()}`,
                  tool: drawingTool,
                  symbol,
                  timeframe,
                  startTime: candle.time,
                  endTime: candle.time,
                  startPrice: candle.close,
                  endPrice: candle.close,
                });
              }
            }
            if (event.key.startsWith('Arrow') && draftAnnotation) {
              event.preventDefault();
              const index = visibleData.findIndex(
                (candle) => candle.time === draftAnnotation.endTime,
              );
              const nextIndex = Math.max(
                0,
                Math.min(
                  visibleData.length - 1,
                  index + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0),
                ),
              );
              const step = Math.max(0.01, draftAnnotation.startPrice * 0.005);
              const price = Math.max(
                0.01,
                draftAnnotation.endPrice +
                  (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
              );
              setDraftAnnotation({
                ...draftAnnotation,
                endTime: visibleData[nextIndex].time,
                startPrice: drawingTool === 'horizontal' ? price : draftAnnotation.startPrice,
                endPrice: price,
              });
            }
          }}
        >
          <svg className="h-full w-full" aria-label="Chart drawing annotations">
            {currentAnnotations.map(renderAnnotation)}
            {draftAnnotation && renderAnnotation({ ...draftAnnotation, id: 'drawing-preview' })}
          </svg>
        </div>
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute z-20 rounded bg-black/95 px-2 py-1 font-mono text-[10px] text-neutral-100 opacity-0 shadow-lg transition-opacity"
        />
      </div>

      {/* RSI Sub-Chart */}
      {showRSI && (
        <div>
          <div className="mb-1 text-[11px] font-semibold text-rose-400 flex items-center justify-between">
            <span>RSI ({rsiPeriod}) Indicator</span>
            <span className="text-neutral-400 text-[10px]">Overbought 70 · Oversold 30</span>
          </div>
          <div
            ref={rsiRef}
            aria-hidden="true"
            className="w-full rounded-xl overflow-hidden border border-neutral-800"
          />
        </div>
      )}
    </div>
  );
}
