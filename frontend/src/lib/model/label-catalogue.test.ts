import { describe, expect, it } from 'vitest'
import { parsePlacementLabels, resolveSectionLabel, resolveSubsectionLabel, sectionLabelFor, withDerivedSections, type LabelCatalogue } from './label-catalogue'

const catalogue: LabelCatalogue = {
  sections: [{ id: 'finances', label: 'Finanças' }, { id: 'notes', label: 'Notas' }],
  subsections: [
    { id: 'overview', sectionId: 'finances', label: 'Movimentações' },
    { id: 'spending', sectionId: 'finances', label: 'Gastos' },
  ],
}

describe('placement labels', () => {
  it('accepts the name on screen or the id behind it, whatever the accents and case', () => {
    expect(resolveSectionLabel(catalogue, 'Finanças')).toBe('finances')
    expect(resolveSectionLabel(catalogue, 'FINANCAS')).toBe('finances')
    expect(resolveSubsectionLabel(catalogue, 'spending')).toBe('spending')
    expect(resolveSubsectionLabel(catalogue, ' Gastos ')).toBe('spending')
  })

  it('refuses a name no section or screen has', () => {
    expect(resolveSectionLabel(catalogue, 'Investimentos')).toBeUndefined()
    expect(resolveSubsectionLabel(catalogue, 'whatever')).toBeUndefined()
  })

  it('takes several values in one cell, and reports the ones it did not know', () => {
    const parsed = parsePlacementLabels('Gastos, overview, nonsense', (value) => resolveSubsectionLabel(catalogue, value))

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
    expect(withDerivedSections({ subsections: ['spending'] }, catalogue)).toEqual({ subsections: ['spending'], sections: ['finances'] })
  })

  it('keeps a section somebody named, which may go beyond what the screens imply', () => {
    expect(withDerivedSections({ sections: ['notes'], subsections: ['spending'] }, catalogue)).toEqual({ sections: ['notes'], subsections: ['spending'] })
  })

  it('leaves a row with no screens alone — there is nothing to derive from', () => {
    expect(withDerivedSections({}, catalogue)).toEqual({})
    expect(withDerivedSections({ subsections: ['nothing-called-this'] }, catalogue)).toEqual({ subsections: ['nothing-called-this'] })
  })
})
