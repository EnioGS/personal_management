# User-configurable tables, accounts and cards replace hardcoded stores

## Status

Accepted — supersedes the fixed-table assumption baked into adr/0007's
otherwise-still-valid navigation registry, and extends adr/0019's local-first
storage model.

## Context

Every table (Spending, Income, Variable Income, Fixed Income, Contributions)
was a compile-time constant: its own Dexie database, its own Zustand store,
its own schema file. That was fine for five tables nobody needed more than
one of. It stopped being fine the moment the requirement became "one table
per credit card" and "one table per bank account" — an unbounded, user-
controlled count that no amount of hardcoding can accommodate, and a real
need to distinguish an account's own statement (money in *and* out) from
undifferentiated spending, which the fixed five-table shape had no way to
express at all.

## Decision

Tables, accounts and cards become data (`lib/model/`), not code:

- **`TableKind`** (`bankLedger` / `cardLedger` / `investmentLedger` /
  `contributions` / `generic`) fixes a table's *columns* — `TABLE_KIND_SCHEMAS`
  in `lib/model/table-kinds.ts`. Table *instances* are unlimited (one
  `cardLedger` per credit card); the column sets are not. Fully user-defined
  columns were considered and rejected for now: it would break CSV import/
  export, the chart layer, and the assistant's tools, all of which are
  schema-driven, for a feature nobody had actually asked for — only the
  table *count* needed to become unbounded, not the column shapes.
- **One `entries` store**, not one store per table. Every user table's rows
  live in a single Dexie table tagged with `tableId`, filtered by
  `entriesForTable()`. Dexie schemas are declared statically at version
  time, so a table created at runtime could never get a Dexie table of its
  own without a version bump and a reload — the one-shared-store shape is
  what makes "create a table from the UI" possible at all.
- **`accounts` and `cards`** are their own config entities. A card always
  has a parent account (`Card.accountId`, required) — deleting an account
  is blocked while any card or table still points at it; archiving is
  offered instead (Settings -> Contas e Cartões).
- **Migration, once, on startup** (`migrate-legacy-db.ts`): each of the five
  old hardcoded tables becomes a `TableDef` plus tagged `Entry` rows, via a
  pure mapping (`legacy-migration.ts`) shared with the file-import upgrader
  below. Additive and idempotent — guarded by a localStorage marker, it
  never touches the old Dexie databases and refuses to run on top of an
  already-existing model (an import, or a table the user already created).
  Income's `source` column folds into the shared `category` field: they
  were the same idea under two names, and one vocabulary now covers money
  in as well as out.
- **Export moves to v3**: `{ config: { accounts, cards, tableDefs,
  categories, categoryRules }, entries, ... }`, so importing into a blank
  browser restores the whole setup, not a pile of untitled data. A v2 file
  upgrades on import through the same mapping the live migration uses; v1
  (encrypted) stays rejected.

## Consequences

Adding "a table per card" or "a table per account" needed no new code —
the account/card config and the "+ Nova tabela" dialog (with a kind and,
where the kind calls for it, an account/card picker) are enough. The
tradeoff is a layer of indirection every table-reading consumer now carries
(kind -> schema, tableId -> rows) that plain per-table stores didn't need —
paid once, here, rather than by every future consumer working around the
old fixed shape. Anyone upgrading loses nothing: existing rows migrate
automatically and the old databases are left in place, unused but intact.
