import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMockStocks } from '../lib/mockData';

const indexedDb = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
  createObjectStore: vi.fn(),
  openDB: vi.fn(),
}));

vi.mock('idb', () => ({
  openDB: indexedDb.openDB,
}));

import { cacheStockUniverse, getCachedStockUniverse } from '../lib/stockCache';

describe('stock universe cache', () => {
  beforeEach(() => {
    indexedDb.put.mockReset();
    indexedDb.get.mockReset();
    indexedDb.createObjectStore.mockReset();
    indexedDb.openDB.mockImplementation(async (_name, _version, options) => {
      options.upgrade({
        objectStoreNames: { contains: () => false },
        createObjectStore: indexedDb.createObjectStore,
      });
      return { put: indexedDb.put, get: indexedDb.get };
    });
  });

  it('creates the cache store, saves the universe, and restores a cached universe', async () => {
    const stocks = generateMockStocks(2);
    await cacheStockUniverse(stocks);
    expect(indexedDb.createObjectStore).toHaveBeenCalledWith('stock-universe');
    expect(indexedDb.put).toHaveBeenCalledWith(
      'stock-universe',
      expect.objectContaining({ stocks }),
      'latest',
    );

    indexedDb.get.mockResolvedValueOnce({ stocks });
    await expect(getCachedStockUniverse()).resolves.toEqual(stocks);
  });

  it('returns undefined when no cached universe exists', async () => {
    indexedDb.get.mockResolvedValueOnce(undefined);
    await expect(getCachedStockUniverse()).resolves.toBeUndefined();
  });
});
