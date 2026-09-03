import { normalizeAmount } from './ingestion-duplicates'
import { parseDateValue } from '@/lib/parse-date'

/**
 * Filtering, sorting and paging over rows held in memory, shared by the assistant's
 * tools and the screens. It is deliberately not Dexie-aware: rows are stored as JSON
 * blobs with indexes only on id and createdAt, so any question about a real field
 * costs a table read regardless — and the analytics screens hold every row anyway.
 * What matters at 1,700 rows is asking a precise question instead of sweeping.
 */

export type FilterOperator =
  | 'contains' | 'notContains'
  | 'equals' | 'notEquals'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'in' | 'notIn'
  | 'isEmpty' | 'isNotEmpty'

export interface RowFilter {
  field: string
  op: FilterOperator
  value?: string | number | (string | number)[]
  /** Text comparisons ignore case and accents unless this is set. */
  caseSensitive?: boolean
}

export type SortType = 'text' | 'number' | 'date'

export interface RowQuery {
  filters?: RowFilter[]
  /** 'all' (default) requires every filter; 'any' requires at least one. */
  match?: 'all' | 'any'
  sort?: { field: string; direction?: 'asc' | 'desc'; type?: SortType }
  offset?: number
  limit?: number
}

export type FieldResolver<T> = (row: T, field: string) => unknown

/** Comparison form for text: case and accents are noise when matching a description. */
export function comparableText(value: unknown, caseSensitive = false): string {
  const text = String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  return caseSensitive ? text : text.toLowerCase()
}

function asList(value: RowFilter['value']): (string | number)[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value]
}

function matchesFilter<T>(row: T, filter: RowFilter, resolve: FieldResolver<T>): boolean {
  const raw = resolve(row, filter.field)
  const text = comparableText(raw, filter.caseSensitive)
  const wanted = comparableText(Array.isArray(filter.value) ? '' : filter.value, filter.caseSensitive)

  switch (filter.op) {
    case 'isEmpty': return text === ''
    case 'isNotEmpty': return text !== ''
    case 'contains': return wanted !== '' && text.includes(wanted)
    case 'notContains': return wanted === '' || !text.includes(wanted)
    case 'equals': return text === wanted
    case 'notEquals': return text !== wanted
    case 'in': return asList(filter.value).some((candidate) => comparableText(candidate, filter.caseSensitive) === text)
    case 'notIn': return !asList(filter.value).some((candidate) => comparableText(candidate, filter.caseSensitive) === text)
    default: {
      // Numeric comparisons: a value that is not a number never satisfies them, rather
      // than being coerced to 0 and quietly passing "less than 10".
      const left = normalizeAmount(raw)
      const right = normalizeAmount(Array.isArray(filter.value) ? undefined : filter.value)
      if (left === null || right === null) return false
      if (filter.op === 'gt') return left > right
      if (filter.op === 'gte') return left >= right
      if (filter.op === 'lt') return left < right
      return left <= right
    }
  }
}

/** The value a sort orders by, or null when this row has nothing sortable in it. */
function sortKey(value: unknown, type: SortType): string | number | null {
  if (type === 'text') {
    const text = comparableText(value)
    return text === '' ? null : text
  }
  return type === 'date' ? parseDateValue(value) : normalizeAmount(value)
}

export interface QueryResult<T> {
  /** Rows the query looked at. */
  total: number
  /** Rows that passed the filters. */
  matched: number
  offset: number
  returned: number
  hasMore: boolean
  rows: T[]
}

export function queryRows<T>(items: readonly T[], resolve: FieldResolver<T>, query: RowQuery = {}): QueryResult<T> {
  const filters = query.filters ?? []
  const matchAny = query.match === 'any'
  const filtered = filters.length === 0
    ? [...items]
    : items.filter((row) => (matchAny
      ? filters.some((filter) => matchesFilter(row, filter, resolve))
      : filters.every((filter) => matchesFilter(row, filter, resolve))))

  if (query.sort) {
    const { field, direction = 'asc', type = 'text' } = query.sort
    const sign = direction === 'desc' ? -1 : 1
    filtered.sort((left, right) => {
      const a = sortKey(resolve(left, field), type)
      const b = sortKey(resolve(right, field), type)
      // Unsortable values stay last in both directions: reversing the order should not
      // fill the top of the table with blank rows.
      if (a === null && b === null) return 0
      if (a === null) return 1
      if (b === null) return -1
      const compared = typeof a === 'string' ? a.localeCompare(String(b)) : a - Number(b)
      return compared === 0 ? 0 : compared * sign
    })
  }

  const offset = Math.max(0, Math.floor(query.offset ?? 0))
  const limit = query.limit === undefined ? filtered.length : Math.max(0, Math.floor(query.limit))
  const page = filtered.slice(offset, offset + limit)
  return { total: items.length, matched: filtered.length, offset, returned: page.length, hasMore: offset + page.length < filtered.length, rows: page }
}

export interface ValueGroup {
  value: string
  count: number
}

/**
 * Value frequencies for one field, most common first — the cheap way to find what a
 * rule could cover before writing it, instead of reading rows until a pattern appears.
 */
export function groupRows<T>(items: readonly T[], resolve: FieldResolver<T>, field: string, limit = 20): ValueGroup[] {
  const counts = new Map<string, { value: string; count: number }>()
  for (const row of items) {
    const value = String(resolve(row, field) ?? '').trim()
    const key = comparableText(value)
    const bucket = counts.get(key)
    if (bucket) bucket.count += 1
    else counts.set(key, { value, count: 1 })
  }
  return [...counts.values()].sort((left, right) => right.count - left.count || left.value.localeCompare(right.value)).slice(0, limit)
}
