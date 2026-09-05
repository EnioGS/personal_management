import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { accountsTable, confirmedRowsTable, sourceRowsTable } from '@/lib/model/model-db'
import { createSourceFile } from '@/lib/model/source-files'
import { confirmRowsTool, setLabelsTool } from './vault-tools'
import type { SourceRow } from '@/lib/model/types'

const context = { attachments: [], translate: (key: string) => key } as never

describe('confirming through the assistant', () => {
  beforeEach(async () => { await wipeAllData() })

  it('knows the accounts the user set up, so a labelled row is not judged unlabelled', async () => {
    await accountsTable.add({ createdAt: 1, data: { name: 'Conta principal', kind: 'checking' } })
    const sourceId = await createSourceFile('nubank.csv', 'Data,Valor\n01/08/2026,-10')
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
})
