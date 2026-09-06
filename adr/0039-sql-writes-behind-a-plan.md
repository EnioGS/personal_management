# SQL writes, behind a plan

## Status

Accepted — built on adr/0038's journal, and replaces the write half of the tool
surface described in adr/0032.

## Context

Reading was SQL; writing was a dozen narrow tools that validated what they were
given, and deleting was refused outright. The tools were expressive enough for
the work they anticipated and nothing else: correcting rows by a condition
nobody had thought of meant a tool call per row, or no way at all. The schemas
also cost tokens on every request that opened their set.

The question was how to open writing up without making loss possible.

## Decision

**One tool, `run_sql`**, taking a single SELECT, INSERT, UPDATE or DELETE over
the tables the vault builds. Deleting included: with a journal underneath, the
argument for withholding it was about trust rather than about safety, and it is
the user's app.

**A write is planned before it is made.** The vault is rebuilt from Dexie on
every call, so the statement runs against a copy and the rows are read before
and after; the difference is the plan. This is why it works for any statement
however phrased — nothing has to parse what it intended. The plan reports row
counts by table and operation; `apply: true` makes it happen, and past 200 rows
the exact count has to be passed back, which cannot be done without having run
the plan.

**The gate is a whitelist.** One statement, a verb from the four, every table
known, and no `attach`/`pragma`/`drop`/`create`/`sqlite_` anywhere in the
statement's skeleton — comments and string literals removed first, so a merchant
called "Pragma Café" is not mistaken for an instruction. Blacklists leak;
unrecognised shape is refused.

**Validation moved out of the tools and into write-back.** Accounts, cards,
sections and screens are checked against the live catalogue before anything is
written, whichever path wrote it — the assistant's SQL, the user's, or the tools
that remain. A rule checked inside one tool protected only the writes that
happened to go through it.

**Eight tools leave the schema, and stay in the code**: `query_vault`,
`set_labels`, `set_confirmed_meaning`, `place_confirmed_rows`,
`fill_from_observations`, `add_confirmed_row`, `mark_rows`, `set_source_values`.
Each is one statement now. Switching one back on is a line in `RETIRED_TOOLS`.

**`revise_confirmed_rows` stays**, deliberately. It is expressible as SQL, and
what it adds is not expressiveness: it leaves the correction visible as a pair,
sharing a `row_id`, on the screen where it happened. A raw UPDATE overwrites in
place, and the journal restores the data but not the ability to see what
changed. The metrics table will say whether the model still reaches for it.

`confirm_rows` and `assign_source_columns` stay because they are not row edits:
one is a pipeline of validation, computation and placement, the other is file
metadata with side effects.

## Consequences

- Add-and-mark becomes advisory for anything written as SQL. Accepted; the
  guide asks for it, the tool's description asks for it, and History shows what
  a statement did.
- `run_sql` is a core tool — reading is core, and a write through it is planned
  — so the tool schema a request carries got smaller, not larger.
- A statement that names two tables is diffed across both, because the plan
  compares every table rather than the one the verb mentions.
- `source_filename` on a confirmed table is derived from the observations and
  cannot be written; a statement setting it changes nothing.
