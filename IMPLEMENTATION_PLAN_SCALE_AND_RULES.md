# Working at volume: querying, sorting, paging, usage metering, and labelling rules

## Why

The ingestion centre now holds ~1,700 unlabelled rows and will hold more. Three
things break at that size, and one capability is missing:

1. **The screen** renders every row of every table at once — the worklist alone is
   ~1,700 rows x ~20 inputs. Nothing can be sorted, so finding anything means
   scrolling.
2. **The assistant** can only page blindly (`offset`/`limit`) through a dataset it
   cannot filter, so answering "which rows mention *Pagamento de fatura*" costs a
   full sweep of the backlog and most of its tool budget.
3. **The conversation** gives no feedback about token cost, so a sweep that burns
   the context window is invisible until the model starts failing.
4. **A rule the model discovers is thrown away.** It finds "33 rows say Pagamento de
   fatura", labels them, and the next import starts from nothing.

## Phase 1 — one query engine, used by both the tools and the UI

### 1.1 `lib/model/row-query.ts` (pure, no Dexie)

- `RowFilter = { field, op, value?, caseSensitive? }` with
  `op ∈ contains | notContains | equals | notEquals | gt | gte | lt | lte | in | notIn | isEmpty | isNotEmpty`.
- `RowQuery = { filters?, match?: 'all' | 'any', sort?: { field, direction, type }, offset?, limit? }`.
- `queryRows(items, resolveField, query)` → `{ total, matched, offset, returned, rows }`.
  Text ops compare case-insensitively unless told otherwise and ignore accents, so
  `sao paulo` finds `SÃO PAULO`. Numeric ops parse the field with the same amount
  parser the duplicate checker uses; date-typed sorts use `parseDateValue`.
- `groupRows(items, resolveField, field, limit)` → value frequencies, most common
  first. This is what turns "find a rule covering the most rows" from a manual scan
  into one call.

### 1.2 Field addressing for ingestion rows

One resolver maps a flat name onto a row: `date`, `amount`, `description`,
`rawCategory`, `note`, `status`, `source`, `destinationTable`, every label
dimension by its own name, plus explicit `raw.<column>` and `mapped.<field>` for
anything else. Unknown names return undefined rather than throwing, and the query
result names the fields it understood.

### 1.3 Tools

- `query_ingestion_rows` — filters, sort, paging, and a `fields` projection so a
  page costs what it needs to and no more.
- `count_ingestion_rows` — the same filters, returning only counts (total, and
  broken down by status and by source). The cheap way to size a rule before running it.
- `group_ingestion_rows` — value frequencies for one field, most common first.
- `read_ingestion_table` keeps working, and its description points at these for
  anything large.

Descriptions must state the default working method: **count or group first, then
query a page** — never sweep a dataset to answer a question about it.

## Phase 2 — tables that sort and load as you scroll

### 2.1 Column sort menu (all tables)

`components/data-table/column-sort-menu.tsx`: clicking a column header opens a menu
with exactly four options — A→Z, Z→A, 1→9, 9→1 — plus Clear. Alphabetic sorts use
`localeCompare` with numeric collation off; numeric sorts parse the cell and put
unparseable values last in both directions, so a text column sorted numerically
degrades to "all blanks at the end" rather than to noise.

