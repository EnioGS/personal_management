import { useEffect, useRef } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
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
  const toggleBar = useUiStore((s) => s.toggleSecondaryBar)
  const setMode = useUiStore((s) => s.setSecondaryBarMode)
  const iconsOnly = useUiStore((s) => s.secondaryBarMode) === 'icons'
  const barRef = useRef<HTMLDivElement>(null)
  const pointerInside = useRef(false)

  useEffect(() => {
    if (iconsOnly) return
    const collapse = () => setMode('icons')

    const onPointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) collapse()
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

  // Typed keys are generated from the app's own namespaces; these two live in the
  // shared common bundle, which the generated union does not cover (see activity-bar).
  const toggleLabel = String(t((iconsOnly ? 'common:nav.showLabels' : 'common:nav.hideLabels') as never))
  const section = sections.find((s) => s.id === activeSectionId) ?? sections[0]
  const activeItemId = activeItemBySection[section.id] ?? section.items[0].id

  return (
    <div ref={barRef} className="bg-sidebar flex h-full flex-col pt-2">
      <div className={cn('flex pb-1', iconsOnly ? 'justify-center px-1.5' : 'justify-end px-2')}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={toggleLabel}
              aria-expanded={!iconsOnly}
              onClick={toggleBar}
              className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
            >
              {iconsOnly ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{toggleLabel}</TooltipContent>
        </Tooltip>
      </div>
      <ScrollArea className="flex-1">
        <nav className={cn('flex flex-col gap-0.5 pb-2', iconsOnly ? 'px-1.5' : 'px-2')}>
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
  )
}
