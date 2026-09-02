# Labelled data ingestion centre with user-confirmed promotion

## Status

Accepted.

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
  Finance destinations (one or more), flow role, settlement channel, spending
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
- Existing active entries enter the same review queue through linked migration
  rows. Confirming such a row creates/reconciles labels only; it never inserts a
  second entry.
- Sources, mappings, ingestion rows, entry labels and audit events are included in
  the app export/import format. The export version is bumped to v4, while v2/v3
  exports continue to import with the new stores empty.

## Consequences

The current category-rule resolver remains a non-destructive fallback and
suggestion mechanism while historical rows are reviewed. It is not removed until
coverage proves all active records have appropriate labels. Finance analytics can
migrate to the label sidecars incrementally, keeping their existing behavior for
unlabelled data during the transition.

The export schema gains several typed tables, with JSON columns for lossless raw
source values and multi-value labels. This is a modest increase in local storage
in exchange for auditability, safe retries, and data that can be understood before
it is committed to a finance table.
