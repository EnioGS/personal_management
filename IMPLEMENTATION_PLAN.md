# Data ingestion centre and financial labels — implementation plan

## Purpose

Create a Settings screen named **Data ingestion centre** where imported source
files are mapped, kept in their original form, labelled, reviewed, and only then
promoted into the app's finance tables. It replaces the current category-only
workflow with a small, explicit set of **label dimensions**.

This is deliberately a *label system*, not a strict tree. A row may be relevant
to more than one Finance screen, and a semantic category such as Health is not a
child of only one screen. The system must therefore model independent label axes,
not force every label into a single parent/child hierarchy.

The design resolves the current ambiguity between checking-account payments,
credit-card charges, statement credits, refunds, and investment movements:

- A Pix sent from a checking account is normally an **outflow** and can be a
  spending item even though it is not a credit-card charge.
- A credit-card statement credit is a **card credit / rebate**, not spending.
  A row whose description includes `IOF` must *not* be assumed to be a credit:
  some IOF records are charges and some are reversals. Its treatment comes from
  the explicit labels, with the raw amount and description always retained.
- Dashboard calculations use the new labels rather than inferring meaning from
  a positive/negative amount or from one word in a description.

The existing category rules remain available during migration as a non-destructive
way to propose a semantic category. They are no longer the source of truth for
the new classification once a row has labels. They can be retired only after the
new workflow has demonstrably covered the historical data.

---

## Product decisions and vocabulary

### 1. Required label dimensions (v1)

Every staged row has one field for every label dimension below. A row is
**fully labelled** only when all required dimensions are set and its target table
is selected.

| Dimension | Stored value(s) | Required | Why it exists |
| --- | --- | --- | --- |
| Finance destinations | Set of `movements`, `spending`, `investments`, `recurring` | Yes, one or more | The first classification layer mirrors the current Finance navigation without making it a hierarchy. A credit-card charge may belong to Movements and Spending; an investment buy belongs to Movements and Investments. |
| Flow role | `inflow`, `outflow`, `transfer`, `adjustment` | Yes | Better terminology than “income/outcome”: it records the economic direction independently of an imported sign. `adjustment` covers corrections that should not be treated as ordinary income or spend. |
| Settlement channel | `checkingAccount`, `creditCard`, `cash`, `investment`, `other` | Yes | Makes it explicit whether a row is a bank movement, card-statement event, investment event, etc. |
| Spending treatment | `expense`, `rebate`, `notApplicable` | Required when the row includes `spending`; otherwise `notApplicable` | Prevents statement credits/reversals from being added to card spend. `rebate` reduces the card bill / spending total; it is not an expense. |
| Semantic category | Canonical category ID | Yes for spending rows; otherwise optional | The current category concept, retained as an open vocabulary and used for grouping and filtering. |
| Destination table | Existing `tableDef` ID | Yes | The app has user-created tables, so a Finance screen alone cannot identify the actual table to receive a row. |
| Recurrence | `oneOff`, `recurring`, `unknown` | Yes | Lets Recurring operate on explicit data later instead of only heuristics. |

The following are canonical **data fields**, not labels: date, amount, narrative
(description/note), raw category, account/card reference, asset, quantity,
investment transaction type, and source provenance. The mapping UI treats labels
and canonical data fields as selectable mapping targets, but they remain separate
in storage and in the code.

### 2. Interpretation rules

- Imported source values are immutable provenance. Transformations, parsed values,
  label assignments, and the final destination are stored alongside them rather
  than replacing them.
- **Column assignment is destination-complete.** Before a source can be staged,
  its assignments must be sufficient for every table kind that its rows might
  later reach through labels. In practice, the mapping validator computes the
  union of required canonical fields for all currently selectable destinations,
  not merely the fields of the one table the user happens to consider first.
  A source that may later be labelled for a bank ledger, card ledger, or investment
  ledger must expose the required data for each of those possible choices before
  it can leave the source-mapping phase.
- If an uploaded CSV does not have enough columns, the mapper adds explicitly
  marked **supplemental blank columns** to its local source representation. They
  are virtual columns (the original file is never altered), have an editable
  canonical name, start empty for every row, and are shown beside the original
  columns. The user or assistant can populate them during labelling. This makes
  a sparse source structurally complete without pretending the missing values
  existed in the bank's file.
