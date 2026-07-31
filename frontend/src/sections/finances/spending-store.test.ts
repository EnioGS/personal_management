import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVaultStore } from '@/store/vault-store'
import { useSpendingStore, type SpendingRow } from './spending-store'

function makeRow(overrides: Partial<SpendingRow> = {}): SpendingRow {
  return { date: Date.now(), category: 'Outros', amount: 42, note: crypto.randomUUID(), ...overrides }
}

describe('spending-store', () => {
  beforeEach(() => {
    useVaultStore.getState().lock()
    useSpendingStore.setState({ items: [] })
  })

  it('auto-refreshes when the shared vault unlocks, without an explicit refresh() call', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    const row = makeRow({ note: 'auto-refresh-marker' })

    useVaultStore.getState().unlock(passphrase)
    await useSpendingStore.getState().addItem(row)

    // Lock clears in-memory items; unlocking again with the same passphrase should
    // repopulate them via the vault subscription, with no explicit refresh() call here.
    useVaultStore.getState().lock()
    expect(useSpendingStore.getState().items).toHaveLength(0)

    useVaultStore.getState().unlock(passphrase)
    await vi.waitFor(() => {
      expect(useSpendingStore.getState().items.some((r) => r.note === 'auto-refresh-marker')).toBe(true)
    })
  })

  it('addItem/addItems/deleteItem/refresh round-trip through the shared vault passphrase', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    useVaultStore.getState().unlock(passphrase)

    const row = makeRow({ note: 'single' })
    await useSpendingStore.getState().addItem(row)
    expect(useSpendingStore.getState().items.some((r) => r.note === 'single')).toBe(true)

    const bulk = [makeRow({ note: 'bulk-a' }), makeRow({ note: 'bulk-b' })]
    await useSpendingStore.getState().addItems(bulk)
    expect(useSpendingStore.getState().items.filter((r) => r.note?.startsWith('bulk-'))).toHaveLength(2)

    const toDelete = useSpendingStore.getState().items.find((r) => r.note === 'single')
    await useSpendingStore.getState().deleteItem(toDelete!.id)
    expect(useSpendingStore.getState().items.some((r) => r.note === 'single')).toBe(false)
  })

  it('clears items when the vault locks', async () => {
    useVaultStore.getState().unlock(`pw-${crypto.randomUUID()}`)
    await useSpendingStore.getState().addItem(makeRow())
    expect(useSpendingStore.getState().items.length).toBeGreaterThan(0)

    useVaultStore.getState().lock()
    expect(useSpendingStore.getState().items).toHaveLength(0)
  })
})
