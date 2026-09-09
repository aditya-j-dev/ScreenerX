import { describe, expect, it } from 'vitest';
import {
  buildFilterAst,
  createPredicate,
  executeFilterPipeline,
  filterStocks,
  filterStocksByAst,
  filterStocksWithMetrics,
  orderPredicates,
  paginateStocks,
  sortStocks,
  type FilterConfig,
  type FilterGroup,
} from '../lib/filterEngine';
import { generateMockStocks } from '../lib/mockData';

const stocks = generateMockStocks(5000);
const sample =
  stocks.find((stock) => stock.sector === 'Banking' && stock.industry === 'NBFC') ?? stocks[0];

function filter(
  operator: FilterConfig['operator'],
  field: FilterConfig['field'],
  value: FilterConfig['value'],
): FilterConfig {
  return { id: `${field}-${operator}`, field, operator, value, enabled: true };
}

describe('filter predicate factory', () => {
  it.each([
    ['eq', filter('eq', 'sector', sample.sector), true],
    ['neq', filter('neq', 'sector', 'IT'), true],
    ['gt', filter('gt', 'marketCap', 1), true],
    ['gte', filter('gte', 'marketCap', sample.marketCap), true],
    ['lt', filter('lt', 'marketCap', sample.marketCap + 1), true],
    ['lte', filter('lte', 'marketCap', sample.marketCap), true],
    ['between', filter('between', 'rsi14', [0, 100]), true],
    ['in', filter('in', 'sector', [sample.sector]), true],
    ['notIn', filter('notIn', 'sector', ['IT']), true],
    ['contains', filter('contains', 'industry', 'nbf'), true],
    ['startsWith', filter('startsWith', 'symbol', sample.symbol.slice(0, 2)), true],
  ])('evaluates %s correctly', (_name, config, expected) => {
    expect(createPredicate(config)(sample)).toBe(expected);
  });

  it('handles array-valued fields for in and contains', () => {
    const index = sample.indexMembership[0];
    expect(createPredicate(filter('in', 'indexMembership', [index]))(sample)).toBe(true);
    expect(createPredicate(filter('contains', 'indexMembership', index))(sample)).toBe(true);
  });

  it('excludes null values from numeric comparisons', () => {
    expect(createPredicate(filter('lte', 'pe', 30))({ ...sample, pe: null })).toBe(false);
  });

  it.each([
    ['eq rejects a different value', filter('eq', 'sector', 'IT'), false],
    ['neq rejects the same value', filter('neq', 'sector', sample.sector), false],
    ['gt excludes its exact boundary', filter('gt', 'marketCap', sample.marketCap), false],
    ['gte includes its exact boundary', filter('gte', 'marketCap', sample.marketCap), true],
    ['lt excludes its exact boundary', filter('lt', 'marketCap', sample.marketCap), false],
    ['lte includes its exact boundary', filter('lte', 'marketCap', sample.marketCap), true],
    ['between includes its lower boundary', filter('between', 'rsi14', [sample.rsi14, 100]), true],
    ['between includes its upper boundary', filter('between', 'rsi14', [0, sample.rsi14]), true],
    [
      'between rejects a value outside its range',
      filter('between', 'rsi14', [sample.rsi14 + 1, 100]),
      false,
    ],
    ['in rejects a missing category', filter('in', 'sector', ['IT']), false],
    ['notIn rejects an excluded category', filter('notIn', 'sector', [sample.sector]), false],
    [
      'contains is case-insensitive',
      filter('contains', 'industry', sample.industry.toUpperCase()),
      true,
    ],
    [
      'contains rejects an absent substring',
      filter('contains', 'industry', 'not-a-real-industry'),
      false,
    ],
    [
      'startsWith is case-insensitive',
      filter('startsWith', 'symbol', sample.symbol.slice(0, 2).toLowerCase()),
      true,
    ],
    ['startsWith rejects a different prefix', filter('startsWith', 'symbol', 'ZZ'), false],
  ])('%s', (_name, config, expected) => {
    expect(createPredicate(config)(sample)).toBe(expected);
  });

  it('treats null values as non-matches for every operator', () => {
    const nullPeStock = { ...sample, pe: null };
    const operators: FilterConfig[] = [
      filter('eq', 'pe', 10),
      filter('neq', 'pe', 10),
      filter('gt', 'pe', 10),
      filter('gte', 'pe', 10),
      filter('lt', 'pe', 10),
      filter('lte', 'pe', 10),
      filter('between', 'pe', [0, 20]),
      filter('in', 'pe', [10]),
      filter('notIn', 'pe', [10]),
      filter('contains', 'pe', '10'),
      filter('startsWith', 'pe', '1'),
    ];

    expect(operators.every((config) => !createPredicate(config)(nullPeStock))).toBe(true);
  });
});