- A missing value still blocks readiness/promotion whenever the selected final
  table requires it. Supplemental columns satisfy mapping *shape*, not data
  validity: they make clear what must be entered later rather than allowing an
  incomplete row to slip through.
- `amount` is stored as the source's parsed absolute numeric amount plus a source
  sign when it exists. The explicit **flow role** determines the reporting effect.
  This avoids silently treating every positive number as an inflow.
- A card `expense` increases card spend. A card `rebate` decreases it. A
  checking-account `outflow` can appear in Movements and Spending; it does not
  become card spend.
- The first version does not auto-classify based on `IOF`, `Pix`, or merchant
  text. The assistant may recommend labels after reading the raw values, but must
  report its judgment and leave the final promotion confirmation to the user.
- Labels are row-level data. A later bulk-label feature may apply a choice to a
  filtered set, but must show an affected-row count and be undoable before final
  promotion.

### 3. States and ownership

```text
Uploaded source CSV
  -> column-mapped source
  -> staged / imported-but-unlabelled rows
  -> fully-labelled, ready rows (automatic readiness marker)
  -> user-confirmed promotion
  -> promoted destination entry + immutable provenance link

Existing active app entry
  -> linked migration row in imported-but-unlabelled data
  -> labels assigned
  -> user-confirmed reconciliation (updates labels/provenance only; never inserts a duplicate entry)
```

Rows must expose one of: `draftSource`, `unlabelled`, `ready`, `promoted`,
`reconciledExisting`, `invalid`, or `promotionError`. The UI normally lists the
active work states; audit/history views may expose promoted and reconciled rows.

No automatic operation may remove an original source, raw source value, or an
existing app entry. Final promotion is the only operation that writes a new
destination `entries` row, and it is always initiated by a user click and
confirmed in the UI.

---

## Target data model

Use the existing Dexie database `app-model-db`, which already owns configurable
accounts, cards, table definitions and entries. Do **not** make a separate,
unexported browser database for ingestion data.

### New stores

1. `ingestionSources`
   - `id`, `originalFilename`, `sourceFingerprint`, `importedAt`, `csvText` or
     lossless parsed source payload, `originalColumns`, `rowCount`, `status`.
   - The fingerprint is a SHA-256 of normalized file bytes. A matching fingerprint
     is rejected as an already uploaded source unless the user explicitly opens its
     existing source.

2. `ingestionColumnMappings`
   - `sourceId`, `sourceColumn`, `targetField`, `parser`, `assignedAt`.
   - `targetField` is a canonical field or label dimension. Mapping is one source
     column to at most one target and one target to at most one source column by
   default. A later transformer feature can deliberately combine fields; v1 must
   reject ambiguous duplicate targets clearly.
   - A `sourceColumn` may be an original source header or a `synthetic` blank
     supplemental column. Store the latter's display name and `isSynthetic=true`
     so export/import retains it while the UI never mistakes it for an original
     header.

3. `ingestionRows`
   - `sourceId` (or the special `legacy` source), `sourceRowIndex`,
     `sourceRowFingerprint`, `rawValues`, `mappedValues`, `labels`, `status`,
     `validationErrors`, `destinationTableId`, `existingEntryId?`,
     `promotedEntryId?`, timestamps.
   - `rawValues` retains all original named values, even after mapping.
   - `existingEntryId` is used by migration rows derived from existing data. It
     prevents that row from being inserted a second time during reconciliation.

4. `entryLabels`
   - `entryId`, `financeDestinations`, `flowRole`, `settlementChannel`,
     `spendingTreatment`, `categoryId?`, `recurrence`, `sourceIngestionRowId?`.
   - Keeping labels separate from schema-specific entry fields avoids corrupting
     bank/card/investment schemas and lets one label system span all table kinds.

5. `ingestionAuditEvents`
   - immutable, concise events for upload, mapping change, row-label change,
     readiness, confirmation, promotion/reconciliation, and failures. Include
     actor (`user` or `assistant`) and affected IDs.

### Model and export changes

- Extend `sqlite-schema.ts`, `data-file.ts`, model types, and store exports for
  every new store.
- Bump `DATA_EXPORT_VERSION`; provide an upgrade path for version 3 data in
  `parseDataExportFile` with empty ingestion/label stores when absent.
