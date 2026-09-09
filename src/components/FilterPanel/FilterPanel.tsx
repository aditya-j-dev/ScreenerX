'use client';

import { useMemo, useState } from 'react';
import { SCREENER_PRESETS } from '@/lib/presets';
import { useStockStore } from '@/stores/stockStore';
import type { FilterConfig, Stock } from '@/types/stock';

type BasicFilterDefinition = {
  field: keyof Stock;
  label: string;
  type: 'number' | 'select';
  operator?: FilterConfig['operator'];
  options?: string[];
};
type MultiSelectDefinition = { field: keyof Stock; label: string; options: string[] };

const basicDefinitions: BasicFilterDefinition[] = [
  { field: 'pe', label: 'P/E Max', type: 'number', operator: 'lte' },
  { field: 'pb', label: 'P/B Max', type: 'number', operator: 'lte' },
  { field: 'dividendYield', label: 'Div Yield % Min', type: 'number', operator: 'gte' },
  { field: 'eps', label: 'EPS Min', type: 'number', operator: 'gte' },
  { field: 'roe', label: 'ROE % Min', type: 'number', operator: 'gte' },
  { field: 'roce', label: 'ROCE % Min', type: 'number', operator: 'gte' },
  { field: 'debtToEquity', label: 'Debt/Equity Max', type: 'number', operator: 'lte' },
  { field: 'currentRatio', label: 'Current Ratio Min', type: 'number', operator: 'gte' },
  { field: 'promoterHolding', label: 'Promoter % Min', type: 'number', operator: 'gte' },
  { field: 'revenueGrowthYoY', label: 'Rev Growth % Min', type: 'number', operator: 'gte' },
  { field: 'profitGrowthYoY', label: 'Profit Growth % Min', type: 'number', operator: 'gte' },
  { field: 'lastPrice', label: 'LTP Min', type: 'number', operator: 'gte' },
  { field: 'avgVolume20D', label: '20D Volume Min', type: 'number', operator: 'gte' },
  { field: 'beta', label: 'Beta Max', type: 'number', operator: 'lte' },
  { field: 'rsi14', label: 'RSI Min', type: 'number', operator: 'gte' },
  {
    field: 'marketCapCategory',
    label: 'Cap Category',
    type: 'select',
    options: ['Large Cap', 'Mid Cap', 'Small Cap', 'Micro Cap'],
  },
  { field: 'priceVsSma50', label: 'vs SMA 50', type: 'select', options: ['Above', 'Below'] },
  { field: 'priceVsSma200', label: 'vs SMA 200', type: 'select', options: ['Above', 'Below'] },
  {
    field: 'bollingerPosition',
    label: 'Bollinger Position',
    type: 'select',
    options: ['Above Upper', 'Within Bands', 'Below Lower'],
  },
];

const multiSelectDefinitions: MultiSelectDefinition[] = [
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
      'Automobiles',
      'Auto Components',
      'Construction',
      'Engineering',
      'Chemicals',
      'Textiles',
    ],
  },
  {
    field: 'indexMembership',
    label: 'Indices',
    options: ['NIFTY 50', 'NIFTY Next 50', 'NIFTY Midcap 100', 'NIFTY Smallcap 250', 'BSE Sensex'],
  },
];

function useFilterActions() {
  return {
    add: useStockStore((state) => state.addFilter),
    remove: useStockStore((state) => state.removeFilter),
    active: useStockStore((state) => state.activeFilters),
  };
}

