import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVaultStore } from '@/store/vault-store'
import { useIncomeStore, type IncomeRow } from './income-store'

function makeRow(overrides: Partial<IncomeRow> = {}): IncomeRow {
  return { date: Date.now(), source: 'Salário', amount: 1000, note: crypto.randomUUID(), ...overrides }
}

describe('income-store', () => {
  beforeEach(() => {
    useVaultStore.getState().lock()
    useIncomeStore.setState({ items: [] })
  })

  it('auto-refreshes when the shared vault unlocks, without an explicit refresh() call', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    const row = makeRow({ note: 'auto-refresh-marker' })

    useVaultStore.getState().unlock(passphrase)
    await useIncomeStore.getState().addItem(row)

    useVaultStore.getState().lock()
    expect(useIncomeStore.getState().items).toHaveLength(0)

    useVaultStore.getState().unlock(passphrase)
    await vi.waitFor(() => {
      expect(useIncomeStore.getState().items.some((r) => r.note === 'auto-refresh-marker')).toBe(true)
    })
  })

  it('addItem/addItems/deleteItem/refresh round-trip through the shared vault passphrase', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    useVaultStore.getState().unlock(passphrase)

    const row = makeRow({ note: 'single' })
    await useIncomeStore.getState().addItem(row)
    expect(useIncomeStore.getState().items.some((r) => r.note === 'single')).toBe(true)

    const bulk = [makeRow({ note: 'bulk-a' }), makeRow({ note: 'bulk-b' })]
    await useIncomeStore.getState().addItems(bulk)
    expect(useIncomeStore.getState().items.filter((r) => r.note?.startsWith('bulk-'))).toHaveLength(2)

    const toDelete = useIncomeStore.getState().items.find((r) => r.note === 'single')
    await useIncomeStore.getState().deleteItem(toDelete!.id)
    expect(useIncomeStore.getState().items.some((r) => r.note === 'single')).toBe(false)
  })

  it('clears items when the vault locks', async () => {
    useVaultStore.getState().unlock(`pw-${crypto.randomUUID()}`)
    await useIncomeStore.getState().addItem(makeRow())
    expect(useIncomeStore.getState().items.length).toBeGreaterThan(0)

    useVaultStore.getState().lock()
    expect(useIncomeStore.getState().items).toHaveLength(0)
  })
})
