import { NextResponse } from 'next/server';
import { generateMockStocks } from '@/lib/mockData';

let cache: { data: ReturnType<typeof generateMockStocks>; timestamp: number } | null = null;
export async function GET() {
  const start = performance.now();
  if (!cache || Date.now() - cache.timestamp > 300000)
    cache = { data: generateMockStocks(5000), timestamp: Date.now() };
  return NextResponse.json({
    success: true,
    data: cache.data,
    meta: {
      total: cache.data.length,
      page: 1,
      pageSize: 5000,
      timestamp: new Date().toISOString(),
      executionTimeMs: +(performance.now() - start).toFixed(2),
    },
  });
}
