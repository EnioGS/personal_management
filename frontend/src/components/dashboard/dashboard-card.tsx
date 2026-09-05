import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DashboardCardProps {
  /** Omitted for content that names itself — a chart whose legend already says what it is. */
  title?: string
  /** At most one — a segmented toggle, a period switch, a "ver tudo" link. */
  action?: ReactNode
  /** A caveat that belongs with the card, not a chart tooltip (see PLAN.md §3.3). */
  footnote?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

/**
 * A titled, bordered container — every piece of dashboard content lives in one of
 * these instead of floating loose on the panel background. See PLAN.md §2.1/§3.3.
 */
export function DashboardCard({ title, action, footnote, children, className, bodyClassName }: DashboardCardProps) {
  return (
    // min-h-0: a grid/flex item's implicit min-height is content-based by default, so
    // an explicit h-[Npx] on `className` would otherwise still let the card grow past
    // it when a body (like a long RankedBarList) wants more room than that.
    <div className={cn('bg-card flex min-h-0 flex-col overflow-hidden rounded-lg border', className)}>
      {(title || action) && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
          {title && <h3 className="text-sm font-medium">{title}</h3>}
          {action}
        </div>
      )}
      <div className={cn('min-h-0 flex-1 p-3', bodyClassName)}>{children}</div>
      {footnote && <div className="text-muted-foreground shrink-0 border-t px-3 py-1.5 text-[11px]">{footnote}</div>}
    </div>
  )
}
