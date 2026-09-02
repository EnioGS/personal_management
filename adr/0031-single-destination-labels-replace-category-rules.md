# One label set decides where a row goes; category rules are removed

## Status

Accepted. Supersedes adr/0023 and refines adr/0030.

## Context

adr/0030 introduced label dimensions but kept two compromises: Finance
destinations were a set, and category rules stayed as a fallback classification
path. Both turned out to be wrong in use.

A row could claim `movements` *and* `spending`, so two labels could disagree
about the same fact, and `recurring` competed with the separate recurrence
dimension. Meanwhile the historical migration copied existing entries into the
worklist and left the originals in their finance tables, so unlabelled rows still
reached dashboards — the exact outcome adr/0030 existed to prevent.

## Decision

- **Finance destination is single-valued**: `movements`, `spending`,
  `investments`. Analytics derive the rest — a spending row is still money that
  moved, so Movements counts it — instead of asking the user to tick both.
  `recurring` is not a destination; the recurrence dimension already says it.
- **Flow role gains `cancelled`** for voided or reversed records. They keep their
  provenance and reach no total.
- **The legacy migration moves rows, it does not copy them.** An entry nobody has
  labelled is deleted from its finance table and queued with its complete values;
  confirming its labels writes it back. A one-off repair version on the legacy
  source cleans up databases written by earlier builds without ever discarding
  labels the user has assigned since.
- **Category rules, the resolver, the category tools and the Categories settings
  panel are deleted.** The category vocabulary is whatever the category labels
  name: typing a name that does not exist creates it. Rules are gone because two
  classification paths mean a row can enter a dashboard without a decision.
- **Every analytics surface reads labels**, including the Investments section,
  which previously joined entries to tables directly and so ignored the gate.
- **The assistant gets no tool for either data-moving step.** Staging a mapped
  source and promoting labelled rows are the two moments data changes shape;
  both stay user-only. Its ingestion knowledge lives in one retrievable guide
  (`read_ingestion_guide`), editable and resettable in Settings → Assistant, so
  a long workflow document costs nothing in conversations that never touch it.

## Consequences

- Dexie version 6 drops the `categoryRules` store; export version 5 drops its
  table and upgrades v4 files by ignoring it.
- `EntryLabels.financeDestinations` becomes `financeDestination`; the sqlite
  export column changes from a JSON array to text.
- Dashboards show nothing until rows are labelled. That is the intent: the
  ingestion centre's worklist is the only door into a finance table.
