import { describe, expect, it } from 'vitest'
import { parsePlacementLabels, resolveSectionLabel, resolveScreenLabel, sectionLabelFor, withDerivedSections, type LabelCatalogue } from './label-catalogue'

const catalogue: LabelCatalogue = {
  sections: [{ id: 'finances', label: 'Finanças' }, { id: 'notes', label: 'Notas' }],
  screens: [
    { id: 'overview', sectionId: 'finances', label: 'Movimentações' },
    { id: 'spending', sectionId: 'finances', label: 'Gastos' },
  ],
  accounts: [{ id: 'Banco A', label: 'Banco A' }],
  cards: [{ id: 'Cartão X', label: 'Cartão X' }],
}

describe('placement labels', () => {
  it('accepts the name on screen or the id behind it, whatever the accents and case', () => {
    expect(resolveSectionLabel(catalogue, 'Finanças')).toBe('finances')
    expect(resolveSectionLabel(catalogue, 'FINANCAS')).toBe('finances')
    expect(resolveScreenLabel(catalogue, 'spending')).toBe('spending')
    expect(resolveScreenLabel(catalogue, ' Gastos ')).toBe('spending')
  })

  it('refuses a name no section or screen has', () => {
    expect(resolveSectionLabel(catalogue, 'Investimentos')).toBeUndefined()
    expect(resolveScreenLabel(catalogue, 'whatever')).toBeUndefined()
  })

  it('takes several values in one cell, and reports the ones it did not know', () => {
    const parsed = parsePlacementLabels('Gastos, overview, nonsense', (value) => resolveScreenLabel(catalogue, value))

    expect(parsed.values).toEqual(['spending', 'overview'])
    expect(parsed.unknown).toEqual(['nonsense'])
  })

  it('shows the current name for a stored id, and the id when it means nothing now', () => {
    expect(sectionLabelFor(catalogue, 'finances')).toBe('Finanças')
    expect(sectionLabelFor(catalogue, 'retired')).toBe('retired')
  })
})

describe('naming the same fact twice', () => {
  it('fills the section in from the screens, so a labelled row is not blocked on bookkeeping', () => {
    expect(withDerivedSections({ screens: ['spending'] }, catalogue)).toEqual({ screens: ['spending'], sections: ['finances'] })
  })

  it('keeps a section somebody named, which may go beyond what the screens imply', () => {
    expect(withDerivedSections({ sections: ['notes'], screens: ['spending'] }, catalogue)).toEqual({ sections: ['notes'], screens: ['spending'] })
  })

  it('leaves a row with no screens alone — there is nothing to derive from', () => {
    expect(withDerivedSections({}, catalogue)).toEqual({})
    expect(withDerivedSections({ screens: ['nothing-called-this'] }, catalogue)).toEqual({ screens: ['nothing-called-this'] })
  })
})
