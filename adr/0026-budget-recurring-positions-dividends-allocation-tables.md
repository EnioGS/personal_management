# Orçamento, Recorrentes, Posições, Proventos, Alocação, and a Tabelas settings page

## Status

Accepted — the six items adr/0022 through adr/0025 deliberately left as
"suggestions, not confirmed requirements" when the multi-account rework was
planned. Requested afterward, once the foundation existed to build them on.

## Context

Each of these is additive to the existing model (adr/0022) and dashboard
patterns (adr/0025) rather than a new architectural direction, so this ADR
covers all six together instead of one each — matching how they were
scoped and delivered as one follow-up pass.

## Decision

**Orçamento** (Finanças): a `Budget { categoryId, monthlyAmount }` entity,
compared each month against actual spend grouped by category
(`groupByKey` over `useDashboardEntries` scoped to that month). A category
with neither a budget nor spend this month doesn't appear — a budget screen
with every category the user has ever used, most at zero, is noise.

**Recorrentes** (Finanças): pattern detection, not declared subscriptions.
`detectRecurringEntries` (`lib/model/recurring.ts`) groups outgoing entries
by category and amount rounded to the nearest whole currency unit — small
month-to-month variance (fees, rounding) shouldn't split one subscription
into two groups — and flags a group once it spans at least 3 distinct
months. Distinct *months*, not occurrences: two charges in the same month
is not "recurring" evidence, it's one busy month. This surfaces what
already repeated; it is not a forecast.

**Posições** (Investimentos): `computePositions` (`lib/current-value.ts`,
alongside the `getCurrentValue` it reuses) turns a transaction list into
one row per asset still held — quantity, the weighted average of *buy*
prices only (a sell doesn't change what was paid for the shares still
held), and current value at the existing book-value definition (last
transaction price, not a live quote — same caveat `getCurrentValue`
already carried). An asset sold down to zero drops out: a closed position
isn't a current holding. Reads across every `investmentLedger` table at
once, like the existing Investments Overview — a position is portfolio-wide,
not scoped to whichever one ledger happens to be selected.

**Proventos** (Investimentos): a new `TableKind` (`dividends`: date, asset,
amount, note), not a `type` value bolted onto the existing buy/sell
transaction schema — dividends aren't a third kind of transaction, they're
a different kind of record with no quantity/price. Otherwise an ordinary
table-workspace panel, identical in shape to Aportes.

**Alocação** (Investimentos): an `AllocationTarget { asset, targetPercent }`
per asset, compared against each asset's actual share of total current
value (from Posições' own numbers, so the two screens can never disagree).
An asset with a target but no current position still shows, at 0% actual —
a target you're meant to be building toward from zero is exactly the case
this screen exists for.

**Tabelas** (Settings): every table across every section in one list, with
the same rename/delete the per-workspace `TableMenu` already offers. Not a
replacement for that menu — it exists for finding and acting on a table
you are *not* currently looking at, which the workspace-local menu
structurally cannot do.

Both new entities travel in the export file (`lib/data-file.ts`'s `TABLES`
map) without a version bump: `parseDataExportFile` already fills in a table
key a given file predates rather than rejecting it (proven by an existing
test), so older v3 files keep importing cleanly with empty
budgets/allocationTargets.

## Consequences

All six read from data that already existed for other reasons (entries,
positions, categories) — none needed a new sync/reconciliation step. The
cost is two more Dexie tables (`budgets`, `allocationTargets`, added via a
`db.version(2).stores(...)` that only declares what's new — Dexie carries
every unmentioned table over unchanged) and two more entries in the export
schema, kept forward- and backward-compatible by the existing
fill-in-missing-keys behavior rather than a new migration.
