import { useState, type CSSProperties } from 'react'
import { ChevronRight } from 'lucide-react'
import { colorForKey } from '@/components/charts/chart-colors'
import { cn } from '@/lib/utils'

export interface RankedBarItem {
  key: string
  label: string
  value: number
  /** Change against a contextual comparison window, expressed as a fraction. */
  comparison?: number
  /** What this one is made of — revealed by clicking it, in the roomier variant. */
  children?: RankedBarItem[]
}

interface RankedBarListProps {
  items: RankedBarItem[]
  valueFormatter: (value: number) => string
  emptyLabel: string
  /** A roomier two-line row for long labels and contextual category comparisons. */
  variant?: 'inline' | 'underlined'
}

/**
 * Label + bar + value + share, sorted descending — the replacement for a category
 * pie (PLAN.md §7): readable well past the ~5 slices a pie stays legible at, sortable,
 * self-labelling, no legend needed, and immune to a pie's small-container geometry
 * problems. Color still follows the entity (colorForKey), just as a bar fill instead
 * of a slice.
 */
export function RankedBarList({ items, valueFormatter, emptyLabel, variant = 'inline' }: RankedBarListProps) {
  if (items.length === 0) {
    return <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{emptyLabel}</p>
  }

  const sorted = [...items].sort((a, b) => b.value - a.value)
  const total = sorted.reduce((sum, item) => sum + item.value, 0)
  const max = Math.max(...sorted.map((item) => Math.max(item.value, 0)), 1)

  return (
    <div className={variant === 'underlined' ? 'flex h-full flex-col gap-3 overflow-y-auto pr-2' : 'flex h-full flex-col gap-2.5 overflow-y-auto'}>
      {sorted.map((item) => {
        if (variant === 'underlined') return <UnderlinedRow key={item.key} item={item} max={max} valueFormatter={valueFormatter} />

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

function formatComparison(comparison: number | undefined): { label: string; className: string } {
  if (comparison === undefined || comparison === 0) return { label: comparison === undefined ? '—' : '▲ 0.0%', className: 'text-muted-foreground' }
  return {
    label: `${comparison >= 0 ? '▲' : '▼'} ${Number.isFinite(comparison) ? `${(Math.abs(comparison) * 100).toFixed(1)}%` : '∞%'}`,
    className: comparison < 0 ? 'text-brand' : 'text-destructive',
  }
}

/**
 * A row of the roomier variant, and whatever it is made of.
 *
 * The breakdown is folded away rather than absent: a category is the question most of
 * the time, and its subcategories are the follow-up. Opening one indents its parts
 * under it and scales their bars against the parent, so the widths read as shares of
 * what was clicked rather than of the panel.
 */
function UnderlinedRow({ item, max, valueFormatter, depth = 0 }: {
  item: RankedBarItem
  max: number
  valueFormatter: (value: number) => string
  depth?: number
}) {
  const [open, setOpen] = useState(false)
  const color = colorForKey(item.key)
  const comparison = formatComparison(item.comparison)
  const children = item.children ?? []
  const childMax = Math.max(...children.map((child) => Math.max(child.value, 0)), 1)

  const row = (
    <div className="grid grid-cols-[minmax(0,1fr)_5rem_3.5rem] items-start gap-x-2 text-xs">
      <div className="min-w-0">
        <span className="flex items-center gap-1 leading-4">
          {children.length > 0 && (
            <ChevronRight className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')} aria-hidden />
          )}
          <span className="min-w-0 break-words" title={item.label}>{item.label || '—'}</span>
        </span>
        <div className="bg-muted mt-1 h-[3px] overflow-hidden rounded-full">
          <div
            className="entity-fill h-full rounded-full"
            style={{ width: `${(Math.max(item.value, 0) / max) * 100}%`, '--entity-light': color.light, '--entity-dark': color.dark } as CSSProperties}
          />
        </div>
      </div>
      <span className="pt-0.5 text-right tabular-nums">{valueFormatter(item.value)}</span>
      <span className={`mr-[5px] pt-0.5 text-right tabular-nums whitespace-nowrap ${comparison.className}`}>{comparison.label}</span>
    </div>
  )

  return (
    <div className={depth > 0 ? 'text-muted-foreground' : undefined}>
      {children.length > 0 ? (
        <button type="button" className="w-full cursor-pointer text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
          {row}
        </button>
      ) : (
        row
      )}
      {open && children.length > 0 && (
        <div className="mt-3 flex flex-col gap-3 border-l pl-3">
          {children.map((child) => (
            <UnderlinedRow key={child.key} item={child} max={childMax} valueFormatter={valueFormatter} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