function includesSearch(label: string, search: string) {
  return !search || label.toLowerCase().includes(search.toLowerCase());
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
  const { add, remove, active } = useFilterActions();
  const clear = useStockStore((state) => state.clearAllFilters);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    Fundamentals: true,
    'Market Data': true,
    Classification: true,
    Technical: true,
    Custom: true,
  });
  const basicBySection = (fields: Array<keyof Stock>) =>
    basicDefinitions.filter(
      (definition) => fields.includes(definition.field) && includesSearch(definition.label, search),
    );
  const toggleSection = (section: string) =>
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  const applyPreset = (filters: Omit<FilterConfig, 'enabled'>[]) => {
    clear();
    filters.forEach((filter) => add({ ...filter, enabled: true }));
  };

  if (collapsed)
    return (
      <aside
        id="filter-panel"
        tabIndex={-1}
        className="w-14 shrink-0 rounded-xl border border-slate-800 bg-slate-900 p-2 shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Expand filters"
          aria-label="Expand filters"
          className="flex w-full flex-col items-center gap-2 rounded-lg px-1 py-3 text-cyan-300 hover:bg-slate-800"
        >
          <span className="text-lg">🎛️</span>
          <span className="rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-bold">
            {active.length}
          </span>
        </button>
      </aside>
    );

  return (
    <aside
      id="filter-panel"
      tabIndex={-1}
      className="w-full max-w-80 shrink-0 rounded-xl border border-slate-800 bg-slate-900 shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
    >
      <div className="flex items-start justify-between border-b border-slate-800 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <span>🎛️</span> Filters{' '}
            <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs font-semibold text-cyan-300">
              {active.length}
            </span>
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Showing{' '}
            <span className="font-semibold text-cyan-300">{matchingCount.toLocaleString()}</span> of{' '}
            {totalCount.toLocaleString()} stocks
          </p>
        </div>
        <button
          type="button"
          onClick={onClose ?? (() => setCollapsed(true))}
          title={onClose ? 'Close filters' : 'Collapse filters'}
          aria-label={onClose ? 'Close filters' : 'Collapse filters'}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          {onClose ? '✕' : '‹'}
        </button>
      </div>
      <div className="max-h-[calc(100vh-170px)] space-y-3 overflow-y-auto p-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search filters..."
          aria-label="Search filters"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
        />
        {active.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-slate-800 pb-3">
            {active.map((filter) => (
              <span
                key={filter.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-950/60 px-2 py-0.5 text-[11px] text-cyan-300"
              >
                <span className="truncate">
                  {filter.field}:{' '}
                  {Array.isArray(filter.value) ? filter.value.join(' - ') : String(filter.value)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(filter.id)}
                  aria-label={`Remove ${filter.field} filter`}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <AccordionSection
          title="Fundamentals"
          open={openSections.Fundamentals}
          onToggle={() => toggleSection('Fundamentals')}
        >
          <div className="grid grid-cols-2 gap-2">
            {basicBySection([
              'pe',
              'pb',
              'dividendYield',
              'eps',
              'roe',
              'roce',
              'debtToEquity',
              'currentRatio',
              'promoterHolding',
              'revenueGrowthYoY',
              'profitGrowthYoY',
            ]).map((definition) => (
              <BasicFilter key={String(definition.field)} definition={definition} />
            ))}
          </div>
        </AccordionSection>
        <AccordionSection
          title="Market Data"
          open={openSections['Market Data']}
          onToggle={() => toggleSection('Market Data')}
        >
          <div className="space-y-2">
            <RangeFilter
              field="marketCap"
              label="Market Cap Range (Cr)"
              minimum={50}
              maximum={2_000_000}
              step={1_000}
            />
            {basicBySection(['lastPrice', 'avgVolume20D', 'beta']).map((definition) => (
              <BasicFilter key={String(definition.field)} definition={definition} />
            ))}
          </div>
        </AccordionSection>
        <AccordionSection
          title="Classification"
          open={openSections.Classification}
          onToggle={() => toggleSection('Classification')}
        >
          <div className="space-y-2">
            {multiSelectDefinitions
              .filter((definition) => includesSearch(definition.label, search))
              .map((definition) => (
                <MultiSelectFilter key={String(definition.field)} {...definition} />
              ))}
            {basicBySection(['marketCapCategory']).map((definition) => (
              <BasicFilter key={String(definition.field)} definition={definition} />
            ))}
          </div>
        </AccordionSection>
        <AccordionSection
          title="Technical"
          open={openSections.Technical}
          onToggle={() => toggleSection('Technical')}
        >
          <div className="space-y-2">
            <SingleSelectFilter
              field="macdSignal"
              label="MACD Signal"
              options={['Bullish Crossover', 'Bearish Crossover', 'Neutral']}
            />
            {basicBySection(['rsi14', 'priceVsSma50', 'priceVsSma200', 'bollingerPosition']).map(
              (definition) => (
                <BasicFilter key={String(definition.field)} definition={definition} />
              ),
            )}
          </div>
        </AccordionSection>
        <AccordionSection
          title="Custom"
          open={openSections.Custom}
          onToggle={() => toggleSection('Custom')}
        >
          <div className="space-y-2">
            <BooleanFilter field="watchlist" label="Watchlist Only" />
            <BooleanFilter field="recentlyUpdated" label="Recently Updated" />
            <div className="border-t border-slate-800 pt-2">
              <p className="mb-1 text-[11px] font-medium text-slate-400">Presets</p>
              <div className="flex flex-wrap gap-1">
                {SCREENER_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.name}
                    onClick={() => applyPreset(preset.filters)}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-300 hover:border-cyan-500 hover:text-cyan-300"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={clear}
              disabled={active.length === 0}
              className="w-full rounded border border-red-500/30 bg-red-950/30 px-2 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear All Filters
            </button>
          </div>
        </AccordionSection>
      </div>
    </aside>
  );
}

function AccordionSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/30">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800/60"
      >
        <span>{title}</span>
        <span className="text-cyan-300">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="border-t border-slate-800 p-2">{children}</div>}
    </section>
  );
}

function RangeFilter({
  field,
  label,
  minimum,
  maximum,
  step,
}: {
  field: keyof Stock;
  label: string;
  minimum: number;
  maximum: number;
  step: number;
}) {
  const { add, remove, active } = useFilterActions();
  const id = `${String(field)}-range`;
  const range = active.find((filter) => filter.id === id && filter.operator === 'between')
    ?.value as number[] | undefined;
  const selectedMinimum = range?.[0] ?? minimum;
  const selectedMaximum = range?.[1] ?? maximum;
  const update = (nextMinimum: number, nextMaximum: number) => {
    remove(String(field));
    add({
      id,
      field,
      operator: 'between',
      value: [Math.min(nextMinimum, nextMaximum), Math.max(nextMinimum, nextMaximum)],
      enabled: true,
    });
  };
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-slate-300">{label}</legend>
      <div className="flex gap-1">
        <input
          aria-label={`${label} minimum`}
          type="number"
          value={range?.[0] ?? ''}
          placeholder={String(minimum)}
          onChange={(event) => {
            if (!event.target.value) {
              remove(id);
              return;
            }
            update(Number(event.target.value), selectedMaximum);
          }}
          className="min-w-0 w-1/2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
        />
        <input
          aria-label={`${label} maximum`}
          type="number"
          value={range?.[1] ?? ''}
          placeholder={String(maximum)}
          onChange={(event) => {
            if (!event.target.value) {
              remove(id);
              return;
            }
            update(selectedMinimum, Number(event.target.value));
          }}
          className="min-w-0 w-1/2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
        />
      </div>
      <input
        aria-label={`${label} minimum slider`}
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={selectedMinimum}
        onChange={(event) => update(Number(event.target.value), selectedMaximum)}
        className="mt-1 w-full accent-cyan-400"
      />
      <input
        aria-label={`${label} maximum slider`}
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={selectedMaximum}
        onChange={(event) => update(selectedMinimum, Number(event.target.value))}
        className="w-full accent-cyan-400"
      />
      <p className="text-[10px] text-slate-400">
        {selectedMinimum.toLocaleString('en-IN')} to {selectedMaximum.toLocaleString('en-IN')} Cr
      </p>
    </fieldset>
  );
}

