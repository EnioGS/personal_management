import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { sections } from '@/sections'
import { useUiStore } from '@/store/ui-store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** How long the labels stay up on their own before the bar gives the width back. */
const AUTO_COLLAPSE_MS = 3000

/**
 * Items of the active section, as an icon strip or with labels (see store/ui-store.ts).
 * The buttons keep the same height and icon size in both, so the toggle only changes
 * the width the bar takes from the content.
 *
 * Expanded, it behaves like a flyout rather than a second permanent column: a click
 * anywhere else puts it away at once, and it puts itself away about three seconds
 * after opening. That countdown is suspended while the pointer or the keyboard focus
 * is inside it — a bar that collapses while someone is reading it would be worse than
 * one that never collapsed.
 */
export function SecondaryBar() {
  const { t } = useTranslation()
  const activeSectionId = useUiStore((s) => s.activeSectionId)
  const activeItemBySection = useUiStore((s) => s.activeItemBySection)
  const selectItem = useUiStore((s) => s.selectItem)
  const setMode = useUiStore((s) => s.setSecondaryBarMode)
  const iconsOnly = useUiStore((s) => s.secondaryBarMode) === 'icons'
  const barRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const pointerInside = useRef(false)
  // The accent is drawn against the item column's real size, so it follows both the
  // number of items and the width the bar currently has.
  const [navBox, setNavBox] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const measure = () => setNavBox({ width: nav.offsetWidth, height: nav.offsetHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (iconsOnly) return
    const collapse = () => setMode('icons')

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (barRef.current?.contains(target as Node)) return
      // A control whose job is to toggle this bar handles the change itself; collapsing
      // here first would undo it, or double it back to where it started.
      if (target?.closest('[data-secondary-bar-toggle]')) return
      collapse()
    }
    let timer = window.setTimeout(collapse, AUTO_COLLAPSE_MS)
    const restart = () => {
      window.clearTimeout(timer)
      if (!pointerInside.current) timer = window.setTimeout(collapse, AUTO_COLLAPSE_MS)
    }
    const onEnter = () => { pointerInside.current = true; restart() }
    const onLeave = () => { pointerInside.current = false; restart() }

    const bar = barRef.current
    document.addEventListener('pointerdown', onPointerDown)
    bar?.addEventListener('pointerenter', onEnter)
    bar?.addEventListener('pointerleave', onLeave)
    bar?.addEventListener('focusin', onEnter)
    bar?.addEventListener('focusout', onLeave)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onPointerDown)
      bar?.removeEventListener('pointerenter', onEnter)
      bar?.removeEventListener('pointerleave', onLeave)
      bar?.removeEventListener('focusin', onEnter)
      bar?.removeEventListener('focusout', onLeave)
    }
  }, [iconsOnly, setMode])

  const section = sections.find((s) => s.id === activeSectionId) ?? sections[0]
  const activeItemId = activeItemBySection[section.id] ?? section.items[0].id

  return (
    <div ref={barRef} className="bg-sidebar flex h-full flex-col pt-2">
      <ScrollArea className="flex-1">
        <div className="relative">
          <SectionAccent width={navBox.width} height={navBox.height} />
          <nav ref={navRef} className={cn('relative flex flex-col gap-0.5 pb-2', iconsOnly ? 'px-1.5' : 'px-2')}>
          {section.items.map((item) => {
            const isActive = item.id === activeItemId
            // labelKey is data-driven, not a static literal — see activity-bar.tsx
            const label = t(item.labelKey as never)
            const button = (
              <Button
                type="button"
                variant="ghost"
                aria-pressed={isActive}
                aria-label={iconsOnly ? label : undefined}
                onClick={() => selectItem(section.id, item.id)}
                data-secondary-bar-toggle
                className={cn(
                  'text-sidebar-foreground/80 hover:text-sidebar-foreground relative h-8 gap-2 text-sm font-normal',
                  iconsOnly ? 'w-9 justify-center px-0' : 'w-full justify-start px-2',
                  isActive && 'bg-sidebar-accent text-sidebar-foreground',
                )}
              >
                {isActive && <span className="bg-brand absolute inset-y-1.5 left-0 w-0.5 rounded-full" />}
                <item.icon className="size-4" />
                {!iconsOnly && label}
              </Button>
            )

            // Only icon mode needs the tooltip — with labels showing it would just repeat them.
            return iconsOnly ? (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ) : (
              <div key={item.id}>{button}</div>
            )
          })}
          </nav>
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * The curve that runs down the side of the item column.
 *
 * Drawn rather than decorated with a border because it has to belong to the items: it
 * spans exactly their height, so a section with three of them gets a shallow bend and
 * one with eight gets a long sweep, and it stretches with the bar as the labels come
 * and go. `preserveAspectRatio="none"` is what lets one path serve every size, and the
 * whole thing is hidden from assistive technology — it says nothing a label does not.
 */
function SectionAccent({ width, height }: { width: number; height: number }) {
  if (width === 0 || height === 0) return null
  return (
    <svg
      aria-hidden
      className="text-brand pointer-events-none absolute inset-y-0 right-0 opacity-70"
      width={Math.max(10, Math.round(width * 0.22))}
      height={height}
      viewBox="0 0 24 100"
      preserveAspectRatio="none"
      fill="none"
    >
      <path
        d="M20 2 C 20 26, 4 34, 4 50 C 4 66, 20 74, 20 98"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
