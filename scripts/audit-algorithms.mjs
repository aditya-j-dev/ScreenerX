// Run: node --import tsx scripts/audit-algorithms.mjs
// Pure functions only: these timings exclude React, layout, paint and network.
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { generateMockStocks, generateHistory } from '../src/lib/mockData.ts';
import { filterStocks, sortStocks } from '../src/lib/filterEngine.ts';
import {
  calculateSMA,
  calculateEMA,
  calculateBollinger,
  calculateRSI,
} from '../src/lib/indicators.ts';

const stocks = generateMockStocks(5000);
const closes = generateHistory(stocks[0], 1260).map((candle) => candle.close);
const broad = [
  ['lastPrice', 'gte', 0],
  ['marketCap', 'gte', 0],
  ['pe', 'gte', -100000],
  ['roe', 'gte', -100000],
  ['volume', 'gte', 0],
].map(([field, operator, value]) => ({ id: field, field, operator, value, enabled: true }));
// Use a null-safe broad P/B criterion so all five predicates visit all 5,000 records.
broad[2] = { id: 'pb', field: 'pb', operator: 'gte', value: -100000, enabled: true };
const selective = [
  ['pe', 'between', [0, 25]],
  ['roe', 'gte', 10],
  ['debtToEquity', 'lte', 2],
  ['lastPrice', 'gte', 100],
  ['sector', 'in', ['IT', 'Banking', 'Pharma']],
].map(([field, operator, value]) => ({ id: field, field, operator, value, enabled: true }));
function measure(name, work) {
  for (let i = 0; i < 20; i++) work();
  const samples = [];
  let result;
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    result = work();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return {
    name,
    resultCount: result.length,
    samples: samples.length,
    medianMs: samples[49],
    p95Ms: samples[94],
    maxMs: samples[99],
  };
}
const results = {
  recordedAt: new Date().toISOString(),
  node: process.version,
  cpu: cpus()[0]?.model,
  environment: 'Node.js local unthrottled; 20 warmups then 100 samples; no React/render cost',
  records: stocks.length,
  measurements: [
    measure('five broad filters', () => filterStocks(stocks, broad)),
    measure('five selective filters', () => filterStocks(stocks, selective)),
    measure('sort marketCap ascending', () => sortStocks(stocks, 'marketCap', 'asc')),
    measure('sort companyName ascending', () => sortStocks(stocks, 'companyName', 'asc')),
    measure('sort nullable pe descending', () => sortStocks(stocks, 'pe', 'desc')),
    measure('default chart indicators over 1260 closes', () => {
      for (const period of [20, 50, 200]) calculateSMA(closes, period);
      for (const period of [12, 26]) calculateEMA(closes, period);
      calculateBollinger(closes, 20, 2);
      return calculateRSI(closes, 14);
    }),
  ],
};
const outputIndex = process.argv.indexOf('--output');
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : 'audit/algorithm-results.json';
if (!output) throw new Error('--output requires a destination path');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
