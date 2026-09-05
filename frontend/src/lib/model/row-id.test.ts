import { describe, expect, it } from 'vitest'
import { newRowId } from './row-id'

describe('a row id', () => {
  it('differs between two identical rows, because a bank may report the same charge twice', () => {
    const contents = { date: '01/08/2026', amount: '-10,00' }
    expect(newRowId(contents)).not.toBe(newRowId(contents))
  })

  it('does not depend on the order the contents were written in', () => {
    // Not equality — a seed makes each id unique — but length and shape, which is what
    // anything storing or joining on an id relies on.
    expect(newRowId({ a: '1', b: '2' })).toHaveLength(newRowId({ b: '2', a: '1' }).length)
  })

  it('is hex and fixed-width, so it reads the same in a table as in a query', () => {
    expect(newRowId({ anything: 'at all' })).toMatch(/^[0-9a-f]{16}$/)
    expect(newRowId()).toMatch(/^[0-9a-f]{16}$/)
  })
})
