import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

interface EditableCellProps {
  value: string
  onCommit: (value: string) => void
  /** Checked as the value is typed. Return the reason it is wrong, or null. */
  validate?: (draft: string) => string | null
  /** True when the cell holds nothing and something is required of it. */
  missing?: boolean
  /** Nothing here can be edited — the filename and the row id say what a row *is*. */
  readOnly?: boolean
  /** While the table is in marking mode, a click means "mark", so editing stays out of the way. */
  disabled?: boolean
  title?: string
  className?: string
}

/**
 * A table cell that is text until it is double-clicked, and an input after that.
 *
 * The border is what carries state — red for a value that names nothing, amber for one
 * that is required and still empty — rather than a permanently open box in every cell,
 * which turns a table into a form and buries the data in chrome. Enter commits, Escape
 * abandons, and clicking away commits, which is what a spreadsheet does and therefore
 * what everyone expects.
 */
export function EditableCell({ value, onCommit, validate, missing, readOnly, disabled, title, className }: EditableCellProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (draft !== null) input.current?.focus()
  }, [draft])

  const error = draft === null ? null : validate?.(draft) ?? null
  const restingError = validate?.(value) ?? null

  function commit() {
    if (draft !== null && draft !== value) onCommit(draft)
    setDraft(null)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') { event.preventDefault(); commit() }
    if (event.key === 'Escape') { event.preventDefault(); setDraft(null) }
  }

  if (draft !== null) {
    return (
      <input
        ref={input}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        title={error ?? undefined}
        className={cn(
          // Fills the cell exactly, so editing does not move anything: the box you type
          // in is the cell, not a smaller box drawn inside it.
          'block h-full w-full bg-transparent px-2 py-1.5 outline-none',
          'ring-inset ring-1',
          error ? 'ring-destructive text-destructive' : 'ring-ring',
          className,
        )}
      />
    )
  }

  return (
    <div
      onDoubleClick={() => { if (!readOnly && !disabled) setDraft(value) }}
      title={title ?? restingError ?? (readOnly ? undefined : 'Double-click to edit')}
      className={cn(
        // The state is drawn on the cell itself — an inset ring on the full width and
        // height — rather than on a smaller box inside it, which reads as an input that
        // is always open and makes a table look like a form.
        'block h-full w-full px-2 py-1.5',
        restingError ? 'ring-destructive text-destructive ring-inset ring-1' : missing ? 'ring-inset ring-1 ring-amber-500' : '',
        !readOnly && !disabled && 'hover:bg-muted/40',
        className,
      )}
    >
      {value}
    </div>
  )
}