- Export/import must round-trip all source files, mappings, staged rows, labels,
  provenance links, statuses, and audit events. Existing source/row/entry IDs must
  keep the same relationship after a full replacement import.
- The import format remains **replace-all**, as it is today. File-level duplicate
  detection applies to Ingestion Centre uploads, not to whole-database restore.

---

## User interface specification

### Settings navigation

Add **Data ingestion centre** to Settings, with its own translation keys and a
database/import-oriented icon. Place it near Categories and Tables because it is
the workflow that feeds both.

### Screen layout

The panel is a full-height, vertically scrolling settings surface with four
sections in this order:

1. **Dataset selector and status**
   - One dropdown controls the entire workspace.
   - The first item is always **Imported, unlabelled data**, showing its count.
   - Other items are uploaded source files, labeled with original filename,
     import date, mapping state, and row count.
   - Promoted-only sources remain selectable from a compact history group.

2. **Selected dataset table**
   - Both horizontal and vertical scrolling are enabled; the table must never
     squeeze or truncate source fields.
   - For an uploaded source, render a two-row header:
     - Row 1: a blank/selectable mapping cell above each original column. Choosing
       a canonical field or label dimension says “this source column means this
       app field.” It can be changed or cleared.
     - Row 2: the untouched original column name.
     - When the source lacks a field needed to make all possible later destinations
       structurally valid, show **Add blank column** beside the header. It adds a
       visibly labelled supplemental column with an empty cell in every row; it
       never edits the uploaded CSV or renames an original column.
   - For Imported, unlabelled data, render canonical mapped fields and one column
     per label dimension, followed by the original raw fields in an expandable
     provenance region. Every label is editable in-place. Include a read-only
     state/reason column and a compact confirmation/readiness indicator.
   - Preserve the existing editable-table interaction quality: visible columns,
     scrollbars, keyboard-friendly controls, no hidden horizontal data.

3. **Context/help and validation**
   - Show required mappings for source import: at minimum date, amount, and a
     narrative/raw description, plus the complete union of canonical fields for
     every destination table kind still available through labels. The validator
     lists each missing field and offers a matching supplemental blank column.
     Destination-specific *values* are still validated later when a destination
     table is selected.
   - Show mapping conflicts, parse failures, missing labels, and duplicate source
     rows inline. Explain why a disabled action is disabled.
   - Do not show category-rule chips or automatic per-text recommendations as the
     primary UI. Existing rules may appear only as a subtle “suggested category”
     helper, never as an automatic final label.

4. **Bottom drop zone and context-sensitive action**
   - A fixed, clearly bounded bottom zone accepts drag-and-drop of multiple CSV
     files and includes an **Import data** button for file-picker access.
   - Dropped files are parsed locally and immediately added to the selector as
     draft sources; no destination entries are written at this point.
   - When an uploaded source is selected, the bottom action reads **Add to
     imported unlabelled data**. It is faded/disabled until required mappings pass
     validation, then stages valid rows and reports rejected rows.
   - When Imported, unlabelled data is selected, the same-sized, same-position
     action reads **Confirm and move ready rows**. It is faded until at least one
     ready row exists. It opens a confirmation dialog with the exact row count and
     target-table counts before promotion.

### Important interaction details

- Mapping a source column to a label dimension is allowed. Its values are copied
  into the labels when rows are staged, but the user may edit every resulting row.
- `sourceFilename` is always visible in the assistant-readable detail, and in the
  provenance expander for staged rows.
- A row automatically displays its ready/confirmed mark once it has every required
  label and validates against the selected destination table. The mark means
  “eligible to promote,” not “already written.” The only user confirmation is the
  final bottom action and its dialog.
- Promotion groups rows by destination table and uses a transaction. A row that
  fails validation remains in Ingestion Centre with `promotionError`; successful
  rows are never retried as duplicates.
- Existing migrated rows use the same visible workflow, but final confirmation
  reconciles their `entryLabels`/provenance instead of inserting a new `entries`
  row. The dialog explicitly labels this difference.

---

## Assistant / code-agent capability specification

The chat assistant can prepare nearly all ingestion work but cannot execute the
user-only final confirmation/promotion action. Add tools with precise descriptions
and update the default system prompt to mention this workflow.

