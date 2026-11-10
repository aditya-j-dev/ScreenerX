'use client';

import { useMemo, useState } from 'react';
import { SCREENER_PRESETS } from '@/lib/presets';
import { useStockStore } from '@/stores/stockStore';
import type { FilterConfig, FilterField } from '@/types/stock';

type Category = 'Fundamentals' | 'Market Data' | 'Classification' | 'Technical' | 'Custom';
type RangeDefinition = {
  field: FilterField;
  label: string;
  category: Category;
  minimum: number;
  maximum: number;
  step: number;
};

export const RANGE_FILTERS: RangeDefinition[] = [
  {
    field: 'marketCap',
    label: 'Market Cap Range (Cr)',
    category: 'Fundamentals',
    minimum: 0,
    maximum: 5000000,
    step: 100,
  },
  { field: 'pe', label: 'P/E', category: 'Fundamentals', minimum: -100, maximum: 500, step: 0.1 },
  { field: 'pb', label: 'P/B', category: 'Fundamentals', minimum: 0, maximum: 100, step: 0.1 },
  {
    field: 'dividendYield',
    label: 'Dividend Yield (%)',
    category: 'Fundamentals',
    minimum: 0,
    maximum: 25,
    step: 0.1,
  },
  { field: 'eps', label: 'EPS', category: 'Fundamentals', minimum: -500, maximum: 5000, step: 0.1 },
  {
    field: 'roe',
    label: 'ROE (%)',
    category: 'Fundamentals',
    minimum: -100,
    maximum: 200,
    step: 0.1,
  },
  {
    field: 'roce',
    label: 'ROCE (%)',
    category: 'Fundamentals',
    minimum: -100,
    maximum: 200,
    step: 0.1,
  },
  {
    field: 'debtToEquity',
    label: 'Debt/Equity',
    category: 'Fundamentals',
    minimum: 0,
    maximum: 15,
    step: 0.1,
  },
  {
    field: 'currentRatio',
    label: 'Current Ratio',
    category: 'Fundamentals',
    minimum: 0,
    maximum: 20,
    step: 0.1,
  },
  {
    field: 'promoterHolding',
    label: 'Promoter Holding (%)',
    category: 'Fundamentals',
    minimum: 0,
    maximum: 100,
    step: 1,
  },
  {
    field: 'revenueGrowthYoY',
    label: 'Revenue Growth (%)',
    category: 'Fundamentals',
    minimum: -100,
    maximum: 500,
    step: 1,
  },
  {
    field: 'profitGrowthYoY',
    label: 'Profit Growth (%)',
    category: 'Fundamentals',
    minimum: -100,
    maximum: 1000,
    step: 1,
  },
  {
    field: 'lastPrice',
    label: 'Last Traded Price',
    category: 'Market Data',
    minimum: 0,
    maximum: 500000,
    step: 1,
  },
  {
    field: 'week52HighProximity',
    label: 'Distance Below 52-Week High (%)',
    category: 'Market Data',
    minimum: 0,
    maximum: 100,
    step: 0.1,
  },
  {
    field: 'week52LowProximity',
    label: 'Distance Above 52-Week Low (%)',
    category: 'Market Data',
    minimum: 0,
    maximum: 100,
    step: 0.1,
  },
  {
    field: 'avgVolume20D',
    label: 'Average Volume (20D)',
    category: 'Market Data',
    minimum: 0,
    maximum: 100000000,
    step: 1000,
  },
  { field: 'beta', label: 'Beta', category: 'Market Data', minimum: -2, maximum: 5, step: 0.01 },
  {
    field: 'changePercent',
    label: 'Day Change (%)',
    category: 'Market Data',
    minimum: -20,
    maximum: 20,
    step: 0.1,
  },
  { field: 'rsi14', label: 'RSI (14)', category: 'Technical', minimum: 0, maximum: 100, step: 1 },
  {
    field: 'atr',
    label: 'Average True Range (ATR)',
    category: 'Technical',
    minimum: 0,
    maximum: 500,
    step: 0.1,
  },
];

