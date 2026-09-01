import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { sections } from '@/sections'
import { useUiStore } from '@/store/ui-store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Items of the active section. Rendered either with labels or as an icon-only
 * strip — the `icons` step of the activity bar's expanded → icons → hidden
 * cycle (see store/ui-store.ts). The buttons keep the same height and icon size
 * in both, so cycling only changes the width the bar takes from the content.
 */
export function SecondaryBar() {
  const { t } = useTranslation()
  const activeSectionId = useUiStore((s) => s.activeSectionId)
  const activeItemBySection = useUiStore((s) => s.activeItemBySection)
  const selectItem = useUiStore((s) => s.selectItem)
  const iconsOnly = useUiStore((s) => s.secondaryBarMode) === 'icons'

  const section = sections.find((s) => s.id === activeSectionId) ?? sections[0]
  const activeItemId = activeItemBySection[section.id] ?? section.items[0].id

  return (
    <div className="bg-sidebar flex h-full flex-col pt-2">
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
