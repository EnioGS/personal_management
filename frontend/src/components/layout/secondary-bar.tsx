import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { sections } from '@/sections'
import { useUiStore } from '@/store/ui-store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

export function SecondaryBar() {
  const { t } = useTranslation()
  const activeSectionId = useUiStore((s) => s.activeSectionId)
  const activeItemBySection = useUiStore((s) => s.activeItemBySection)
  const selectItem = useUiStore((s) => s.selectItem)

  const section = sections.find((s) => s.id === activeSectionId) ?? sections[0]
  const activeItemId = activeItemBySection[section.id] ?? section.items[0].id

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="px-3 py-3">
        <h2 className="text-xs font-semibold tracking-wide text-sidebar-foreground/70 uppercase">
          {/* labelKey is data-driven, not a static literal — see activity-bar.tsx */}
          {t(section.labelKey as never)}
        </h2>
      </div>
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-0.5 px-2 pb-2">
          {section.items.map((item) => {
            const isActive = item.id === activeItemId
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                aria-pressed={isActive}
                onClick={() => selectItem(section.id, item.id)}
                className={cn(
                  'relative h-8 justify-start gap-2 px-2 text-sm font-normal text-sidebar-foreground/80 hover:text-sidebar-foreground',
                  isActive && 'bg-sidebar-accent text-sidebar-foreground',
                )}
              >
                {isActive && (
                  <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand" />
                )}
                <item.icon className="size-4" />
                {t(item.labelKey as never)}
              </Button>
            )
          })}
        </nav>
      </ScrollArea>
    </div>
  )
}
