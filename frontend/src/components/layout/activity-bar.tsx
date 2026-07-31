import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { sections } from '@/sections'
import { useUiStore } from '@/store/ui-store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BrandMark } from './brand-mark'

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
              'relative size-[3.375rem] text-sidebar-foreground/70 hover:text-sidebar-foreground',
              isActive && 'bg-sidebar-accent text-sidebar-foreground',
            )}
          >
            {isActive && (
              <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand" />
            )}
            <section.icon className="size-[1.875rem]" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div className="flex h-full w-18 shrink-0 flex-col items-center border-r bg-sidebar py-2">
      <BrandMark />
      <nav className="flex flex-col items-center gap-1">
        {sections.filter((s) => !s.pinned).map(renderSectionButton)}
      </nav>
      <nav className="mt-auto flex flex-col items-center gap-1 border-t pt-2">
        {sections.filter((s) => s.pinned).map(renderSectionButton)}
      </nav>
    </div>
  )
}
