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
 * The slip's bottom-right corner, in pixels: a rounded corner rather than a sweep,
 * and constant whatever width the bar has.
 */
const CORNER = 18

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
  const sheetRef = useRef<HTMLDivElement>(null)
  const pointerInside = useRef(false)
  // The edge is drawn to the sheet's real width, so it follows the bar as the labels
  // come and go; the sheet's height follows the items by itself.
  const [sheetWidth, setSheetWidth] = useState(0)
  // The corner is a fixed size, so widening the bar lengthens the flat part and leaves
  // the curve alone — stretching one shape across four times the width is what made
  // the expanded bar look wrong.
  const edgeHeight = CORNER

  useLayoutEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    const measure = () => setSheetWidth(sheet.offsetWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(sheet)
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
    <div ref={barRef} className="flex h-full min-h-0 flex-col">
      <div ref={sheetRef} style={{ maxHeight: `calc(100% - ${edgeHeight}px)` }} className="bg-sidebar flex min-h-0 flex-col border-r pt-2">
        <ScrollArea className="min-h-0">
          <nav className={cn('flex flex-col gap-0.5 pb-1', iconsOnly ? 'px-1.5' : 'px-2')}>
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
        </ScrollArea>
      </div>
      <SlipEdge width={sheetWidth} height={edgeHeight} />
    </div>
  )
}

/**
 * The slip's bottom edge.
 *
 * The bar is a sheet that ends where its items end, not a column running the height of
 * the window — so the surface stops after the last icon and this draws the shape it
 * stops with: the right edge carries on down, then sweeps left and away. One filled
 * path in the sidebar's own colour with the border stroked along the curve, so the
 * edge reads as the same object as the block above it, at any width.
 */
function SlipEdge({ width, height }: { width: number; height: number }) {
  if (width === 0) return null
  // The right border turns through a quarter round of a fixed size and then runs flat
  // to the left, meeting the activity bar square. Only that flat run changes with the
  // bar's width, so the corner keeps its shape at 48px and at 224px alike.
  const corner = Math.min(height, width)
  const turn = `C${width} ${corner * 0.55}, ${width - corner * 0.45} ${corner}, ${width - corner} ${corner}`
  return (
    <svg aria-hidden className="pointer-events-none shrink-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <path d={`M0 0 H${width} ${turn} H0 Z`} className="fill-sidebar" />
      <path d={`M${width} 0 ${turn} H0`} className="stroke-border" strokeWidth="1" fill="none" />
    </svg>
  )
}
