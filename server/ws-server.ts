import { WebSocket, WebSocketServer } from 'ws';
import { generateMockStocks } from '../src/lib/mockData';
import {
  combineSectorShock,
  gaussianRandom,
  marketHoursVolatilityMultiplier,
  simulateNextPrice,
} from '../src/lib/priceSimulator';

const port = Number(process.env.WS_PORT ?? 3001);
const updateIntervalMs = Number(process.env.WS_UPDATE_INTERVAL_MS ?? 2000);
const schedulerTickMs = Math.min(250, Math.max(50, Math.floor(updateIntervalMs / 4)));
const sectorCorrelation = 0.6;

type SimulatedStock = {
  symbol: string;
  sector: string;
  price: number;
  volatility: number;
  nextUpdateAt: number;
};

const now = Date.now();
const simulatedStocks: SimulatedStock[] = generateMockStocks(5000).map((stock) => ({
  symbol: stock.symbol,
  sector: stock.sector,
  price: stock.lastPrice,
  volatility: Math.max(0.01, stock.beta * 0.015),
  // A random first deadline prevents all 5,000 symbols sending at the same instant.
  nextUpdateAt: now + Math.random() * updateIntervalMs,
}));

const wss = new WebSocketServer({ port });

function broadcast(message: string) {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

function scheduleNextUpdate(stock: SimulatedStock, timestamp: number) {
  // Each instrument averages two seconds, with a small random spread for realistic arrivals.
  stock.nextUpdateAt = timestamp + updateIntervalMs * (0.75 + Math.random() * 0.5);
}

function emitDuePriceUpdates() {
  const timestamp = Date.now();
  const dueStocks = simulatedStocks.filter((stock) => stock.nextUpdateAt <= timestamp);
  if (dueStocks.length === 0) return;

  const sectorShocks = new Map<string, number>();
  const sessionMultiplier = marketHoursVolatilityMultiplier();

  for (const stock of dueStocks) {
    const sectorShock = sectorShocks.get(stock.sector) ?? gaussianRandom();
    sectorShocks.set(stock.sector, sectorShock);
    const shock = combineSectorShock(sectorShock, sectorCorrelation);
    const previousPrice = stock.price;
    const nextPrice = simulateNextPrice(
      previousPrice,
      stock.volatility * sessionMultiplier,
      0.0001,
      1 / 252,
      shock,
    );
    stock.price = nextPrice;
    scheduleNextUpdate(stock, timestamp);

    const change = nextPrice - previousPrice;
    broadcast(
      JSON.stringify({
        symbol: stock.symbol,
        price: nextPrice,
        change,
        changePercent: (change / previousPrice) * 100,
        timestamp,
      }),
    );
  }
}

wss.on('connection', (client) => {
  console.log(`WebSocket client connected (${wss.clients.size} active)`);
  client.on('close', () =>
    console.log(`WebSocket client disconnected (${wss.clients.size} active)`),
  );
});

console.log(
  `WebSocket simulator running on ws://localhost:${port}; mean update interval ${updateIntervalMs}ms per stock`,
);
setInterval(emitDuePriceUpdates, schedulerTickMs);
