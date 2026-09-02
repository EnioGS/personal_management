import type { CSSProperties } from 'react'
import { Badge } from '@/components/ui/badge'
import { colorForKey } from '@/components/charts/chart-colors'

/** A category name as a tinted pill instead of plain text — see the .entity-tint rule in index.css. */
export function CategoryPill({ label }: { label: string }) {
  const color = colorForKey(label || ' ')
  return (
    <Badge
      variant="outline"
      className="entity-tint border-transparent font-normal"
      style={{ '--entity-light': color.light, '--entity-dark': color.dark } as CSSProperties}
    >
      {label || '—'}
    </Badge>
  )
}
