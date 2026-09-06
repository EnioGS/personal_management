/** What a statement may begin with. Anything else is not table work. */
const VERBS = ['select', 'insert', 'update', 'delete'] as const

/**
 * Words that are never table work, whatever they are doing in the statement.
 *
 * A whitelist of verbs is not enough on its own: `INSERT INTO x SELECT ... FROM
 * sqlite_master` begins with an allowed word. These are checked anywhere in the
 * statement, on the skeleton — comments and string literals removed — so a merchant
 * called "Pragma Café" is not mistaken for an instruction.
 */
const FORBIDDEN = ['attach', 'detach', 'pragma', 'vacuum', 'reindex', 'drop', 'alter', 'create', 'trigger', 'sqlite_', 'replace']

/**
 * Whether a statement is table work, and why not when it is not.
 *
 * A whitelist rather than a blacklist, because a blacklist leaks: every SQL dialect has
 * one more way to reach the schema than anybody remembers. Unrecognised shape is refused.
 *
 * This is the outer gate. The inner one is that a write is executed against a copy of the
 * data and turned back into real writes by a layer that knows what a row is — so a
 * statement that gets past this still cannot write anything the app would not recognise.
 */
export function admits(statement: string, knownTables: string[]): string | null {
  const trimmed = statement.trim()
  if (!trimmed) return 'There is no statement here.'

  const skeleton = strip(trimmed).toLowerCase()
  if (skeleton.replace(/;\s*$/, '').includes(';')) {
    return 'One statement at a time: this is two or more.'
  }

  const verb = skeleton.match(/^\s*([a-z]+)/)?.[1] ?? ''
  if (!(VERBS as readonly string[]).includes(verb)) {
    return `Statements may only start with ${VERBS.join(', ').toUpperCase()}. This starts with "${verb}".`
  }

  const forbidden = FORBIDDEN.find((word) => skeleton.includes(word))
  if (forbidden) return `"${forbidden}" is not table work, and this is only for table work.`

  const unknown = tablesNamed(skeleton).filter((name) => !knownTables.some((known) => known.toLowerCase() === name))
  if (unknown.length > 0) {
    return `There is no table called "${unknown[0]}". Call query_vault with no statement for the ones there are.`
  }
  return null
}

/** Whether the statement changes anything, which decides whether it needs planning. */
export function isWrite(statement: string): boolean {
  const verb = strip(statement).trim().toLowerCase().match(/^\s*([a-z]+)/)?.[1] ?? ''
  return verb !== 'select'
}

/** Comments and string literals out, so what is left is structure rather than content. */
function strip(statement: string): string {
  return statement
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
}

/** Every name in a position where a table can stand. */
function tablesNamed(skeleton: string): string[] {
  const names = new Set<string>()
  const pattern = /\b(?:from|join|into|update)\s+("([^"]+)"|[a-z_][a-z0-9_]*)/g
  let match = pattern.exec(skeleton)
  while (match) {
    names.add((match[2] ?? match[1]).toLowerCase())
    match = pattern.exec(skeleton)
  }
  return [...names]
}
