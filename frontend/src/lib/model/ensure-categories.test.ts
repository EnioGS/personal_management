import { describe, expect, it, vi } from 'vitest'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import { ensureCategoriesExist } from './ensure-categories'
import type { Category } from './types'

function category(id: number, name: string): StoredRow<Category> {
  return { id, createdAt: 0, name }
}

describe('ensureCategoriesExist', () => {
  it('creates a category for a value never seen before', async () => {
    const addCategory = vi.fn().mockResolvedValue(1)

    await ensureCategoriesExist(['PIX'], [], addCategory)

    expect(addCategory).toHaveBeenCalledExactlyOnceWith({ name: 'PIX' })
  })

  it('does not duplicate a category that already exists, case-insensitively', async () => {
    const addCategory = vi.fn().mockResolvedValue(1)

    await ensureCategoriesExist(['pix'], [category(1, 'PIX')], addCategory)

    expect(addCategory).not.toHaveBeenCalled()
  })

  it('does not create the same new value twice in one call', async () => {
    const addCategory = vi.fn().mockResolvedValue(1)

    await ensureCategoriesExist(['Mercado', 'mercado', 'MERCADO'], [], addCategory)

    expect(addCategory).toHaveBeenCalledTimes(1)
  })

  it('ignores blank values', async () => {
    const addCategory = vi.fn().mockResolvedValue(1)

    await ensureCategoriesExist(['', '   '], [], addCategory)

    expect(addCategory).not.toHaveBeenCalled()
  })

  it('trims before comparing and storing', async () => {
    const addCategory = vi.fn().mockResolvedValue(1)

    await ensureCategoriesExist(['  Aluguel  '], [], addCategory)

    expect(addCategory).toHaveBeenCalledExactlyOnceWith({ name: 'Aluguel' })
  })
})