describe('filter pipeline', () => {
  it('filters 5,000 stocks in under 200ms and exposes timing metadata', () => {
    const result = filterStocksWithMetrics(stocks, [
      filter('gte', 'marketCap', 1000000),
      filter('lte', 'pe', 30),
      filter('gte', 'roe', 15),
      filter('in', 'sector', ['IT', 'Banking']),
      filter('gte', 'rsi14', 40),
    ]);

    expect(result.executionTimeMs).toBeLessThan(200);
    expect(Array.isArray(result.data)).toBe(true);
    expect(
      result.data.every(
        (stock) =>
          stock.marketCap >= 1000000 &&
          stock.pe !== null &&
          stock.pe <= 30 &&
          stock.roe >= 15 &&
          ['IT', 'Banking'].includes(stock.sector) &&
          stock.rsi14 >= 40,
      ),
    ).toBe(true);
  });

  it('keeps only the stock that satisfies three simultaneous criteria', () => {
    const matching = {
      ...sample,
      id: 9001,
      sector: 'Banking' as const,
      pe: 12,
      roe: 18,
      debtToEquity: 0.3,
    };
    const wrongPe = { ...matching, id: 9002, pe: 18 };
    const wrongRoe = { ...matching, id: 9003, roe: 12 };
    const wrongDebt = { ...matching, id: 9004, debtToEquity: 0.8 };
    const criteria = [
      filter('lt', 'pe', 15),
      filter('gte', 'roe', 15),
      filter('lt', 'debtToEquity', 0.5),
    ];

    expect(
      filterStocks([matching, wrongPe, wrongRoe, wrongDebt], criteria).map((stock) => stock.id),
    ).toEqual([9001]);
  });

  it('ignores disabled filters', () => {
    expect(filterStocks([sample], [{ ...filter('eq', 'sector', 'IT'), enabled: false }])).toEqual([
      sample,
    ]);
  });

  it('builds an AND root with OR group children from UI filters', () => {
    const ast = buildFilterAst([
      filter('gte', 'marketCap', 1),
      { ...filter('eq', 'sector', 'IT'), group: 'OR' },
      { ...filter('eq', 'sector', 'Banking'), id: 'sector-banking', group: 'OR' },
    ]);
    expect(ast.type).toBe('AND');
    expect(ast.children).toHaveLength(2);
    expect(
      filterStocks(
        [sample],
        [
          { ...filter('gte', 'marketCap', 1) },
          { ...filter('eq', 'sector', 'IT'), group: 'OR' },
          { ...filter('eq', 'sector', 'Banking'), id: 'sector-banking', group: 'OR' },
        ],
      ),
    ).toEqual([sample]);
  });

  it('orders numeric range filters before category filters', () => {
    const ordered = orderPredicates([
      filter('contains', 'companyName', 'A'),
      filter('in', 'sector', ['Banking']),
      filter('between', 'rsi14', [40, 60]),
    ]);
    expect(ordered.map((item) => item.operator)).toEqual(['between', 'in', 'contains']);
  });

  it('evaluates caller-supplied OR AST groups', () => {
    const ast: FilterGroup = {
      type: 'OR',
      children: [filter('eq', 'sector', 'IT'), filter('eq', 'sector', 'Banking')],
    };
    const result = filterStocksByAst(stocks, ast);
    expect(result.every((stock) => stock.sector === 'IT' || stock.sector === 'Banking')).toBe(true);
  });

  it('uses an explicit stable sort tie-breaker', () => {
    const first = { ...sample, id: 1, marketCap: 100 };
    const second = { ...sample, id: 2, marketCap: 100 };
    expect(sortStocks([first, second], 'marketCap', 'asc').map((stock) => stock.id)).toEqual([
      1, 2,
    ]);
  });

  it('paginates a filtered result safely', () => {
    expect(paginateStocks(stocks.slice(0, 10), 2, 3).map((stock) => stock.id)).toEqual(
      stocks.slice(3, 6).map((stock) => stock.id),
    );
    expect(paginateStocks(stocks.slice(0, 10), 0, 0)).toHaveLength(1);
  });

  it('executes filter, stable sort, and pagination as one pipeline', () => {
    const result = executeFilterPipeline(stocks, [filter('eq', 'sector', 'Banking')], {
      sortConfig: { field: 'marketCap', direction: 'asc' },
      page: 2,
      pageSize: 5,
    });
    expect(result.data).toHaveLength(5);
    expect(result.total).toBeGreaterThan(5);
    expect(result.data[0].marketCap).toBeLessThanOrEqual(result.data[1].marketCap);
  });
});
