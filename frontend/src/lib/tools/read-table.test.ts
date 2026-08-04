import { beforeEach, describe, expect, it } from 'vitest'
import { useSpendingStore } from '@/sections/finances/spending-store'
import { useVaultStore } from '@/store/vault-store'
import { readTableTool } from './read-table'

const context = { attachments: [] }

function unlock() {
  useVaultStore.getState().unlock(`pw-${crypto.randomUUID()}`)
}

describe('readTableTool', () => {
  beforeEach(() => {
    useVaultStore.getState().lock()
    useSpendingStore.setState({ items: [] })
  })

  it('errors when the vault is locked', async () => {
    const result = await readTableTool.execute({ table: 'spending' }, context)
    expect(result).toContain('vault is locked')
  })

  it('errors on an unknown table', async () => {
    unlock()
    const result = await readTableTool.execute({ table: 'nope' }, context)
    expect(result).toContain('unknown table "nope"')
  })

  it('errors on an invalid dateFrom/dateTo', async () => {
    unlock()
    expect(await readTableTool.execute({ table: 'spending', dateFrom: 'not-a-date' }, context)).toContain(
      '"dateFrom" is not a valid date',
    )
    expect(await readTableTool.execute({ table: 'spending', dateTo: 'not-a-date' }, context)).toContain(
      '"dateTo" is not a valid date',
    )
  })

  it('filters rows by an inclusive date range and includes flagged rows, tagged', async () => {
    unlock()
    await useSpendingStore.getState().addItems([
      { date: Date.parse('2026-01-01'), category: 'Outros', amount: 10 },
      { date: Date.parse('2026-02-15'), category: 'Outros', amount: 20 },
      { date: Date.parse('2026-03-01'), category: 'Outros', amount: 30, deleted: true },
    ])

    const result = await readTableTool.execute({ table: 'spending', dateFrom: '2026-02-01', dateTo: '2026-03-01' }, context)

    expect(result).toContain('2 row(s) (1 flagged deleted) of 3 total')
    expect(result).toContain('2026-02-15')
    expect(result).toContain('2026-03-01')
    expect(result).not.toContain('2026-01-01')
    expect(result).toContain('true') // the flagged row's deleted column
  })

  it(
    'rejects an unscoped read once filtered rows exceed the cap',
    async () => {
      unlock()
      const rows = Array.from({ length: 201 }, (_, i) => ({
        date: Date.parse('2026-01-01') + i * 86_400_000,
        category: 'Outros' as const,
        amount: 1,
      }))
      await useSpendingStore.getState().addItems(rows)

      const result = await readTableTool.execute({ table: 'spending' }, context)
      expect(result).toContain('too many to return at once')

      const scopedResult = await readTableTool.execute(
        { table: 'spending', dateFrom: '2026-01-01', dateTo: '2027-01-01' },
        context,
      )
      expect(scopedResult).toContain('too many to return at once')
    },
    // 201 rows each go through a real, deliberately-expensive PBKDF2 (250k iterations) key
    // derivation (lib/crypto/envelope.ts) — comfortably fast locally, but slow CI runners can
    // exceed Vitest's default 5s test timeout purely on this test's unusually large row count.
    30_000,
  )
})
