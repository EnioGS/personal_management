# One-phase ingestion, four labels, and nothing invisible

## Status

Accepted. Supersedes the two-phase workflow of adr/0030 and the label set of adr/0031;
what those record about provenance, user-confirmed movement and standing rules stands.

## Context

Seven labels were too many, and four of them were doing work the data already did. Flow
role restated the sign of the amount. Settlement channel restated which file a row came
from. Spending treatment restated the sign again. Recurrence answered a question the
Recurring screen can ask of the data itself.

Worse, one of them was actively dangerous: labelling a transfer as `transfer` removed it
from capital, so money that had genuinely left an account stopped being visible. The rule
this ADR adopts is that **nothing is made invisible by a label**. Money leaving an account
counts as leaving; its arrival elsewhere counts as arriving; the two net to zero by
arithmetic rather than by being hidden.

The two-phase import was also a phase too many. Mapping columns and labelling rows are the
same act of understanding a file, split across two screens for no reason the user has.

## Decision

- **Four labels.** Section and screen place a row and are validated against the app's own
  navigation — a screen is checked *within* the sections the row names, so the same screen
  name may mean different things under different sections. Category and subcategory carry
  meaning, are free text, and default to `outros` rather than to nothing.
- **Direction is the sign of the amount.** Making a file's convention agree with ours is an
  explicit step of the import, decided from the file's own evidence and from a sample of
  the tables the rows are going to, not from a setting.
- **One phase.** A file is a table: its own columns, `source_filename`, and the four label
  columns. Only original columns are assignable. Everything unassigned is condensed into
  one observations column when the row is confirmed, the value the file carried for a
  rewritten amount included.
- **Confirming copies a row into every table it belongs to**, joined by a `row_id` hashed
  from the row's contents and a random seed, so two identical rows in one file stay
  distinct, and fixed for life so a row stays traceable through every later change.
- **Rows are never edited in place by the assistant.** A correction is a new row with the
  same `row_id` and a mark for elimination on the old one. Marked rows are invisible to
  dashboards and visible in their table — the one deliberate exception to the rule above,
  and the reason it is safe to let the assistant write at all.
- **Marking is everyone's, deleting is the user's.** Both mark and unmark; only the user
  removes what is marked, and that removal is permanent.
- **The assistant reads and writes through SQL** over the browser's data, with labelling,
  confirming and rules staying in typed functions that validate.

## Consequences

Runtime storage stays Dexie; SQLite remains the export format, now written generically so
the file mirrors the database rather than a fixed set of stores. Source files and confirmed
tables appear under their own names in both.

Capital becomes the sum of every confirmed row's signed amount, counted once per `row_id`,
investments included: one number for everything of value held, with position value
(quantity × price) kept as the separate quantity it is.
