/** Standard-normal random number using the Box-Muller transform from PDF Section A4.1. */
export function gaussianRandom(random: () => number = Math.random): number {
  const first = Math.max(random(), Number.EPSILON);
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

/** Geometric-Brownian-motion price step. The optional shock keeps the model easy to test and correlate. */
export function simulateNextPrice(
  currentPrice: number,
  volatility = 0.02,
  drift = 0.0001,
  dt = 1 / 252,
  shock = gaussianRandom(),
): number {
  if (
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    !Number.isFinite(volatility) ||
    volatility < 0 ||
    !Number.isFinite(drift) ||
    !Number.isFinite(dt) ||
    dt <= 0 ||
    !Number.isFinite(shock)
  ) {
    throw new RangeError('Invalid price simulation parameters');
  }
  const exponent = (drift - 0.5 * volatility ** 2) * dt + volatility * Math.sqrt(dt) * shock;
  return Math.max(0.1, currentPrice * Math.exp(exponent));
}

/** Produces a sector-correlated shock while retaining stock-specific movement. */
export function combineSectorShock(
  sectorShock: number,
  sectorCorrelation = 0.6,
  idiosyncraticShock = gaussianRandom(),
): number {
  if (!Number.isFinite(sectorCorrelation) || sectorCorrelation < 0 || sectorCorrelation > 1)
    throw new RangeError('Sector correlation must be between zero and one');
  return (
    Math.sqrt(sectorCorrelation) * sectorShock +
    Math.sqrt(1 - sectorCorrelation) * idiosyncraticShock
  );
}

/** NSE cash-market sessions: volatility is highest in the first and last 30 minutes. */
export function marketHoursVolatilityMultiplier(date = new Date()): number {
  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const weekday = timeParts.find((part) => part.type === 'weekday')?.value;
  if (weekday === 'Sat' || weekday === 'Sun') return 1;
  const hour = Number(timeParts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(timeParts.find((part) => part.type === 'minute')?.value ?? 0);
  const minutesSinceMidnight = hour * 60 + minute;
  const marketOpen = 9 * 60 + 15;
  const marketClose = 15 * 60 + 30;

  if (minutesSinceMidnight >= marketOpen && minutesSinceMidnight < marketOpen + 30) return 1.6;
  if (minutesSinceMidnight >= marketClose - 30 && minutesSinceMidnight < marketClose) return 1.6;
  if (minutesSinceMidnight >= marketOpen && minutesSinceMidnight < marketClose) return 0.7;
  return 1;
}
