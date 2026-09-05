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


## 1b. Clarifications and additions, verbatim

> What does "SQL against the .db" mean at runtime? here I was imprecise. I dont mean that we should implement sqlite for the runtime. it should remain as only the exporting file format. I meant to allow the agent to send direct sql queries to the database on the browser
>
> Q2 — Where does a confirmed row live, when screens are multi-valued? for lines with multiple tables, lets duplicate the rows and put that same row into their specific tables. lets add to all confirmed tables one column named 'row_id' which is a hash id that should be different for all rows, but be the same for rows that have been duplicated. this is true for rows belonging to two icons in two or more options, and rows in the same icons but two or more options (and of course rows that belong to one icon and one option. the hash is generated for those too just in case later we duplicated them.
>
> Q3 — Is destination table still a label? I dont get it... the values in labels 1 and 2 decide to which label they belong to, right?
>
> Q4 — Card files invert the sign. this is more important that I thought. a simple per source sign convention is not enough because later in another credit card we might have exported files that dont follow this convention. I think we should allow the model, per source file, using the context provided by its filename and the general descriptions of all transactions on all lines, allowing the model to query for each confirmed table a big sample of the values there, so it can itself decide if it should alter the sign of all values of a column based on the reference we adopt on the current 'accepted' tables (the same is true not just for credit cards)
> we should include all of this on the description and instructions it has for this phase
> also, we should add to the description for the adopted references for each table, and, and instruct it for if we do not provide the reference for the table it needs, to sample the table and find out. actuially the instructions should instruct it to sample the table regardless
>
> But this question opened my eyes to something more importtant: we should make it follow an order for labeling after assigning columns:
> 1 - assign the columns
> 2 - label label 1
> 3 - then label 2
> 4 - then decide the signal of the values based on the tables it is going to be put in.
> One other thing that should be inputed as description is that: the current source file can use multiple conventions for signed values and we should adapt them to our own by changing the signs of the values provided. the change made can be a global change, inverting all signs, this is mainly for data that follow the oposite convention, but is clearly using a convention for the sign, and we can selectively change the signs of some values in the case of a source file that uses only positive or negative values, and in another column or somewhere else, lists a per line 'buy/sell' or a per line 'received/sent' anything equivalent. if you are not sure after consulting all outside information, ask the user for help
>
> Q5 — Transfers. I dont get it. savings transfers do move capital. they move capital from the bank checkings account to the savings. if I got what you meant: the capital evolution measurements address this by adding all the money from the bank account including the money sent to the savings account to the money in the savings account. I decided to exclude label 3 (which from what I remember is where this transfers came from) because labeling one thing transfer would make it invisible, which is dangerous. in other words: if anything leaves an account, it counts as negative money, which can be compensated later by the income on another account equal to what left on the other. here is a key design decision: leaving things invisible by default is dangerous
>
> Q6 — Recurring, with no recurrence label. this will be better addressed later, but it is a combination of A and B. assinatura, membership, parcelado and similars are to be protected words for the labels, and we also are going to try to predict future expenses based on how frequently they happened
>
> Q7 — Does a confirmed row leave its source table? A, it moves. but dont forget that all unasiggned columns that are originally from the source files are condensed to one column with the contents of all the other cells on that line, as I previously observed
>
> Q8 — Export format. B
>
> Q9 — Deleting a confirmed row. I think I specified this: flagging it for elimination is the behaviour, both users and assistants can do that. but user can delete (permanently) the rows marked for elimination
>
> Q10 — May the assistant confirm rows? it can freely do that. although we should still keep two different buttons for two operations (the user can do both, but the second one, that discards things should instruct the agent to ask for permission):
> 1 - non destructive: equivalent in spirit to our current 'import new values'
> 2 - destructive: Import and discard
>
> Also, I remember we added logic for automatic duplicate flagging: keep it, but make sure that this part of the code takes into consideration that one line can only be duplicate if either:
> it has the same values as another one from a different source file (since multiple transactions on the same file reported by the bank are to be taken as 2 different transactions
> or if a source file with name very similar to one already currently imported is uploaded. (similar because files with the names for example Nubank_2026-09-08 (1).csv and Nubank_2026-09-08.csv are duplicates. so exact source file name are likely duplicates, and files that share a significantly big common substring are also likely duplicates (Calculating 'significantly big' in proportion to the smaller source filename)
>
> also: I forgot to say: users and agents can mark rows for deletion but they can also unmark them.

## 1c. Answers to the open questions, verbatim

> Q11 — May SQL write? - yes, but in a customized way:
> - instruct the agent to add new lines, instead of patching (is patching the correct word?), and to mark the old lines to elimination (Key things: marked to elimination lines are to be invisible to the all dashboards, showing only on the tables. (this is an exception to the principle of invisibility is dangerous). instruct the model everywhere appropriate (being redundant here is a feature, but do it in moderation) to conserve the hash for that line. and the model can create new lines out of thin air, but in that case, give it a special function that when used, creates a hash based on the current contents of the line it intends to create)
> Q12 — Where does a sign transformation live? B, but with a catch: the original value must be one of the data that is recorded on the condensed values of all original lines to one column (and the column is the 'observations' column or however it is currently named I dont get it).
> Q13 — Does capital now include investments? yes. and this was always the plan. but a key distinction: the capital is a word that represents in general 'all money or things of value i have' so in movements, it is expressed in the Current capital box, and as the current green line on 'capital evolution' for example.
> Q14 — What is row_id made of? it should be a hash, but we should take steps to differentiate identical rows on the same source file, asigning them to different hashes, the hash can include a random seed when it is calculated. but the calculated hash, once it is assigned, cannot be changed even when the row content is partially or totally changed.
> Q15 — Confirmed table names and creation. A
> Q16 — A screen gets renamed or removed from the app; what happens to its table? A in general, but with some caveats: if we just rename the suboption, but the content is to remain the same, then we change the table name. it depends. but one key detail: if a model creates or removes a table:
> - it cannot remove a table that is the one used for any of the current dashboards.
> - it will only create the table if its convenient for it for some reason, the tables are at least for now, not going to be used as data sources for us for now

## 2. What changes, in one page

**The label set shrinks from seven to four.** Flow role, settlement channel, spending
treatment and recurrence are gone. Nothing is ever made invisible by a label: money that
leaves an account counts as leaving, and the arrival on the other side counts as
arriving. What remains is two *placement* labels, validated against the app itself, and
two *meaning* labels, free text:

| Label | Values | Required | Notes |
| --- | --- | --- | --- |
| Section | many, free text, validated globally | yes, starts NULL | the app's sections |
| Screen | many, free text, validated **within the row's sections** | yes, starts NULL | local to the section |
| Category | one, free text, unvalidated | defaults to `outros` | the generic bucket |
| Subcategory | one, free text, unvalidated | defaults to `outros` | the detail under it |

**Direction comes from the sign of the amount**, and making the file's sign convention
agree with ours is an explicit, reasoned step in the import — not a guess.

**Ingestion stops having two phases.** A file loads as its own table carrying
`source_filename`, its own columns, and the four label columns. Assignment and labelling
happen there. "Imported, unlabelled" disappears.

**Confirming duplicates a row into every table it belongs to**, joined by a shared
`row_id`, and the row leaves its source table with its unassigned columns condensed into
one description column.

**Rules gain a context** (source or confirmed), column-scoped conditions and regex, and
can pre-fill labels at import.

**Marking for elimination is everybody's; deleting is the user's.** Both mark and unmark;
only the user removes what is marked, permanently.

**The assistant reads and writes the browser database with SQL**, under one discipline:
it never edits a row in place. It adds a corrected row carrying the same `row_id` and
marks the old one for elimination. A row marked for elimination is invisible to every
dashboard and visible in its table — the single, deliberate exception to "nothing is
made invisible".

Every phase starts with the same preamble and ends with tests. Phases are ordered so the
app runs at every commit.

---

## Phase 0 — decisions and groundwork

**Before starting: commit outstanding work; read this whole phase; re-read the verbatim
request and clarifications above; if something they ask for belongs here and is missing,
add it here first.**

1. Settle the open questions in section 4.
2. Record `adr/0032-one-phase-ingestion-and-four-labels.md`, superseding adr/0030 and
   adr/0031 where the decision is replaced rather than refined, and stating the design
   principle behind the removals: **nothing is made invisible by a label**.
3. Export the current vault as a `.db` fixture, so migrations are tested against real
   data.

**Test:** suite, lint, typecheck, build unchanged — this phase writes no code.

---

## Phase 1 — the four-label model

**Before starting: commit; read the whole phase; re-read the verbatim request and
clarifications; fold in anything of them that belongs here and is missing.**

### 1.1 Types and vocabulary
- `IngestionRowLabels` / `EntryLabels` become
  `{ sections: string[]; screens: string[]; category: string; subcategory: string }`.
- Delete `FlowRole`, `SettlementChannel`, `SpendingTreatment`, `RecurrenceLabel` and the
  whole of `label-vocabulary.ts`; what survives moves into `label-catalogue.ts`.
- `categoryId` becomes the plain string `category`. The `categories` store, its Dexie
  table, its export table and `category-vocabulary.ts` are removed.
- Reserved subcategory words — `assinatura`, `membership`, `parcelado` and their
  synonyms — live in one exported list, used by the Recurring screen and stated in the
  guide. (Frequency-based prediction is deliberately out of scope here.)

### 1.2 Validation
- Required: at least one section and one screen, every value known to the catalogue.
- A screen is validated **within the row's sections**: a screen that exists only under a
  section the row does not name is an error naming both.
- Category and subcategory are never invalid and never blank; they default to `outros`.

### 1.3 Direction and sign
- `directionOf(amount)`: negative leaves, positive arrives. No flow role, no exceptions.
- **Capital is everything of value you hold.** It is the sum of signed amounts across
  every confirmed row, counted once per `row_id` however many tables the row was copied
  into, investments included: money leaving checking for savings is negative there and
  positive here, and nets to zero by arithmetic rather than by being hidden. This is the
  number in *Current capital* and the green line in *Capital evolution*.
- Rows marked for elimination are excluded from every dashboard while remaining in their
  table.

### 1.4 Dashboards
- `FilteredEntry` loses `flowRole`, `spendingTreatment`, `recurrence`; keeps `screens`;
  gains `category` and `subcategory`.
- Spending: rows on a spending screen; negative amounts subtract as refunds.
- Recurring: pattern detection plus the reserved words.
- Investments: unchanged apart from label names.

### 1.5 Migration
- Dexie and export version bumps rewriting stored labels into the new shape: keep
  sections and screens, resolve `categoryId` to its name, set subcategory to `outros`,
  drop the removed fields.

**Test:** validation (including a screen valid only under another section), `directionOf`,
capital netting across two accounts, the migration against the Phase 0 fixture, updated
dashboard tests.

---

## Phase 2 — one table per source file

**Before starting: commit; read the whole phase; re-read the verbatim request and
clarifications; fold in anything of them that belongs here and is missing.**

### 2.1 Storage
- Every uploaded file becomes its own table in the browser database, named recognisably
  after the file (`source__nubank_2026_09_08__3`).
- `row_id` is a hash taken at import from the row's contents **plus a random seed**, so
  two identical rows in one file get different ids; once assigned it never changes, even
  if every value in the row is later edited. Copies made at confirmation share it.
- A row holds: `row_id`,
  `source_filename`, every original column verbatim, the four label columns, and its own
  state (`marked_for_elimination`, `duplicate_of`, `rule_ids`).
- Assignment lives on the source record, not the rows.

### 2.2 The screen
- One selector lists source tables and confirmed tables; the unlabelled pool is gone.
- A source table renders `source_filename`, the original columns each with an assignment
  cell above it, then the four label columns. **Only original columns are assignable** —
  never `source_filename`, never a label column.
- Labels are edited in place, invalid values shown red at typing time.

### 2.3 Confirming
- Two actions, both available to user and assistant, mirroring today's pair:
  **Import new values** (non-destructive: confirms what is ready, leaves the rest) and
  **Import and discard** (destructive: also drops what is marked, and retires the file).
  The assistant may run the first freely and must ask before the second.
- A confirmed row is written into **one table per (section, screen) pair it names**, each
  copy carrying the same `row_id`. Copies are independent after confirmation; `row_id`
  is what relates them.
- The row leaves its source table.
- `description` is composed at confirmation from every unassigned original column plus
  `source_filename`, in a compact JSON-like form, and stored as one column.

### 2.4 Duplicate flagging, narrowed
- A row may be flagged a duplicate only when it matches a row **from a different source
  file** — two identical rows inside one file are two real transactions.
- A newly uploaded file whose name is the same as, or shares a long common substring
  with, an already-imported one (measured against the shorter name) is flagged as a
  likely repeat of that file, and its rows are compared against it first.
- Marks remain advisory: they never remove anything by themselves.

**Test:** upload → assign → label → confirm end to end over `samples/`; a row on two
screens producing two copies with one `row_id`; unassigned columns reaching the
description; identical rows within one file not flagged; a near-identical filename
flagged.

---

## Phase 3 — making the file's signs agree with ours

**Before starting: commit; read the whole phase; re-read the verbatim request and
clarifications; fold in anything of them that belongs here and is missing.**

### 3.1 The order of work
The import has an order, stated in the guide and in the tool descriptions, and the tools
report where a source is in it:
1. assign the columns;
2. label the sections;
3. label the screens;
4. **only then** decide the sign, because the decision depends on the tables the rows are
   going to.

### 3.2 The decision
- The reference convention of each confirmed table is recorded and readable, and the
  assistant is told to **sample the destination table regardless** — a stated reference is
  a shortcut, not a substitute for looking.
- The amount column is **rewritten in place** by the transformation, and the value the
  file actually carried is preserved in the condensed observations column, so nothing is
  lost and the two never disagree.
- Two transformations are supported:
  - **invert everything**, for a file that uses the opposite convention consistently;
  - **invert by condition**, for a file whose values are all one sign and whose direction
    lives in another column (`buy`/`sell`, `received`/`sent`, `debit`/`credit`).
- The source table shows the resulting signed amount; the value as imported stays
  readable in the observations column.
- When the evidence is inconclusive, the assistant asks the user rather than guessing;
  this is stated in the tool description and the guide.

**Test:** a card file inverted globally; a file with a `buy/sell` column inverted
conditionally; the original column unchanged in both; the ordering reported correctly;
a sampling call returning what a table's existing signs look like.

---

## Phase 4 — SQL over the browser database

**Before starting: commit; read the whole phase; re-read the verbatim request and
clarifications; fold in anything of them that belongs here and is missing.**

- Runtime storage stays Dexie/IndexedDB. SQLite remains the export format only; the
  assistant's SQL runs against an in-memory database built from the live stores.
- `query_vault` runs a **read** statement and returns columns, rows and a count.
- `write_vault` runs a **write** under the one discipline that makes it safe: rows are
  never edited in place. A correction is a new row carrying the same `row_id` plus a
  mark for elimination on the old one, so history is additive and nothing disappears.
  `INSERT` and `UPDATE ... SET marked_for_elimination` are accepted; `DELETE` is not.
- `new_row_id` mints an id for a row invented from nothing, hashed from the contents it
  is about to hold. A corrected row reuses the id it corrects — stated in the tool
  descriptions and the guide, deliberately more than once. Its description carries
  the schema, the table naming convention, and the sampling guidance from Phase 3.
- It replaces `read_ingestion_table`, `query_ingestion_rows`, `count_ingestion_rows`,
  `group_ingestion_rows`, `list_ingestion_datasets`, `read_ingestion_provenance` and
  `find_ingestion_duplicates`, which are deleted.
- Labelling, confirming and rule application stay typed functions, because they validate
  against the catalogue; SQL is for reading and for the add-and-mark discipline above.
- `drop_source_table` removes an **empty source table** only. A table any dashboard reads
  is never removable. The assistant may create a table when it has a reason to, and
  nothing the app draws reads from tables it created.

**Test:** a select returning rows; a rejected write; a rejected drop of a non-empty or
confirmed table; an accepted drop of an empty source table.

---

## Phase 5 — rules with a context

**Before starting: commit; read the whole phase; re-read the verbatim request and
clarifications; fold in anything of them that belongs here and is missing.**

- `LabelRule` gains `context: 'source' | 'confirmed'`; conditions keep `field`,
  `caseSensitive` and gain `match: contains | equals | startsWith | regex`.
- Source rules run at upload so rows can *start* labelled rather than NULL; confirmed
  rules run over confirmed rows on demand.
- No rule is bound to one table: narrowing is done with conditions on labels.
- Regex is validated at save time, never at match time.
- The rules panel shows only the rules of the selected context, and nothing when the
  selection has none.
- Attribution keeps its meaning: a rule claims a row only where it was confirmed with the
  rule's own labels intact.

**Test:** a source rule pre-filling labels at upload; a confirmed rule narrowed by
labels; an invalid regex refused at save; the panel showing the right set per selection.

---

## Phase 6 — marking for elimination, everywhere

**Before starting: commit; read the whole phase; re-read the verbatim request and
clarifications; fold in anything of them that belongs here and is missing.**

- A reusable table behaviour, on **every** table: a *Mark for elimination* checkbox above
  it. While on, clicking a row toggles its mark — marking and unmarking alike; clicking
  anything that is not a row turns the mode off. Marked rows are visibly distinct.
- **Delete marked lines** is the user's alone and removes them permanently.
- The assistant's `mark_rows` matches the user exactly, marking and unmarking, and no
  tool deletes.
- The per-row `eliminate` link and the discard/restore vocabulary it replaces are removed.

**Test:** marking, unmarking, and the mode turning itself off; deletion removing rows;
the assistant marking and unmarking but unable to delete.

---

## Phase 7 — tools, prompts and parity

**Before starting: commit; read the whole phase; re-read the verbatim request and
clarifications; fold in anything of them that belongs here and is missing.**

- Expected final tool set: `query_vault`, `assign_source_columns`, `set_sign_convention`,
  `set_labels`, `label_rows_by_match`, `mark_rows`, `confirm_rows`, `drop_source_table`,
  the four rule tools, `read_ingestion_guide`, `list_label_options`, and the file
  readers. Everything else is deleted.
- The guide is rewritten for: the one-phase flow, the four labels, the ordered work of
  Phase 3, sampling a destination table before deciding a sign, asking when unsure, the
  narrowed duplicate rules, and the two confirmation actions with their different
  permissions.
- The system prompt's ingestion paragraph is rewritten to match, keeping the
  `{{sections}}`/`{{screens}}` placeholders and their enforcement.
- A parity test asserts the only asymmetry: deleting marked lines.

**Test:** registry test for the exact list; guide tests for placeholders, the four
labels, the ordering and the sign guidance; a prompt test asserting no removed label is
mentioned anywhere.

---

## Phase 8 — sweep

**Before starting: commit; read the whole phase; re-read the verbatim request and
clarifications; fold in anything of them that belongs here and is missing.**

- Grep out every removed concept: `flowRole`, `settlementChannel`, `spendingTreatment`,
  `recurrence`, `categoryId`, `stage`, `promote`, `worklist`, `discard`, `subsections`.
- Delete files nothing imports; update README and ADRs; rewrite `samples/README.md` for
  the one-phase flow.

**Test:** full suite, lint, typecheck, production build, and a manual pass over the four
sample files.

---

## 4. Open questions

**Answered — kept for the record.**

**Q11 — May SQL write anything?** Marking a row deleted is allowed for the assistant, and
SQL is the natural way to express it. (a) SQL is read-only; marking, labelling and
confirming stay typed tools that validate. (b) A whitelist of statements is applied back
to Dexie (`UPDATE … SET marked_for_elimination`, `DROP TABLE` of an empty source table).
**Recommendation: (a)** — a label written through SQL skips catalogue validation, and
write-back from an in-memory copy is where silent corruption lives.

**Q12 — Where does a sign transformation live?** (a) Stored on the source and applied when
rows are confirmed, original column untouched, both values visible. (b) The values in the
source table are rewritten in place.
**Recommendation: (a)** — the original stays comparable with the file it came from, which
is what duplicate detection and any later re-check depend on.

**Q13 — Does capital now include investments?** With sign-based accounting, buying an
investment is negative in checking and positive in the investment table, so summing
everything gives total capital without special cases — but position value (quantity ×
price) is a different quantity from cash moved. (a) Capital sums every confirmed row, and
the investments screen keeps position maths separately. (b) Capital excludes investment
screens and adds position value, as today.
**Recommendation: (a)** — it follows your principle, and the two numbers stay distinct
and honest: money moved, and what holdings are worth.

**Q14 — What is `row_id` made of?** (a) A random id per source row at import, copied to
every confirmation copy. (b) A content hash of the row's values.
**Recommendation: (a)** — a content hash would make two genuinely distinct transactions
with identical values share an id, which is exactly the case your duplicate rule says to
treat as two real rows.

**Q15 — What names do confirmed tables take, and when do they appear?** (a) One table per
(section, screen) pair, created on first confirmation, named
`confirmed__<section>__<screen>`. (b) All pairs created up front from the catalogue.
**Recommendation: (a)** — no empty tables for screens nobody uses, and new screens work
without a migration.

**Q16 — What happens to a screen's table when the screen is renamed or removed from the
app?** (a) The table stays under its old name and its rows keep their labels, visible as
an orphan the user can relabel. (b) A migration renames it.
**Recommendation: (a)** — nothing is lost silently, and the orphan is a visible prompt to
decide rather than an invisible rewrite.

---

## Status — implemented

Phases 0–8 are done and on `main`. What landed, in the order the plan asked for it:

- **Four labels** (`sections`, `screens`, `category`, `subcategory`), validated the way
  §1 describes: screens inside the sections the row names, meaning free text defaulting
  to `outros`. Flow role, settlement channel, spending treatment and recurrence are gone
  from the model, the tools, the prompts and the dashboards.
- **One phase.** A file becomes its own table (`source__<file>__<id>`), keeping every
  column it wrote; only its own columns are assignable; unassigned columns are condensed
  into one observations column at confirmation. There is no unlabelled pool.
- **Confirmation copies** a row into one table per (section, screen) pair, every copy
  carrying the same `row_id`, and the row leaves its source table.
- **Signs** come from the amount. A file is brought into line wholesale or by a condition
  on another column, decided after labelling, with the value the file wrote kept in the
  observations.
- **SQL** reads everything (`query_vault`); writes go through validating tools, never in
  place — a correction is a new row with the same `row_id` plus a mark on the old one.
- **Rules** carry a context, column-scoped conditions and regex validated at save time,
  and source rules run at upload so an import can land already labelled.
- **Marking** is a table-wide mode; the assistant marks and unmarks exactly as the user
  does, and only the user deletes. A marked row is invisible to dashboards and visible in
  its table — the single exception recorded in adr/0032.
- **Duplicates** are flagged only across files, or when a filename is very close to one
  already imported.
- Export mirrors the database (v8); capital includes investments; README, `samples/`
  and adr/0018, 0021, 0030 and 0031 were updated or marked superseded.

**Not carried over:** data stored under the old two-phase schema. Dexie v9 clears the
stores that model needed, and no migration was written — the old rows describe a
classification this app no longer has. Files are re-imported through the new door.
