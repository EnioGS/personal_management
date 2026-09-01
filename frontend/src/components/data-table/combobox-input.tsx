import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface ComboboxInputProps {
  value: string
  onChange: (value: string) => void
  /** Offered as suggestions only — typing a value that isn't here is expected and allowed. */
  suggestions: readonly string[]
  label: string
  className?: string
}

/**
 * Free-text input with an in-DOM suggestion list, for open vocabularies (categories).
 *
 * Deliberately not a native <datalist>: on at least Linux, browsers render that popup
 * through the OS widget toolkit, which ignores the page's theme entirely — the same
 * problem that made the native <select> unreadable here. The list is also positioned
 * `fixed` off the input's rect rather than absolutely, because the table it lives in
 * sits inside `overflow-auto` containers that would otherwise clip it.
 */
export function ComboboxInput({ value, onChange, suggestions, label, className }: ComboboxInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const query = value.trim().toLowerCase()
  const matches = suggestions.filter((option) => !query || option.toLowerCase().includes(query))

  useLayoutEffect(() => {
    if (!isOpen) return
    const update = () => {
      const box = inputRef.current?.getBoundingClientRect()
      if (box) setRect({ left: box.left, top: box.bottom, width: box.width })
    }
    update()
    // The list is `fixed`, so it doesn't follow the input on its own — recompute while
    // open. `true` catches scrolling of the table's inner containers, not just the page.
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    // Both events matter: pointerdown for clicking away, focusin for tabbing away —
    // with only the former, keyboard users leave the list stranded open.
    function closeIfOutside(target: Node | null) {
      if (inputRef.current?.contains(target) || listRef.current?.contains(target)) return
      setIsOpen(false)
    }
    const onPointerDown = (e: PointerEvent) => closeIfOutside(e.target as Node)
    const onFocusIn = (e: FocusEvent) => closeIfOutside(e.target as Node)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [isOpen])

  function pick(option: string) {
    onChange(option)
    setIsOpen(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setIsOpen(false)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        return
      }
      if (matches.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setHighlighted((current) => (current + step + matches.length) % matches.length)
      return
    }
    if (e.key === 'Enter' && isOpen && matches[highlighted]) {
      e.preventDefault()
      pick(matches[highlighted])
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        aria-label={label}
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        type="text"
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setHighlighted(0)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {isOpen && rect && matches.length > 0 && (
        <div
          ref={listRef}
          role="listbox"
          className="bg-popover text-popover-foreground fixed z-50 max-h-48 overflow-y-auto rounded-md border p-1 shadow-md"
          style={{ left: rect.left, top: rect.top + 2, minWidth: rect.width }}
        >
          {matches.map((option, index) => (
            <div
              key={option}
              role="option"
              aria-selected={index === highlighted}
              // pointerdown, not click: the input's own blur would otherwise race the click.
              onPointerDown={(e) => {
                e.preventDefault()
                pick(option)
              }}
              onPointerEnter={() => setHighlighted(index)}
              className={cn(
                'cursor-default rounded-sm px-2 py-1 text-xs',
                index === highlighted && 'bg-accent text-accent-foreground',
              )}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
