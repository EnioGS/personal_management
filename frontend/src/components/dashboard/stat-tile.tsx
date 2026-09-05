import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Sparkline } from './sparkline'

export interface StatDelta {
  /** The change itself, in the tile's own unit, already formatted and unsigned. */
  change: string
  /** Fraction, e.g. 0.124 for 12.4% — left out when the base makes a percentage meaningless. */
  percent?: number
  direction: 'up' | 'down' | 'flat'
  /** What the comparison is against — a delta with no referent is noise. */
  label: string
  /** Which direction of movement is good for this metric (rising spend is bad; rising balance is good). */
  goodDirection: 'up' | 'down'
}

interface StatTileProps {
  label: string
  value: string
  /** A small colored dot echoing the value's chart series, so the tile and its chart read as one thing. */
  indicatorColor?: string
  tone?: 'default' | 'positive' | 'negative'
  icon?: ReactNode
  /** Comparisons under the number, in reading order: the nearest one first. */
  deltas?: StatDelta[]
  /** Recent period values, oldest first — rendered as a trend line, not a chart. */
  sparkline?: number[]
}

function formatPercent(value: number): string {
  return `${(Math.abs(value) * 100).toFixed(0)}%`
}

const ARROW = { up: '▲', down: '▼', flat: '=' } as const

/**
 * A single headline number — the dataviz skill's answer to "the data is a single
 * current value": a stat tile, not a one-bar chart. Several of these in a row is a
 * KPI row (see PLAN.md §3.4 and dashboard-filters usage in finances-panels.tsx).
 */
export function StatTile({ label, value, indicatorColor, tone = 'default', icon, deltas, sparkline }: StatTileProps) {
  return (
    <div className="bg-card flex flex-1 flex-col gap-1 rounded-lg border p-3">
      <div className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase">
        {indicatorColor && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: indicatorColor }} />}
        {icon}
        {label}
      </div>
      <p
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tone === 'positive' && 'text-brand',
          tone === 'negative' && 'text-destructive',
        )}
      >
        {value}
      </p>
      {deltas && deltas.length > 0 && (
        <div className="flex flex-col gap-0.5 text-[11px] leading-tight">
          {deltas.map((delta) => (
            <p key={delta.label} className="flex items-baseline gap-1">
              <span
                className={cn(
                  'shrink-0 font-medium tabular-nums',
                  delta.direction === 'flat' ? 'text-muted-foreground'
                  : delta.direction === delta.goodDirection ? 'text-brand'
                  : 'text-destructive',
                )}
              >
                {ARROW[delta.direction]} {delta.change}
                {delta.percent !== undefined && <span className="font-normal"> · {formatPercent(delta.percent)}</span>}
              </span>
              <span className="text-muted-foreground truncate">{delta.label}</span>
            </p>
          ))}
        </div>
      )}
      {sparkline && sparkline.length >= 2 && (
        <div className="mt-auto pt-1">
          <Sparkline values={sparkline} color={indicatorColor ?? 'var(--brand)'} />
        </div>
      )}
    </div>
  )
}
