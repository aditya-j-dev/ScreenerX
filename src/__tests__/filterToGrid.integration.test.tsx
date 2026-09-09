import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { FilterPanel } from '../components/FilterPanel/FilterPanel';
import { filterStocks } from '../lib/filterEngine';
import { generateMockStocks } from '../lib/mockData';
import { useStockStore } from '../stores/stockStore';

function FilterToGrid({ stocks }: { stocks: ReturnType<typeof generateMockStocks> }) {
  const filters = useStockStore((state) => state.activeFilters);
  const matchingStocks = filterStocks(stocks, filters);
  return (
    <>
      <FilterPanel matchingCount={matchingStocks.length} totalCount={stocks.length} />
      <div role="grid" aria-label="Filtered stock results">
        {matchingStocks.map((stock) => (
          <div role="row" key={stock.symbol}>
            {stock.symbol}
          </div>
        ))}
      </div>
    </>
  );
}

describe('filter-to-grid workflow', () => {
  beforeEach(() => act(() => useStockStore.setState({ activeFilters: [] })));

  it('updates the displayed grid immediately after applying and clearing a P/E filter', async () => {
    const user = userEvent.setup();
    const stocks = generateMockStocks(2);
    stocks[0].pe = 10;
    stocks[1].pe = 35;
    render(<FilterToGrid stocks={stocks} />);

    expect(screen.getAllByRole('row')).toHaveLength(2);
    await user.type(screen.getAllByPlaceholderText('Value')[0], '20');
    expect(screen.getAllByRole('row')).toHaveLength(1);
    expect(screen.getByRole('row')).toHaveTextContent(stocks[0].symbol);

    await user.click(screen.getByRole('button', { name: 'Clear All Filters' }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });
});
