import { describeVault, queryVault } from '@/lib/sql/query-vault'
import { admits, isWrite } from '@/lib/sql/statement-gate'
import { applyStatement, planStatement } from '@/lib/sql/write-back'
import type { ToolDefinition } from './types'

/**
 * Past this many rows a change is reported before it is made.
 *
 * Not a limit on what may be done — anything may be done — but on what may be done
 * without saying so first. A statement that rewrites twelve hundred rows is either the
 * point of the request or a mistake, and the difference is a sentence to the user.
 */
const REPORT_ABOVE = 200

export const runSqlTool: ToolDefinition = {
  name: 'run_sql',
  description: "Runs one statement against the user's data: SELECT, INSERT, UPDATE or DELETE, over the tables query_vault lists. A write is planned first and changes nothing — you get the row counts it would touch. Pass apply: true to make it happen; past 200 rows also pass acknowledgedRows with the exact number the plan reported, after telling the user what it will do. Everything a statement changes is one entry in the history, undoable whole. Deleting is allowed here; prefer revise_confirmed_rows when changing a field across many rows, so the correction stays visible as a pair.",
  parameters: {
    type: 'object',
    properties: {
      statement: { type: 'string', description: 'One statement. Omit to describe the tables instead.' },
      apply: { type: 'boolean', description: 'Make the change. Without it a write is only planned.' },
      acknowledgedRows: { type: 'number', description: 'The exact row count the plan reported, for a change past 200 rows.' },
    },
    additionalProperties: false,
  },
  execute: async (args) => {
    const statement = typeof args.statement === 'string' ? args.statement.trim() : ''
    if (!statement) return JSON.stringify({ tables: await describeVault(), note: 'Pass a statement to read or change any of these.' })

    const tables = (await describeVault()).map((table) => table.name)
    const refusal = admits(statement, tables)
    if (refusal) return `Error: ${refusal}`

    if (!isWrite(statement)) {
      try { return JSON.stringify(await queryVault(statement)) }
      catch (error) { return `Error: ${error instanceof Error ? error.message : 'that query could not run.'}` }
    }

    try {
      const plan = await planStatement(statement)
      const rows = plan.changes.length

      if (plan.refusals.length > 0) return JSON.stringify({ applied: false, counts: plan.counts, refused: plan.refusals })
      if (rows === 0) return JSON.stringify({ applied: false, counts: {}, note: 'That statement changes nothing.' })
      if (args.apply !== true) {
        return JSON.stringify({
          applied: false,
          rows,
          counts: plan.counts,
          sample: plan.changes.slice(0, 3),
          note: rows > REPORT_ABOVE
            ? `Tell the user this changes ${rows} rows, then call again with apply: true and acknowledgedRows: ${rows}.`
            : 'Call again with apply: true to make it happen.',
        })
      }
      if (rows > REPORT_ABOVE && args.acknowledgedRows !== rows) {
        return `Error: this changes ${rows} rows. Tell the user, then pass acknowledgedRows: ${rows} with apply: true.`
      }

      const result = await applyStatement(statement)
      return JSON.stringify({ applied: result.applied, rows: result.changes.length, counts: result.counts, refused: result.refusals })
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : 'that statement could not run.'}`
    }
  },
}
