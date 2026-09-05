import { describe, expect, it } from 'vitest'
import { ingestionLabelErrors } from './ingestion'
import type { LabelCatalogue } from './label-catalogue'

const catalogue: LabelCatalogue = {
  sections: [{ id: 'finances', label: 'Finanças' }],
  screens: [{ id: 'spending', sectionId: 'finances', label: 'Gastos' }],
  accounts: [{ id: 'Banco A', label: 'Banco A' }],
  cards: [{ id: 'Cartão X', label: 'Cartão X' }],
}

describe('what still stands between a row and a table', () => {
  it('is placement, and only placement', () => {
    expect(ingestionLabelErrors({ sections: ['finances'], screens: ['spending'] }, catalogue)).toEqual([])
    expect(ingestionLabelErrors({}, catalogue)).toHaveLength(2)
  })

  it('refuses a screen that belongs to a section the row does not name', () => {
    const errors = ingestionLabelErrors({ sections: ['notes'], screens: ['spending'] }, catalogue)
    expect(errors.join(' ')).toContain('which this row does not name')
  })

  it('refuses an account or a card nobody set up, and accepts having neither', () => {
    expect(ingestionLabelErrors({ sections: ['finances'], screens: ['spending'] }, catalogue)).toEqual([])
    expect(ingestionLabelErrors({ sections: ['finances'], screens: ['spending'], account: 'Banco A', card: 'Cartão X' }, catalogue)).toEqual([])

    const errors = ingestionLabelErrors({ sections: ['finances'], screens: ['spending'], account: 'Banco Z' }, catalogue)
    expect(errors.join(' ')).toContain('No account is called Banco Z')
  })
})
