import type { EntityTable } from 'dexie'
import type { LocalRow } from '@/lib/local-store/create-local-table'
import { isJournalling, record } from './journal'

/** The methods that change something. Everything else passes through untouched. */
const WRITES = new Set(['add', 'update', 'put', 'delete', 'bulkAdd', 'bulkPut', 'bulkDelete'])

/**
 * A Dexie table that remembers what it used to hold.
 *
 * Wrapped here rather than in the store factory because the tools write to these tables
 * directly — the table is the one thing every write path has in common. A proxy rather
 * than a rewritten API, so nothing that uses Dexie has to know: `where`, `orderBy`, `get`
 * and the rest are the same objects they were.
 *
 * `clear` is deliberately not journalled. It is what wiping the vault and importing a file
 * do, and a log holding a copy of everything that was ever wiped protects nobody from
 * anything — those paths have the export for that.
 */
export function journalled(table: EntityTable<LocalRow, 'id'>, name: string): EntityTable<LocalRow, 'id'> {
  return new Proxy(table, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown
      if (typeof value !== 'function') return value
      const method = value as (...args: unknown[]) => Promise<unknown>
      if (!WRITES.has(String(property))) return method.bind(target)

      return async (...args: unknown[]) => {
        if (!isJournalling()) return method.apply(target, args)
        const before = await beforeImages(target, String(property), args)
        const result = await method.apply(target, args)
        await record(await entriesFor(target, name, String(property), args, before, result))
        return result
      }
    },
  }) as EntityTable<LocalRow, 'id'>
}

/** What the rows about to be written look like now, read before anything changes them. */
async function beforeImages(table: EntityTable<LocalRow, 'id'>, method: string, args: unknown[]): Promise<Map<number, LocalRow>> {
  const ids = targetIds(method, args)
  if (ids.length === 0) return new Map()
  const rows = await table.bulkGet(ids)
  return new Map(rows.filter((row): row is LocalRow => !!row).map((row) => [row.id, row]))
}

function targetIds(method: string, args: unknown[]): number[] {
  if (method === 'update' || method === 'delete') return typeof args[0] === 'number' ? [args[0]] : []
  if (method === 'bulkDelete') return (args[0] as number[]) ?? []
  if (method === 'put') return idsOf([args[0]])
  if (method === 'bulkPut') return idsOf((args[0] as LocalRow[]) ?? [])
  return []
}

function idsOf(rows: unknown[]): number[] {
  return rows.map((row) => (row as { id?: number })?.id).filter((id): id is number => typeof id === 'number')
}

async function entriesFor(
  table: EntityTable<LocalRow, 'id'>,
  name: string,
  method: string,
  args: unknown[],
  before: Map<number, LocalRow>,
  result: unknown,
): Promise<Parameters<typeof record>[0]> {
  const entry = (rowId: number, op: 'insert' | 'update' | 'delete', after: unknown) =>
    ({ table: name, rowId, op, before: before.get(rowId) ?? null, after })

  if (method === 'delete' || method === 'bulkDelete') {
    return targetIds(method, args).map((id) => entry(id, 'delete', null))
  }

  // An insert's id is whatever Dexie just handed back; an update's rows are read again,
  // because `update` takes a patch rather than the row it produced.
  const ids = method === 'add' ? [result as number]
    : method === 'bulkAdd' ? (Array.isArray(result) ? (result as number[]) : [])
    : targetIds(method, args)
  if (ids.length === 0) return []

  const after = await table.bulkGet(ids)
  return ids.map((id, index) => {
    const wasThere = before.has(id)
    return entry(id, wasThere ? 'update' : 'insert', after[index] ?? null)
  })
}