function MultiSelectFilter({ field, label, options }: MultiSelectDefinition) {
  const { add, remove, active } = useFilterActions();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const id = `${String(field)}-multi`;
  const selected = (active.find((filter) => filter.id === id)?.value as string[] | undefined) ?? [];
  const visibleOptions = useMemo(
    () => options.filter((option) => option.toLowerCase().includes(query.toLowerCase())),
    [options, query],
  );
  const toggle = (option: string) => {
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];
    if (next.length === 0) remove(id);
    else add({ id, field, operator: 'in', value: next, enabled: true });
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center justify-between rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-left text-xs text-slate-300 hover:border-cyan-500"
      >
        <span>{label}</span>
        <span className="text-cyan-300">{selected.length || 'Any'} ▾</span>
      </button>
      {expanded && (
        <div className="absolute z-30 mt-1 w-full rounded border border-slate-700 bg-slate-900 p-2 shadow-xl">
          <input
            aria-label={`Search ${label}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search..."
            className="mb-2 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
          />
          <div className="max-h-40 space-y-1 overflow-auto">
            {visibleOptions.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={() => toggle(option)}
                  className="accent-cyan-400"
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
  field: keyof Stock;
  label: string;
  options: string[];
}) {
  const { add, remove, active } = useFilterActions();
  const id = `${String(field)}-single`;
  const selected = active.find((filter) => filter.id === id)?.value;
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-slate-300">{label}</legend>
      <div className="space-y-1">
        {options.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-300"
          >
            <input
              type="radio"
              name={id}
              checked={selected === option}
              onChange={() => add({ id, field, operator: 'eq', value: option, enabled: true })}
              className="accent-cyan-400"
            />
            {option}
          </label>
        ))}
        <button
          type="button"
          onClick={() => remove(id)}
          disabled={!selected}
          className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-30"
        >
          Any
        </button>
      </div>
    </fieldset>
  );
}

function BooleanFilter({ field, label }: { field: keyof Stock; label: string }) {
  const { add, remove, active } = useFilterActions();
  const id = `${String(field)}-boolean`;
  const enabled = active.some((filter) => filter.id === id && filter.value === true);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => {
        if (enabled) remove(id);
        else add({ id, field, operator: 'eq', value: true, enabled: true });
      }}
      className="flex w-full items-center justify-between rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-left text-xs text-slate-300 hover:border-cyan-500"
    >
      <span>{label}</span>
      <span className={`relative h-4 w-8 rounded-full ${enabled ? 'bg-cyan-500' : 'bg-slate-700'}`}>
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  );
}

function BasicFilter({ definition }: { definition: BasicFilterDefinition }) {
  const { add, remove, active } = useFilterActions();
  const selected = active.find((filter) => filter.id === String(definition.field));
  return (
    <label className="flex flex-col text-xs text-slate-400">
      <span className="truncate font-medium text-slate-300">{definition.label}</span>
      {definition.type === 'number' ? (
        <input
          type="number"
          value={selected ? (selected.value as number) : ''}
          placeholder="Value"
          onChange={(event) => {
            if (!event.target.value) {
              remove(String(definition.field));
              return;
            }
            add({
              id: String(definition.field),
              field: definition.field,
              operator: definition.operator ?? 'gte',
              value: Number(event.target.value),
              enabled: true,
            });
          }}
          className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white placeholder-slate-600"
        />
      ) : (
        <select
          value={String(selected?.value ?? '')}
          onChange={(event) => {
            if (!event.target.value) {
              remove(String(definition.field));
              return;
            }
            add({
              id: String(definition.field),
              field: definition.field,
              operator: 'eq',
              value: event.target.value,
              enabled: true,
            });
          }}
          className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
        >
          <option value="">Any</option>
          {definition.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}
