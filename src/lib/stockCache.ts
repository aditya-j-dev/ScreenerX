import { openDB } from 'idb';
import type { Stock } from '@/types/stock';

const DATABASE_NAME = 'pulse-screener-cache';
const STORE_NAME = 'stock-universe';
const CACHE_KEY = 'latest';

async function getDatabase() {
  return openDB(DATABASE_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    },
  });
}

/** Persists the complete universe locally so the screener can open without a network request. */
export async function cacheStockUniverse(stocks: Stock[]) {
  const database = await getDatabase();
  await database.put(STORE_NAME, { stocks, cachedAt: Date.now() }, CACHE_KEY);
}

/** Returns the last complete cached universe, or nothing if this browser has never loaded the app online. */
export async function getCachedStockUniverse(): Promise<Stock[] | undefined> {
  const database = await getDatabase();
  const cached = (await database.get(STORE_NAME, CACHE_KEY)) as { stocks?: Stock[] } | undefined;
  return cached?.stocks;
}
