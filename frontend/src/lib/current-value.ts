// A type alias, not an interface — interfaces don't structurally satisfy the
// Record<string, unknown> generic constraint used by EditableDataTable/chart components.
export type Transaction = {
  date: number
  asset: string
  type: 'buy' | 'sell'
  quantity: number
  price: number
  note?: string
  /** Soft-delete flag — not a visible column (no ColumnDef), set only via the assistant's tools or the app UI. */
  deleted?: boolean
}

/**
 * Simplification: current value = quantity × price of the most recent transaction,
 * NOT live market pricing. Swap this function's body for a live-quote lookup later
 * if that's ever needed — nothing else depends on how this number is computed.
 */
export function getCurrentValue(asset: string, transactions: Transaction[]): number {
  const assetTx = transactions.filter((t) => t.asset === asset).sort((a, b) => a.date - b.date)
  const quantity = assetTx.reduce((q, t) => q + (t.type === 'buy' ? t.quantity : -t.quantity), 0)
  const lastPrice = assetTx.at(-1)?.price ?? 0
  return quantity * lastPrice
}
