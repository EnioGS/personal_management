import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVaultStore } from '@/store/vault-store'
import type { Transaction } from '@/lib/current-value'
import { useFixedIncomeStore } from './fixed-income-store'

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return { date: Date.now(), asset: 'Tesouro Selic', type: 'buy', quantity: 1, price: 1000, note: crypto.randomUUID(), ...overrides }
}

describe('fixed-income-store', () => {
  beforeEach(() => {
    useVaultStore.getState().lock()
    useFixedIncomeStore.setState({ items: [] })
  })

  it('auto-refreshes when the shared vault unlocks, without an explicit refresh() call', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    const tx = makeTx({ note: 'auto-refresh-marker' })

    useVaultStore.getState().unlock(passphrase)
    await useFixedIncomeStore.getState().addItem(tx)

    useVaultStore.getState().lock()
    expect(useFixedIncomeStore.getState().items).toHaveLength(0)

    useVaultStore.getState().unlock(passphrase)
    await vi.waitFor(() => {
      expect(useFixedIncomeStore.getState().items.some((r) => r.note === 'auto-refresh-marker')).toBe(true)
    })
  })

  it('addItem/addItems/deleteItem round-trip through the shared vault passphrase', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    useVaultStore.getState().unlock(passphrase)

    const tx = makeTx({ note: 'single' })
    await useFixedIncomeStore.getState().addItem(tx)
    expect(useFixedIncomeStore.getState().items.some((r) => r.note === 'single')).toBe(true)

    const bulk = [makeTx({ note: 'bulk-a' }), makeTx({ note: 'bulk-b' })]
    await useFixedIncomeStore.getState().addItems(bulk)
    expect(useFixedIncomeStore.getState().items.filter((r) => r.note?.startsWith('bulk-'))).toHaveLength(2)

    const toDelete = useFixedIncomeStore.getState().items.find((r) => r.note === 'single')
    await useFixedIncomeStore.getState().deleteItem(toDelete!.id)
    expect(useFixedIncomeStore.getState().items.some((r) => r.note === 'single')).toBe(false)
  })
})
