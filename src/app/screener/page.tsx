import { Screener } from '@/components/Screener';

/**
 * Dedicated screener route required by the project brief.  The root route remains
 * available as the existing landing entry point and renders the same client UI.
 */
export default function ScreenerPage() {
  return <Screener />;
}
