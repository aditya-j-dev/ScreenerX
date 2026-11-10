import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart } from 'lightweight-charts';
import { generateHistory, generateMockStocks } from '../lib/mockData';
import { calculateEMA, calculateRSI, calculateBollinger } from '../lib/indicators';
import * as indicators from '../lib/indicators';

const { chart } = vi.hoisted(() => {
  const series = (_options?: { title?: string }) => ({
    setData: vi.fn(),
    update: vi.fn(),
    createPriceLine: vi.fn(),
    priceToCoordinate: vi.fn((price: number) => price / 10),
    coordinateToPrice: vi.fn((coordinate: number) => coordinate * 10),
  });
  const chart = (_container?: unknown, options?: { height?: number }) => {
    type MockRange = { from: number; to: number };
    let range: MockRange = { from: 0, to: 251 };
    const listeners = new Set<(range: { from: number; to: number }) => void>();
    const scale = {
      fitContent: vi.fn(),
      getVisibleLogicalRange: vi.fn(() => range),
      setVisibleLogicalRange: vi.fn((next: typeof range) => {
        range = next;
        listeners.forEach((listener) => listener(next));
      }),
      subscribeVisibleLogicalRangeChange: vi.fn((listener: (range: MockRange) => void) => {
        listeners.add(listener);
      }),
      unsubscribeVisibleLogicalRangeChange: vi.fn((listener: (range: MockRange) => void) => {
        listeners.delete(listener);
      }),
      timeToCoordinate: vi.fn((time: number) => time % 1000),
      coordinateToTime: vi.fn((coordinate: number) => 1700000000 + coordinate),
      width: vi.fn(() => 600),
    };
    return {
      addCandlestickSeries: vi.fn(series),
      addLineSeries: vi.fn(series),
      addAreaSeries: vi.fn(series),
      timeScale: () => scale,
      applyOptions: vi.fn(),
      subscribeCrosshairMove: vi.fn(),
      remove: vi.fn(),
      takeScreenshot: vi.fn(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = options?.height ?? 320;
        return canvas;
      }),
    };
  };
  return { chart };
});

vi.mock('lightweight-charts', () => ({ createChart: vi.fn(chart) }));
const observers: Array<{ callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }> =
  [];
beforeEach(() => {
  vi.clearAllMocks();
  observers.length = 0;
});
afterEach(() => vi.restoreAllMocks());

