import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { accountsTable, confirmedRowsTable, sourceFilesTable, sourceRowsTable } from '@/lib/model/model-db'
import { journalEntriesTable } from '@/lib/journal/journal-db'
import { listTurns, undoTurn } from '@/lib/journal/journal'
import { JOURNALLED_TABLES } from '@/lib/model/model-db'
import { applyStatement, planStatement } from './write-back'
import type { ConfirmedRow } from '@/lib/model/types'

const confirmed = (over: Partial<ConfirmedRow> = {}): ConfirmedRow => ({
  rowId: 'r1', section: 'finances', screen: 'movements', confirmedAt: 1,
  observations: '{}', category: 'mercado', subcategory: '', value: -10, ...over,
})

beforeEach(async () => {
  await wipeAllData()
  await journalEntriesTable.clear()
  await accountsTable.add({ createdAt: 1, data: { name: 'Conta principal', kind: 'checking' } })
})

describe('what a statement would do', () => {
  it('is worked out on a copy, changing nothing until it is applied', async () => {
    const id = await confirmedRowsTable.add({ createdAt: 1, data: confirmed() })

    const plan = await planStatement(`UPDATE "confirmed__finances__movements" SET category = 'farmácia'`)

    expect(plan.counts['confirmed__finances__movements']).toEqual({ insert: 0, update: 1, delete: 0 })
    expect(((await confirmedRowsTable.get(id))!.data as ConfirmedRow).category).toBe('mercado')
  })

  it('applies what it planned, and the row comes back changed', async () => {
    const id = await confirmedRowsTable.add({ createdAt: 1, data: confirmed() })

    const result = await applyStatement(`UPDATE "confirmed__finances__movements" SET category = 'farmácia', class = 'renda fixa'`)

    expect(result.applied).toBe(true)
    const row = (await confirmedRowsTable.get(id))!.data as ConfirmedRow
    expect(row).toMatchObject({ category: 'farmácia', class: 'renda fixa', value: -10, rowId: 'r1' })
  })

  it('deletes, which is what the assistant could never do before', async () => {
    await confirmedRowsTable.add({ createdAt: 1, data: confirmed() })

    const result = await applyStatement(`DELETE FROM "confirmed__finances__movements"`)

    expect(result.counts['confirmed__finances__movements']).toMatchObject({ delete: 1 })
    expect(await confirmedRowsTable.count()).toBe(0)
  })

  it('inserts a row the statement invented, id and all', async () => {
    await confirmedRowsTable.add({ createdAt: 1, data: confirmed() })

    await applyStatement(`INSERT INTO "confirmed__finances__movements" (row_id, section, screen, category, value, observations)
      VALUES ('r2', 'finances', 'movements', 'padaria', -25, '{}')`)

    const categories = (await confirmedRowsTable.toArray()).map((stored) => (stored.data as ConfirmedRow).category)
    expect(categories).toEqual(['mercado', 'padaria'])
  })

  it('leaves everything alone when nothing matched', async () => {
    await confirmedRowsTable.add({ createdAt: 1, data: confirmed() })

    const result = await applyStatement(`UPDATE "confirmed__finances__movements" SET category = 'x' WHERE category = 'nothing'`)

    expect(result.applied).toBe(false)
    expect(result.changes).toEqual([])
  })
})

describe('what a statement is not allowed to make untrue', () => {
  it('refuses an account nobody registered, whichever path wrote it', async () => {
    await confirmedRowsTable.add({ createdAt: 1, data: confirmed() })

    const result = await applyStatement(`UPDATE "confirmed__finances__movements" SET account = 'Bnaco Inter'`)

    expect(result.applied).toBe(false)
    expect(result.refusals[0]).toContain('Bnaco Inter')
    expect(((await confirmedRowsTable.toArray())[0].data as ConfirmedRow).account).toBeUndefined()
  })

  it('accepts one that exists', async () => {
    await confirmedRowsTable.add({ createdAt: 1, data: confirmed() })

    const result = await applyStatement(`UPDATE "confirmed__finances__movements" SET account = 'Conta principal'`)

    expect(result.applied).toBe(true)
  })

  it('refuses a screen that does not exist in the section named', async () => {
    await confirmedRowsTable.add({ createdAt: 1, data: confirmed() })

    const result = await applyStatement(`UPDATE "confirmed__finances__movements" SET screen = 'nowhere'`)

    expect(result.applied).toBe(false)
    expect(result.refusals.join(' ')).toContain('nowhere')
  })
})

describe('a statement in the journal', () => {
  it('is one turn, carrying the statement, and undoes whole', async () => {
    const id = await confirmedRowsTable.add({ createdAt: 1, data: confirmed() })
    await journalEntriesTable.clear()

    await applyStatement(`DELETE FROM "confirmed__finances__movements"`)
    expect(await confirmedRowsTable.count()).toBe(0)

    const [turn] = await listTurns()
    expect(turn.origin).toBe('sql')
    expect(turn.statement).toContain('DELETE FROM')

    await undoTurn(turn.turnId, JOURNALLED_TABLES as never)

    const restored = (await confirmedRowsTable.get(id))!.data as ConfirmedRow
    expect(restored.category).toBe('mercado')
  })
})

describe('a source row written as SQL', () => {
  it('keeps the columns the file wrote and takes the labels back apart', async () => {
    const sourceId = await sourceFilesTable.add({
      createdAt: 1,
      data: { originalFilename: 'banco.csv', importedAt: 1, originalColumns: ['Data', 'Valor'], assignments: {}, signConvention: { kind: 'asImported' } },
    })
    await sourceRowsTable.add({
      createdAt: 1,
      data: { sourceId, rowId: 's1', values: { source_filename: 'banco.csv', Data: '01/08/2026', Valor: '-10' }, labels: {} },
    })

    const table = (await import('./query-vault')).sourceTableName({ originalFilename: 'banco.csv' } as never, sourceId)
    await applyStatement(`UPDATE "${table}" SET sections = 'finances', screens = 'movements', category = 'mercado', Valor = '-12'`)

    const row = (await sourceRowsTable.toArray())[0].data as { values: Record<string, string>; labels: Record<string, unknown> }
    expect(row.values).toMatchObject({ Data: '01/08/2026', Valor: '-12', source_filename: 'banco.csv' })
    expect(row.labels).toMatchObject({ sections: ['finances'], screens: ['movements'], category: 'mercado' })
  })
})
