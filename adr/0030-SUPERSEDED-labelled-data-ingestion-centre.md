# Labelled data ingestion centre with user-confirmed promotion

> **Superseded by adr/0032.** The two-phase import — map a source, stage its rows into a
> separate unlabelled worklist, then promote them — is gone: a file is now its own table
> and its rows are labelled where they land. What this ADR records about keeping raw
> values, about the user confirming every move, and about labels gating the dashboards
> still holds.

## Status

Accepted, refined by adr/0031 — which makes the Finance destination
single-valued, adds the `cancelled` flow role, makes the historical migration
*move* entries out of their tables instead of copying them, and removes the
category-rule fallback described below.

## Context

The existing CSV flow imports directly into a preselected table. It keeps no
source-file provenance, assumes a table schema before the source has been
examined, and reduces classification to a single category normalization rule.
That is not enough to distinguish a checking-account Pix payment, a credit-card
charge, a card statement credit/rebate, and an investment transaction. In
particular, raw amount signs and words such as `IOF` cannot safely decide the
financial meaning of a row.

The application already has user-configurable table definitions and one
replace-all export/import file. Any ingestion model must preserve that local-first
property and must not allow automation to silently insert duplicate financial
records.

## Decision

Add an ingestion model to the existing configurable-model Dexie database:

- Uploaded CSVs retain their original filename, raw CSV content, headers and a
  source fingerprint. Rows retain raw values and source-row fingerprints.
- Column mappings target canonical data fields or independent label dimensions;
  the source file is never rewritten. Supplemental blank columns may be added to
  the local mapping representation when a sparse CSV needs the complete field
  shape of a possible future destination. They do not claim to be original CSV
  columns and missing required values still block promotion.
- Classifications are **independent label dimensions**, not a category tree:
  Finance destination (single-valued since adr/0031), flow role, settlement channel, spending
  treatment, semantic category, recurrence, and a concrete destination table.
  An `expense` and `rebate` are intentionally distinct so a card credit reduces
  spending without being misreported as an ordinary outflow.
- Labels are stored as entry sidecars rather than added to every table schema.
  This lets bank, card, generic and investment tables share classification
  semantics while retaining their own validated data fields.
- New source rows move through staged/unlabelled/ready states. Only a user-clicked
  confirmation promotes ready rows into destination entries. A chat assistant may
  inspect, map, stage, label and validate, but has no operation for final
  promotion.
- Existing active entries enter the same review queue. Since adr/0031 they are
  moved rather than linked: the entry leaves its finance table, and confirming
  its labels writes it back, so an unreviewed row is never counted anywhere.
- Sources, mappings, ingestion rows, entry labels and audit events are included in
  the app export/import format. The export version is bumped to v4, while v2/v3
  exports continue to import with the new stores empty.

## Consequences

Finance analytics read only entries with a confirmed label sidecar. Staged,
unlabelled and invalid rows are deliberately absent from dashboards until the
user confirms them. The category-rule resolver that adr/0023 introduced was kept
here as a transitional suggestion mechanism; adr/0031 removed it entirely,
because a second classification path is a second way for an undecided row to
reach a dashboard.

The export schema gains several typed tables, with JSON columns for lossless raw
source values and multi-value labels. This is a modest increase in local storage
in exchange for auditability, safe retries, and data that can be understood before
it is committed to a finance table.
