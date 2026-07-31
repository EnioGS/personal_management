import { useState, type ReactNode } from 'react'
import { useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'

interface ChartTablePanelProps {
  /** Unique per instance — becomes the localStorage key, must not collide with 'app-shell' or other instances. */
  id: string
  chart: ReactNode
  table: ReactNode
}

/** Chart on top, data table below — collapsed by default, revealed by dragging the handle. Mirrors app-shell.tsx's secondary-bar pattern, nested instead of at the shell level. */
export function ChartTablePanel({ id, chart, table }: ChartTablePanelProps) {
  const tablePanelRef = usePanelRef()
  // Collapsed content is unmounted entirely (see below) rather than relying on CSS
  // (height/overflow) to hide it — that was unreliable through this many nested
  // flex/percentage layers and let the table's content visually leak while collapsed.
  const [isTableCollapsed, setIsTableCollapsed] = useState(true)
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    // "-v3" invalidates layouts persisted during earlier development, before the
    // table panel's collapsed content was unmounted instead of CSS-hidden.
    id: `chart-table-v3-${id}`,
    panelIds: ['chart', 'table'],
    storage: localStorage,
  })

  return (
    <ResizablePanelGroup
      orientation="vertical"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="h-full"
    >
      <ResizablePanel id="chart" minSize="30">
        <div className="relative h-full overflow-hidden">
          <div className="absolute inset-0">{chart}</div>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel
        id="table"
        collapsible
        collapsedSize={0}
        defaultSize="0"
        panelRef={tablePanelRef}
        onResize={() => setIsTableCollapsed(tablePanelRef.current?.isCollapsed() ?? true)}
      >
        {/* absolute positioning takes this out of the panel's own flex sizing — otherwise
            the panel grows to fit its content's natural (min-content) size the instant
            the content mounts, overriding the intended near-zero collapsed/dragging size. */}
        <div className="relative h-full overflow-hidden">
          <div className="absolute inset-0 overflow-auto">{!isTableCollapsed && table}</div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
