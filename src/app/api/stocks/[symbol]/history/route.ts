import { NextResponse } from 'next/server';
import { generateMockStocks, generateHistory } from '@/lib/mockData';

export async function GET(_: Request, { params }: { params: { symbol: string } }) {
  const stock = generateMockStocks(5000).find((s) => s.symbol === params.symbol);
  if (!stock)
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Stock not found' } },
      { status: 404 },
    );
  return NextResponse.json({
    success: true,
    data: generateHistory(stock),
    meta: {
      total: 252,
      page: 1,
      pageSize: 252,
      timestamp: new Date().toISOString(),
      executionTimeMs: 0,
    },
  });
}
