import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVaultStore } from '@/store/vault-store'
import type { Transaction } from '@/lib/current-value'
import { useVariableIncomeStore } from './variable-income-store'

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return { date: Date.now(), asset: 'ABC', type: 'buy', quantity: 10, price: 5, note: crypto.randomUUID(), ...overrides }
}

describe('variable-income-store', () => {
  beforeEach(() => {
    useVaultStore.getState().lock()
    useVariableIncomeStore.setState({ items: [] })
  })

  it('auto-refreshes when the shared vault unlocks, without an explicit refresh() call', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    const tx = makeTx({ note: 'auto-refresh-marker' })

    useVaultStore.getState().unlock(passphrase)
    await useVariableIncomeStore.getState().addItem(tx)

    useVaultStore.getState().lock()
    expect(useVariableIncomeStore.getState().items).toHaveLength(0)

    useVaultStore.getState().unlock(passphrase)
    await vi.waitFor(() => {
      expect(useVariableIncomeStore.getState().items.some((r) => r.note === 'auto-refresh-marker')).toBe(true)
    })
  })

  it('addItem/addItems/deleteItem round-trip through the shared vault passphrase', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    useVaultStore.getState().unlock(passphrase)

    const tx = makeTx({ note: 'single' })
    await useVariableIncomeStore.getState().addItem(tx)
    expect(useVariableIncomeStore.getState().items.some((r) => r.note === 'single')).toBe(true)

    const bulk = [makeTx({ note: 'bulk-a' }), makeTx({ note: 'bulk-b' })]
    await useVariableIncomeStore.getState().addItems(bulk)
    expect(useVariableIncomeStore.getState().items.filter((r) => r.note?.startsWith('bulk-'))).toHaveLength(2)

    const toDelete = useVariableIncomeStore.getState().items.find((r) => r.note === 'single')
    await useVariableIncomeStore.getState().deleteItem(toDelete!.id)
    expect(useVariableIncomeStore.getState().items.some((r) => r.note === 'single')).toBe(false)
  })
})
