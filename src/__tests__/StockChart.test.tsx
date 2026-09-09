import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { generateHistory, generateMockStocks } from '../lib/mockData';

const series = () => ({ setData: vi.fn(), update: vi.fn(), createPriceLine: vi.fn() });
const chart = () => ({
  addCandlestickSeries: series,
  addLineSeries: series,
  addAreaSeries: series,
  timeScale: () => ({
    fitContent: vi.fn(),
    getVisibleLogicalRange: vi.fn(() => ({ from: 1, to: 2 })),
    setVisibleLogicalRange: vi.fn(),
  }),
  applyOptions: vi.fn(),
  subscribeCrosshairMove: vi.fn(),
  remove: vi.fn(),
});

vi.mock('lightweight-charts', () => ({ createChart: vi.fn(chart) }));

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

describe('StockChart', () => {
  it('changes timeframe, toggles indicators, and exposes settings', async () => {
    const { StockChart } = await import('../components/Chart/StockChart');
    const user = userEvent.setup();
    const stock = generateMockStocks(1)[0];
    render(<StockChart symbol={stock.symbol} data={generateHistory(stock, 260)} />);

    await user.click(screen.getByRole('button', { name: '1M' }));
    expect(screen.getByRole('button', { name: '1M' })).toHaveClass('bg-cyan-600');

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

    const overlay = container.querySelector('svg')?.parentElement;
    expect(overlay).not.toBeNull();
    fireEvent.pointerDown(overlay!, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(overlay!, { pointerId: 1, clientX: 90, clientY: 30 });
    expect(container.querySelector('line')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear drawings' })).not.toBeDisabled();
  });
});
