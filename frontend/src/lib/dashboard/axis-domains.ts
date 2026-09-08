export interface Extent {
  min: number
  max: number
}

/**
 * What a chart's Y axis should span.
 *
 * The lowest value drawn to the highest, rather than the furthest from zero in both
 * directions. On this chart a month's flows never fall as far as the running totals rise,
 * so a domain mirrored about zero would leave the whole bottom half empty and squeeze
 * everything else into what was left of the top.
 *
 * Zero is always in it, because the bars are read against it.
 */

/** The lowest and highest any of these series reaches, zero always included. */
export function extentOf(rows: Record<string, unknown>[], keys: string[]): Extent {
  const values = rows.flatMap((row) => keys.map((key) => row[key]).filter((value): value is number => typeof value === 'number'))
  return { min: Math.min(0, ...values), max: Math.max(0, ...values) }
}
