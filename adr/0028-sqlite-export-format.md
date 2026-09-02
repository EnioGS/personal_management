# Whole-app export moves from JSON (.pmdata) to real SQLite (.db)

## Status

Accepted.

## Context

adr/0019 settled on plain JSON as the export format specifically because it
is human-readable and hand-editable — a deliberate trade once encryption
was dropped. That's still the right property to optimize for, but a `.db`
extension on a JSON file is a false promise: it doesn't open in the SQLite
tools (DB Browser for SQLite, DBeaver, the `sqlite3` CLI) a `.db` extension
implies, and those tools are a considerably better hand-editing experience
than a text editor for a file this shaped — tables, typed columns,
constraints on what a value can be, and the ability to run a `WHERE` clause
instead of scrolling.

## Decision

Export a **real SQLite database**, built client-side with `sql.js` (SQLite
compiled to WASM — no backend, no native binary, fits adr/0009 unchanged).

- **One real table per app table**, not a generic `id/blob` pair — a fixed
  `SqliteTableSchema` per table (`lib/sqlite-schema.ts`) maps each row's
  `data` object onto typed columns (`TEXT`/`INTEGER`/`REAL`), so `accounts`,
  `cards`, `categories`, and the rest look like an ordinary relational
  schema in any SQLite browser, queryable by column.
- **`entries` is the one deliberate exception**: `Entry` rows are dynamic by
  design (adr/0022 — the column set is fixed per `TableKind`, not per app),
  so its schema is one wide table listing every field any current
  `TableKind` uses (from `table-kinds.ts`), mostly `NULL` per row depending
  on kind — the honest relational shape for data whose columns aren't fixed
  app-wide, and it still means `WHERE category = 'Alimentação'` works.
  A `_export_meta` table (`version`, `exported_at`) carries what the JSON
  format's top-level keys used to.
- `lib/sqlite-schema.ts` holds the pure column mapping and SQL-string
  building (fully unit-tested, no WASM involved); `lib/sqlite-export.ts` is
  the thin `sql.js` glue (`buildSqliteFile`/`parseSqliteFile`), exercised
  through the running app rather than Vitest — same split already used for
  other browser-only concerns (`file-io.ts` has no unit tests either).
- `DataExportFile` (the JSON-shaped in-memory type `importData`/
  `parseDataExportFile` already worked with) is unchanged — SQLite is
  purely a new *serialization* of the same structure, so none of the
  existing version-upgrade logic needed touching.
- **Old `.pmdata` JSON exports still import.** Format is detected from the
  bytes themselves (SQLite's own magic header) rather than the file
  extension, so a renamed file still round-trips correctly, and a backup
  made before this change doesn't become unreadable.
- `saveTextFile` (`lib/file-io.ts`) gained a `saveBinaryFile` sibling for
  the `Uint8Array` payload — same picker-or-download-fallback shape, just
  writing bytes instead of text.

## Consequences

`sql.js`'s ~650KB WASM binary ships as its own chunk, loaded lazily only
when an export or import actually happens — it doesn't inflate the app's
main bundle. Adding a genuinely new field to an existing `TableKind` means
also adding one line to `entries`' column list in `sqlite-schema.ts`, a
small maintenance cost this ADR accepts in exchange for typed columns on
the app's actual transaction data rather than a blob. Everything else
(accounts, cards, categories, budgets, notes, the assistant's own config)
has a fixed shape already, so their schemas need no upkeep at all.
