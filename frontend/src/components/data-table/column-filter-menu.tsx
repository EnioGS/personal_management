import { useState } from 'react'
import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { RowFilter } from '@/lib/model/row-query'
import { cn } from '@/lib/utils'

export type ColumnFilter = RowFilter

const TEXT_OPS = [
  { op: 'contains', label: 'contains' },
  { op: 'notContains', label: 'does not contain' },
  { op: 'equals', label: 'is exactly' },
  { op: 'isEmpty', label: 'is empty' },
  { op: 'isNotEmpty', label: 'is not empty' },
] as const

/**
 * Filtering one column, by text or by number.
 *
 * A range is offered as two boxes rather than as two separate filters: "between" is
 * one idea, and leaving one side empty says "above" or "below" without needing a
 * different control for each.
 */
export function ColumnFilterMenu({ field, label, filters, onChange }: { field: string; label: string; filters: ColumnFilter[]; onChange: (filters: ColumnFilter[]) => void }) {
  const active = filters.filter((filter) => filter.field === field)
  const [text, setText] = useState('')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')

  function replace(next: ColumnFilter[]) {
    onChange([...filters.filter((filter) => filter.field !== field), ...next])
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="xs" aria-label={`Filter ${label}`} className={cn('h-auto px-1 py-0', active.length > 0 && 'text-primary')}>
          <Filter className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 text-xs">
        <div className="flex flex-col gap-2">
          <p className="font-medium">{label}</p>
          <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="text…" className="h-7 text-xs" />
          <div className="flex flex-wrap gap-1">
            {TEXT_OPS.map(({ op, label: opLabel }) => (
              <Button
                key={op}
                type="button"
                size="xs"
                variant="outline"
                disabled={(op === 'contains' || op === 'notContains' || op === 'equals') && !text.trim()}
                onClick={() => replace([{ field, op, ...(op === 'isEmpty' || op === 'isNotEmpty' ? {} : { value: text.trim() }) }])}
              >
                {opLabel}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Input value={min} onChange={(event) => setMin(event.target.value)} placeholder="min" inputMode="decimal" className="h-7 text-xs" />
            <span className="text-muted-foreground">to</span>
            <Input value={max} onChange={(event) => setMax(event.target.value)} placeholder="max" inputMode="decimal" className="h-7 text-xs" />
            <Button
              type="button"
              size="xs"
              disabled={!min.trim() && !max.trim()}
              onClick={() => replace([
                ...(min.trim() ? [{ field, op: 'gte' as const, value: Number(min) }] : []),
                ...(max.trim() ? [{ field, op: 'lte' as const, value: Number(max) }] : []),
              ])}
            >
              Apply
            </Button>
          </div>
          <p className="text-muted-foreground">Leave one side empty for "above" or "below".</p>
          {active.length > 0 && (
            <Button type="button" size="xs" variant="ghost" onClick={() => { setText(''); setMin(''); setMax(''); replace([]) }}>
              <X className="size-3" />Clear this column
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