### Required tools

| Tool | Capability | Safety rule to state in its prompt |
| --- | --- | --- |
| `list_ingestion_datasets` | List the special unlabelled dataset and sources with original filenames, status, counts, required mappings, and ready count. | Read-only. |
| `read_ingestion_table` | Read original columns, mapping header, label columns, statuses, and paged rows for a selected dataset. Supports column selection and row offset/limit. | Read-only; raw values may be large, so paginate. |
| `assign_ingestion_columns` | Add/change/clear source-column assignments. Returns validation state and affected row count. | It edits mapping metadata only; it does not stage or promote rows. Reject ambiguous mappings. |
| `stage_ingestion_source` | Validate and send a mapped source to Imported, unlabelled data. | Must report skipped/invalid/duplicate rows and does not promote to a finance table. It may run only after the agent describes the intended mapping. |
| `update_ingestion_labels` | Set, replace, or clear label fields for explicit row IDs or a narrowly defined filtered set. | Must report row count and values changed. Cannot confirm/push data to destination tables. |
| `suggest_ingestion_labels` | Return evidence-based suggestions from raw fields, current categories, category rules, and existing similar labelled rows. | Read-only. It never applies labels itself. The assistant must state uncertainty, especially for IOF/Pix. |
| `read_ingestion_provenance` | Read raw source values, original filename, mapping history, related existing/promoted entry, and audit trail for a row. | Read-only. |
| `validate_ingestion_rows` | Return readiness and all blockers for selected rows/dataset. | Read-only; useful before the assistant tells the user to review/confirm. |

Existing `read_table`, `write_to_table`, category tools, and rule tools remain
available. The assistant must prefer the ingestion tools for new CSV-derived data
so it preserves source provenance and does not bypass user confirmation. It may
still append a directly user-entered row using the existing table-writing tool.

### Prompt requirements

The default system prompt and tool descriptions must explicitly say:

- inspect the selected dataset and source filename before assigning mappings;
- preserve original data and explain any semantic judgment;
- ask the user when a label meaning is uncertain rather than using description
  text as an unquestioned rule;
- never call a final promotion operation because that UI action is reserved for
  the user;
- interpret card rebates separately from card expenses; do not classify every
  `IOF` or every Pix movement with a blanket rule;
- use the table-definition information to select a concrete destination table;
- report what was changed, what remains unlabelled, and why.

All new tools need focused unit tests, registry tests, and prompt tests confirming
their safety language is actually included in the request sent to the model.

---

## Dashboard and calculation integration

After the ingestion model is stable, migrate Finance calculations to consume
labels where present and retain the current behavior as an explicit fallback for
unlabelled legacy rows during transition.

1. **Movements**
   - Show rows labelled for `movements`.
   - Calculate capital/cash evolution using `flowRole` and settlement channel,
     not raw sign alone.
   - Credit-card expenses do not directly change cash capital; card rebates reduce
     card liability and appear as their labelled movement/adjustment as appropriate.

2. **Spending categories**
   - Include rows labelled `spending` with `spendingTreatment=expense`.
   - Subtract rows labelled `rebate` from the same card/category/month grouping.
   - Include checking-account Pix outflows only when explicitly labelled as
     spending. Transfers and general cash movements remain outside this metric.
   - Rename any display/documentation that currently implies the list is
     exclusively credit-card spending if it becomes a combined spending view.

3. **Recurring**
   - Prefer explicit `recurrence=recurring`; retain the current detector as a
     visible “suggestion” fallback until history is labelled.

4. **Investments**
   - Use `settlementChannel=investment` plus the destination table/schema. Keep
     investment `buy`, `sell`, and `income` behavior already implemented.

5. **Categories and rules**
   - The Categories settings panel becomes a lightweight canonical-category
     vocabulary and migration-rule screen. The ingestion centre owns new-row
     classification.
   - Do not remove rules until an audit reports that all active historical rows
     have semantic-category labels or an explicitly accepted “no category” state.

---

## Phased implementation and verification

Each phase ends with its listed tests, a manual acceptance check, documentation
updates where relevant, and one focused commit. Do not begin a later data migration
or remove a fallback until the preceding phase has passed.

### Phase 0 — confirm taxonomy and baseline tests

**Deliverables**

