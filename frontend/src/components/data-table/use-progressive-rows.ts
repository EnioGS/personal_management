import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react'

const PAGE_SIZE = 100
/** Start loading the next page while this much of the current one is still below. */
const LOOKAHEAD_PX = 600

/**
 * Renders a table one page at a time, growing as its own scroll container approaches
 * the bottom. A worklist of 1,700 rows is ~30,000 live inputs if rendered at once,
 * which is what makes the panel slow to open and to type in — not the database read.
 *
 * The window resets whenever the rows themselves change (a different dataset, a new
 * sort, a filter), so a sort never appears to apply only to what was already on screen.
 */
export function useProgressiveRows<T>(rows: readonly T[], resetKey: unknown = null): { visible: T[]; onScroll: (event: UIEvent<HTMLElement>) => void; hasMore: boolean; shown: number; total: number } {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const previousKey = useRef(resetKey)
  const previousLength = useRef(rows.length)

  useEffect(() => {
    if (previousKey.current === resetKey && previousLength.current === rows.length) return
    previousKey.current = resetKey
    previousLength.current = rows.length
    setLimit(PAGE_SIZE)
  }, [resetKey, rows.length])

  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    const element = event.currentTarget
    if (element.scrollHeight - element.scrollTop - element.clientHeight > LOOKAHEAD_PX) return
    setLimit((current) => (current >= rows.length ? current : current + PAGE_SIZE))
  }, [rows.length])

  return { visible: rows.slice(0, limit), onScroll, hasMore: limit < rows.length, shown: Math.min(limit, rows.length), total: rows.length }
}
