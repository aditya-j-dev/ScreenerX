function compact(value: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(value);
}

export function formatPriceINR(value: number) {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatVolume(value: number) {
  if (value >= 10_000_000) return `${compact(value / 10_000_000)}Cr`;
  if (value >= 100_000) return `${compact(value / 100_000)}L`;
  if (value >= 1_000) return `${compact(value / 1_000)}K`;
  return compact(value);
}

export function formatMarketCap(valueInCrores: number) {
  if (valueInCrores >= 100_000) return `${compact(valueInCrores / 100_000)}L Cr`;
  if (valueInCrores >= 1_000) return `${compact(valueInCrores / 1_000)}K Cr`;
  return `${compact(valueInCrores)} Cr`;
}

export function getRsiTone(value: number) {
  if (value < 30) return 'oversold';
  if (value > 70) return 'overbought';
  return 'neutral';
}
