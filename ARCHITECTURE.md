# Architecture - Real-Time Stock Screener

This document describes the architecture currently implemented in this repository. It separates server data, shared client state, real-time price streaming, and component-local UI state so that each has a clear responsibility.

## Component hierarchy

```
Next.js App Router
|
|- src/app/layout.tsx
|  `- Providers
|     `- TanStack QueryClientProvider
|
|- src/app/page.tsx
|  `- Screener
|     |- useStockData -> React Query -> GET /api/stocks
|     |- useRealtimeUpdates -> WebSocket client -> ws://localhost:3001
|     |- Header (connection status and matching-stock count)
|     |- FilterPanel
|     |- FeatureErrorBoundary -> StockTable -> TanStack Table + TanStack Virtual
|     |- FeatureErrorBoundary -> StockChart
|     `- Summary metrics
|
|- src/app/screener/page.tsx
|  `- Screener
|
`- src/app/[symbol]/page.tsx
   `- Stock-detail route shell
```

## State-management flow

```
                         Server state
GET /api/stocks ---------------------------------> React Query cache
                                                       |
                                                       | stock universe
                                                       v
                                                Screener component
                                                       |
                  +------------------------------------+-----------------------------------+
                  |                                    |                                   |
                  v                                    v                                   v
            FilterPanel                           StockTable                          StockChart


                         Shared client state
FilterPanel / StockTable / Screener <-----------> Zustand store
                                                     - active filters
                                                     - sort configuration
                                                     - selected symbol
                                                     - watchlist (localStorage only)
                                                     - live-price Map
                                                     - connection status


                         Streaming state
WebSocket simulator (ws://localhost:3001) ---> useRealtimeUpdates hook
                                                     |
                                                     | latest tick per symbol,
                                                     | batched with requestAnimationFrame
                                                     v
                                               Zustand live-price Map
                                                     |
                                                     v
                                               StockTable price cells


                         Component-local UI state
StockTable: active row index, help-dialog visibility, price-flash direction
StockChart: timeframe and indicator visibility toggles
```

React Query and Zustand deliberately hold different categories of state. React Query owns the fetched stock universe and its caching lifecycle. Zustand owns interactive state shared across components and the incoming live-price stream. Neither store replaces the other; `Screener` reads both and derives the filtered and sorted stock list.

## Major technology decisions

| Library                           | Chosen for                             | Alternative considered           | Reason for the decision                                                                                                             |
| --------------------------------- | -------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 14 App Router             | Application routes and API routes      | Plain React SPA                  | File-based routes, server-capable API endpoints, and an integrated development workflow.                                            |
| React 18                          | User interface                         | Other UI frameworks              | Component composition, hooks, and broad ecosystem compatibility.                                                                    |
| TypeScript                        | Application contracts                  | JavaScript                       | Makes the stock, filter, sort, and streaming message shapes explicit before data reaches the UI.                                    |
| TanStack Table + TanStack Virtual | Large stock grid                       | AG Grid / an ordinary HTML table | Headless control over the grid plus virtualization so thousands of rows do not become thousands of DOM nodes.                       |
| Zustand + Immer                   | Shared client and live-streaming state | Redux Toolkit                    | Small selector-based store with straightforward immutable updates for the `Map` and `Set` state used by live prices and watchlists. |
| TanStack Query                    | Fetched stock universe                 | SWR / manual fetch state         | Caching, stale-time control, loading states, and retry behaviour without mixing server data into UI state.                          |
| Lightweight Charts                | Financial chart rendering              | Chart.js / Recharts              | Canvas-oriented charting designed for candlesticks and technical overlays.                                                          |
| WebSocket (`ws`)                  | Local real-time price simulation       | Polling                          | Demonstrates connection lifecycle, reconnection, and frequent update batching without requiring a live market-data provider.        |
| Vitest                            | Automated tests                        | Jest                             | Fast TypeScript-friendly test runner that fits this Vite-based test configuration.                                                  |

## Performance decisions

1. The table virtualizes rows and keeps only the visible area plus overscan rows mounted.
2. Filters and sorting are derived with memoization in `Screener`, instead of copying the full stock universe into another state store.
3. The WebSocket hook retains only the latest update for each symbol during an animation frame, then submits the batch once to Zustand.
4. The table tracks price-flash state locally, allowing price movement feedback without making the whole application manage transient animation state.

## Boundaries and responsibilities

| Area                        | Responsibility                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `src/app`                   | Routes, application layout, and API endpoints.                                               |
| `src/components`            | Screen composition and presentational/interactive UI.                                        |
| `src/hooks/useStockData.ts` | Fetches and caches the stock universe through React Query.                                   |
| `src/hooks/useWebSocket.ts` | Connects to the simulator, reconnects with bounded exponential backoff, and batches updates. |
| `src/stores/stockStore.ts`  | Shared filters, selection, sorting, watchlist, connection, and live prices.                  |
| `src/lib`                   | Mock data, filtering, and financial indicator calculations.                                  |
| `server/ws-server.ts`       | Standalone local WebSocket simulation server.                                                |
| `src/types/stock.ts`        | Canonical contracts for stocks, filters, sort settings, and price updates.                   |
