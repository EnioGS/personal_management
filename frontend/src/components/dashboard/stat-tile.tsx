import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Sparkline } from './sparkline'

export interface StatDelta {
  /** Fraction, e.g. 0.124 for +12.4%. */
  value: number
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
  delta?: StatDelta
  /** Recent period values, oldest first — rendered as a trend line, not a chart. */
  sparkline?: number[]
}

function formatPercent(value: number): string {
  return `${(Math.abs(value) * 100).toFixed(1)}%`
}

/**
 * A single headline number — the dataviz skill's answer to "the data is a single
 * current value": a stat tile, not a one-bar chart. Several of these in a row is a
 * KPI row (see PLAN.md §3.4 and dashboard-filters usage in finances-panels.tsx).
 */
export function StatTile({ label, value, indicatorColor, tone = 'default', icon, delta, sparkline }: StatTileProps) {
  const deltaIsGood = delta && (delta.value >= 0) === (delta.goodDirection === 'up')

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
          tone === 'positive' && 'text-foreground',
          tone === 'negative' && 'text-destructive',
        )}
      >
        {value}
      </p>
      {delta && (
        <p className={cn('text-[11px]', deltaIsGood ? 'text-brand' : 'text-destructive')}>
          {delta.value >= 0 ? '▲' : '▼'} {formatPercent(delta.value)}{' '}
          <span className="text-muted-foreground">{delta.label}</span>
        </p>
      )}
      {sparkline && sparkline.length >= 2 && (
        <div className="mt-auto pt-1">
          <Sparkline values={sparkline} color={indicatorColor ?? 'var(--brand)'} />
        </div>
      )}
    </div>
  )
}
