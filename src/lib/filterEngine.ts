import type { FilterConfig, FilterOperator, SortConfig, Stock } from '@/types/stock';

export type { FilterConfig, FilterOperator } from '@/types/stock';

export interface FilterGroup {
  type: 'AND' | 'OR';
  children: Array<FilterGroup | FilterConfig>;
}

export interface FilterExecutionResult {
  data: Stock[];
  executionTimeMs: number;
}

export interface FilterPipelineOptions {
  sortConfig?: SortConfig;
  page?: number;
  pageSize?: number;
}

export interface FilterPipelineResult extends FilterExecutionResult {
  total: number;
}

function isFilterGroup(node: FilterGroup | FilterConfig): node is FilterGroup {
  return 'children' in node;
}

function toComparableValue(value: unknown) {
  return typeof value === 'number' || typeof value === 'string' ? value : String(value);
}

function includesValue(actual: unknown, values: unknown[]) {
  if (Array.isArray(actual)) return actual.some((item) => values.includes(item));
  return values.includes(actual);
}

/** Builds one safe predicate for every filter operator declared in `FilterOperator`. */
export function createPredicate(filter: FilterConfig): (stock: Stock) => boolean {
  return (stock) => {
    const actual = stock[filter.field];
    if (actual === null || actual === undefined) return false;

    const expected = filter.value;
    switch (filter.operator) {
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
      case 'gt':
        return Number(actual) > Number(expected);
      case 'gte':
        return Number(actual) >= Number(expected);
      case 'lt':
        return Number(actual) < Number(expected);
      case 'lte':
        return Number(actual) <= Number(expected);
      case 'between': {
        const [minimum, maximum] = expected as number[];
        const value = Number(actual);
        return value >= minimum && value <= maximum;
      }
      case 'in':
        return includesValue(actual, expected as Array<number | string>);
      case 'notIn':
        return !includesValue(actual, expected as Array<number | string>);
      case 'contains': {
        if (Array.isArray(actual)) return actual.map(String).includes(String(expected));
        return String(actual).toLowerCase().includes(String(expected).toLowerCase());
      }
      case 'startsWith':
        return String(actual).toLowerCase().startsWith(String(expected).toLowerCase());
      default:
        return false;
    }
  };
}

/** Numeric range predicates run first because they are normally most selective. */
export function getSelectivityRank(operator: FilterOperator) {
  const ranks: Record<FilterOperator, number> = {
    between: 0,
    gt: 1,
    gte: 1,
    lt: 1,
    lte: 1,
    eq: 2,
    neq: 2,
    in: 3,
    notIn: 3,
    startsWith: 4,
    contains: 5,
  };
  return ranks[operator];
}

export function orderPredicates(filters: FilterConfig[]) {
  return [...filters].sort(
    (first, second) => getSelectivityRank(first.operator) - getSelectivityRank(second.operator),
  );
}

/** Converts flat UI filters into a normalised root AND group, with optional OR children. */
export function buildFilterAst(filters: FilterConfig[]): FilterGroup {
  const enabledFilters = filters.filter((filter) => filter.enabled);
  const andChildren = orderPredicates(enabledFilters.filter((filter) => filter.group !== 'OR'));
  const orChildren = orderPredicates(enabledFilters.filter((filter) => filter.group === 'OR'));

  return {
    type: 'AND',
    children:
      orChildren.length > 0 ? [...andChildren, { type: 'OR', children: orChildren }] : andChildren,
  };
}

export function optimiseFilterAst(node: FilterGroup | FilterConfig): FilterGroup | FilterConfig {
  if (!isFilterGroup(node)) return node;
  const children = node.children.map(optimiseFilterAst);
  return {
    type: node.type,
    children: children.sort((first, second) => {
      const firstRank = isFilterGroup(first) ? 6 : getSelectivityRank(first.operator);
      const secondRank = isFilterGroup(second) ? 6 : getSelectivityRank(second.operator);
      return firstRank - secondRank;
    }),
  };
}

export function evaluateGroup(stock: Stock, node: FilterGroup | FilterConfig): boolean {
  if (!isFilterGroup(node)) return createPredicate(node)(stock);
  return node.type === 'AND'
    ? node.children.every((child) => evaluateGroup(stock, child))
    : node.children.some((child) => evaluateGroup(stock, child));
}

export function filterStocksWithMetrics(
  stocks: Stock[],
  filters: FilterConfig[],
): FilterExecutionResult {
  const start = performance.now();
  const ast = optimiseFilterAst(buildFilterAst(filters)) as FilterGroup;
  const data =
    ast.children.length === 0 ? stocks : stocks.filter((stock) => evaluateGroup(stock, ast));
  return { data, executionTimeMs: performance.now() - start };
}

export function filterStocks(stocks: Stock[], filters: FilterConfig[]): Stock[] {
  return filterStocksWithMetrics(stocks, filters).data;
}

/** Executes the complete parse, optimise, filter, stable-sort, and paginate pipeline. */
export function executeFilterPipeline(
  stocks: Stock[],
  filters: FilterConfig[],
  options: FilterPipelineOptions = {},
): FilterPipelineResult {
  const filtered = filterStocksWithMetrics(stocks, filters);
  const { sortConfig, page, pageSize } = options;
  const sorted =
    sortConfig?.field && sortConfig.direction
      ? sortStocks(filtered.data, sortConfig.field, sortConfig.direction)
      : filtered.data;
  const data =
    page !== undefined && pageSize !== undefined ? paginateStocks(sorted, page, pageSize) : sorted;
  return { data, total: sorted.length, executionTimeMs: filtered.executionTimeMs };
}

export function filterStocksByAst(stocks: Stock[], root: FilterGroup) {
  const optimisedRoot = optimiseFilterAst(root) as FilterGroup;
  return stocks.filter((stock) => evaluateGroup(stock, optimisedRoot));
}

/** Explicit index tie-breaker keeps output stable even in runtimes without stable native sort. */
export function sortStocks(
  stocks: Stock[],
  field: keyof Stock,
  direction: NonNullable<SortConfig['direction']>,
) {
  const multiplier = direction === 'asc' ? 1 : -1;
  return stocks
    .map((stock, index) => ({ stock, index }))
    .sort((first, second) => {
      const firstValue = toComparableValue(first.stock[field]);
      const secondValue = toComparableValue(second.stock[field]);
      if (firstValue === secondValue) return first.index - second.index;
      return (firstValue > secondValue ? 1 : -1) * multiplier;
    })
    .map(({ stock }) => stock);
}

export function paginateStocks(stocks: Stock[], page: number, pageSize: number) {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const start = (safePage - 1) * safePageSize;
  return stocks.slice(start, start + safePageSize);
}