beforeAll(() => {
  class ResizeObserverMock {
    disconnect = vi.fn();
    constructor(public callback: ResizeObserverCallback) {
      observers.push(this);
    }
    observe() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('PointerEvent', MouseEvent);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

describe('StockChart', () => {
  it('creates drawings with the keyboard and restores focus to the tool button', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const stock = generateMockStocks(1)[0];
    render(<StockChart symbol={stock.symbol} data={generateHistory(stock, 260)} />);
    const tool = screen.getByRole('button', { name: 'Trend line' });
    fireEvent.click(tool);
    const area = screen.getByRole('group', { name: 'Chart drawing area' });
    expect(area).toHaveFocus();
    fireEvent.keyDown(area, { key: 'Enter' });
    fireEvent.keyDown(area, { key: 'ArrowRight' });
    fireEvent.keyDown(area, { key: 'ArrowUp' });
    fireEvent.keyDown(area, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Clear drawings' })).toBeEnabled();
    expect(tool).toHaveFocus();
    fireEvent.click(tool);
    fireEvent.keyDown(area, { key: 'Escape' });
    expect(tool).toHaveAttribute('aria-pressed', 'false');
    expect(tool).toHaveFocus();
  });
  it('provides text candle data and indicates the selected timeframe', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const stock = generateMockStocks(1)[0];
    const data = generateHistory(stock, 260);
    render(<StockChart symbol={stock.symbol} data={data} />);
    expect(screen.getByRole('note', { name: 'Chart summary' })).toHaveTextContent(
      `close ${data[data.length - 1].close.toFixed(2)}`,
    );
    expect(screen.getByRole('button', { name: '1Y' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '1M' }));
    expect(screen.getByRole('button', { name: '1Y' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('note', { name: 'Chart summary' })).toHaveTextContent(
      '1M candlestick chart',
    );
  });
  it('skips disabled indicator calculations on new candles and recomputes when enabled', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const calculations = [
      vi.spyOn(indicators, 'calculateSMA'),
      vi.spyOn(indicators, 'calculateEMA'),
      vi.spyOn(indicators, 'calculateBollinger'),
      vi.spyOn(indicators, 'calculateRSI'),
      vi.spyOn(indicators, 'calculateVolumeProfile'),
    ];
    const stock = generateMockStocks(1)[0];
    const data = generateHistory(stock, 260);
    const { rerender } = render(<StockChart symbol={stock.symbol} data={data} />);
    const labels = [/SMA 20/, /EMA 12/, /^Bollinger$/, /RSI 14/, /^Volume Profile$/];
    labels.forEach((label) => fireEvent.click(screen.getByLabelText(label)));
    calculations.forEach((calculation) => calculation.mockClear());
    const updated = data.map((candle, index) =>
      index === data.length - 1
        ? { ...candle, close: candle.close + 1, high: candle.high + 1 }
        : candle,
    );
    rerender(<StockChart symbol={stock.symbol} data={updated} />);
    calculations.forEach((calculation) => expect(calculation).not.toHaveBeenCalled());
    labels.forEach((label) => fireEvent.click(screen.getByLabelText(label)));
    calculations.forEach((calculation) => expect(calculation).toHaveBeenCalled());
    expect(screen.getByText(/RSI \(14\) Indicator/)).toBeInTheDocument();
    expect(screen.getByLabelText('Volume profile')).toBeInTheDocument();
  });

  it('changes timeframe, toggles indicators, and exposes settings', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const user = userEvent.setup();
    const stock = generateMockStocks(1)[0];
    render(<StockChart symbol={stock.symbol} data={generateHistory(stock, 260)} />);

    await user.click(screen.getByRole('button', { name: '1M' }));
    expect(screen.getByRole('button', { name: '1M' })).toHaveClass('bg-emerald-700');

    await user.click(screen.getByLabelText(/RSI 14/));
    expect(screen.queryByText(/RSI \(14\) Indicator/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('spinbutton', { name: 'SMA 1' })).toHaveValue(20);
  });

  it('selects a drawing tool and records a drawing', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const user = userEvent.setup();
    const stock = generateMockStocks(1)[0];
    const { container } = render(
      <StockChart symbol={stock.symbol} data={generateHistory(stock, 260)} />,
    );

    await user.click(screen.getByRole('button', { name: 'Horizontal line' }));
    expect(screen.getByRole('button', { name: 'Horizontal line' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const overlay = container.querySelector(
      'svg[aria-label="Chart drawing annotations"]',
    )?.parentElement;
    expect(overlay).not.toBeNull();
    fireEvent.pointerDown(overlay!, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(overlay!, { pointerId: 1, clientX: 90, clientY: 30 });
    expect(container.querySelector('line')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear drawings' })).not.toBeDisabled();
  });

  it('initializes after data arrives and keeps the main chart present when RSI is disabled', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const user = userEvent.setup();
    const stock = generateMockStocks(1)[0];
    const { rerender } = render(<StockChart symbol={stock.symbol} data={[]} />);
    expect(createChart).not.toHaveBeenCalled();
    rerender(<StockChart symbol={stock.symbol} data={generateHistory(stock)} />);
    expect(createChart).toHaveBeenCalledTimes(2);
    await user.click(screen.getByLabelText(/RSI 14/));
    // Two old instances are removed; one new main instance replaces them.
    expect(createChart).toHaveBeenCalledTimes(3);
    const main = vi.mocked(createChart).mock.results[2].value as ReturnType<typeof chart>;
    expect(main.addCandlestickSeries).toHaveBeenCalledOnce();
    expect(main.remove).not.toHaveBeenCalled();
  });

  it('loads 75 candles for the labeled simulated intraday view', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const user = userEvent.setup();
    const stock = generateMockStocks(1)[0];
    render(<StockChart symbol={stock.symbol} data={generateHistory(stock)} />);
    await user.click(screen.getByRole('button', { name: '1D' }));
    const main = vi.mocked(createChart).mock.results[2].value as ReturnType<typeof chart>;
    expect(main.addCandlestickSeries.mock.results[0].value.setData.mock.calls[0][0]).toHaveLength(
      75,
    );
    expect(screen.getByText(/Simulated 5-minute candles/)).toBeInTheDocument();
  });

  it('reads tooltip volume from source OHLCV and handles resize/cleanup', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const stock = generateMockStocks(1)[0];
    const data = generateHistory(stock);
    const { container, unmount } = render(<StockChart symbol={stock.symbol} data={data} />);
    const main = vi.mocked(createChart).mock.results[0].value as ReturnType<typeof chart>;
    const crosshair = main.subscribeCrosshairMove.mock.calls[0][0] as (event: unknown) => void;
    const last = data[data.length - 1];
    act(() => crosshair({ time: last.time, point: { x: 10, y: 10 }, seriesData: new Map() }));
    expect(container.textContent).toContain(`V ${last.volume.toLocaleString('en-IN')}`);
    act(() =>
      observers[0].callback(
        [{ contentRect: { width: 420 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      ),
    );
    expect(main.applyOptions).toHaveBeenCalledWith({ width: 420 });
    const observer = observers[0];
    unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(main.remove).toHaveBeenCalledOnce();
  });

  it('updates every enabled indicator on a tick without recreating charts or losing pan/zoom', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const stock = generateMockStocks(1)[0];
    const data = generateHistory(stock);
    const { rerender, container } = render(<StockChart symbol={stock.symbol} data={data} />);
    const main = vi.mocked(createChart).mock.results[0].value as ReturnType<typeof chart>;
    const rsi = vi.mocked(createChart).mock.results[1].value as ReturnType<typeof chart>;
    const rsiInitial = rsi.addLineSeries.mock.results[0].value.setData.mock.calls[0][0];
    expect(rsiInitial).toHaveLength(data.length);
    expect(rsiInitial[0]).toEqual({ time: data[0].time });
    const range = { from: 100, to: 150 };
    act(() => main.timeScale().setVisibleLogicalRange(range));
    const last = data[data.length - 1];
    const changed = [
      ...data.slice(0, -1),
      { ...last, close: last.close + 10, high: Math.max(last.high, last.close + 10) },
    ];
    rerender(<StockChart symbol={stock.symbol} data={changed} />);
    expect(createChart).toHaveBeenCalledTimes(2);
    expect(main.timeScale().getVisibleLogicalRange()).toEqual(range);
    expect(rsi.timeScale().getVisibleLogicalRange()).toEqual(range);
    const line = (title: string) => {
      const index = main.addLineSeries.mock.calls.findIndex(
        ([options]) => options?.title === title,
      );
      return main.addLineSeries.mock.results[index].value;
    };
    const closes = changed.map((candle) => candle.close);
    expect(line('SMA 20').update.mock.lastCall?.[0].value).toBeCloseTo(
      closes.slice(-20).reduce((sum, close) => sum + close, 0) / 20,
    );
    expect(line('EMA 12').update.mock.lastCall?.[0].value).toBeCloseTo(
      calculateEMA(closes, 12).at(-1)!,
    );
    expect(line('BB Upper').update.mock.lastCall?.[0].value).toBeCloseTo(
      calculateBollinger(closes).at(-1)!.upper,
    );
    expect(line('BB Middle').update).toHaveBeenCalled();
    expect(line('BB Lower').update).toHaveBeenCalled();
    expect(rsi.addLineSeries.mock.results[0].value.update.mock.lastCall?.[0].value).toBeCloseTo(
      calculateRSI(closes).at(-1)!,
    );
    expect(container.querySelector('polygon')).toHaveAttribute('points');
  });

  it('warms up long indicators before slicing a short daily view and preserves range through settings', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const user = userEvent.setup();
    const stock = generateMockStocks(1)[0];
    render(<StockChart symbol={stock.symbol} data={generateHistory(stock)} />);
    await user.click(screen.getByRole('button', { name: '1W' }));
    const main = vi.mocked(createChart).mock.results[2].value as ReturnType<typeof chart>;
    const index = main.addLineSeries.mock.calls.findIndex(
      ([options]) => options?.title === 'SMA 200',
    );
    expect(main.addLineSeries.mock.results[index].value.setData.mock.calls[0][0]).toHaveLength(5);
    act(() => main.timeScale().setVisibleLogicalRange({ from: 1, to: 3 }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'SMA 1' }), {
      target: { value: '3.8' },
    });
    expect(screen.getByRole('spinbutton', { name: 'SMA 1' })).toHaveValue(4);
    const newMain = vi.mocked(createChart).mock.results[4].value as ReturnType<typeof chart>;
    expect(newMain.timeScale().getVisibleLogicalRange()).toEqual({ from: 1, to: 3 });
    expect(newMain.addLineSeries.mock.calls.some(([options]) => options?.title === 'SMA 4')).toBe(
      true,
    );
  });

  it('recalculates volume for the visible range and synchronizes RSI navigation', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const stock = generateMockStocks(1)[0];
    const data = generateHistory(stock);
    const { unmount } = render(<StockChart symbol={stock.symbol} data={data} />);
    const main = vi.mocked(createChart).mock.results[0].value as ReturnType<typeof chart>;
    const rsi = vi.mocked(createChart).mock.results[1].value as ReturnType<typeof chart>;
    act(() => main.timeScale().setVisibleLogicalRange({ from: 10, to: 20 }));
    expect(
      Number(screen.getByLabelText('Volume profile').getAttribute('data-profile-volume')),
    ).toBeCloseTo(
      data.slice(10, 21).reduce((sum, candle) => sum + candle.volume, 0),
      5,
    );
    act(() => rsi.timeScale().setVisibleLogicalRange({ from: 20, to: 30 }));
    expect(main.timeScale().getVisibleLogicalRange()).toEqual({ from: 20, to: 30 });
    expect(
      Number(screen.getByLabelText('Volume profile').getAttribute('data-profile-volume')),
    ).toBeCloseTo(
      data.slice(20, 31).reduce((sum, candle) => sum + candle.volume, 0),
      5,
    );
    act(() => main.timeScale().setVisibleLogicalRange({ from: -20, to: -10 }));
    expect(screen.getByLabelText('Volume profile')).toHaveAttribute('data-profile-volume', '0');
    unmount();
    expect(main.timeScale().unsubscribeVisibleLogicalRangeChange).toHaveBeenCalledOnce();
    expect(rsi.timeScale().unsubscribeVisibleLogicalRangeChange).toHaveBeenCalledOnce();
  });

  it('removes disabled overlays and accepts volume-profile bucket settings', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const user = userEvent.setup();
    const stock = generateMockStocks(1)[0];
    const { container } = render(
      <StockChart symbol={stock.symbol} data={generateHistory(stock)} />,
    );
    await user.click(screen.getByLabelText(/SMA 20/));
    let main = vi.mocked(createChart).mock.results.at(-2)!.value as ReturnType<typeof chart>;
    expect(
      main.addLineSeries.mock.calls.some(([options]) => options?.title?.startsWith('SMA')),
    ).toBe(false);
    await user.click(screen.getByLabelText(/EMA 12/));
    main = vi.mocked(createChart).mock.results.at(-2)!.value as ReturnType<typeof chart>;
    expect(
      main.addLineSeries.mock.calls.some(([options]) => options?.title?.startsWith('EMA')),
    ).toBe(false);
    await user.click(screen.getByLabelText('Bollinger'));
    expect(container.querySelector('polygon')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Volume Profile'));
    expect(screen.queryByLabelText('Volume profile')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Volume Profile'));
    expect(screen.getByLabelText('Volume profile')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Profile buckets' }), {
      target: { value: '50' },
    });
    expect(screen.getByRole('spinbutton', { name: 'Profile buckets' })).toHaveValue(50);
  });

  it('enables zoom/pan gestures and resets both panes on double click', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const stock = generateMockStocks(1)[0];
    render(<StockChart symbol={stock.symbol} data={generateHistory(stock)} />);
    expect(vi.mocked(createChart).mock.calls[0][1]).toMatchObject({
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
    });
    const main = vi.mocked(createChart).mock.results[0].value as ReturnType<typeof chart>;
    const rsi = vi.mocked(createChart).mock.results[1].value as ReturnType<typeof chart>;
    fireEvent.doubleClick(screen.getByLabelText('Chart drawing area').parentElement!);
    expect(main.timeScale().fitContent).toHaveBeenCalledTimes(2);
    expect(rsi.timeScale().fitContent).toHaveBeenCalledTimes(2);
  });

  it('keeps trend anchors in time/price coordinates and isolates drawings by stock', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const user = userEvent.setup();
    const [first, second] = generateMockStocks(2);
    const { container, rerender } = render(
      <StockChart symbol={first.symbol} data={generateHistory(first)} />,
    );
    await user.click(screen.getByRole('button', { name: 'Trend line' }));
    const overlay = screen.getByLabelText('Chart drawing area');
    fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(overlay, { clientX: 90, clientY: 30 });
    const line = container.querySelector('svg[aria-label="Chart drawing annotations"] line')!;
    expect(line).toHaveAttribute('data-start-time', '1700000010');
    expect(line).toHaveAttribute('data-start-price', '100');
    expect(line).toHaveAttribute('x1', '10');
    expect(screen.getByRole('button', { name: 'Trend line' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    const main = vi.mocked(createChart).mock.results[0].value as ReturnType<typeof chart>;
    main.timeScale().timeToCoordinate.mockImplementation((time) => (time % 1000) + 50);
    act(() => main.timeScale().setVisibleLogicalRange({ from: 10, to: 100 }));
    expect(line).toHaveAttribute('x1', '60');
    expect(line).toHaveAttribute('data-start-time', '1700000010');
    main.addCandlestickSeries.mock.results[0].value.priceToCoordinate.mockImplementation(
      (price: number) => price / 10 + 25,
    );
    fireEvent.pointerMove(overlay.parentElement!, { buttons: 1 });
    expect(line).toHaveAttribute('y1', '35');
    expect(line).toHaveAttribute('data-start-price', '100');
    rerender(<StockChart symbol={second.symbol} data={generateHistory(second)} />);
    expect(
      container.querySelector('svg[aria-label="Chart drawing annotations"] line'),
    ).not.toBeInTheDocument();
    rerender(<StockChart symbol={first.symbol} data={generateHistory(first)} />);
    expect(
      container.querySelector('svg[aria-label="Chart drawing annotations"] line'),
    ).toBeInTheDocument();
  });

  it('cancels an unfinished drawing on Escape or pointer cancellation', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const user = userEvent.setup();
    const stock = generateMockStocks(1)[0];
    const { container } = render(
      <StockChart symbol={stock.symbol} data={generateHistory(stock)} />,
    );
    const overlay = screen.getByLabelText('Chart drawing area');
    for (const cancel of ['escape', 'pointer']) {
      await user.click(screen.getByRole('button', { name: 'Rectangle' }));
      fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10 });
      expect(
        container.querySelector('svg[aria-label="Chart drawing annotations"] rect'),
      ).toBeInTheDocument();
      if (cancel === 'escape') fireEvent.keyDown(overlay, { key: 'Escape' });
      else fireEvent.pointerCancel(overlay);
      expect(
        container.querySelector('svg[aria-label="Chart drawing annotations"] rect'),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clear drawings' })).toBeDisabled();
    }
  });

  it('requests a composite PNG download and reports capture failure honestly', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const user = userEvent.setup();
    const stock = generateMockStocks(1)[0];
    render(<StockChart symbol={stock.symbol} data={generateHistory(stock)} />);
    const context = Object.fromEntries(
      [
        'fillRect',
        'fillText',
        'drawImage',
        'save',
        'restore',
        'translate',
        'scale',
        'beginPath',
        'rect',
        'clip',
        'lineTo',
        'moveTo',
        'closePath',
        'fill',
        'strokeRect',
        'stroke',
      ].map((method) => [method, vi.fn()]),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,test',
    );
    const downloads: Array<{ href: string; name: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push({ href: this.href, name: this.download });
    });
    await user.click(screen.getByRole('button', { name: /Export PNG/ }));
    expect(downloads).toEqual([
      { href: 'data:image/png;base64,test', name: `${stock.symbol}-1Y.png` },
    ]);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const main = vi.mocked(createChart).mock.results[0].value as ReturnType<typeof chart>;
    main.takeScreenshot.mockImplementationOnce(() => {
      throw new Error('Not ready');
    });
    await user.click(screen.getByRole('button', { name: /Export PNG/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to export');
    expect(downloads).toHaveLength(1);
  });
});
