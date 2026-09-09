import { render, renderHook, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  combineSectorShock,
  gaussianRandom,
  marketHoursVolatilityMultiplier,
  simulateNextPrice,
} from '../lib/priceSimulator';
import { FeatureErrorBoundary } from '../components/ErrorBoundary';
import { OfflineServiceWorker } from '../components/OfflineServiceWorker';
import { Providers } from '../components/Providers';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

describe('price simulation utilities', () => {
  it('produces finite gaussian values and bounded price steps', () => {
    expect(Number.isFinite(gaussianRandom(() => 0.5))).toBe(true);
    expect(simulateNextPrice(100, 0.02, 0.0001, 1 / 252, -100)).toBeGreaterThanOrEqual(0.1);
    expect(combineSectorShock(1, 0.6, 0)).toBeCloseTo(0.6);
  });

  it('uses the documented NSE market-hour multipliers', () => {
    expect(marketHoursVolatilityMultiplier(new Date('2024-01-01T04:00:00Z'))).toBe(1.6); // 09:30 IST
    expect(marketHoursVolatilityMultiplier(new Date('2024-01-01T07:00:00Z'))).toBe(0.7); // 12:30 IST
    expect(marketHoursVolatilityMultiplier(new Date('2024-01-01T15:00:00Z'))).toBe(1); // 20:30 IST
  });
});

describe('application infrastructure components', () => {
  afterEach(() => vi.restoreAllMocks());

  it('updates the network-status hook from browser online and offline events', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(true);
    act(() => window.dispatchEvent(new Event('offline')));
    expect(result.current).toBe(false);
    act(() => window.dispatchEvent(new Event('online')));
    expect(result.current).toBe(true);
  });

  it('registers the service worker and provides query context to children', () => {
    const register = vi.fn(() => Promise.resolve({}));
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } });
    render(
      <>
        <OfflineServiceWorker />
        <Providers>
          <span>Ready</span>
        </Providers>
      </>,
    );
    expect(register).toHaveBeenCalledWith('/sw.js');
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('shows a recovery message when a feature throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const BrokenFeature = () => {
      throw new Error('boom');
    };
    render(
      <FeatureErrorBoundary>
        <BrokenFeature />
      </FeatureErrorBoundary>,
    );
    expect(screen.getByText(/This feature failed to render/)).toBeInTheDocument();
    expect(error).toHaveBeenCalled();
  });
});