- Add this plan to the repository and open a short product-review checkpoint for
  the label vocabulary above. Confirm whether `adjustment` needs further distinct
  values before schema migration.
- Capture current behavior with tests for category resolution, card spending,
  capital evolution, data export/import, and assistant registry.
- Record an ADR explaining why independent label dimensions replace a hierarchy
  and why final promotion remains user-confirmed.

**Tests / checks**

- Existing unit suites for category resolver, spending analytics, capital evolution,
  `data-file`, and tools pass unchanged.
- `npm run lint`, TypeScript/Vite production build, and `git diff --check` pass.

**Commit**

- `docs: define data ingestion centre and label model`

### Phase 1 — persistent ingestion and label model

**Deliverables**

- Add typed models, Dexie version migration, stores, selectors, and repository
  functions for sources, mappings, staged rows, labels, and audit events.
- Add stable source and source-row fingerprints, idempotent insertion guards, and
  transaction boundaries.
- Extend full data export/import and version upgrade logic.

**Tests / checks**

- Unit tests for source/file fingerprinting, duplicate detection, row identity,
  status transitions, required-label completeness, and promotion idempotency.
- Migration tests from existing database state and v3 export files.
- Round-trip export/import test verifies every new relation and audit link.
- Run lint, targeted tests, full build, and Docker development smoke test.

**Commit**

- `feat: add persistent ingestion sources and financial labels`

### Phase 2 — source parsing and column-mapping service

**Deliverables**

- Generalize CSV parsing from fixed table schemas to lossless raw-source parsing.
- Implement mapping validation, parser/coercion selection, supplemental blank
  columns, and staging into the unlabelled dataset without writing destination
  entries. Mapping validation must calculate required field coverage across every
  table kind that can later be selected via labels, not only the current choice.
- Support multiple dropped CSV files, per-file status, duplicate-file rejection,
  and duplicate-row reporting.

**Tests / checks**

- CSV fixtures covering quoted fields, blank values, Brazilian number/date forms,
  duplicate source files, duplicate rows across files, invalid required mapping,
  and mapping a source category into the semantic-category label.
- Fixtures where a sparse CSV gains supplemental blank columns: verify its source
  headers remain untouched, its mapped shape becomes destination-complete, and
  blank required values still prevent the individual row's final promotion.
- Verify original headers/values survive staging unchanged.
- Verify staging twice cannot create duplicate ingestion rows.
- Run lint, focused tests, full build, and Docker smoke test.

**Commit**

- `feat: stage mapped csv sources for ingestion review`

### Phase 3 — Data ingestion centre UI

**Deliverables**

- Add the Settings navigation item, translations, selector, two-level mapped-source
  header, unlabelled work table, scrollable original-data view, validation panel,
  and fixed bottom multi-file drop zone.
- Implement the two context-sensitive bottom action states exactly as specified.
- Ensure table cells and selectors are keyboard accessible and the wide table can
  scroll in both directions.

**Tests / checks**

- Component/integration tests for selector switching, mapping assignment/clearing,
  disabled/enabled action conditions, adding/removing supplemental blank columns,
  multi-file drop, both table scroll wrappers, and unchanged original column names.
- Manual check in light and dark mode at desktop and narrow widths.
- Run lint, targeted tests, production build, and Docker UI smoke test.

**Commit**

- `feat: add settings data ingestion centre`

### Phase 4 — labelling, readiness, and user-confirmed promotion

**Deliverables**

- Add in-place label editors, completeness/readiness indicator, provenance view,
  final confirmation dialog, grouped destination writes, and failure recovery.
- Create entry-label sidecars and preserve source-to-entry links.
- Implement special handling for legacy linked rows: final confirmation reconciles
  labels without adding another destination entry.

**Tests / checks**

- Unit tests for every required/optional label combination and finance-destination
  multi-select behavior.
- Transaction tests: successful rows promote once; invalid rows remain visible;
  retries do not duplicate rows; canceling the dialog writes nothing.
- Tests prove an existing migrated row never generates a second entry.
- Manual test of a Pix payment, card purchase, card rebate, and ambiguous IOF row.
- Run lint, full tests, build, Docker smoke test.

**Commit**

- `feat: confirm and promote labelled ingestion rows`

### Phase 5 — assistant ingestion tools and prompts

