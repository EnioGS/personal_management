import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
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
 * It renders the `<td>` itself so that the state it carries — red for a value that names
 * nothing, amber for one that is required and still empty — is drawn on the cell, the
 * full height of the row. Drawn on a box inside the cell it reads as a text input that is
 * permanently open, which turns a table into a form and buries the data in chrome.
 *
 * Enter commits, Escape abandons, and clicking away commits, which is what a spreadsheet
 * does and therefore what everyone expects.
 */
function EditableCellView({ value, onCommit, validate, missing, readOnly, disabled, title, className }: EditableCellProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  // Kept in a ref so the memo below depends on the value, not on the identity of an
  // arrow function the parent rebuilds every render.
  const check = useRef(validate)
  check.current = validate

  useEffect(() => {
    if (draft !== null) input.current?.focus()
  }, [draft])

  // Validating means resolving text against the app's own catalogue, which a table full
  // of cells does hundreds of times a render if it is done unconditionally. It only
  // changes when the text does.
  const restingError = useMemo(() => check.current?.(value) ?? null, [value])
  const error = draft === null ? restingError : check.current?.(draft) ?? null

  function commit() {
    if (draft !== null && draft !== value) onCommit(draft)
    setDraft(null)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') { event.preventDefault(); commit() }
    if (event.key === 'Escape') { event.preventDefault(); setDraft(null) }
  }

  return (
    <td
      title={title ?? error ?? undefined}
      onDoubleClick={() => { if (!readOnly && !disabled && draft === null) setDraft(value) }}
      className={cn(
        // A hairline with barely-rounded corners: the cell has to say "look at me"
        // without shouting over the data it is drawn around. The yellow is a light shade
        // held near full opacity — dimming a mid yellow on a dark ground turns it brown.
        'rounded-[3px] p-0 align-middle',
        error ? 'text-destructive/90 ring-destructive/50 ring-[0.5px] ring-inset' : missing ? 'ring-[0.5px] ring-amber-300/70 ring-inset' : '',
        draft !== null && !error && 'ring-ring/60 ring-[0.5px] ring-inset',
        !readOnly && !disabled && draft === null && 'hover:bg-muted/40',
        className,
      )}
    >
      {draft === null ? (
        <div className="px-2 py-1.5">{value || ' '}</div>
      ) : (
        <input
          ref={input}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="w-full min-w-24 bg-transparent px-2 py-1.5 outline-none"
        />
      )}
    </td>
  )
}

/**
 * Memoised because a table is thousands of these: a cell whose own value, state and
 * handler are unchanged has nothing to re-render for, and without this every keystroke
 * anywhere in the table re-renders every cell in it.
 */
export const EditableCell = memo(EditableCellView)
