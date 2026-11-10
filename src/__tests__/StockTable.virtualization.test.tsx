import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockTable, type StockTableHandle } from '../components/DataGrid/StockTable';
import { generateMockStocks } from '../lib/mockData';
import { useStockStore } from '../stores/stockStore';

// Use the real TanStack virtualizer. jsdom supplies no layout, so model only the
// scroll viewport and browser scroll API; these tests do not measure browser FPS.
const HEIGHT = 560;
const HEADER = 36;
const FOOTER = 32;
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');

beforeEach(() => {
  useStockStore.setState({ selectedSymbol: null, livePrices: new Map(), watchlist: new Set() });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.id === 'stock-grid' ? HEIGHT : 36;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.id === 'stock-grid' ? 1000 : Number.parseFloat(this.style.width) || 100;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(HEIGHT);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.id === 'stock-grid'
      ? HEADER + Number.parseFloat((this.children[1] as HTMLElement)?.style.height || '0') + FOOTER
      : HEIGHT;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return Number.parseFloat((this.children[1] as HTMLElement)?.style.width || '1000');
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: function (this: HTMLElement, options?: ScrollToOptions | number) {
      if (typeof options !== 'object') return;
      const previousTop = this.scrollTop;
      const previousLeft = this.scrollLeft;
      if (options.top !== undefined)
        this.scrollTop = Math.max(0, Math.min(options.top, this.scrollHeight - HEIGHT));
      if (options.left !== undefined) this.scrollLeft = options.left;
      if (this.scrollTop !== previousTop || this.scrollLeft !== previousLeft)
        fireEvent.scroll(this);
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

function rowBounds(row: HTMLElement, grid: HTMLElement) {
  const translation = Number(row.style.transform.match(/translateY\(([-\d.]+)px\)/)?.[1]);
  const top = HEADER + translation - grid.scrollTop;
  return { top, bottom: top + 36 };
}

describe('StockTable real virtualization', () => {
  it.each([5000, 10000, 20000])(
    'windows %i records and exposes programmatically targeted rows',
    (count) => {
      const stocks = generateMockStocks(count);
      const ref = createRef<StockTableHandle>();
      const { container } = render(<StockTable ref={ref} stocks={stocks} />);
      const grid = screen.getByRole('grid');
      const renderedRows = () =>
        container.querySelectorAll<HTMLElement>(
          '[role="row"][aria-rowindex]:not([aria-rowindex="1"])',
        );
      expect(renderedRows().length).toBeGreaterThan(0);
      expect(renderedRows().length).toBeLessThan(50);
      expect(grid).toHaveAttribute('aria-rowcount', String(count + 1));
      expect((grid.children[1] as HTMLElement).style.height).toBe(`${count * 36}px`);

      for (const index of [Math.floor(count / 2), count - 1, 0]) {
        act(() => ref.current!.scrollToRow(index));
        const row = container.querySelector<HTMLElement>(`[aria-rowindex="${index + 2}"]`);
        expect(row).not.toBeNull();
        expect(row).toHaveTextContent(stocks[index].symbol);
        const bounds = rowBounds(row!, grid);
        expect(bounds.top).toBeGreaterThanOrEqual(HEADER);
        expect(bounds.bottom).toBeLessThanOrEqual(HEIGHT - FOOTER);
        expect(renderedRows().length).toBeLessThan(50);
      }
    },
  );

  it('clamps out-of-range targets and tolerates an empty result set', () => {
    const ref = createRef<StockTableHandle>();
    const { container, rerender } = render(
      <StockTable ref={ref} stocks={generateMockStocks(100)} />,
    );
    act(() => ref.current!.scrollToRow(1000));
    expect(container.querySelector('[aria-rowindex="101"]')).toBeInTheDocument();
    act(() => ref.current!.scrollToRow(-10));
    expect(container.querySelector('[aria-rowindex="2"]')).toBeInTheDocument();
    rerender(<StockTable ref={ref} stocks={[]} />);
    expect(() => act(() => ref.current!.scrollToRow(0))).not.toThrow();
    expect(
      container.querySelectorAll('[role="row"][aria-rowindex]:not([aria-rowindex="1"])'),
    ).toHaveLength(0);
  });
});
