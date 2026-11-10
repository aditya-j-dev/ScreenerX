import { WebSocket, WebSocketServer } from 'ws';
import { generateMockStocks } from '../src/lib/mockData';
import {
  combineSectorShock,
  gaussianRandom,
  marketHoursVolatilityMultiplier,
  simulateNextPrice,
} from '../src/lib/priceSimulator';
import type { Stock } from '../src/types/stock';

type SimulationStock = Pick<Stock, 'symbol' | 'sector' | 'lastPrice' | 'previousClose' | 'beta'>;
type Options = {
  port?: number;
  updateIntervalMs?: number;
  stocks?: SimulationStock[];
  random?: () => number;
  now?: () => number;
  maxBufferedBytes?: number;
};

export function readSimulatorConfig(env: Record<string, string | undefined>) {
  const port = Number(env.WS_PORT ?? 3001);
  const updateIntervalMs = Number(env.WS_UPDATE_INTERVAL_MS ?? 2000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new RangeError('WS_PORT must be an integer from 1 to 65535');
  if (!Number.isFinite(updateIntervalMs) || updateIntervalMs < 50)
    throw new RangeError('WS_UPDATE_INTERVAL_MS must be at least 50');
  return { port, updateIntervalMs };
}

/** One wall-clock tick is a compressed simulated market step, dt=1/252 (not two real trading seconds). */
export function createPriceSimulationServer(options: Options = {}) {
  const {
    port = 3001,
    updateIntervalMs = 2000,
    random = Math.random,
    now = Date.now,
    maxBufferedBytes = 1024 * 1024,
  } = options;
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new RangeError('Invalid WebSocket port');
  if (!Number.isFinite(updateIntervalMs) || updateIntervalMs < 50)
    throw new RangeError('Update interval must be at least 50ms');
  if (!Number.isFinite(maxBufferedBytes) || maxBufferedBytes <= 0)
    throw new RangeError('Invalid buffer limit');
  const startedAt = now();
  const stocks = (options.stocks ?? generateMockStocks(5000)).map((stock) => {
    if (
      !Number.isFinite(stock.lastPrice) ||
      stock.lastPrice <= 0 ||
      !Number.isFinite(stock.previousClose) ||
      stock.previousClose <= 0 ||
      !Number.isFinite(stock.beta)
    )
      throw new RangeError('Invalid stock simulation data');
    return {
      ...stock,
      price: stock.lastPrice,
      volatility: Math.max(0.01, stock.beta * 0.015),
      nextUpdateAt: startedAt + random() * updateIntervalMs,
    };
  });
  const wss = new WebSocketServer({ port });
  const schedulerTickMs = Math.min(250, Math.max(10, Math.floor(updateIntervalMs / 4)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let listening = false;
  let nextTickAt = startedAt;
  let closing: Promise<void> | undefined;

  function broadcast(message: string) {
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (client.bufferedAmount > maxBufferedBytes) {
        client.terminate();
        continue;
      }
      try {
        client.send(message, (error) => {
          if (error) client.terminate();
        });
      } catch {
        client.terminate();
      }
    }
  }
  function tick() {
    if (stopped) return;
    const timestamp = now();
    const sectorShocks = new Map<string, number>();
    const multiplier = marketHoursVolatilityMultiplier(new Date(timestamp));
    for (const stock of stocks) {
      if (stock.nextUpdateAt > timestamp) continue;
      let sectorShock = sectorShocks.get(stock.sector);
      if (sectorShock === undefined) {
        sectorShock = gaussianRandom(random);
        sectorShocks.set(stock.sector, sectorShock);
      }
      stock.price = simulateNextPrice(
        stock.price,
        stock.volatility * multiplier,
        0.0001,
        1 / 252,
        combineSectorShock(sectorShock, 0.6, gaussianRandom(random)),
      );
      const interval = updateIntervalMs * (0.75 + random() * 0.5);
      stock.nextUpdateAt += interval;
      // Drop missed ticks after a stall; do not accumulate timer drift or replay a burst.
      if (stock.nextUpdateAt <= timestamp) stock.nextUpdateAt = timestamp + interval;
      const change = stock.price - stock.previousClose;
      broadcast(
        JSON.stringify({
          symbol: stock.symbol,
          price: stock.price,
          change,
          changePercent: (change / stock.previousClose) * 100,
          timestamp,
        }),
      );
    }
    nextTickAt += schedulerTickMs;
    if (nextTickAt <= now()) nextTickAt = now() + schedulerTickMs;
    timer = setTimeout(tick, Math.max(0, nextTickAt - now()));
  }
  wss.on('connection', (client) => {
    // A socket error is local to this client; it must not crash the simulator.
    client.on('error', () => client.terminate());
  });
  const ready = new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => reject(error);
    wss.once('error', fail);
    wss.once('listening', () => {
      listening = true;
      wss.off('error', fail);
      nextTickAt = now();
      tick();
      resolve();
    });
  });
  wss.on('error', (error) => {
    // Startup failures are reported by the CLI through ready's rejection.
    if (listening && !stopped) console.error('Simulator server error:', error.message);
  });
  return {
    wss,
    ready,
    close(): Promise<void> {
      if (closing) return closing;
      stopped = true;
      if (timer) clearTimeout(timer);
      const socketClosures = [...wss.clients].map(
        (client) =>
          new Promise<void>((resolve) => {
            if (client.readyState === WebSocket.CLOSED) {
              resolve();
              return;
            }
            client.once('close', () => resolve());
            client.terminate();
          }),
      );
      closing = Promise.all([
        ...socketClosures,
        new Promise<void>((resolve) => {
          wss.close(() => resolve());
        }),
      ]).then(() => undefined);
      return closing;
    },
  };
}
