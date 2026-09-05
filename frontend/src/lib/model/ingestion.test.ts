import { describe, expect, it } from 'vitest'
import { ingestionLabelErrors } from './ingestion'
import type { LabelCatalogue } from './label-catalogue'

const catalogue: LabelCatalogue = {
  sections: [{ id: 'finances', label: 'Finanças' }],
  screens: [{ id: 'spending', sectionId: 'finances', label: 'Gastos' }],
  accounts: [{ id: 'Banco A', label: 'Banco A' }],
  cards: [{ id: 'Cartão X', label: 'Cartão X' }],
}

const placed = { sections: ['finances'], screens: ['spending'], account: 'Banco A', card: 'Cartão X' }

describe('what still stands between a row and a table', () => {
  it('is an account, and where it belongs', () => {
    expect(ingestionLabelErrors(placed, catalogue)).toEqual([])
    expect(ingestionLabelErrors({}, catalogue)).toHaveLength(3)
  })

  it('is never a card: a Pix, a salary or a transfer never touched one', () => {
    expect(ingestionLabelErrors({ ...placed, card: undefined }, catalogue)).toEqual([])
    expect(ingestionLabelErrors({ ...placed, account: undefined }, catalogue).join(' ')).toContain('Name the account')
  })

  it('refuses a screen that belongs to a section the row does not name', () => {
    const errors = ingestionLabelErrors({ ...placed, sections: ['notes'] }, catalogue)
    expect(errors.join(' ')).toContain('which this row does not name')
  })

  it('refuses an account or a card nobody set up', () => {
    expect(ingestionLabelErrors({ ...placed, account: 'Banco Z' }, catalogue).join(' ')).toContain('No account is called Banco Z')
    expect(ingestionLabelErrors({ ...placed, card: 'Cartão Z' }, catalogue).join(' ')).toContain('No card is called Cartão Z')
  })
})
