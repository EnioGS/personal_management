export interface Extent {
  min: number
  max: number
}

/**
 * Two Y axes for one chart, each scaled to its own numbers, their zeros in line.
 *
 * A running total in the tens of thousands and a month's flows in the thousands do not
 * share a scale usefully: on one axis the smaller is drawn in a sliver while half the
 * chart stands empty. Two axes fix that and introduce a worse problem — two zero lines a
 * centimetre apart read as one line and quietly lie about every value near them — so the
 * axis with less below zero is stretched down until both zeros sit at the same height.
 *
 * Stretching rather than shrinking: an axis is never made to clip the values it carries.
 */
export function alignedDomains(totals: Extent, flows: Extent): { totals: [number, number]; flows: [number, number] } {
  const share = Math.max(negativeShare(totals), negativeShare(flows))
  return { totals: domainFor(totals, share), flows: domainFor(flows, share) }
}

/** How much of an axis's height sits below zero, from 0 to 1. */
export function negativeShare({ min, max }: Extent): number {
  const span = max - min
  return span === 0 ? 0 : -min / span
}

function domainFor({ min, max }: Extent, share: number): [number, number] {
  if (share <= 0 || share >= 1 || max <= 0) return [min, max]
  return [-(share * max) / (1 - share), max]
}

/** The lowest and highest any of these series reaches, zero always included. */
export function extentOf(rows: Record<string, unknown>[], keys: string[]): Extent {
  const values = rows.flatMap((row) => keys.map((key) => row[key]).filter((value): value is number => typeof value === 'number'))
  return { min: Math.min(0, ...values), max: Math.max(0, ...values) }
}
