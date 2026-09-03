import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { sections } from '@/sections'
import { useUiStore } from '@/store/ui-store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function ActivityBar() {
  const { t } = useTranslation()
  const activeSectionId = useUiStore((s) => s.activeSectionId)
  const selectSection = useUiStore((s) => s.selectSection)

  const renderSectionButton = (section: (typeof sections)[number]) => {
    const isActive = section.id === activeSectionId
    // labelKey is data-driven (from the sections registry), not a
    // static literal, so it can't be checked against the strict key union.
    const label = t(section.labelKey as never)
    return (
      <Tooltip key={section.id}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            aria-pressed={isActive}
            onClick={() => selectSection(section.id)}
            className={cn(
              'relative size-[3.375rem]',
              section.brand
                ? cn(
                    'rounded-lg bg-brand text-brand-foreground hover:bg-brand-hover hover:text-brand-foreground dark:hover:bg-brand-hover',
                    // Active state reuses the hover color instead of the generic accent-line
                    // indicator below — a separate thin line reads as a rendering glitch on
                    // top of an already-colored, rounded brand box.
                    isActive && 'bg-brand-hover dark:bg-brand-hover',
                  )
                : 'text-sidebar-foreground/70 hover:text-sidebar-foreground',
              isActive && !section.brand && 'bg-sidebar-accent text-sidebar-foreground',
            )}
          >
            {isActive && !section.brand && (
              <span className="bg-brand absolute inset-y-1.5 left-0 w-0.5 rounded-full" />
            )}
            <section.icon className="size-[1.875rem]" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    // Marked so the secondary bar's click-away does not fight this bar's own toggle:
    // without it, clicking the active icon collapsed the bar and then re-expanded it in
    // the same gesture, and it could never be closed from here.
    <div data-secondary-bar-toggle className="flex h-full w-18 shrink-0 flex-col items-center border-r bg-sidebar py-2">
      <nav className="flex flex-col items-center gap-1">
        {sections.filter((s) => !s.pinned).map(renderSectionButton)}
      </nav>
      <nav className="mt-auto flex flex-col items-center gap-1 border-t pt-2">
        {sections.filter((s) => s.pinned).map(renderSectionButton)}
      </nav>
    </div>
  )
}
