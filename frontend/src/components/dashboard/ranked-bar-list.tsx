import { useEffect, useState, type CSSProperties } from 'react'
import { ChevronRight } from 'lucide-react'
import { colorForKey, colorForRank, tintedColor, type ThemedColor } from '@/components/charts/chart-colors'
import { cn } from '@/lib/utils'

export interface RankedBarItem {
  key: string
  label: string
  value: number
  /** Change against a contextual comparison window, expressed as a fraction. */
  comparison?: number
  /** What this one is made of — revealed by clicking it, in the roomier variant. */
  children?: RankedBarItem[]
  /**
   * The entity's own colour, where it has one.
   *
   * A rank colour is right for a list of things with nothing in common but their size. It
   * is wrong for a list whose members already belong to something the reader knows the
   * colour of — a holding is fixed income or variable income before it is the third-largest
   * of anything, and drawing it by rank makes the list argue with the chart above it. The
   * children keep it and fade, so a group stays one colour as it opens.
   */
  color?: ThemedColor
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
      {sorted.map((item, rank) => {
        if (variant === 'underlined') {
          return (
            <UnderlinedRow
              key={item.key}
              item={item}
              color={item.color ?? colorForRank(rank)}
              share={Math.max(0, item.value) / max}
              rank={rank}
              valueFormatter={valueFormatter}
            />
          )
        }

        const color = item.color ?? colorForKey(item.key)
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

/** How far a child's track is inset from its parent's: the rule, plus the padding after it. */
const CHILD_INDENT_PX = 13

/**
 * A row of the roomier variant, and whatever it is made of.
 *
 * The breakdown is folded away rather than absent: a category is the question most of
 * the time, and its subcategories are the follow-up. Opening one indents its parts under
 * it, in shades of the category's own colour — they belong to it, so they are not given
 * hues of their own.
 *
 * A part's bar ends where its share of the category's bar ends, never further: a
 * subcategory holding all of its category draws a bar finishing exactly under the
 * category's, which is what "all of it" looks like. The indent makes that arithmetic
 * rather than a proportion — the child's track is `CHILD_INDENT_PX` shorter than the
 * parent's, so the same fraction of it would overshoot — hence the `calc`, which takes
 * the fraction of the parent's bar and then gives back the indent the child never had.
 */
function UnderlinedRow({ item, color, share, rank, valueFormatter }: {
  item: RankedBarItem
  color: ThemedColor
  /** How much of this row's own track the bar fills, from 0 to 1. */
  share: number
  /** Its place in the list, which is what staggers the bars as they grow. */
  rank: number
  valueFormatter: (value: number) => string
}) {
  const [open, setOpen] = useState(false)
  const comparison = formatComparison(item.comparison)
  const children = item.children ?? []

  const childWidth = (value: number): string => {
    const fraction = item.value > 0 ? Math.min(1, Math.max(0, value) / item.value) : 0
    return `calc(${(fraction * share * 100).toFixed(3)}% - ${(fraction * (1 - share) * CHILD_INDENT_PX).toFixed(2)}px)`
  }

  const row = (
    <div className="grid grid-cols-[minmax(0,1fr)_5rem_3.5rem] items-start gap-x-2 text-xs">
      <div className="min-w-0">
        <span className="flex items-center gap-1 leading-4">
          {children.length > 0 && (
            <ChevronRight className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')} aria-hidden />
          )}
          <span className="min-w-0 break-words" title={item.label}>{item.label || '—'}</span>
        </span>
        <Bar width={`${(share * 100).toFixed(3)}%`} color={color} delay={rank * GROW_STAGGER_MS} />
      </div>
      <span className="pt-0.5 text-right tabular-nums">{valueFormatter(item.value)}</span>
      <span className={`mr-[5px] pt-0.5 text-right tabular-nums whitespace-nowrap ${comparison.className}`}>{comparison.label}</span>
    </div>
  )

  return (
    <div>
      {children.length > 0 ? (
        <button type="button" className="w-full cursor-pointer text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
          {row}
        </button>
      ) : (
        row
      )}
      {open && children.length > 0 && (
        <div className="mt-3 flex flex-col gap-3 border-l pl-3">
          {children.map((child, rank) => {
            const childComparison = formatComparison(child.comparison)
            return (
              <div key={child.key} className="grid grid-cols-[minmax(0,1fr)_5rem_3.5rem] items-start gap-x-2 text-xs">
                <div className="text-muted-foreground min-w-0">
                  <span className="block min-w-0 break-words leading-4" title={child.label}>{child.label || '—'}</span>
                  <Bar width={childWidth(child.value)} color={tintedColor(color, rank)} delay={rank * GROW_STAGGER_MS} />
                </div>
                <span className="text-muted-foreground pt-0.5 text-right tabular-nums">{valueFormatter(child.value)}</span>
                <span className={`mr-[5px] pt-0.5 text-right tabular-nums whitespace-nowrap ${childComparison.className}`}>
                  {childComparison.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Long enough to be seen as movement, short enough that nobody waits for it. */
const GROW_MS = 380
/** A little apart, so the list fills like a list rather than like one wide bar. */
const GROW_STAGGER_MS = 22
const MAX_STAGGER_MS = 260

/**
 * A bar that draws itself.
 *
 * It grows from nothing on the frame after it mounts — which is the whole trick: mounting
 * is what happens when the panel first renders and when a category is opened, so the parts
 * sliding out from under a category use the same code as the categories themselves, with
 * no state to keep about which of them has been seen.
 *
 * The stagger is per row, capped, so a long list still finishes about when a short one
 * does; and anyone who has asked their system for less motion gets the final width
 * immediately.
 */
function Bar({ width, color, delay = 0 }: { width: string; color: ThemedColor; delay?: number }) {
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="bg-muted mt-1 h-[3px] overflow-hidden rounded-full">
      <div
        className="entity-fill h-full rounded-full transition-[width] ease-out motion-reduce:transition-none"
        style={{
          width: grown ? width : 0,
          transitionDuration: `${GROW_MS}ms`,
          transitionDelay: `${Math.min(delay, MAX_STAGGER_MS)}ms`,
          '--entity-light': color.light,
          '--entity-dark': color.dark,
        } as CSSProperties}
      />
    </div>
  )
}
