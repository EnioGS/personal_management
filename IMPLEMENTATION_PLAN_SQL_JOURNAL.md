# Full SQL for the agent, backed by a journal

Four layers, each independently useful and testable, built in this order. Phase 1
is worth shipping alone: it protects the tools that already exist, and nothing
after it is safe without it.

## Phase 1 — The journal

Hooked into the Dexie tables themselves rather than the store factory: tools
write to `confirmedRowsTable` and friends directly, so the tables are what
everything imports and the only place every write passes through. A journalling
proxy intercepts the write methods and lets everything else through untouched.

An entry is `{ turnId, at, table, rowId, op, before, after, origin, statement?,
profile? }`. `turnId` groups everything one assistant message did, which is the
only granularity anyone wants to undo.

Retention: 90 days, trimmed oldest-first, with a size guard for quota. Undo
replays before-images in reverse inside one transaction, and refuses if a row
has changed since — so undo cannot silently clobber later work.

A History panel lists turns with row counts by table, and one Undo per turn.

## Phase 2 — Write-back

`query_vault` builds a fresh sql.js database from Dexie each call, so a write
there changes a copy. Write-back snapshots the affected tables, runs the
statement, diffs by primary key, and applies inserts/updates/deletes to Dexie in
one transaction, journalling before-images.

Views are read-only in SQLite without INSTEAD OF triggers, so writes target the
base tables (`confirmed_rows`, `source_rows`). The guide must say so.

Validation moves out of the tools and into this layer: accounts, cards, sections
and screens are checked before a batch commits, so every write path is covered
rather than the one tool that happened to check.

## Phase 3 — The gate

One statement, verb in `SELECT|INSERT|UPDATE|DELETE`, every table known, and no
`ATTACH`/`PRAGMA`/`DROP`/`ALTER`/`CREATE`/`VACUUM`/`sqlite_*` writes. A
whitelist, because blacklists leak.

Writes dry-run first and report what they would change; applying takes a second
call, and above a row threshold it refuses unless the count has been reported.

## Phase 4 — Retirement

Out of the schema, code kept: `mark_rows`, `place_confirmed_rows`, `set_labels`,
`set_confirmed_meaning`, `fill_from_observations`, `add_confirmed_row`,
`update_source_value`.

Kept: `revise_confirmed_rows` (the correction pair stays visible, and the
metrics table will say whether the model still reaches for it), `confirm_rows`
and `assign_source_columns` (pipelines with side effects, not row edits),
`new_row_id`, the read tools, rules and notes.

## Risks

The add-and-mark discipline becomes advisory for anything written as SQL.
Multi-table statements must diff every table they name. A delete that orphans
dependents is refused. Phase 1 ships before Phase 3 opens writes, so the undo
log predates the code that most needs it.
