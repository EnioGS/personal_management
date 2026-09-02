import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatTileProps {
  label: string
  value: string
  /** A small colored dot echoing the value's chart series, so the tile and its chart read as one thing. */
  indicatorColor?: string
  tone?: 'default' | 'positive' | 'negative'
  icon?: ReactNode
}

/**
 * A single headline number — the dataviz skill's answer to "the data is a single
 * current value": a stat tile, not a one-bar chart. Several of these in a row is a
 * KPI row (see dashboard-filters usage in finances-panels.tsx).
 */
export function StatTile({ label, value, indicatorColor, tone = 'default', icon }: StatTileProps) {
  return (
    <div className="bg-card flex flex-1 flex-col gap-1 rounded-lg border p-3">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {indicatorColor && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: indicatorColor }} />}
        {icon}
        {label}
      </div>
      <p
        className={cn(
          'text-lg font-medium tabular-nums',
          tone === 'positive' && 'text-foreground',
          tone === 'negative' && 'text-destructive',
        )}
      >
        {value}
      </p>
    </div>
  )
}
