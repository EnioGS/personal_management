import { useEffect } from 'react'
import { useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { sections } from '@/sections'
import { useUiStore } from '@/store/ui-store'
import { ActivityBar } from './activity-bar'
import { SecondaryBar } from './secondary-bar'

export function AppShell() {
  const activeSectionId = useUiStore((s) => s.activeSectionId)
  const activeItemBySection = useUiStore((s) => s.activeItemBySection)
  const secondaryBarCollapsed = useUiStore((s) => s.secondaryBarCollapsed)

  const section = sections.find((s) => s.id === activeSectionId) ?? sections[0]
  const activeItemId = activeItemBySection[section.id] ?? section.items[0].id
  const activeItem = section.items.find((i) => i.id === activeItemId) ?? section.items[0]
  const ActiveComponent = activeItem.component

  const secondaryPanelRef = usePanelRef()
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'app-shell',
    panelIds: ['secondary', 'main'],
    storage: localStorage,
  })

  useEffect(() => {
    if (secondaryBarCollapsed) secondaryPanelRef.current?.collapse()
    else secondaryPanelRef.current?.expand()
  }, [secondaryBarCollapsed, secondaryPanelRef])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <ActivityBar />
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="flex-1"
      >
        <ResizablePanel
          id="secondary"
          defaultSize="20"
          minSize="12"
          maxSize="35"
          collapsible
          collapsedSize={0}
          panelRef={secondaryPanelRef}
        >
          <SecondaryBar />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="main" minSize="30">
          <div className="h-full overflow-auto">
            <ActiveComponent />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
