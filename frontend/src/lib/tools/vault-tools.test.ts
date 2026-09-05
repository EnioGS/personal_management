import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { accountsTable, cardsTable, confirmedRowsTable, sourceRowsTable } from '@/lib/model/model-db'
import { createSourceFile } from '@/lib/model/source-files'
import { assignSourceColumnsTool, confirmRowsTool, setLabelsTool } from './vault-tools'
import type { SourceRow } from '@/lib/model/types'

const context = { attachments: [], translate: (key: string) => key } as never

describe('confirming through the assistant', () => {
  beforeEach(async () => { await wipeAllData() })

  it('knows the accounts the user set up, so a labelled row is not judged unlabelled', async () => {
    await accountsTable.add({ createdAt: 1, data: { name: 'Conta principal', kind: 'checking' } })
    const sourceId = await createSourceFile('nubank.csv', 'Data,Valor\n01/08/2026,-10')
    await assignSourceColumnsTool.execute({ sourceId, assignments: { Data: 'date', Valor: 'value' } }, context)
    const [row] = await sourceRowsTable.toArray()

    await setLabelsTool.execute({
      rowIds: [row.id], sections: 'finances', screens: 'movements', account: 'Conta principal',
    }, context)

    const result = JSON.parse(await confirmRowsTool.execute({ sourceId }, context))

    expect(result).toMatchObject({ confirmed: 1 })
    expect(await confirmedRowsTable.count()).toBe(1)
  })

  it('says what is missing from the rows it left behind, not only how many', async () => {
    const sourceId = await createSourceFile('nubank.csv', 'Data,Valor\n01/08/2026,-10')

    const result = JSON.parse(await confirmRowsTool.execute({ sourceId }, context))

    expect(result.confirmed).toBe(0)
    expect(Object.keys(result.blocking).join(' ')).toContain('Name the account')
    expect((await sourceRowsTable.toArray())[0].data as SourceRow).toBeDefined()
  })

  it('refuses a row whose file never said which column holds the money', async () => {
    await accountsTable.add({ createdAt: 1, data: { name: 'Conta principal', kind: 'checking' } })
    const sourceId = await createSourceFile('nubank.csv', 'Data,Valor\n01/08/2026,-10')
    await assignSourceColumnsTool.execute({ sourceId, assignments: { Data: 'date' } }, context)
    const [row] = await sourceRowsTable.toArray()
    await setLabelsTool.execute({ rowIds: [row.id], sections: 'finances', screens: 'movements', account: 'Conta principal' }, context)

    const result = JSON.parse(await confirmRowsTool.execute({ sourceId }, context))

    expect(result.confirmed).toBe(0)
    expect(Object.keys(result.blocking).join(' ')).toContain('to value')
    expect(await confirmedRowsTable.count()).toBe(0)
  })
})

describe('marking by query', () => {
  beforeEach(async () => { await wipeAllData() })

  it('marks every row a SELECT picks out, not just the first screenful', async () => {
    const { addConfirmedRow, updateConfirmedRow } = await import('@/lib/model/confirmed-rows')
    const { markRowsTool } = await import('./vault-tools')
    for (let index = 0; index < 3; index += 1) {
      const id = await addConfirmedRow('finances', 'movements')
      // Only the middle one is worth keeping: it has both numbers.
      if (index === 1) { await updateConfirmedRow(id, 'date', '01/08/2026'); await updateConfirmedRow(id, 'value', '-10') }
    }

    const result = JSON.parse(await markRowsTool.execute({
      table: 'confirmed',
      selectIds: 'SELECT id FROM "confirmed__finances__movements" WHERE date IS NULL OR value IS NULL',
      reason: 'no date or no value',
    }, context))

    expect(result).toMatchObject({ changed: 2, marked: true })
    const rows = (await confirmedRowsTable.toArray()).map((row) => row.data as { markedForElimination?: boolean; value?: number })
    expect(rows.filter((row) => row.markedForElimination)).toHaveLength(2)
    expect(rows.find((row) => row.value === -10)!.markedForElimination).toBeUndefined()
  })

  it('refuses a query that returns no id to act on', async () => {
    const { markRowsTool } = await import('./vault-tools')

    expect(await markRowsTool.execute({ table: 'confirmed', selectIds: 'SELECT 1' }, context)).toContain('id column')
  })
})

describe('clearing a card, said out loud', () => {
  beforeEach(async () => { await wipeAllData() })

  async function rowWithCard() {
    await accountsTable.add({ createdAt: 1, data: { name: 'Conta principal', kind: 'checking' } })
    await cardsTable.add({ createdAt: 1, data: { name: 'Cartão principal', accountId: 1 } })
    const { addConfirmedRow } = await import('@/lib/model/confirmed-rows')
    const { reviseConfirmedRowsTool } = await import('./vault-tools')
    const id = await addConfirmedRow('finances', 'movements')
    await reviseConfirmedRowsTool.execute({ rowIds: [id], card: 'Cartão principal' }, context)
    return (await confirmedRowsTable.toArray()).find((row) => !(row.data as { markedForElimination?: boolean }).markedForElimination)!
  }

  it('leaves the card alone when the field arrives empty, which is what filling in every field looks like', async () => {
    const { reviseConfirmedRowsTool } = await import('./vault-tools')
    const carrying = await rowWithCard()

    await reviseConfirmedRowsTool.execute({ rowIds: [carrying.id], account: 'Conta principal', card: '' }, context)

    const current = (await confirmedRowsTable.toArray())
      .map((row) => row.data as { card?: string; account?: string; markedForElimination?: boolean })
      .filter((row) => !row.markedForElimination)
    expect(current).toHaveLength(1)
    expect(current[0]).toMatchObject({ card: 'Cartão principal', account: 'Conta principal' })
  })

  it('removes it when that is what was asked for', async () => {
    const { reviseConfirmedRowsTool } = await import('./vault-tools')
    const carrying = await rowWithCard()

    await reviseConfirmedRowsTool.execute({ rowIds: [carrying.id], clearCard: true }, context)

    const current = (await confirmedRowsTable.toArray())
      .map((row) => row.data as { card?: string; markedForElimination?: boolean })
      .filter((row) => !row.markedForElimination)
    expect(current[0].card).toBeUndefined()
  })
})
