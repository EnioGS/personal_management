import { ArrowDown01, ArrowDownAZ, ArrowUp10, ArrowUpZA, ChevronsUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { SortType } from '@/lib/model/row-query'
import { cn } from '@/lib/utils'

export interface ColumnSort {
  field: string
  type: SortType
  direction: 'asc' | 'desc'
}

/**
 * A column header that sorts. Alphabetic and numeric are offered separately rather
 * than guessed from the data: a column of "12/10" strings and a column of amounts
 * look alike to a sniffer and mean opposite things, and the user knows which they
 * meant. Values a numeric sort cannot read stay at the bottom in both directions
 * (see row-query.ts), so choosing the wrong one is recoverable, not destructive.
 */
export function ColumnSortMenu({ field, label, sort, onSort }: { field: string; label: string; sort: ColumnSort | null; onSort: (sort: ColumnSort | null) => void }) {
  const active = sort?.field === field ? sort : null
  const option = (type: SortType, direction: 'asc' | 'desc') => active?.type === type && active.direction === direction

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="xs" className={cn('-ml-1 h-auto gap-1 px-1 py-0 font-medium', active && 'text-primary')}>
          {label}
          {active
            ? (active.direction === 'asc' ? <ArrowDownAZ className="size-3" /> : <ArrowUpZA className="size-3" />)
            : <ChevronsUpDown className="size-3 opacity-40" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="text-xs">
        <DropdownMenuItem onClick={() => onSort({ field, type: 'text', direction: 'asc' })} className={cn(option('text', 'asc') && 'text-primary')}>
          <ArrowDownAZ className="size-3.5" />Alphabetically, A to Z
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSort({ field, type: 'text', direction: 'desc' })} className={cn(option('text', 'desc') && 'text-primary')}>
          <ArrowUpZA className="size-3.5" />Alphabetically, Z to A
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSort({ field, type: 'number', direction: 'asc' })} className={cn(option('number', 'asc') && 'text-primary')}>
          <ArrowDown01 className="size-3.5" />Numerically, smallest first
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSort({ field, type: 'number', direction: 'desc' })} className={cn(option('number', 'desc') && 'text-primary')}>
          <ArrowUp10 className="size-3.5" />Numerically, largest first
        </DropdownMenuItem>
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onSort(null)}><X className="size-3.5" />Clear sorting</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
