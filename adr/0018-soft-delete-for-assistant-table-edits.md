# Soft-delete for anything the assistant removes or corrects

> **Since adr/0031**: the assistant no longer edits or deletes table rows at all; it
> works in the ingestion centre, where discarding a confirmed row flags its entry
> exactly as this ADR describes. The soft-delete decision stands — it is what makes
> discarding reversible — but the tools it was written for are gone.

## Status

Accepted — extends the tool-calling architecture (adr/0017).

## Context

`write_to_table` only ever adds rows — a mistake there is trivially fixed by deleting the extra row. Giving the assistant a reconciliation workflow (compare an attached file against existing Finances/Investments data, skip what's already there, fix what's wrong) means it also needs to read existing rows and, sometimes, decide an existing one is a duplicate or wrong. That's a different risk category: a bad judgment call there overwrites or hides something real, and unless the user happens to check that exact row, they might not notice.

## Decision

Nothing a tool does to an existing row is ever a hard delete or an in-place overwrite. Every writable table's row type gets an optional `deleted?: boolean` field (no `TableSchema`/`ColumnDef` entry — stays invisible to CSV export/import and the manual add-row form, confirmed those only touch keys the schema lists):

- `delete_table_rows` only sets `deleted: true` — the row still exists, still shows (faded, not hidden) in the table UI, still returned by `read_table` (tagged, so the model can reason about it).
- `update_table_rows` never mutates in place: it flags the original row deleted and writes a new row with the corrected values, preserving history. The new row is created *before* the original is flagged, so a failure partway through leaves a harmless duplicate rather than silently losing data.
- `restore_table_rows` is the only way to clear the flag — a dedicated tool, not a mode switch on delete, so "undo" is never ambiguous.
- Charts and totals (Overview balance, position value, allocation pie, monthly buckets) filter flagged rows out at each call site — `lib/aggregations.ts`/`lib/current-value.ts` themselves stay generic/unfiltered, callers pass them the filtered array.

Only the user can permanently remove a flagged row, via a new "delete flagged rows" button (`components/data-table/delete-flagged-rows-button.tsx`) added next to each table's CSV buttons, gated behind a confirmation dialog. No tool has access to the underlying hard-delete (`removeMany`/`deleteItems`, added to the encrypted-store factory alongside the existing bulk-add).

## Consequences

The assistant can never destroy or silently corrupt existing financial data — the worst it can do is mislabel a flag, which is a one-click `restore_table_rows` away from undone, or leave a harmless duplicate row behind. This is more back-and-forth than a hard update would be (two writes instead of one, plus the model needing `read_table` first to find the row id), and it means flagged-but-not-yet-purged rows accumulate until the user clears them — an accepted tradeoff for keeping every assistant-driven change to existing data reversible by construction, not by discipline.