export const MULTI_FILTERS = [
  {
    field: 'sector',
    label: 'Sectors',
    options: [
      'IT',
      'Banking',
      'Pharma',
      'Auto',
      'FMCG',
      'Metal',
      'Energy',
      'Realty',
      'Telecom',
      'Infrastructure',
      'Media',
      'Others',
    ],
  },
  {
    field: 'industry',
    label: 'Industries',
    options: [
      'Private Bank',
      'Public Bank',
      'NBFC',
      'Software',
      'IT Services',
      'Semiconductors',
      'Pharmaceuticals',
      'Biotech',
      'Consumer Goods',
      'Food Products',
      'Automobiles',
      'Auto Components',
      'Steel',
      'Aluminium',
      'Mining',
      'Oil & Gas',
      'Renewables',
      'Power',
      'Real Estate',
      'REIT',
      'Telecom Services',
      'Entertainment',
      'Broadcasting',
      'Construction',
      'Engineering',
      'Chemicals',
      'Textiles',
      'Paper',
      'Diversified',
    ],
  },
  {
    field: 'marketCapCategory',
    label: 'Market Cap Categories',
    options: ['Large Cap', 'Mid Cap', 'Small Cap', 'Micro Cap'],
  },
  {
    field: 'indexMembership',
    label: 'Indices',
    options: ['NIFTY 50', 'NIFTY Next 50', 'NIFTY Midcap 100', 'NIFTY Smallcap 250', 'BSE Sensex'],
  },
] satisfies Array<{ field: FilterField; label: string; options: string[] }>;

export const SINGLE_FILTERS = [
  {
    field: 'macdSignal',
    label: 'MACD Signal',
    options: ['Bullish Crossover', 'Bearish Crossover', 'Neutral'],
  },
  { field: 'priceVsSma50', label: 'Price vs SMA 50', options: ['Above', 'Below'] },
  { field: 'priceVsSma200', label: 'Price vs SMA 200', options: ['Above', 'Below'] },
  {
    field: 'bollingerPosition',
    label: 'Bollinger Position',
    options: ['Above Upper', 'Within Bands', 'Below Lower'],
  },
  { field: 'volumeVsAvg', label: 'Volume vs 20D Average', options: ['Below', 'Above', '2x', '3x'] },
] satisfies Array<{ field: FilterField; label: string; options: string[] }>;

export const BOOLEAN_FILTERS = [
  { field: 'watchlist', label: 'Watchlist Only' },
  { field: 'recentlyUpdated', label: 'Recently Updated' },
] satisfies Array<{ field: FilterField; label: string }>;

function useFilterActions() {
  const active = useStockStore((state) => state.activeFilters);
  const add = useStockStore((state) => state.addFilter);
  const remove = useStockStore((state) => state.removeFilter);
  const replace = (field: FilterField, filter?: FilterConfig) => {
    // A preset may use a legacy ID. Replace all criteria for this control's field.
    active
      .filter((item) => item.field === field && item.id !== filter?.id)
      .forEach((item) => remove(item.id));
    if (filter) add(filter);
  };
  return { active, remove, replace };
}

