// A type alias, not an interface — interfaces don't structurally satisfy the
// Record<string, unknown> generic constraint used by EditableDataTable/chart components.
export type Transaction = {
  date: number
  category?: string
  asset: string
  type: 'buy' | 'sell' | 'income'
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
  const quantity = assetTx.reduce((q, t) => q + quantityDelta(t), 0)
  // Income is paid separately: it neither changes the holding nor supplies a new
  // unit price for it.
  const lastPrice = assetTx.filter((t) => t.type !== 'income').at(-1)?.price ?? 0
  return quantity * lastPrice
}

export interface Position {
  asset: string
  quantity: number
  /** Weighted average of buy prices only — what was actually paid, not affected by sells. */
  averagePrice: number
  /** See getCurrentValue's own caveat: book value from the last transaction, not a live quote. */
  currentValue: number
}

/**
 * One row per asset still held (Posições) — an asset fully sold off (quantity settles
 * to ~0) drops out, since "current holdings" isn't the place for closed positions.
 */
export function computePositions(transactions: Transaction[]): Position[] {
  const visible = transactions.filter((t) => !t.deleted)
  const assets = [...new Set(visible.map((t) => t.asset))]

  return assets
    .map((asset): Position => {
      const assetTx = visible.filter((t) => t.asset === asset).sort((a, b) => a.date - b.date)
      const quantity = assetTx.reduce((q, t) => q + quantityDelta(t), 0)

      const buys = assetTx.filter((t) => t.type === 'buy')
      const buyQuantity = buys.reduce((q, t) => q + t.quantity, 0)
      const buyCost = buys.reduce((c, t) => c + t.quantity * t.price, 0)
      const averagePrice = buyQuantity > 0 ? buyCost / buyQuantity : 0

      return { asset, quantity, averagePrice, currentValue: getCurrentValue(asset, visible) }
    })
    .filter((position) => Math.abs(position.quantity) > 1e-9)
}

function quantityDelta(transaction: Transaction): number {
  if (transaction.type === 'buy') return transaction.quantity
  if (transaction.type === 'sell') return -transaction.quantity
  return 0
}
