import { categoriesTable } from './model-db'
import type { Category } from './types'

/**
 * The category vocabulary has no management screen: it *is* whatever the semantic
 * category labels name. Looking a name up creates it when nobody has used it yet,
 * case-insensitively, so "Mercado" and "mercado" stay one category.
 */
export async function ensureCategoryByName(name: string): Promise<number | undefined> {
  const wanted = name.trim()
  if (!wanted) return undefined
  const existing = (await categoriesTable.toArray()).find((row) => (row.data as Category).name.trim().toLowerCase() === wanted.toLowerCase())
  if (existing) return existing.id
  return categoriesTable.add({ createdAt: Date.now(), data: { name: wanted } satisfies Category })
}

export async function categoryNameById(id: number | undefined): Promise<string | undefined> {
  if (!id) return undefined
  const row = await categoriesTable.get(id)
  return row ? (row.data as Category).name : undefined
}