Wired into `editable-data-table.tsx` (TanStack's sorting state, custom sort fns) and
into the ingestion centre's own table, which is hand-rolled and sorts its row array
directly.

### 2.2 Progressive rendering

`components/data-table/use-progressive-rows.ts`: renders the first page (100 rows)
and grows by a page whenever the scroll container comes within one viewport of the
bottom; resets when the underlying rows, the sort, or the dataset change.

Why this and not a Dexie-side cursor: rows are stored as JSON blobs with indexes
only on `id`/`createdAt`, so sorting or filtering by any real field requires reading
the table anyway, and the analytics screens need every row in memory regardless.
The cost that actually hurts at 1,700 rows is the DOM — 30,000 inputs — and that is
what this removes. The store keeps one read; the screen keeps a window.

## Phase 3 — token usage in the chat

- `lib/openrouter.ts` returns the response's `usage` block alongside the message.
- `store/chat-store.ts` keeps `lastUsage` and a session total across the whole
  tool-call loop, not just the final reply.
- The chat panel shows one quiet line under the composer: tokens for the last
  exchange, the session total, and — when the model's context length is known —
  how much of the window the next request would use.
- Context length is **not** in a completion response. It is fetched once per session
  from OpenRouter's models endpoint and cached; if that call fails or the model is
  absent, the line shows tokens only and says the window is unknown rather than
  guessing.

## Phase 4 — labelling rules

### 4.1 Model

`LabelRule`: `{ name, field, contains, caseSensitive?, labels, destinationTableId?, createdAt, createdBy }`.
New Dexie store (version 8) and export table (export version 6, v5 files upgrade
with it empty).

### 4.2 Application

- `applyLabelRules(row, rules)` fills **only labels the row does not already have** —
  a decision made by hand or by the assistant always wins over a rule — and records
  the rule ids it filled on the row as `appliedRuleIds`.
- Rules run when rows are staged, and can be run over the existing worklist on
  demand. A row that ends up with every required label validates to `ready` exactly
  as if a human had typed them.

### 4.3 Attribution

A rule may claim a row only when **the user confirmed it** and **every label that
rule set still holds the value the rule set**. Labels the rule never set are free to
be filled in by hand without breaking attribution. Computed from the rows, never
stored as a counter, so it cannot drift:

`ruleStats(rule, rows)` → `{ applied, confirmedRespected, overridden, matchedStrings }`.

### 4.4 UI

A **Labelling rules** section below the worklist in the ingestion centre. Each rule
is one line: what it matches, what it sets, and how many rows it has been credited
with. Clicking opens a dialog with the full labels, the distinct strings it matched,
the confirmed/overridden split, and a delete action.

### 4.5 Authorship and rationale

Every rule carries a **rationale**: why it is safe to apply this label set to
everything matching this string. The assistant writes it when it proposes a rule
(aim for a short paragraph, no hard limit), the user can edit it freely, and a rule
created by hand in the UI starts with whatever the user writes. It is stored with the
rule and shown in both the collapsed line and the detail dialog, because a rule that
nobody can justify later is a rule nobody can safely keep.

The user can also **create a rule directly**: a small form in the Labelling rules
section — field, matching text, the label set, and the rationale — with no assistant
involved.

### 4.6 Tools

- `save_label_rule` — persist a rule *with its rationale*, optionally applying it to
  the current worklist immediately.
- `list_label_rules` — every rule with its labels, rationale and stats, so the
  assistant can read the standing rules, judge whether one already covers a batch,
  and apply or skip it rather than inventing an overlapping one.
- `apply_label_rules` — run the saved rules over rows that are still unlabelled,
  reporting what each one filled.
- `delete_label_rule` — remove one; rows it labelled keep their labels.
- `label_ingestion_rows_by_match` gains an instruction: after a rule is applied,
  **ask the user whether to save it**, so the next import starts where this one ended.

## Phase 5 — the secondary bar behaves like a flyout

The bar rests on its icon strip (adr/0020). Expanding it should feel like peeking,
not like committing:

- **A control inside the bar** toggles the width as well as the activity-bar icon, so
  the bar can be collapsed without travelling back to the icon that opened it.
- **Width transitions** are animated (~150ms), matching the chat panel's own
  transition so the two do not feel like different applications.
- **It collapses itself**: immediately when a click lands outside it, and about three
  seconds after it opened. The timer is cancelled while the pointer or keyboard focus
  is inside the bar — a countdown that fires while someone is reading the labels
  would be worse than no countdown at all — and restarts when they leave.
- Choosing an item still collapses it, as it does today.

## Verification

Each phase ends with unit tests for its own logic, the full suite, lint, typecheck
and a production build. The query engine and the rule engine are pure modules and
get the bulk of the tests; the UI pieces are kept thin enough to be read.
