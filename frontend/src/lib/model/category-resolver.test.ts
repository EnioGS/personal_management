import { describe, expect, it } from 'vitest'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import { createCategoryResolver } from './category-resolver'
import type { Category, CategoryRule } from './types'

function category(id: number, name: string): StoredRow<Category> {
  return { id, createdAt: 0, name }
}

function rule(id: number, overrides: Partial<CategoryRule> & Pick<CategoryRule, 'categoryId'>): StoredRow<CategoryRule> {
  return { id, createdAt: 0, match: 'contains', pattern: '', priority: 0, ...overrides }
}

const PIX = category(1, 'PIX')
const SALARY = category(2, 'Salário')

describe('createCategoryResolver', () => {
  it('maps a raw value onto a category by a case-insensitive substring', () => {
    const resolve = createCategoryResolver([PIX], [rule(1, { categoryId: 1, pattern: 'pix' })])

    expect(resolve('PIX TRANSF JOAO 12/03')).toEqual({ label: 'PIX', categoryId: 1 })
    expect(resolve('recebimento Pix')).toEqual({ label: 'PIX', categoryId: 1 })
  })

  it('honours caseSensitive when asked', () => {
    const resolve = createCategoryResolver(
      [PIX],
      [rule(1, { categoryId: 1, pattern: 'PIX', caseSensitive: true })],
    )

    expect(resolve('PIX recebido').categoryId).toBe(1)
    expect(resolve('pix recebido').categoryId).toBeNull()
  })

  it('resolves an unmatched value to itself rather than a catch-all bucket', () => {
    const resolve = createCategoryResolver([PIX], [rule(1, { categoryId: 1, pattern: 'pix' })])

    expect(resolve('Supermercado')).toEqual({ label: 'Supermercado', categoryId: null })
  })

  it('applies rules in priority order, first match winning', () => {
    const resolve = createCategoryResolver(
      [PIX, SALARY],
      [
        rule(1, { categoryId: 2, pattern: 'pix salario', priority: 1 }),
        rule(2, { categoryId: 1, pattern: 'pix', priority: 2 }),
      ],
    )

    // The narrower, higher-priority rule wins even though the broad one also matches.
    expect(resolve('PIX SALARIO ACME').label).toBe('Salário')
    expect(resolve('PIX JOAO').label).toBe('PIX')
  })

  it('supports equals, startsWith and regex matches', () => {
    const resolve = createCategoryResolver(
      [PIX],
      [rule(1, { categoryId: 1, match: 'equals', pattern: 'pix' })],
    )
    expect(resolve('pix').categoryId).toBe(1)
    expect(resolve('pix recebido').categoryId).toBeNull()

    const startsWith = createCategoryResolver(
      [PIX],
      [rule(1, { categoryId: 1, match: 'startsWith', pattern: 'pix' })],
    )
    expect(startsWith('PIX recebido').categoryId).toBe(1)
    expect(startsWith('recebido PIX').categoryId).toBeNull()

    const regex = createCategoryResolver(
      [PIX],
      [rule(1, { categoryId: 1, match: 'regex', pattern: '^pix\\s+\\d+' })],
    )
    expect(regex('PIX 123').categoryId).toBe(1)
    expect(regex('PIX abc').categoryId).toBeNull()
  })

  it('ignores an invalid regex instead of throwing', () => {
    const resolve = createCategoryResolver([PIX], [rule(1, { categoryId: 1, match: 'regex', pattern: '([unclosed' })])

    expect(() => resolve('anything')).not.toThrow()
    expect(resolve('anything').categoryId).toBeNull()
  })

  it('ignores a rule pointing at a category that no longer exists', () => {
    const resolve = createCategoryResolver([], [rule(1, { categoryId: 99, pattern: 'pix' })])

    expect(resolve('PIX joao')).toEqual({ label: 'PIX joao', categoryId: null })
  })

  it('only applies scoped rules to their own table kind', () => {
    const rules = [rule(1, { categoryId: 1, pattern: 'pix', scope: 'bankLedger' })]

    expect(createCategoryResolver([PIX], rules, 'bankLedger')('PIX joao').categoryId).toBe(1)
    expect(createCategoryResolver([PIX], rules, 'cardLedger')('PIX joao').categoryId).toBeNull()
  })

  it('keeps a value unmatched when it has no explicit match string', () => {
    const resolve = createCategoryResolver([PIX], [])

    expect(resolve('PIX')).toEqual({ label: 'PIX', categoryId: null })
    expect(resolve('pix')).toEqual({ label: 'pix', categoryId: null })
  })

  it('treats a non-string raw value as empty', () => {
    const resolve = createCategoryResolver([PIX], [rule(1, { categoryId: 1, pattern: 'pix' })])

    expect(resolve(undefined)).toEqual({ label: '', categoryId: null })
  })
})
