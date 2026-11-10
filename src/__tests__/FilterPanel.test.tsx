import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilterPanel } from '../components/FilterPanel/FilterPanel';
import { useStockStore } from '../stores/stockStore';

describe('FilterPanel', () => {
  beforeEach(() => {
    act(() => useStockStore.setState({ activeFilters: [], watchlist: new Set() }));
  });

  it('gives every filter control an accessible name', () => {
    const { container } = render(<FilterPanel matchingCount={342} totalCount={5000} />);
    for (const control of container.querySelectorAll('button, input, select')) {
      expect(control).toHaveAccessibleName();
    }
  });

  it('adds, displays, and clears a numeric filter', async () => {
    const user = userEvent.setup();
    render(<FilterPanel matchingCount={42} totalCount={5000} />);

    const input = screen.getByRole('spinbutton', { name: 'P/E maximum' });
    await user.type(input, '20');

    expect(useStockStore.getState().activeFilters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'pe', operator: 'lte', value: 20 }),
      ]),
    );
    expect(screen.getByText('pe: lte 20')).toBeInTheDocument();

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
    expect(screen.queryByRole('spinbutton', { name: 'P/E maximum' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close filters' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps range bounds in ascending order', () => {
    render(<FilterPanel matchingCount={1} totalCount={2} />);
    const minimum = screen.getByRole('spinbutton', { name: 'Market Cap Range (Cr) minimum' });
    fireEvent.change(minimum, { target: { value: '100000' } });
    expect(
      useStockStore.getState().activeFilters.find((filter) => filter.field === 'marketCap'),
    ).toMatchObject({ operator: 'gte', value: 100000 });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Market Cap Range (Cr) maximum' }), {
      target: { value: '50000' },
    });
    expect(
      useStockStore.getState().activeFilters.find((filter) => filter.field === 'marketCap')?.value,
    ).toEqual([100000, 100000]);
  });

  it('exposes all 31 distinct criteria including the five missing fields', () => {
    const { container } = render(<FilterPanel matchingCount={5000} totalCount={5000} />);
    const fields = Array.from(container.querySelectorAll('[data-filter-field]')).map((node) =>
      node.getAttribute('data-filter-field'),
    );
    expect(new Set(fields).size).toBe(31);
    expect(fields).toEqual(
      expect.arrayContaining([
        'week52HighProximity',
        'week52LowProximity',
        'changePercent',
        'atr',
        'volumeVsAvg',
      ]),
    );
    expect(screen.getAllByRole('slider')).toHaveLength(40);
  });

  it('supports zero, negative, two-sided and independently cleared bounds', async () => {
    const user = userEvent.setup();
    render(<FilterPanel matchingCount={1} totalCount={2} />);
    const min = screen.getByRole('spinbutton', { name: 'Day Change (%) minimum' });
    const max = screen.getByRole('spinbutton', { name: 'Day Change (%) maximum' });
    await user.type(min, '-5');
    await user.type(max, '0');
    expect(
      useStockStore.getState().activeFilters.find((filter) => filter.field === 'changePercent'),
    ).toMatchObject({ operator: 'between', value: [-5, 0] });
    fireEvent.change(min, { target: { value: '' } });
    expect(
      useStockStore.getState().activeFilters.find((filter) => filter.field === 'changePercent'),
    ).toMatchObject({ operator: 'lte', value: 0 });
    fireEvent.change(max, { target: { value: '' } });
    expect(useStockStore.getState().activeFilters).toEqual([]);
  });

  it('reflects preset ranges and replaces a preset criterion instead of duplicating it', async () => {
    const user = userEvent.setup();
    render(<FilterPanel matchingCount={1} totalCount={2} />);
    await user.click(screen.getByRole('button', { name: 'Growth Momentum' }));
    expect(screen.getByRole('spinbutton', { name: 'RSI (14) minimum' })).toHaveValue(40);
    expect(screen.getByRole('spinbutton', { name: 'RSI (14) maximum' })).toHaveValue(70);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'RSI (14) maximum' }), {
      target: { value: '65' },
    });
    const rsi = useStockStore.getState().activeFilters.filter((filter) => filter.field === 'rsi14');
    expect(rsi).toHaveLength(1);
    expect(rsi[0].value).toEqual([40, 65]);
    await user.click(screen.getByRole('button', { name: 'Clear All Filters' }));
    expect(screen.getByRole('spinbutton', { name: 'RSI (14) minimum' })).toHaveValue(null);
    expect(screen.getByLabelText('0 active filters')).toBeInTheDocument();
  });

  it('updates both slider handles and displays the Technical Breakout volume preset', async () => {
    const user = userEvent.setup();
    render(<FilterPanel matchingCount={1} totalCount={2} />);
    fireEvent.change(screen.getByRole('slider', { name: 'RSI (14) minimum slider' }), {
      target: { value: '40' },
    });
    fireEvent.change(screen.getByRole('slider', { name: 'RSI (14) maximum slider' }), {
      target: { value: '70' },
    });
    expect(screen.getByRole('spinbutton', { name: 'RSI (14) minimum' })).toHaveValue(40);
    expect(screen.getByRole('spinbutton', { name: 'RSI (14) maximum' })).toHaveValue(70);
    await user.click(screen.getByRole('button', { name: 'Technical Breakout' }));
    const volume = within(screen.getByRole('group', { name: 'Volume vs 20D Average' }));
    expect(volume.getByRole('radio', { name: '2x' })).toBeChecked();
    expect(volume.getByRole('radio', { name: '3x' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Clear All Filters' }));
    expect(volume.getByRole('radio', { name: '2x' })).not.toBeChecked();
  });

  it('searches multiselect options, reports counts and applies radio/boolean controls', async () => {
    const user = userEvent.setup();
    render(<FilterPanel matchingCount={1} totalCount={2} />);
    await user.click(screen.getByRole('button', { name: 'Sectors: 0 selected' }));
    await user.type(screen.getByRole('textbox', { name: 'Search Sectors' }), 'Bank');
    await user.click(screen.getByRole('checkbox', { name: 'Banking' }));
    expect(screen.getByRole('button', { name: 'Sectors: 1 selected' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const atr = screen.getByRole('spinbutton', { name: 'Average True Range (ATR) minimum' });
    fireEvent.change(atr, { target: { value: '10' } });
    await user.click(
      within(screen.getByRole('group', { name: 'Volume vs 20D Average' })).getByRole('radio', {
        name: '3x',
      }),
    );
    await user.click(screen.getByRole('switch', { name: 'Recently Updated' }));
    expect(screen.getByLabelText('4 active filters')).toBeInTheDocument();
    expect(useStockStore.getState().activeFilters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'sector', operator: 'in', value: ['Banking'] }),
        expect.objectContaining({ field: 'volumeVsAvg', value: '3x' }),
      ]),
    );
  });
});
