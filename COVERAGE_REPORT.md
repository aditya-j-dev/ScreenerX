# Task 7.1 — Test suite and coverage report

Recorded: 10 November 2026. Command: `npm run test:coverage` (Vitest 2.1.9, V8 provider).

**Result: 285 tests passed across all 23 test files; no failures or skips.** The configured aggregate 70% minimum passed in all four categories. TypeScript and lint also passed; lint emitted no warnings.

## Aggregate coverage

| Metric     | Covered / total | Coverage | Minimum |
| ---------- | --------------: | -------: | ------: |
| Lines      |   3,740 / 3,884 |   96.29% |     70% |
| Statements |   3,740 / 3,884 |   96.29% |     70% |
| Functions  |       180 / 209 |   86.12% |     70% |
| Branches   |   1,165 / 1,267 |   91.94% |     70% |

Machine-readable result: [coverage-summary.json](coverage/coverage-summary.json). Run `npm run test:coverage` to regenerate the HTML report at `coverage/index.html`. The JSON summary and this report belong in the repository; generated HTML/assets are ignored by the existing `.gitignore`.

## Coverage scope

The existing configuration includes `src/**/*.{ts,tsx}` and excludes `src/app/**`, `src/types/**`, and test files. These exclusions and the 70% thresholds were not narrowed or lowered. All 22 runtime source files within that scope appear in the report. Server entry points, Next route files, and `public/sw.js` are outside the coverage denominator; server and service-worker behavior still have dedicated tests.

Thresholds are aggregate, not per-file. This is not 96.29% whole-repository coverage. Browser rendering, FPS and end-to-end deployment behavior are not measured by this suite.

## Included source files

| Source                                                                                   |   Lines | Branches | Functions |
| ---------------------------------------------------------------------------------------- | ------: | -------: | --------: |
| [src/components/Chart/StockChart.tsx](src/components/Chart/StockChart.tsx)               |  96.21% |   87.45% |    83.33% |
| [src/components/DataGrid/StockTable.tsx](src/components/DataGrid/StockTable.tsx)         |  94.32% |   90.11% |    75.00% |
| [src/components/ErrorBoundary.tsx](src/components/ErrorBoundary.tsx)                     | 100.00% |  100.00% |   100.00% |
| [src/components/FilterPanel/FilterPanel.tsx](src/components/FilterPanel/FilterPanel.tsx) |  97.66% |   91.53% |    80.76% |
| [src/components/OfflineServiceWorker.tsx](src/components/OfflineServiceWorker.tsx)       |  52.94% |   50.00% |   100.00% |
| [src/components/Providers.tsx](src/components/Providers.tsx)                             | 100.00% |  100.00% |   100.00% |
| [src/components/Screener.tsx](src/components/Screener.tsx)                               |  89.80% |   86.31% |    47.05% |
| [src/hooks/useNetworkStatus.ts](src/hooks/useNetworkStatus.ts)                           | 100.00% |  100.00% |   100.00% |
| [src/hooks/useStockData.ts](src/hooks/useStockData.ts)                                   | 100.00% |   95.00% |   100.00% |
| [src/hooks/useWebSocket.ts](src/hooks/useWebSocket.ts)                                   | 100.00% |   95.45% |   100.00% |
| [src/lib/chartData.ts](src/lib/chartData.ts)                                             | 100.00% |  100.00% |   100.00% |
| [src/lib/chartExport.ts](src/lib/chartExport.ts)                                         | 100.00% |  100.00% |   100.00% |
| [src/lib/filterEngine.ts](src/lib/filterEngine.ts)                                       |  97.39% |   94.49% |    94.11% |
| [src/lib/formatters.ts](src/lib/formatters.ts)                                           | 100.00% |  100.00% |   100.00% |
| [src/lib/gridKeyboard.ts](src/lib/gridKeyboard.ts)                                       | 100.00% |   92.85% |   100.00% |
| [src/lib/indicators.ts](src/lib/indicators.ts)                                           | 100.00% |  100.00% |   100.00% |
| [src/lib/mockData.ts](src/lib/mockData.ts)                                               |  99.45% |   95.55% |   100.00% |
| [src/lib/presets.ts](src/lib/presets.ts)                                                 | 100.00% |  100.00% |   100.00% |
| [src/lib/priceSimulator.ts](src/lib/priceSimulator.ts)                                   |  96.55% |   89.65% |   100.00% |
| [src/lib/stockCache.ts](src/lib/stockCache.ts)                                           | 100.00% |  100.00% |   100.00% |
| [src/lib/virtualGrid.ts](src/lib/virtualGrid.ts)                                         | 100.00% |  100.00% |   100.00% |
| [src/stores/stockStore.ts](src/stores/stockStore.ts)                                     | 100.00% |  100.00% |   100.00% |

## Required test coverage

| Area                                    | Retained evidence                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Utility functions and filter predicates | Filter operators, null handling, formats, keyboard/virtual-grid helpers, mock data, cache, price simulation and chart export/data tests                  |
| Technical indicators                    | SMA, EMA, RSI, Bollinger and volume-profile tests                                                                                                        |
| Components and cell renderers           | StockTable formatting/live updates/watchlist/sorting, FilterPanel controls, StockChart tools/settings, infrastructure and Screener tests                 |
| Real virtualization                     | Real TanStack virtualizer at 5,000, 10,000 and 20,000 records using modeled jsdom viewport geometry; not FPS evidence                                    |
| Complete filter-to-grid integration     | Real Screener + FilterPanel + Zustand + filtering/sorting + StockTable; numeric filter, reset, sort direction, watchlist filter and selected-chart focus |
| Data and transport                      | React Query/cache behavior, WebSocket hooks and six standalone simulator tests                                                                           |

The complete integration test substitutes external data/transport, canvas loading and viewport geometry. Its filter/store/sort/table wiring uses the production components. Real chart rendering logic has its own component tests with a chart API mock; this is not a live-browser E2E test.

## Changes made for 7.1

- Replaced the simplified grid integration fixture with tests through the actual Screener and StockTable.
- Fixed Escape dismissal after clearing the last filter disables the focused button, by keeping dismissal active while the modal is open.
- Hid decorative sort indicators from accessible names so repeated header interactions retain stable button names.
- Regenerated coverage without excluding failing tests or changing thresholds. Previously permission-blocked real WebSocket tests passed in this run.

## Remaining limits

Lower-coverage areas include development service-worker cleanup (52.94% lines) and Screener callbacks (47.05% functions). The aggregate threshold passes; these values are not represented as per-file compliance. The current scope excludes Next route/entry code and the simulator from the coverage percentage. Live browser, production build, accessibility conformance and pending performance measurements retain their separate validation status.

Next: **Task 7.2 — README Documentation**, followed by **Task 7.3 — Storybook (optional)**.
