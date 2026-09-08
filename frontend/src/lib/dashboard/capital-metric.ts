import type { StatDelta } from '@/components/dashboard/stat-tile'

/**
 * Anything measured month by month: a point with a month and some numbers on it.
 *
 * Kept this loose because every screen wants the same tile — the latest month, what it was
 * before, and the line under it — and none of them wants to write that three times.
 */
export interface MonthlyPoint {
  month: string
  [key: string]: string | number
}

/** How many months a tile's own line draws. The card is a glance; the chart below is the history. */
export const TILE_MONTHS = 4

/** Past ten times over, a ratio has stopped being a comparison and started being a curiosity. */
const MAX_MEANINGFUL_SHARE = 10

/**
 * One comparison under a tile's number: how much it moved, and by what share of what it was.
 *
 * The amount leads because an amount is always true. A percentage is only shown when its
 * base makes one mean something — a base of zero, of the opposite sign, or so small that
 * any change reads as hundreds of percent, describes the base rather than the change.
 */
export function comparison(
  current: number,
  previous: number,
  goodDirection: 'up' | 'down',
  label: string,
  format: (value: number) => string,
): StatDelta {
  const change = current - previous
  const share = previous > 0 ? change / previous : undefined
  return {
    change: format(Math.abs(change)),
    percent: share !== undefined && Math.abs(share) <= MAX_MEANINGFUL_SHARE ? share : undefined,
    direction: Math.abs(change) < 0.005 ? 'flat' : change > 0 ? 'up' : 'down',
    goodDirection,
    label,
  }
}

export interface MetricLabels {
  lastMonth: string
  sinceMonth: (month: string) => string
}

/**
 * A tile's number, its line, and the two comparisons that make the number mean something:
 * against the month before, and against the first month the line beside it draws — so both
 * are answerable from the tile itself rather than from the period on the filter bar.
 */
export function capitalMetric(
  points: MonthlyPoint[],
  metric: string,
  goodDirection: 'up' | 'down',
  labels: MetricLabels,
  format: (value: number) => string,
): { current: number; sparkline: number[]; deltas: StatDelta[] } {
  const values = points.map((point) => point[metric] as number)
  const current = values.at(-1) ?? 0
  const sparkline = values.slice(-TILE_MONTHS)
  const firstDrawn = values.length - sparkline.length

  const deltas: StatDelta[] = []
  if (values.length >= 2) deltas.push(comparison(current, values[values.length - 2], goodDirection, labels.lastMonth, format))
  // With only two months drawn, the line starts where last month is: one comparison, said once.
  if (values.length >= 3) {
    deltas.push(comparison(current, values[firstDrawn], goodDirection, labels.sinceMonth(points[firstDrawn].month), format))
  }

  return { current, sparkline, deltas }
}
