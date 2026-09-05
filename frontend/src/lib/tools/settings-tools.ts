import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import { accountsTable, cardsTable } from '@/lib/model/model-db'
import type { Account, AccountKind, Card } from '@/lib/model/types'
import type { ToolDefinition } from './types'

const ACCOUNT_KINDS: AccountKind[] = ['checking', 'savings', 'cash', 'broker']

async function accounts(): Promise<{ id: number; account: Account }[]> {
  return (await accountsTable.toArray()).map((row) => ({ id: row.id, account: row.data as Account }))
}

async function cards(): Promise<{ id: number; card: Card }[]> {
  return (await cardsTable.toArray()).map((row) => ({ id: row.id, card: row.data as Card }))
}

export const listAccountsAndCardsTool: ToolDefinition = {
  name: 'list_accounts_and_cards',
  description: "Lists the accounts and credit cards the user has set up, with each card's parent account. Every row names an account, so read this before labelling \u2014 and add what is missing rather than inventing a name.",
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  execute: async () => JSON.stringify({
    accounts: (await accounts()).map(({ id, account }) => ({ id, ...account })),
    cards: (await cards()).map(({ id, card }) => ({ id, ...card })),
  }),
}

export const addAccountTool: ToolDefinition = {
  name: 'add_account',
  description: `Registers an account the user holds — a checking account, a savings account, cash, or a broker account. Add one when a file's rows plainly belong somewhere that is not set up yet, giving it the name the user would recognise, and say afterwards what you added. Kinds: ${ACCOUNT_KINDS.join(', ')}. A name that is already taken is refused rather than duplicated.`,
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'What the user calls it, e.g. "Nubank" or "Poupança".' },
      kind: { type: 'string', enum: [...ACCOUNT_KINDS] },
      institution: { type: 'string' },
    },
    required: ['name', 'kind'],
    additionalProperties: false,
  },
  execute: async (args) => {
    const name = typeof args.name === 'string' ? args.name.trim() : ''
    if (!name) return 'Error: a name is required.'
    if (!ACCOUNT_KINDS.includes(args.kind as AccountKind)) return `Error: kind must be one of ${ACCOUNT_KINDS.join(', ')}.`
    if ((await accounts()).some(({ account }) => account.name.toLowerCase() === name.toLowerCase())) {
      return `Error: an account called "${name}" already exists. Use it rather than adding a second one.`
    }

    const account: Account = {
      name,
      kind: args.kind as AccountKind,
      ...(typeof args.institution === 'string' && args.institution.trim() ? { institution: args.institution.trim() } : {}),
    }
    const id = await accountsTable.add({ createdAt: Date.now(), data: account })
    await refreshAllLocalStores()
    return JSON.stringify({ id, account })
  },
}

export const addCardTool: ToolDefinition = {
  name: 'add_card',
  description: "Registers a credit card. A card settles against an account, so the account must exist and be named here by its id. closingDay and dueDay are days of the month; leave them out if the user has not said. A name already taken is refused.",
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      accountId: { type: 'number', description: 'The account this card is paid from. Required: a card without one belongs nowhere.' },
      limit: { type: 'number' },
      closingDay: { type: 'number' },
      dueDay: { type: 'number' },
    },
    required: ['name', 'accountId'],
    additionalProperties: false,
  },
  execute: async (args) => {
    const name = typeof args.name === 'string' ? args.name.trim() : ''
    if (!name) return 'Error: a name is required.'
    if (typeof args.accountId !== 'number') return 'Error: accountId is required — a card always settles against an account.'
    const parent = (await accounts()).find(({ id }) => id === args.accountId)
    if (!parent) return `Error: no account has id ${args.accountId}. Call list_accounts_and_cards, or add_account first.`
    if ((await cards()).some(({ card }) => card.name.toLowerCase() === name.toLowerCase())) {
      return `Error: a card called "${name}" already exists. Use it rather than adding a second one.`
    }

    const day = (value: unknown) => (typeof value === 'number' && value >= 1 && value <= 31 ? Math.trunc(value) : undefined)
    const card: Card = {
      name,
      accountId: args.accountId,
      ...(typeof args.limit === 'number' && args.limit > 0 ? { limit: args.limit } : {}),
      ...(day(args.closingDay) ? { closingDay: day(args.closingDay) } : {}),
      ...(day(args.dueDay) ? { dueDay: day(args.dueDay) } : {}),
    }
    const id = await cardsTable.add({ createdAt: Date.now(), data: card })
    await refreshAllLocalStores()
    return JSON.stringify({ id, card, settlesAgainst: parent.account.name })
  },
}
