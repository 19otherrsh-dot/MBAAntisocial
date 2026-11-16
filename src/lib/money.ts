/**
 * Rupee formatting and banding, shared by the offer API and the pages that
 * render its figures. Pure, so both sides agree and it can be tested alone.
 */

function trim(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.?0+$/, '');
}

/** Compact Indian-system money: 2500000 → "₹25L", 12500000 → "₹1.25Cr", 85000 → "₹85k". */
export function formatInr(value: number): string {
  if (value >= 10_000_000) return `₹${trim(value / 10_000_000, 2)}Cr`;
  if (value >= 100_000) return `₹${trim(value / 100_000, 1)}L`;
  if (value >= 1_000) return `₹${trim(value / 1_000, 0)}k`;
  return `₹${Math.round(value)}`;
}

export interface Band {
  low: number;
  high: number;
}

/**
 * Rounds a figure into a band wide enough to stop it identifying one person:
 * a lakh wide above ₹10L, ₹10k wide above ₹1L, ₹5k below that.
 */
export function toBand(value: number): Band {
  const step = value >= 1_000_000 ? 100_000 : value >= 100_000 ? 10_000 : 5_000;
  const low = Math.floor(value / step) * step;
  return { low, high: low + step };
}

export function formatBand(band: Band): string {
  return `${formatInr(band.low)}–${formatInr(band.high).replace('₹', '')}`;
}
