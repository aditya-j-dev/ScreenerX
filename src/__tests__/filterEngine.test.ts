import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

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
    const record = { ...sample, indexMembership: ['NIFTY 50', 'BSE Sensex'] };
    expect(createPredicate(filter('in', 'indexMembership', ['NIFTY 50']))(record)).toBe(true);
    expect(createPredicate(filter('contains', 'indexMembership', 'BSE Sensex'))(record)).toBe(true);
    expect(createPredicate(filter('notIn', 'indexMembership', ['NIFTY 50']))(record)).toBe(false);
    expect(createPredicate(filter('in', 'indexMembership', ['NIFTY Next 50']))(record)).toBe(false);
  });

  it('keeps zero and false as valid filter operands', () => {
    const record = { ...sample, pe: 0, watchlist: false };
    expect(createPredicate(filter('eq', 'watchlist', false))(record)).toBe(true);
    expect(createPredicate(filter('eq', 'watchlist', true))(record)).toBe(false);
    expect(createPredicate(filter('between', 'pe', [0, 0]))(record)).toBe(true);
    expect(createPredicate(filter('gte', 'pe', 0))(record)).toBe(true);
  });

  it('defines empty-list membership without dropping valid records', () => {
    expect(createPredicate(filter('in', 'indexMembership', []))(sample)).toBe(false);
    expect(createPredicate(filter('notIn', 'indexMembership', []))(sample)).toBe(true);
    expect(
      createPredicate(filter('in', 'indexMembership', ['NIFTY 50']))({
        ...sample,
        indexMembership: [],
      }),
    ).toBe(false);
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

  it.each(['gt', 'gte', 'lt', 'lte'] as const)(
    'rejects non-numeric operands for %s without coercion',
    (operator) => {
      expect(
        createPredicate(filter(operator, 'watchlist', 0))({ ...sample, watchlist: true }),
      ).toBe(false);
      expect(createPredicate(filter(operator, 'pe', '20'))({ ...sample, pe: 10 })).toBe(false);
      expect(createPredicate(filter(operator, 'pe', Infinity))({ ...sample, pe: 10 })).toBe(false);
      expect(createPredicate(filter(operator, 'pe', 20))({ ...sample, pe: NaN })).toBe(false);
    },
  );

  it.each([true, '10', [10], [10, 20, 30], [20, 10], [0, Infinity]])(
    'rejects malformed range %j',
    (value) => {
      expect(createPredicate(filter('between', 'pe', value))({ ...sample, pe: 15 })).toBe(false);
    },
  );

  it.each(['in', 'notIn'] as const)('rejects scalar input for %s without throwing', (operator) => {
    expect(createPredicate(filter(operator, 'sector', 'Banking'))(sample)).toBe(false);
  });

  it('filters by explicitly defined percentage distance from 52-week highs and lows', () => {
    const stock = { ...sample, lastPrice: 90, week52High: 100, week52Low: 60 };
    expect(createPredicate(filter('between', 'week52HighProximity', [9.9, 10.1]))(stock)).toBe(
      true,
    );
    expect(createPredicate(filter('between', 'week52LowProximity', [49.9, 50.1]))(stock)).toBe(
      true,
    );
    expect(createPredicate(filter('lte', 'week52HighProximity', 5))(stock)).toBe(false);
    expect(
      createPredicate(filter('gte', 'week52LowProximity', 0))({ ...stock, week52Low: 0 }),
    ).toBe(false);
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
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.map((stock) => stock.symbol)).toEqual(
      stocks
        .filter(
          (stock) =>
            stock.marketCap >= 1000000 &&
            stock.pe !== null &&
            stock.pe <= 30 &&
            stock.roe >= 15 &&
            ['IT', 'Banking'].includes(stock.sector) &&
            stock.rsi14 >= 40,
        )
        .map((stock) => stock.symbol),
    );
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

  it('runs five low-selectivity filters over all 5,000 records in under 200ms', () => {
    const result = filterStocksWithMetrics(stocks, [
      filter('gte', 'marketCap', 0),
      filter('gte', 'roe', -100),
      filter('lte', 'rsi14', 100),
      filter('in', 'sector', [...new Set(stocks.map((stock) => stock.sector))]),
      filter('startsWith', 'symbol', ''),
    ]);
    expect(result.data).toHaveLength(5000);
    expect(result.data.map((stock) => stock.symbol)).toEqual(stocks.map((stock) => stock.symbol));
    expect(result.executionTimeMs).toBeLessThan(200);
    console.info(
      `[Task 3.5] 5,000 records / 5 low-selectivity filters: ${result.executionTimeMs.toFixed(2)}ms`,
    );
  });

  it('handles an empty universe, no filters, and contradictory criteria', () => {
    expect(filterStocks([], [filter('gt', 'pe', 0)])).toEqual([]);
    expect(filterStocks([sample], [])).toEqual([sample]);
    expect(filterStocks([sample], [filter('lt', 'pe', 10), filter('gt', 'pe', 20)])).toEqual([]);
  });

  it('leaves frozen records and filter configuration unchanged during the pipeline', () => {
    const record = Object.freeze({ ...sample, pe: 10 });
    const criteria = [Object.freeze(filter('lt', 'pe', 15))];
    Object.freeze(criteria);
    expect(
      executeFilterPipeline([record], criteria, {
        sortConfig: { field: 'pe', direction: 'asc' },
        page: 1,
        pageSize: 1,
      }).data,
    ).toEqual([record]);
    expect(criteria[0].value).toBe(15);
    expect(record.pe).toBe(10);
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

  it.each(['asc', 'desc'] as const)(
    'sorts missing P/E values last with stable ties in %s order',
    (direction) => {
      const records = [
        { ...sample, id: 1, pe: null },
        { ...sample, id: 2, pe: 10 },
        { ...sample, id: 3, pe: 20 },
        { ...sample, id: 4, pe: 10 },
        { ...sample, id: 5, pe: NaN },
      ];
      expect(sortStocks(records, 'pe', direction).map((stock) => stock.id)).toEqual(
        direction === 'asc' ? [2, 4, 3, 1, 5] : [3, 2, 4, 1, 5],
      );
      expect(records.map((stock) => stock.id)).toEqual([1, 2, 3, 4, 5]);
    },
  );

  it('evaluates nested groups against independently specified expected matches', () => {
    const records = [
      { ...sample, id: 1, sector: 'IT' as const, pe: 12, roe: 20 },
      { ...sample, id: 2, sector: 'IT' as const, pe: 30, roe: 5 },
      { ...sample, id: 3, sector: 'Pharma' as const, pe: 10, roe: 20 },
      { ...sample, id: 4, sector: 'Banking' as const, pe: 30, roe: 20 },
    ];
    const ast: FilterGroup = {
      type: 'AND',
      children: [
        filter('in', 'sector', ['IT', 'Banking']),
        { type: 'OR', children: [filter('lt', 'pe', 15), filter('gt', 'roe', 15)] },
      ],
    };
    expect(filterStocksByAst(records, ast).map((stock) => stock.id)).toEqual([1, 4]);
  });

  it('short-circuits AND and OR branches without reading unnecessary fields', () => {
    const readRoe = vi.fn(() => 20);
    const record = { ...sample, pe: 10 };
    Object.defineProperty(record, 'roe', { get: readRoe });
    expect(
      filterStocksByAst([record], {
        type: 'AND',
        children: [filter('lt', 'pe', 5), filter('gt', 'roe', 15)],
      }),
    ).toEqual([]);
    expect(readRoe).not.toHaveBeenCalled();
    expect(
      filterStocksByAst([record], {
        type: 'OR',
        children: [filter('lt', 'pe', 15), filter('gt', 'roe', 15)],
      }),
    ).toEqual([record]);
    expect(readRoe).not.toHaveBeenCalled();
  });

  it('includes the complete pipeline duration in its timing', () => {
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(101)
      .mockReturnValueOnce(104)
      .mockReturnValueOnce(110);
    vi.stubEnv('NODE_ENV', 'test');
    const result = executeFilterPipeline([sample], [], {
      sortConfig: { field: 'pe', direction: 'asc' },
      page: 1,
      pageSize: 1,
    });
    expect(result.executionTimeMs).toBe(10);
  });

  it('logs filter timings only in development', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.stubEnv('NODE_ENV', 'production');
    filterStocksWithMetrics([sample], []);
    expect(debug).not.toHaveBeenCalled();
    vi.stubEnv('NODE_ENV', 'development');
    filterStocksWithMetrics([sample], []);
    expect(debug).toHaveBeenCalledWith(
      '[filterEngine]',
      expect.objectContaining({ records: 1, matches: 1, executionTimeMs: expect.any(Number) }),
    );
  });
});
