import type { CSSProperties } from 'react'
import { colorForKey } from '@/components/charts/chart-colors'

export interface NestedBarGroup {
  key: string
  label: string
  /** Signed: an account can be down over the period as easily as up. */
  value: number
  children: { key: string; label: string; value: number }[]
}

interface NestedBarListProps {
  groups: NestedBarGroup[]
  valueFormatter: (value: number) => string
  emptyLabel: string
  /** What a group with nothing under it says in place of its children. */
  childEmptyLabel: string
}

/**
 * A ranked list one level deep: each account, and the cards billed to it beneath.
 *
 * The label sits above its bar rather than beside it — the same shape the spending
 * categories use — because an account called "Nubank - Main account" truncated to a
 * column of fixed width stops identifying anything. Bar width is read off the magnitude,
 * so an account that ended the period down still draws a bar; its number carries the sign.
 */
export function NestedBarList({ groups, valueFormatter, emptyLabel, childEmptyLabel }: NestedBarListProps) {
  if (groups.length === 0) {
    return <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{emptyLabel}</p>
  }

  const groupMax = Math.max(...groups.map((group) => Math.abs(group.value)), 1)
  const childMax = Math.max(...groups.flatMap((group) => group.children.map((child) => Math.abs(child.value))), 1)

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-2">
      {groups.map((group) => (
        <div key={group.key}>
          <Row label={group.label} value={group.value} share={Math.abs(group.value) / groupMax} colorKey={group.key} />
          <div className="mt-2 flex flex-col gap-2 border-l pl-3">
            {group.children.length === 0 ? (
              <p className="text-muted-foreground text-[11px]">{childEmptyLabel}</p>
            ) : (
              group.children.map((child) => (
                <Row key={child.key} label={child.label} value={child.value} share={Math.abs(child.value) / childMax} colorKey={child.key} small />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )

  function Row({ label, value, share, colorKey, small }: { label: string; value: number; share: number; colorKey: string; small?: boolean }) {
    const color = colorForKey(colorKey)
    return (
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className={small ? 'text-muted-foreground min-w-0 break-words text-[11px] leading-4' : 'min-w-0 break-words text-xs leading-4'}>
            {label || '—'}
          </span>
          <span className={`shrink-0 tabular-nums ${small ? 'text-[11px]' : 'text-xs'} ${value < 0 ? 'text-destructive' : ''}`}>
            {valueFormatter(value)}
          </span>
        </div>
        <div className={`bg-muted mt-1 overflow-hidden rounded-full ${small ? 'h-[2px]' : 'h-[3px]'}`}>
          <div
            className="entity-fill h-full rounded-full"
            style={{ width: `${share * 100}%`, '--entity-light': color.light, '--entity-dark': color.dark } as CSSProperties}
          />
        </div>
      </div>
    )
  }
}
