import Link from 'next/link';

interface StockDetailPageProps {
  params: {
    symbol: string;
  };
}

/**
 * Server-rendered stock-detail route shell. Interactive chart/detail behaviour
 * belongs to Day 10; this establishes the App Router route required for Day 1.
 */
export default function StockDetailPage({ params }: StockDetailPageProps) {
  const symbol = params.symbol.toUpperCase();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <section className="max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-400">Stock detail</p>
        <h1 className="mt-2 text-2xl font-bold">{symbol}</h1>
        <p className="mt-3 text-sm text-slate-400">
          The interactive stock-detail chart will be connected in Day 10.
        </p>
        <Link
          className="mt-5 inline-block text-sm font-medium text-cyan-300 hover:text-cyan-200"
          href="/screener"
        >
          Return to screener
        </Link>
      </section>
    </main>
  );
}
