import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { accountsTable, cardsTable } from '@/lib/model/model-db'
import { addAccountTool, addCardTool, listAccountsAndCardsTool } from './settings-tools'

const context = { attachments: [], translate: (key: string) => key } as never

describe('the assistant setting up accounts and cards', () => {
  beforeEach(async () => { await wipeAllData() })

  it('registers an account, and refuses a second one by the same name', async () => {
    const added = JSON.parse(await addAccountTool.execute({ name: 'Nubank', kind: 'checking' }, context))

    expect(added.account).toMatchObject({ name: 'Nubank', kind: 'checking' })
    expect(await addAccountTool.execute({ name: 'nubank', kind: 'savings' }, context)).toContain('already exists')
    expect(await accountsTable.count()).toBe(1)
  })

  it('refuses a kind the app has no meaning for', async () => {
    expect(await addAccountTool.execute({ name: 'X', kind: 'crypto' }, context)).toContain('kind must be one of')
  })

  it('will not register a card without an account to settle against', async () => {
    expect(await addCardTool.execute({ name: 'Cartão', accountId: 99 }, context)).toContain('no account has id 99')
    expect(await cardsTable.count()).toBe(0)
  })

  it('ties a card to the account it is paid from', async () => {
    const account = JSON.parse(await addAccountTool.execute({ name: 'Nubank', kind: 'checking' }, context))
    const card = JSON.parse(await addCardTool.execute({ name: 'Nubank Ultravioleta', accountId: account.id, closingDay: 28, dueDay: 5 }, context))

    expect(card.card).toMatchObject({ name: 'Nubank Ultravioleta', accountId: account.id, closingDay: 28, dueDay: 5 })
    expect(card.settlesAgainst).toBe('Nubank')
  })

  it('ignores a closing day that is not a day of the month', async () => {
    const account = JSON.parse(await addAccountTool.execute({ name: 'Banco', kind: 'checking' }, context))
    const card = JSON.parse(await addCardTool.execute({ name: 'Cartão', accountId: account.id, closingDay: 44 }, context))

    expect(card.card.closingDay).toBeUndefined()
  })

  it('lists what exists, which is what labelling reads', async () => {
    const account = JSON.parse(await addAccountTool.execute({ name: 'Banco', kind: 'checking' }, context))
    await addCardTool.execute({ name: 'Cartão', accountId: account.id }, context)

    const listed = JSON.parse(await listAccountsAndCardsTool.execute({}, context))
    expect(listed.accounts.map((row: { name: string }) => row.name)).toEqual(['Banco'])
    expect(listed.cards[0]).toMatchObject({ name: 'Cartão', accountId: account.id })
  })
})
