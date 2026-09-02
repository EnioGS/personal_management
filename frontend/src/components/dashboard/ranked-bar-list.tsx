import type { CSSProperties } from 'react'
import { colorForKey } from '@/components/charts/chart-colors'

export interface RankedBarItem {
  key: string
  label: string
  value: number
}

interface RankedBarListProps {
  items: RankedBarItem[]
  valueFormatter: (value: number) => string
  emptyLabel: string
}

/**
 * Label + bar + value + share, sorted descending — the replacement for a category
 * pie (PLAN.md §7): readable well past the ~5 slices a pie stays legible at, sortable,
 * self-labelling, no legend needed, and immune to a pie's small-container geometry
 * problems. Color still follows the entity (colorForKey), just as a bar fill instead
 * of a slice.
 */
export function RankedBarList({ items, valueFormatter, emptyLabel }: RankedBarListProps) {
  if (items.length === 0) {
    return <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{emptyLabel}</p>
  }

  const sorted = [...items].sort((a, b) => b.value - a.value)
  const total = sorted.reduce((sum, item) => sum + item.value, 0)
  const max = Math.max(...sorted.map((item) => Math.max(item.value, 0)), 1)

  return (
    <div className="flex h-full flex-col gap-2.5 overflow-y-auto">
      {sorted.map((item) => {
        const color = colorForKey(item.key)
        const share = total > 0 ? (item.value / total) * 100 : 0
        return (
          <div key={item.key} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 truncate" title={item.label}>
              {item.label || '—'}
            </span>
            <div className="bg-muted h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
              <div
                className="entity-fill h-full rounded-full"
                style={{ width: `${(Math.max(item.value, 0) / max) * 100}%`, '--entity-light': color.light, '--entity-dark': color.dark } as CSSProperties}
              />
            </div>
            <span className="w-20 shrink-0 text-right tabular-nums">{valueFormatter(item.value)}</span>
            <span className="text-muted-foreground w-10 shrink-0 text-right tabular-nums">{share.toFixed(0)}%</span>
          </div>
        )
      })}
    </div>
  )
}
