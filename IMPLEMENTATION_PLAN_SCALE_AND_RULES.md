# One-phase ingestion, a simpler label set, and SQL over the vault

## 1. The request, verbatim

> hmmm im planning a big code paradigm shift
> 1 please list to me again the labeling hierarchy and for each label kind, an explanation for it
>
> lets remove the recurrence element (7) and replace it with something like 'subcategory' allowing us more flexibility and labeling on category more generic and subcategory more detailed. please update the logic, update the descriptions used for the agent tools. remove the 5 altogether for now. remove the 4 as well.
> labels: 1: required, can contain multiple labels, free text input (user or agent can input theoretically whateve label it wants) but dynamically validated (dashboard, at the text input time, validates with the available icons and returns error, showing in red on the cell, if any one of the labels is unavailable). global: meaning this label is globally the same
> 2: required, can contain multiple labels, free text input (user or agent can input theoretically whateve label it wants) but dynamically validated (dashboard, at the text input time, validates with the available icons and returns error, showing in red on the cell, if any one of the labels is unavailable). Local to label 1 (meaning that depending the label given on 1, its own available values can change, so labeling it happens at the 'confirmed'
> 3 should also go away. we are going to decide if its inflow or outfow based on the sign of the value in money/valor/ammount/or similar name column
> 6 and 7 behave the same as 1 and 2 except that there is no validation, and they now start as the default value 'outros', and that they do not allow multiple values
> then lets change the whole logic:
> 1 - the importing process no longer has 2 steps (column assignment and labeling). instead we are assigning columns and labeling everything on the source files:
> 1.1 - a source file table is loaded with their own columns. the source_filename is added as a first column using the filename of the file those lines came from
> 1.2 - all necessary labeling columns are added as new columns on the right, all labels that are required start with their values NULL, and labels 6 and 7 start as 'outros'.
> 1.3 - the only columns the agent or the user can assign are the originaly present ones, this means that the source file column added or the label columns added cannot be assigned
> 1.4 - column 'description' is not one that requires assignment: the description column shown on the 'confirmed' section contains the contents of every unassigned line, using a similar to json formatting to show the contents. this includes the 'source_file' column content
> 1.5 - on the 1 (and now only) phase, the only labels required to be provided are the 1 and 2. the others can be provided now but also can be added later
> 1.6 - labeling rules now are limited to their context: there are labeling rules for the first phase, assigment and labeling. and there are also labeling rules exclusive to the confirmed tables. for simplicity, lets not allow rules specific to single tables, if this behaviour is desired, it is possible to create rules that apply to all tables in confirmed, but restrict their effect to the lines labeled to a specific tables
> 1.6.1 - the labeling rules for each limited context only appear if a table for that context is selected: for example, the labeling rules section should show the labeling rules for the confirmed tables only if one confirmed table, or 'every table' is selected
> 1.7 labeling rule should allow selecting to which columns their conditioning applies, they should work pretty much like the curernt ones
> 2 - 'imported unabeled' button no longer exists
> 3 - labeling rules for the source files can make the labels 1 and 2 not start as NULL, the intention here is mainly to allow those lines to start with pre-defined values based on the source file or any other column. see the option of adding regex support for the rules, this would make things significantly easier
> 4 - the user and the agent should have their functionality 100% matched, they both cannot eliminate lines, they can only mark lines for elimination (there is a box on the top of any table that when selected reads 'mark for elimination' where the user, when the box is selected, can click on lines and they are marked for elimination (this eliminated the need for the 'eliminate' button on the status column. the only thing the user can do and the agent cannot is to click a new button named 'delete marked lines') this mark for elimination functionality should be enabled for all tables and treated as a table interface functionality for the user. the box marked for elimination is automatically deselected if the user clicks anything that is not a line
> 5 - check the possibility of: (and if its possibly a good idea, implement)
> 5.1 - save all source files uploaded as distinct tables on the .db of the browser (with distinct and easy to recognise names)
> 5.2 - as a consequence, instead of implementing distinct specific and implemented by us functions for the model to interact with data, create a function that allows it to run sql queries directly to the .db
> 5.3 - this might require some logic changes to the currently used .db format for importing and exporting. since now there are actually distinct tables there with the actual names we want them to have
> 5.4 - for now restrict the capacity for the model to drop tables that are not empty tables from source files, and as I previously stated: dropping lines is forbidden, but marking as deleted lines is allowed for the model
>
> since these are big requirements, write:
> 0 - delete the current contents of the file
> 1 - write my text verbatim
> 2 - write e detailed implementation plan. this implementation plan should consider all requirements that are direct or indirect consequences of what I required: for example, I didnt say that, but its obvious we should review the functions the agent has and their descriptions, removing whats no longer necessary and adding what is, and changing the prompts corresponding to the changes
> here: /home/enio/projects/personal_management/IMPLEMENTATION_PLAN_SCALE_AND_RULES.md
> the implementation plan should consist of steps and for each step:
> first things to do:
> - commit the previous code content
> - read the whole step instructions
> - review my verbatim command contained on the top of the implementation
> - if something I asked on the verbatim text should belong on this phase and it isnt (maybe it is an oversight) adjust the current instructions of the current phase to contain it
>
> at the end:
> - test it
>
> before starting the implementation of the plan, write it on the file I specified and ask me any question if you think there are unforseen consequences that need my decision that cannot yet be known from my specifications. for each one, give me what are the options and your recommendation
>
> This questions phase is important to prevent later on, when you finish, having to finetune and adjust small things here and there

## 2. What changes, in one page

**The label set shrinks from seven to four.** Flow role, settlement channel, spending
treatment and recurrence are removed. Direction comes from the sign of the amount.
What remains is two *placement* labels, validated against the app itself, and two
*meaning* labels, free text:

| Label | Values | Required | Notes |
| --- | --- | --- | --- |
| Section | many, free text, validated globally | yes | the app's sections |
| Screen | many, free text, validated **within the chosen sections** | yes | what each section offers |
| Category | one, free text, no validation | defaults to `outros` | the generic bucket |
| Subcategory | one, free text, no validation | defaults to `outros` | the detail under it |

**Ingestion stops having two phases.** A file is loaded as its own table, carrying its
own columns plus `source_filename` on the left and the four label columns on the right.
Assignment and labelling happen there, together. The "Imported, unlabelled" pool
disappears; a row leaves its source table only when it is confirmed.

**Rules gain a context.** Rules for source tables run during import; rules for confirmed
tables run over confirmed rows. A rule is never bound to one table — it may be *narrowed*
by the labels a row carries. Rules gain column-scoped conditions and regex.

**Deleting is nobody's power, marking is everybody's.** Both the user and the assistant
mark rows for elimination; only the user presses *Delete marked lines*. Marking is a
property of every table, not a button in one column.

**Storage becomes queryable.** Each uploaded file is its own table in the browser
database, named after the file, and the assistant reads the vault through SQL instead of
through a growing catalogue of bespoke read tools.

Every phase below starts with the same preamble and ends with tests. Phases are ordered
so the app is runnable at every commit.

---

## Phase 0 — decisions and groundwork

**Before starting: commit outstanding work; read this whole phase; re-read the verbatim
request above; if something it asks for belongs here and is missing, add it here first.**

1. Answer the open questions in section 4. Nothing below is built until they are settled,
   because several phases change shape depending on the answers.
2. Record the outcome as `adr/0032-one-phase-ingestion-and-four-labels.md`, superseding
   the relevant parts of adr/0030 and adr/0031 (rename those to `-SUPERSEDED-` where the
   whole decision is replaced, not merely refined).
3. Take a full export (`.db`) of the current vault as a fixture, so migrations can be
   tested against real data rather than invented rows.

**Test:** the suite, lint, typecheck and build pass unchanged — this phase writes no code.

---

## Phase 1 — the four-label model

**Before starting: commit; read the whole phase; re-read the verbatim request; fold in
anything of it that belongs here and is missing.**

### 1.1 Types and vocabulary
- `IngestionRowLabels` and `EntryLabels` become `{ sections: string[]; screens: string[];
  category: string; subcategory: string }`. Note the rename from `subsections` to
  `screens`, which is what everything already calls them in prose.
- Delete `FlowRole`, `SettlementChannel`, `SpendingTreatment`, `RecurrenceLabel` and
  their entries in `label-vocabulary.ts`. That file then holds nothing but helpers; fold
  what survives into `label-catalogue.ts` and delete it.
- `categoryId` (a foreign key into `categories`) becomes a plain string on the row.
  The `categories` store is then unused — remove it, its Dexie store, its export table
  and `category-vocabulary.ts`.

### 1.2 Validation
- Required: at least one section, at least one screen, and every named value must exist
  in the catalogue. Category and subcategory are never invalid and never empty (they
  default to `outros`).
- Screens are validated **within the row's sections**: a screen that exists only under a
  section the row does not name is an error, with a message that says so.
- Delete the conditional spending rules entirely.

### 1.3 Direction from the amount
- A new `lib/model/row-direction.ts`: `directionOf(amount, convention)` where the
  convention is per source table (see Q4). Default: negative is outflow.
- Everything that consumed `flowRole` reads this instead.

### 1.4 Dashboards
- `FilteredEntry` loses `flowRole` and `spendingTreatment`, keeps `screens`, gains
  `category`/`subcategory`.
- Capital evolution: sum signed amounts of rows not on the investments screen, cards
  excluded as today. Transfers are handled per Q5.
- Spending: rows on the spending screen; a negative amount is a refund and subtracts.
- Recurring: the detector loses its `recurrence === 'recurring'` shortcut and returns to
  pattern detection alone (see Q6).
- Investments: unchanged except for label names.

### 1.5 Migration
- Dexie version bump: rewrite stored `IngestionRow.labels` and `entryLabels` into the new
  shape — keep sections/screens, map `categoryId` to the category's name, set
  subcategory to `outros`, drop the removed fields.
- Export version bump with an upgrade path from the current version.

**Test:** unit tests for the new validation (including a screen valid only under another
section), `directionOf` across both conventions, the migration against the Phase 0
fixture, and updated dashboard tests. Full suite, lint, typecheck, build.

---

## Phase 2 — one table per source file

**Before starting: commit; read the whole phase; re-read the verbatim request; fold in
anything of it that belongs here and is missing.**

### 2.1 Storage
- Each uploaded file becomes a Dexie table named `source__<slug of filename>__<n>`,
  created at upload (Dexie needs a version bump per new store — use a single dynamic
  store keyed by source id if that proves unworkable; decide during implementation and
  record why).
- Each row holds: `source_filename`, every original column verbatim, the four label
  columns, and its own state (`marked_for_elimination`, `confirmed_at`, `rule_ids`).
- Assignment metadata (which original column means date, amount, …) stays with the
  source record, not on the rows.

### 2.2 The screen
- The ingestion centre lists source tables and confirmed tables in one selector; the
  "Imported, unlabelled" entry is gone, and so is its dataset.
- A source table renders: `source_filename`, the original columns with their assignment
  cell above each, then the four label columns. Only original columns offer an
  assignment; `source_filename` and the label columns are not assignable.
- Labels are edited in place, exactly as the worklist does today, with red cells for a
  value the catalogue does not have.

### 2.3 Confirming
- One action per source table: confirm the rows whose required labels are complete. They
  are written into the confirmed table their labels select (Q3), and leave the source
  table (Q7).
- `description` is not stored: the confirmed view composes it from every unassigned
  column of the source row, `source_filename` included, in a compact JSON-like form.

### 2.4 Removals
- Delete the staged-row model (`ingestionRows` as a pool), `stage`/`promote` as separate
  steps, the `duplicate?`/`ready` source marks that no longer apply, and every screen
  and tool that only served the two-phase flow.

**Test:** upload → assign → label → confirm, end to end, against the sample files in
`samples/`. Confirm that an unassigned column reaches the confirmed description, that
label columns cannot be assigned, and that a partially labelled row is not confirmable.

---

## Phase 3 — SQL over the vault

**Before starting: commit; read the whole phase; re-read the verbatim request; fold in
anything of it that belongs here and is missing.**

- `lib/sql/query-vault.ts`: builds an in-memory SQLite (sql.js, already a dependency)
  from the Dexie stores on demand, runs a **read-only** statement, returns rows plus the
  columns and a row count. Rebuilt per call from live data; cached only within one call.
- One tool, `query_vault`, replacing the bespoke readers (`read_ingestion_table`,
  `query_ingestion_rows`, `count_ingestion_rows`, `group_ingestion_rows`,
  `list_ingestion_datasets`, `read_ingestion_provenance`, `find_ingestion_duplicates`).
  Its description carries the schema, the table naming convention, and the rule that
  only `SELECT` runs.
- Writes stay in typed functions, because they validate: labelling, marking, confirming,
  rules. Nothing writes through SQL (Q1).
- Dropping a table is allowed only for a source table with no rows (5.4); a `DROP` is
  refused otherwise, and never touches a confirmed table.
- Export/import: the `.db` gains the source tables under their real names, and the
  importer restores them; the exporter stops flattening everything into fixed stores
  (Q8).

**Test:** a query returning rows, a rejected write, a rejected drop of a non-empty table,
an accepted drop of an empty one, and an export/import round trip that preserves source
tables, labels, rules and settings.

---

## Phase 4 — rules with a context

**Before starting: commit; read the whole phase; re-read the verbatim request; fold in
anything of it that belongs here and is missing.**

- `LabelRule` gains `context: 'source' | 'confirmed'` and keeps `where` conditions, each
  with `field`, `match: contains | equals | startsWith | regex`, and `caseSensitive`.
- Source rules run at upload, so a row can *start* with sections and screens already set
  rather than NULL (requirement 3). Confirmed rules run over confirmed rows on demand.
- A rule is never bound to one table; narrowing is done with conditions on labels
  (`screens contains investments`).
- Regex is compiled once, guarded by try/catch, and reported as invalid at save time
  rather than at match time.
- The rules panel shows only the rules of the context currently selected, and nothing
  when the selection has no context.
- Rule statistics keep their current meaning: a rule may claim a row only where the user
  confirmed it with the rule's labels intact.

**Test:** a source rule pre-filling labels at upload; a confirmed rule narrowed by
labels; an invalid regex refused at save; the panel showing the right set per selection.

---

## Phase 5 — marking for elimination, everywhere

**Before starting: commit; read the whole phase; re-read the verbatim request; fold in
anything of it that belongs here and is missing.**

- A reusable table behaviour: a *Mark for elimination* checkbox above every table. While
  it is on, clicking a row toggles its mark; clicking anything that is not a row turns it
  off. Marked rows are visibly distinct.
- `Delete marked lines` is a button only the user has. It removes the marked rows from a
  source table; in a confirmed table it flags them deleted rather than erasing them (Q9).
- The assistant's `mark_rows` matches the user's power exactly, and no tool deletes.
- Remove the per-row `eliminate` link and the `discard`/`restore` vocabulary that this
  replaces.

**Test:** marking and unmarking through the behaviour; deletion removing source rows and
flagging confirmed ones; the assistant marking but being unable to delete.

---

## Phase 6 — tools, prompts, and parity

**Before starting: commit; read the whole phase; re-read the verbatim request; fold in
anything of it that belongs here and is missing.**

- Audit every tool against the new model. Expected final set: `query_vault`,
  `assign_source_columns`, `set_labels`, `label_rows_by_match`, `mark_rows`,
  `save_label_rule` / `list_label_rules` / `apply_label_rules` / `delete_label_rule`,
  `confirm_rows` (if Q10 says the assistant may confirm), `read_ingestion_guide`,
  `list_label_options`, plus the file readers. Everything else is deleted, not deprecated.
- Rewrite the ingestion guide for the one-phase flow and the four labels, keeping the
  `{{sections}}`/`{{screens}}` placeholders and their enforcement.
- Rewrite the system prompt's ingestion paragraph.
- Write a parity test listing what the user can do and what the assistant can do, so the
  one asymmetry (deleting marked lines) is asserted rather than assumed.

**Test:** registry test for the exact tool list; guide tests for the placeholders and the
four labels; a prompt test asserting the removed labels are not mentioned anywhere.

---

## Phase 7 — sweep

**Before starting: commit; read the whole phase; re-read the verbatim request; fold in
anything of it that belongs here and is missing.**

- Grep for every removed concept (`flowRole`, `settlementChannel`, `spendingTreatment`,
  `recurrence`, `categoryId`, `stage`, `promote`, `worklist`, `discard`) and remove what
  survives in code, comments, translations and docs.
- Delete files nothing imports.
- Update `README.md` and the ADRs.
- Re-run the sample-file walkthrough from `samples/README.md` end to end and correct it
  where the flow has changed.

**Test:** full suite, lint, typecheck, production build, and a manual pass through the
four sample files.

---

## 4. Open questions

Each needs an answer before Phase 1. Options first, recommendation last.

**Q1 — What does "run SQL against the .db" mean at runtime?**
The browser database is Dexie/IndexedDB; SQLite exists only as the export format.
(a) Build an in-memory SQLite from Dexie for each query, read-only, and keep writes in
typed functions. (b) Move the whole runtime to sql.js persisted into IndexedDB, and write
through SQL too. (c) Keep a structured query API and drop the SQL idea.
**Recommendation: (a)** — real SQL for reading, no rewrite of the storage layer, and
writes keep the validation that makes labels trustworthy.

**Q2 — Where does a confirmed row live?**
Screens are multi-valued, so a row can name two. (a) One confirmed table per *section*,
with screens as views over it. (b) One confirmed table per *screen*, duplicating a row
that names two. (c) A single confirmed table; every screen is a view.
**Recommendation: (c)** — one row, one home, and the labels decide what reads it. It also
makes "rules for confirmed tables, narrowed by labels" natural, which is what you asked
for.

**Q3 — Is the destination table still a label?**
If Q2 is (c), the destination is implied. (a) Remove it entirely. (b) Keep it as an
optional override.
**Recommendation: (a)** — one fewer required field, and screens already say where a row
belongs.

**Q4 — Card files invert the sign.**
A bank export writes a purchase as negative; a card export writes the same purchase as
positive. Deciding direction from the sign alone will read every card charge as income.
(a) A per-source *sign convention* set during assignment (`negative is outflow` /
`positive is outflow`), defaulting from a quick scan of the file. (b) Always treat card
files as inverted, detected by the assigned columns. (c) Ignore it and let labels carry
the meaning.
**Recommendation: (a)** — explicit, visible on the source table, and settable by the
assistant with a reason.

**Q5 — Transfers between your own accounts.**
Flow role is what currently keeps a savings transfer from moving total capital. Without
it: (a) a reserved screen (`transfers`) that capital ignores. (b) a reserved category
name. (c) accept that transfers move capital.
**Recommendation: (a)** — it is a placement decision, and placement is what survives.

**Q6 — Recurring, without a recurrence label.**
(a) Pattern detection only, as it was before the label existed. (b) A reserved
subcategory (`assinatura`, `parcelado`) that the Recurring screen reads.
**Recommendation: (b)** — you are already labelling subscriptions by name, and this
keeps the screen meaningful without reviving a fifth label.

**Q7 — Does a confirmed row leave its source table?**
(a) It moves: the source table empties as work is done, and confirmed rows live in one
place. (b) It stays and is marked confirmed, so the file remains whole.
**Recommendation: (a)**, with `source_filename` and the unassigned columns travelling
with the row, so provenance survives without keeping two copies.

**Q8 — Export format.**
(a) Keep the current fixed-store export and add source tables as extra tables.
(b) Export whatever tables exist, generically, so the file mirrors the database.
**Recommendation: (b)** — it is what makes the `.db` genuinely inspectable, which is the
point of 5.3, with a small header table recording the version.

**Q9 — Deleting a confirmed row.**
(a) Flag it deleted (today's behaviour), reversible. (b) Remove it outright.
**Recommendation: (a)** — the button says "delete marked lines", and a flag is what makes
that safe to press.

**Q10 — May the assistant confirm rows?**
Today it may stage but not promote. In a one-phase flow, confirming is the only move.
(a) User only. (b) Assistant may confirm rows whose labels it did not itself invent.
(c) Assistant may confirm freely.
**Recommendation: (a)** — it is the last point at which a mistake is cheap, and you have
said the two roles differ only in deletion; confirming would be the second difference,
deliberately.
