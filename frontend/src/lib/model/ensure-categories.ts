import type { StoredRow } from '@/lib/local-store/create-local-table'
import type { Category } from './types'

/**
 * Registers every not-yet-seen value as a bare Category (no rule) so it shows up in
 * Settings -> Categorias the moment it's typed or imported anywhere — not just as a
 * per-table suggestion, but as a real entity every other table's combobox can also
 * suggest. Matching is case-insensitive so "Pix" and "pix" don't become two rows.
 *
 * A rule is not created here: an unmatched value already displays under its own raw
 * spelling (see category-resolver.ts), so the bare Category exists only to be visible
 * and to give the unclassified worklist and future rules something to target.
 */
export async function ensureCategoriesExist(
  values: string[],
  existing: StoredRow<Category>[],
  addCategory: (category: Category) => Promise<number>,
): Promise<void> {
  const known = new Set(existing.map((c) => c.name.toLowerCase()))
  const seen = new Set<string>()

  for (const raw of values) {
    const name = raw.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (known.has(key) || seen.has(key)) continue
    seen.add(key)
    await addCategory({ name })
  }
}
