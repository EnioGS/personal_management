import type { ReactNode } from 'react'
import { TableWorkspace } from '@/components/data-table/table-workspace'
import { ChartTablePanel } from '@/components/layout/chart-table-panel'
import type { TableKind } from '@/lib/model/types'

/** Every Finance surface keeps its dashboard scrollable above the same drag-up table drawer. */
export function FinanceTableDrawer({ id, kinds, children }: { id: string; kinds: TableKind[]; children: ReactNode }) {
  return (
    <ChartTablePanel
      id={id}
      chart={<div className="h-full overflow-auto p-4">{children}</div>}
      table={<TableWorkspace workspaceId={id} kinds={kinds} />}
    />
  )
}