export function FilterPanel({
  matchingCount,
  totalCount,
  onClose,
}: {
  matchingCount: number;
  totalCount: number;
  onClose?: () => void;
}) {
  const { active, remove } = useFilterActions();
  const clear = useStockStore((state) => state.clearAllFilters);
  const applyPreset = useStockStore((state) => state.applyPreset);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Record<Category, boolean>>({
    Fundamentals: true,
    'Market Data': true,
    Classification: true,
    Technical: true,
    Custom: true,
  });
  const activeCount = active.filter((filter) => filter.enabled).length;
  const matchesSearch = (label: string) => label.toLowerCase().includes(search.toLowerCase());

  if (collapsed)
    return (
      <aside
        id="filter-panel"
        tabIndex={-1}
        className="w-14 rounded-xl border border-neutral-800 bg-neutral-900 p-2"
      >
        <button type="button" aria-label="Expand filters" onClick={() => setCollapsed(false)}>
          Filters ({activeCount})
        </button>
      </aside>
    );

  return (
    <aside
      id="filter-panel"
      tabIndex={-1}
      className="w-full max-w-80 shrink-0 rounded-xl border border-neutral-800 bg-neutral-900 shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-400/70"
    >
      <div className="flex items-start justify-between border-b border-neutral-800 p-4">
        <div>
          <h2 className="font-bold text-white">
            Filters{' '}
            <span
              aria-label={`${activeCount} active filters`}
              className="rounded-full bg-emerald-500/15 px-2 text-emerald-300"
            >
              {activeCount}
            </span>
          </h2>
          <p className="mt-1 text-xs text-neutral-400" role="status">
            Showing {matchingCount.toLocaleString()} of {totalCount.toLocaleString()} stocks
          </p>
        </div>
        <button
          type="button"
          aria-label={onClose ? 'Close filters' : 'Collapse filters'}
          onClick={onClose ?? (() => setCollapsed(true))}
          className="rounded p-1 text-neutral-400"
        >
          Close
        </button>
      </div>
      <div className="max-h-[calc(100vh-170px)] space-y-3 overflow-y-auto p-3">
        <input
          aria-label="Search filters"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search filters..."
          className="w-full rounded-lg border border-neutral-700 bg-black px-3 py-2 text-xs text-white"
        />
        {active.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-live="polite">
            {active.map((filter) => (
              <span
                key={filter.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-950/60 px-2 text-[11px] text-emerald-300"
              >
                <span className="truncate">
                  {filter.field}: {filter.operator}{' '}
                  {Array.isArray(filter.value) ? filter.value.join(' - ') : String(filter.value)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(filter.id)}
                  aria-label={`Remove ${filter.field} filter`}
                >
                  Remove
                </button>
              </span>
            ))}
          </div>
        )}
        {(
          ['Fundamentals', 'Market Data', 'Classification', 'Technical', 'Custom'] as Category[]
        ).map((category) => (
          <section key={category} className="rounded-lg border border-neutral-800 bg-black/30">
            <button
              type="button"
              aria-expanded={open[category]}
              onClick={() => setOpen((current) => ({ ...current, [category]: !current[category] }))}
              className="flex w-full justify-between px-3 py-2 text-xs font-semibold text-neutral-200"
            >
              <span>{category}</span>
              <span>{open[category] ? '-' : '+'}</span>
            </button>
            {open[category] && (
              <div className="space-y-3 border-t border-neutral-800 p-2">
                {RANGE_FILTERS.filter(
                  (item) => item.category === category && matchesSearch(item.label),
                ).map((item) => (
                  <RangeFilter key={item.field} {...item} />
                ))}
                {category === 'Classification' &&
                  MULTI_FILTERS.filter((item) => matchesSearch(item.label)).map((item) => (
                    <MultiSelectFilter key={item.field} {...item} />
                  ))}
                {category === 'Technical' &&
                  SINGLE_FILTERS.filter((item) => matchesSearch(item.label)).map((item) => (
                    <SingleSelectFilter key={item.field} {...item} />
                  ))}
                {category === 'Custom' && (
                  <>
                    {BOOLEAN_FILTERS.filter((item) => matchesSearch(item.label)).map((item) => (
                      <BooleanFilter key={item.field} {...item} />
                    ))}
                    <p className="text-xs text-neutral-400">Presets</p>
                    <div className="flex flex-wrap gap-1">
                      {SCREENER_PRESETS.map((preset) => (
                        <button
                          type="button"
                          key={preset.name}
                          onClick={() => applyPreset(preset.filters)}
                          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300"
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        ))}
        <button
          type="button"
          onClick={clear}
          disabled={active.length === 0}
          className="w-full rounded border border-red-500/30 bg-red-950/30 px-2 py-1.5 text-xs text-red-400 disabled:opacity-40"
        >
          Clear All Filters
        </button>
      </div>
    </aside>
  );
}

function RangeFilter({ field, label, minimum, maximum, step }: RangeDefinition) {
  const { active, replace } = useFilterActions();
  const selected = active.find((filter) => filter.field === field && filter.enabled);
  let lower: number | undefined;
  let upper: number | undefined;
  if (selected) {
    if (selected.operator === 'between' && Array.isArray(selected.value))
      [lower, upper] = selected.value as number[];
    else if (typeof selected.value === 'number') {
      if (['gte', 'gt', 'eq'].includes(selected.operator)) lower = selected.value;
      if (['lte', 'lt', 'eq'].includes(selected.operator)) upper = selected.value;
    }
  }
  const update = (bound: 'minimum' | 'maximum', value: string) => {
    const parsed = value === '' ? undefined : Number(value);
    if (parsed !== undefined && !Number.isFinite(parsed)) return;
    let nextLower = bound === 'minimum' ? parsed : lower;
    let nextUpper = bound === 'maximum' ? parsed : upper;
    if (nextLower !== undefined && nextUpper !== undefined && nextLower > nextUpper) {
      // Keep handles ordered without silently swapping their roles.
      if (bound === 'minimum') nextLower = nextUpper;
      else nextUpper = nextLower;
    }
    if (nextLower === undefined && nextUpper === undefined) {
      replace(field);
      return;
    }
    replace(field, {
      id: String(field),
      field,
      enabled: true,
      operator:
        nextLower !== undefined && nextUpper !== undefined
          ? 'between'
          : nextLower !== undefined
            ? 'gte'
            : 'lte',
      value:
        nextLower !== undefined && nextUpper !== undefined
          ? [nextLower, nextUpper]
          : (nextLower ?? nextUpper)!,
    });
  };
  const inputClass =
    'min-w-0 w-full rounded border border-neutral-700 bg-black px-2 py-1 text-xs text-white';
  return (
    <fieldset data-filter-field={field} className="space-y-1">
      <legend className="text-xs font-medium text-neutral-300">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-neutral-400">
          Min
          <input
            aria-label={`${label} minimum`}
            type="number"
            step="any"
            value={lower ?? ''}
            placeholder="Min"
            onChange={(event) => update('minimum', event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-[10px] text-neutral-400">
          Max
          <input
            aria-label={`${label} maximum`}
            type="number"
            step="any"
            value={upper ?? ''}
            placeholder="Max"
            onChange={(event) => update('maximum', event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <div className="relative h-6">
        <input
          aria-label={`${label} minimum slider`}
          type="range"
          min={Math.min(minimum, lower ?? minimum)}
          max={Math.max(maximum, upper ?? maximum)}
          step={step}
          value={lower ?? minimum}
          onChange={(event) => update('minimum', event.target.value)}
          className="pointer-events-none absolute inset-0 w-full accent-emerald-400 [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
          style={{ zIndex: (lower ?? minimum) >= (upper ?? maximum) ? 2 : 1 }}
        />
        <input
          aria-label={`${label} maximum slider`}
          type="range"
          min={Math.min(minimum, lower ?? minimum)}
          max={Math.max(maximum, upper ?? maximum)}
          step={step}
          value={upper ?? maximum}
          onChange={(event) => update('maximum', event.target.value)}
          className="pointer-events-none absolute inset-0 w-full accent-emerald-400 [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
        />
      </div>
    </fieldset>
  );
}

function MultiSelectFilter({
  field,
  label,
  options,
}: {
  field: FilterField;
  label: string;
  options: string[];
}) {
  const { active, replace } = useFilterActions();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const value = active.find((filter) => filter.field === field && filter.enabled)?.value;
  const selected = Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? [value]
      : [];
  const visible = useMemo(
    () => options.filter((option) => option.toLowerCase().includes(query.toLowerCase())),
    [options, query],
  );
  const toggle = (option: string) => {
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];
    replace(
      field,
      next.length
        ? { id: String(field), field, operator: 'in', value: next, enabled: true }
        : undefined,
    );
  };
  return (
    <div data-filter-field={field}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`${label}: ${selected.length} selected`}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full justify-between rounded border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300"
      >
        <span>{label}</span>
        <span>{selected.length || 'Any'}</span>
      </button>
      {expanded && (
        <div className="mt-1 rounded border border-neutral-700 bg-neutral-900 p-2">
          <input
            aria-label={`Search ${label}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mb-2 w-full rounded bg-black px-2 py-1 text-xs text-white"
          />
          <div className="max-h-40 overflow-auto">
            {visible.map((option) => (
              <label key={option} className="flex items-center gap-2 py-1 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={() => toggle(option)}
                />
                {option}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SingleSelectFilter({
  field,
  label,
  options,
}: {
  field: FilterField;
  label: string;
  options: string[];
}) {
  const { active, replace } = useFilterActions();
  const selected = active.find((filter) => filter.field === field && filter.enabled)?.value;
  return (
    <fieldset data-filter-field={field}>
      <legend className="text-xs font-medium text-neutral-300">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-1 text-xs text-neutral-300">
            <input
              type="radio"
              name={String(field)}
              checked={Array.isArray(selected) ? selected[0] === option : selected === option}
              onChange={() =>
                replace(field, {
                  id: String(field),
                  field,
                  operator:
                    field === 'volumeVsAvg' && ['Above', '2x'].includes(option) ? 'in' : 'eq',
                  value:
                    field === 'volumeVsAvg' && option === 'Above'
                      ? ['Above', '2x', '3x']
                      : field === 'volumeVsAvg' && option === '2x'
                        ? ['2x', '3x']
                        : option,
                  enabled: true,
                })
              }
            />
            {option}
          </label>
        ))}
        <button
          type="button"
          onClick={() => replace(field)}
          disabled={selected === undefined}
          className="text-xs text-neutral-400"
        >
          Any
        </button>
      </div>
    </fieldset>
  );
}

function BooleanFilter({ field, label }: { field: FilterField; label: string }) {
  const { active, replace } = useFilterActions();
  const enabled = active.some(
    (filter) => filter.field === field && filter.enabled && filter.value === true,
  );
  return (
    <button
      data-filter-field={field}
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() =>
        replace(
          field,
          enabled
            ? undefined
            : { id: String(field), field, operator: 'eq', value: true, enabled: true },
        )
      }
      className="flex w-full items-center justify-between rounded border border-neutral-700 px-2 py-1.5 text-xs text-neutral-300"
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={`relative h-4 w-8 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-neutral-700'}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  );
}
