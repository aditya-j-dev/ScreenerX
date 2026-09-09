'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { OfflineServiceWorker } from '@/components/OfflineServiceWorker';
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 300000 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <OfflineServiceWorker />
      {children}
    </QueryClientProvider>
  );
}
