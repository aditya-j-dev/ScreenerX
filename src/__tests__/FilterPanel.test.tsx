import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilterPanel } from '../components/FilterPanel/FilterPanel';
import { useStockStore } from '../stores/stockStore';

describe('FilterPanel', () => {
  beforeEach(() => {
    act(() => useStockStore.setState({ activeFilters: [], watchlist: new Set() }));
  });

  it('adds, displays, and clears a numeric filter', async () => {
    const user = userEvent.setup();
    render(<FilterPanel matchingCount={42} totalCount={5000} />);

    const input = screen.getAllByPlaceholderText('Value')[0];
    await user.type(input, '20');

    expect(useStockStore.getState().activeFilters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'pe', operator: 'lte', value: 20 }),
      ]),
    );
    expect(screen.getByText('pe: 20')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear All Filters' }));
    expect(useStockStore.getState().activeFilters).toEqual([]);
  });

  it('supports presets, a boolean filter, search, and the supplied close action', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<FilterPanel matchingCount={878} totalCount={5000} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Value Stocks' }));
    expect(useStockStore.getState().activeFilters.length).toBeGreaterThan(0);

    await user.click(screen.getByRole('switch', { name: 'Watchlist Only' }));
    expect(screen.getByRole('switch', { name: 'Watchlist Only' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await user.type(screen.getByRole('textbox', { name: 'Search filters' }), 'Bollinger');
    expect(screen.getByText('Bollinger Position')).toBeInTheDocument();
    expect(screen.queryByText('P/E Max')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close filters' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps range bounds in ascending order', () => {
    render(<FilterPanel matchingCount={1} totalCount={2} />);
    const minimum = screen.getByRole('spinbutton', { name: 'Market Cap Range (Cr) minimum' });
    fireEvent.change(minimum, { target: { value: '100000' } });
    expect(
      useStockStore.getState().activeFilters.find((filter) => filter.id === 'marketCap-range')
        ?.value,
    ).toEqual([100000, 2000000]);
  });
});
