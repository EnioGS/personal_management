import { refreshLocalStores } from '@/lib/local-store/create-local-list-store'
import { usageTotalsTable } from './conversations-db'

/** Everything spent since the beginning, whatever became of the conversations that spent it. */
export interface UsageTotals {
  tokens: number
  requests: number
  cost: number
  /** Messages counted, so an average is possible without keeping every one of them. */
  messages: number
}

const EMPTY: UsageTotals = { tokens: 0, requests: 0, cost: 0, messages: 0 }

export async function readUsageTotals(): Promise<UsageTotals> {
  const [stored] = await usageTotalsTable.toArray()
  return stored ? { ...EMPTY, ...(stored.data as UsageTotals) } : EMPTY
}

/**
 * Adds one exchange to the running total.
 *
 * Kept outside the conversations because deleting a conversation should not unspend what
 * it spent: the tally is about the money and the tokens, which are gone either way. One
 * row, added to rather than appended, since nothing here needs a history.
 */
export async function recordUsage(exchange: { tokens: number; requests: number; cost: number | null }): Promise<void> {
  if (exchange.tokens <= 0) return
  const [stored] = await usageTotalsTable.toArray()
  const totals = stored ? { ...EMPTY, ...(stored.data as UsageTotals) } : EMPTY
  const next: UsageTotals = {
    tokens: totals.tokens + exchange.tokens,
    requests: totals.requests + exchange.requests,
    cost: totals.cost + (exchange.cost ?? 0),
    messages: totals.messages + 1,
  }

  if (stored) await usageTotalsTable.update(stored.id, { data: next })
  else await usageTotalsTable.add({ createdAt: Date.now(), data: next })
  await refreshLocalStores('usageTotals')
}
