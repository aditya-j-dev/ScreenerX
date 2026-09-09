# PulseScreener

PulseScreener is a real-time Indian-equity stock screener built with Next.js, React, and TypeScript. It combines a 5,000-stock simulated universe, virtualized filtering and sorting, live WebSocket price ticks, and an interactive technical-analysis chart.

> This project uses simulated market data for engineering demonstration only. It is not financial advice.

## Highlights

- 5,000 deterministic mock stocks with sectors, fundamentals, market data, and technical fields.
- 30+ screening criteria, presets, predicate reordering, and short-circuit filtering.
- A two-axis virtualized grid with pinned columns, resizing, sorting, keyboard navigation, and conditional formatting.
- A live-price WebSocket simulator with animation-frame batching and jittered exponential reconnect delays.
- Candlestick charts with SMA, EMA, Bollinger Bands, RSI, Volume Profile, multiple timeframes, PNG export, and drawing tools.
- Offline shell support and an IndexedDB stock-universe cache.
- 130 automated tests with 80.49% line coverage and 72.39% function coverage.

<!-- ## Screenshots

Screenshots are intentionally deferred and will be added before submission. -->

## Architecture

```text
Next.js App Router
|
|- src/app/page.tsx and src/app/screener/page.tsx
|  `- Screener
|     |- useStockData -> React Query -> GET /api/stocks
|     |- useRealtimeUpdates -> ws://localhost:3001
|     |- FilterPanel -> Zustand active filters
|     |- StockTable -> TanStack Table + row/column virtualization
|     `- StockChart -> Lightweight Charts
|
|- Zustand store
|  |- filters, sorting, selection, watchlist, connection state
|  `- symbol-keyed live prices
|
`- WebSocket simulator (server/ws-server.ts)
   `- price bursts -> requestAnimationFrame batch -> live-price cells
```

1. `useStockData` loads `/api/stocks`, caches it in React Query, and persists it to IndexedDB.
2. `FilterPanel` and `StockTable` update shared filtering, sorting, watchlist, and selection state in Zustand.
3. `Screener` memoizes the filtered and sorted list.
4. The WebSocket hook batches ticks once per animation frame. Each `LivePriceCell` subscribes only to its own symbol.
5. Selecting a row focuses its chart and updates only the latest candle, preserving pan and zoom.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed component responsibilities and design decisions.

## Quick start

### Requirements

- Node.js 20 or newer
- npm

### Development

```bash
git clone <your-repository-url>
cd ScreenerX-main
npm install
npm run dev
```

`npm run dev` starts the Next.js app and WebSocket simulator. Open [http://localhost:3000](http://localhost:3000).

### Run services separately

```bash
# Terminal 1
npm run dev:web

# Terminal 2
npm run dev:ws
```

### Production-style local run

Keep `npm run dev:ws` running in one terminal, then run:

```bash
npm run build
npm start
```

## Environment variables

The WebSocket address defaults to `ws://localhost:3001`; no environment file is needed for local development.

To use another compatible server, create `.env.local`:

```bash
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

Restart the Next.js server after changing environment variables.

## Available scripts

| Script                  | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `npm run dev`           | Start the web app and WebSocket simulator together. |
| `npm run dev:web`       | Start only the Next.js development server.          |
| `npm run dev:ws`        | Start only the WebSocket simulator.                 |
| `npm run build`         | Create a production build.                          |
| `npm start`             | Serve the production build.                         |
| `npm run typecheck`     | Validate TypeScript without emitting files.         |
| `npm run lint`          | Run configured ESLint checks.                       |
| `npm test`              | Run the automated test suite.                       |
| `npm run test:watch`    | Run tests in watch mode.                            |
| `npm run test:coverage` | Run tests and create the coverage summary.          |

Storybook is not installed. It is an optional Day 7.3 enhancement, not a required runtime script.

## Technology decisions and trade-offs

| Choice                   | Why                                                               | Trade-off                                           |
| ------------------------ | ----------------------------------------------------------------- | --------------------------------------------------- |
| Next.js App Router       | Routes, API endpoints, and integrated tooling.                    | More framework complexity than a small SPA.         |
| Zustand + Immer          | Compact shared streaming and UI state, including `Map` and `Set`. | Requires selector discipline.                       |
| React Query              | Fetched-data caching and loading/error lifecycle.                 | Adds a second state category beside Zustand.        |
| TanStack Table + Virtual | Customizable large-data grid without rendering every row/column.  | More implementation work than a prebuilt grid.      |
| Lightweight Charts       | Canvas-focused financial charting.                                | Controls, indicators, and drawings are custom work. |
| WebSocket simulator      | Demonstrates real-time behavior without a data vendor.            | Data is simulated, not exchange-backed.             |
| Vitest + Testing Library | Fast unit, component, and workflow tests.                         | Browser end-to-end testing remains future work.     |

## Verification

```bash
npm run typecheck
npm run test:coverage
```

The suite contains 130 tests and enforces 70% minimum coverage for lines, statements, functions, and branches. The compact result is saved to `coverage/coverage-summary.json`.

## Known limitations and future improvements

- Prices and historical candles are simulated; a real deployment needs a licensed market-data provider.
- The service worker needs explicit cache versioning and update policies for deployment.
- Lighthouse and long-scroll verification should be repeated in production mode on the deployment target.
- Add Storybook/Chromatic visual regression coverage as optional Day 7.3 work.
- Add browser-level end-to-end tests for chart gestures, service-worker upgrades, and reconnect behavior.

<!-- - Add final product screenshots and a hosted deployment link before submission. -->

## Project documentation

- [Architecture](./ARCHITECTURE.md)
- [Performance report](./PERFORMANCE_REPORT.md)
- [Errata](./ERRATA.md)
