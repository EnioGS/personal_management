import { sections } from '@/sections'
import { useUiStore } from '@/store/ui-store'
import { ActivityBar } from './activity-bar'
import { SecondaryBar } from './secondary-bar'

/**
 * The secondary bar is deliberately not resizable: its three widths are the
 * activity bar's expanded → icons → hidden cycle (store/ui-store.ts), and a
 * drag handle on top of that gave two competing ways to size the same column.
 */
const SECONDARY_BAR_WIDTH = {
  expanded: 'w-56',
  icons: 'w-12',
} as const

export function AppShell() {
  const activeSectionId = useUiStore((s) => s.activeSectionId)
  const activeItemBySection = useUiStore((s) => s.activeItemBySection)
  const secondaryBarMode = useUiStore((s) => s.secondaryBarMode)

  const section = sections.find((s) => s.id === activeSectionId) ?? sections[0]
  const activeItemId = activeItemBySection[section.id] ?? section.items[0].id
  const activeItem = section.items.find((i) => i.id === activeItemId) ?? section.items[0]
  const ActiveComponent = activeItem.component

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <ActivityBar />
      <div className={`${SECONDARY_BAR_WIDTH[secondaryBarMode]} shrink-0 border-r`}>
        <SecondaryBar />
      </div>
      <div className="min-w-0 flex-1 overflow-auto">
        <ActiveComponent />
      </div>
    </div>
  )
}
