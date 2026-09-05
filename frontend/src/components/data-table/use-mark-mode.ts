import { useCallback, useEffect, useState } from 'react'

/**
 * Marking rows for elimination, as a mode rather than a per-row control.
 *
 * A table gets one checkbox. While it is on, clicking a row toggles that row's mark —
 * marking and unmarking are the same gesture, because both are things the user and the
 * assistant may do freely. Clicking anything that is not a row turns the mode off, so
 * the mode cannot be left on by accident and start eating ordinary clicks.
 *
 * Nothing here deletes: a mark hides the row from dashboards and leaves it in its table.
 * Removing marked rows is the user's alone, and lives with the table that owns them.
 */
export function useMarkMode(): { marking: boolean; setMarking: (value: boolean) => void; rowProps: (toggle: () => void) => { 'data-markable': true; onClick: () => void } } {
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    if (!marking) return
    function handle(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-markable]') || target?.closest('[data-mark-toggle]')) return
      setMarking(false)
    }
    document.addEventListener('click', handle)
    return () => document.removeEventListener('click', handle)
  }, [marking])

  const rowProps = useCallback(
    (toggle: () => void) => ({ 'data-markable': true as const, onClick: () => { if (marking) toggle() } }),
    [marking],
  )

  return { marking, setMarking, rowProps }
}
