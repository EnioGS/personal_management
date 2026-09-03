import type { ReactNode } from 'react'
import type { TableKind } from '@/lib/model/types'

/**
 * A Finance surface, full height.
 *
 * This used to be the top half of a drag-up drawer whose bottom half was an editable
 * table: add a row, rename a table, import a CSV. All of that moved to the Data
 * ingestion centre, where a row arrives with its raw values intact and its labels
 * explicit, so a second way of writing into a finance table would be a way of putting
 * rows on a dashboard with neither. The wrapper stays because every panel is written
 * against it, and `kinds` stays in the signature for the same reason.
 */
export function FinanceTableDrawer({ kinds, children }: { id: string; kinds: TableKind[]; children: ReactNode }) {
  void kinds
  return <div className="h-full overflow-auto p-4">{children}</div>
}
