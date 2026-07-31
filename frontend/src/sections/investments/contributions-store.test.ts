import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVaultStore } from '@/store/vault-store'
import { useContributionsStore, type Contribution } from './contributions-store'

function makeRow(overrides: Partial<Contribution> = {}): Contribution {
  return { date: Date.now(), amount: 500, destination: 'Renda Fixa', ...overrides }
}

describe('contributions-store', () => {
  beforeEach(() => {
    useVaultStore.getState().lock()
    useContributionsStore.setState({ items: [] })
  })

  it('auto-refreshes when the shared vault unlocks, without an explicit refresh() call', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    const row = makeRow({ amount: 12345 })

    useVaultStore.getState().unlock(passphrase)
    await useContributionsStore.getState().addItem(row)

    useVaultStore.getState().lock()
    expect(useContributionsStore.getState().items).toHaveLength(0)

    useVaultStore.getState().unlock(passphrase)
    await vi.waitFor(() => {
      expect(useContributionsStore.getState().items.some((r) => r.amount === 12345)).toBe(true)
    })
  })

  it('addItem/addItems/deleteItem round-trip through the shared vault passphrase', async () => {
    const passphrase = `pw-${crypto.randomUUID()}`
    useVaultStore.getState().unlock(passphrase)

    const row = makeRow({ amount: 111 })
    await useContributionsStore.getState().addItem(row)
    expect(useContributionsStore.getState().items.some((r) => r.amount === 111)).toBe(true)

    const bulk = [makeRow({ amount: 222 }), makeRow({ amount: 333 })]
    await useContributionsStore.getState().addItems(bulk)
    expect(useContributionsStore.getState().items.filter((r) => r.amount === 222 || r.amount === 333)).toHaveLength(2)

    const toDelete = useContributionsStore.getState().items.find((r) => r.amount === 111)
    await useContributionsStore.getState().deleteItem(toDelete!.id)
    expect(useContributionsStore.getState().items.some((r) => r.amount === 111)).toBe(false)
  })
})
