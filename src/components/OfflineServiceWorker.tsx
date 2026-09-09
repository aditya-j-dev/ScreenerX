'use client';

import { useEffect } from 'react';

/** Registers the app-shell cache; the separately managed IndexedDB cache supplies stock data offline. */
export function OfflineServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  return null;
}
