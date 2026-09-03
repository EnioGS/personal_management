import type { TableDef } from './types'

/**
 * What to call a table on screen.
 *
 * A table the app owns is named after the screen it belongs to, in whatever language
 * the app is speaking; anything imported from an older vault keeps the name it was
 * given, because that name is the only record of what it held.
 */
export function tableDisplayName(table: Pick<TableDef, 'name' | 'nameKey'>, translate: (key: string) => string): string {
  if (!table.nameKey) return table.name
  const translated = translate(table.nameKey)
  return translated === table.nameKey ? table.name : translated
}