**Deliverables**

- Implement and register all tools in the assistant specification, including
  pagination and narrowly-scoped bulk label updates.
- Update prompt persistence/migration so existing saved default prompts acquire
  the new instruction without overwriting user custom prompts.
- Keep the final promotion UI-only; no tool may bypass it.

**Tests / checks**

- One test file per tool for success, validation failure, and scope/safety edge
  cases; registry test includes every new tool.
- Prompt tests assert text about raw provenance, IOF/Pix uncertainty, user-only
  promotion, destination tables, and reporting changes.
- Simulated assistant workflow: inspect source -> assign columns -> stage -> read
  unlabelled -> label -> validate -> instruct user to confirm.
- Run lint, full tests, build, Docker smoke test.

**Commit**

- `feat: let assistant prepare ingestion labels safely`

### Phase 6 — migrate existing data without duplicates

**Deliverables**

- Add a one-time, idempotent migration that creates a special `Existing data
  migration` source and linked ingestion rows for active existing entries that do
  not have complete new labels.
- Seed only defensible suggestions from current category rules and table metadata;
  leave ambiguous fields unlabelled. Never delete/move existing entries merely to
  create this queue.
- Display counts and a migration-complete report.

**Tests / checks**

- Fixtures containing bank, card, fixed/variable investment, deleted rows, and
  category-rule matches. Assert only active, incomplete rows appear; repeated
  migration creates no duplicates.
- Verify rules produce suggestions but do not silently finalise labels.
- Export/import after migration preserves link identities.
- Run lint, full tests, build, Docker smoke test.

**Commit**

- `feat: queue existing unlabeled records for ingestion review`

### Phase 7 — adopt labels in Finance analytics

**Deliverables**

- Introduce one tested reporting adapter that determines movement, spend, card
  rebate, recurrence, and investment behavior from labels, with documented legacy
  fallback while unlabelled historical rows remain.
- Update Movements, Spending categories, Recurring, and Investments to use it.
- Show a small non-intrusive coverage notice while fallback data remains, linking
  to Data ingestion centre.

**Tests / checks**

- Regression fixtures prove:
  - checking-account Pix outflow counts as spend only when labelled spending;
  - a card rebate reduces monthly category spend;
  - an IOF row is governed by explicit treatment, not its text or sign;
  - capital evolution does not double-count card activity;
  - investment buy/sell/income behavior remains correct.
- Visual smoke test against the existing Overview design baseline and table drawer.
- Run lint, full tests, build, Docker smoke test.

**Commit**

- `feat: calculate finance dashboards from ingestion labels`

### Phase 8 — rule deprecation review and documentation

**Deliverables**

- Add a coverage/audit report for rows still using legacy rule fallback.
- Update Categories wording to distinguish canonical categories from legacy
  normalization helpers.
- Only after the report shows no unreviewed active rows, propose a separate,
  user-approved removal or archival of the old rules UI/code.
- Update README and ADR index for the ingestion workflow and export format.

**Tests / checks**

- Legacy fallback and no-fallback coverage tests.
- Full export/import compatibility matrix for supported versions.
- Run lint, full tests, build, Docker smoke test, and `git diff --check`.

**Commit**

- `docs: document labelled ingestion and category-rule transition`

---

## Acceptance criteria

The implementation is complete only when all of the following are true:

1. A user can drop multiple CSV files, see each original filename and columns,
   map columns, add clearly marked blank supplemental columns where a source is
   structurally incomplete, stage the rows, label them, and manually confirm
   promotion.
2. Raw columns and original values remain inspectable after promotion and survive
   full database export/import.
3. The app never creates duplicate source rows or duplicate destination entries
   from a repeated upload, staging retry, or promotion retry.
4. Existing unlabelled records appear in the worklist without being duplicated in
   their current destination tables.
5. A row cannot be promoted until every required label and destination table is
   valid; a failed row remains recoverable in the worklist.
6. The assistant can inspect, map, stage, label, validate, and explain data, but
   cannot execute the user-only final confirmation.
7. Card rebates and checking-account Pix payments are distinguished by explicit
   labels. No blanket IOF/Pix heuristic can silently distort spending categories.
8. Finance dashboards use labelled data where available and retain correct,
   tested behavior for unlabelled legacy history during the transition.
