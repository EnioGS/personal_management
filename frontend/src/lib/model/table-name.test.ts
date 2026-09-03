import { describe, expect, it } from 'vitest'
import { tableDisplayName } from './table-name'

const translate = (key: string) => (key === 'finances:items.movements' ? 'Movements' : key)

describe('what a table is called', () => {
  it('follows the language when the app owns the table', () => {
    expect(tableDisplayName({ name: 'Movimentações', nameKey: 'finances:items.movements' }, translate)).toBe('Movements')
  })

  it('keeps the name an imported table was given', () => {
    expect(tableDisplayName({ name: 'Extrato Nubank' }, translate)).toBe('Extrato Nubank')
  })

  it('falls back to the stored name when the key has no translation', () => {
    expect(tableDisplayName({ name: 'Movimentações', nameKey: 'finances:items.unknown' }, translate)).toBe('Movimentações')
  })
})
