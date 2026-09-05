# One `class` label replaces the investment-only columns

## Status

Accepted — extends adr/0032, whose one-phase ingestion stands unchanged; the
six labels it describes are now seven.

## Context

`asset`, `investmentType` and `investmentClass` were columns only investment
rows ever filled and only investment screens ever read. Three consequences, all
felt at once:

A row could not move between tables without leaving part of its meaning behind,
because half of what it said lived in fields the destination ignored. The words
on it could not be queried, ruled on or revised the way every label can. And
`investmentClass` collided with the ordinary meaning of "class" the moment a
seventh label was wanted for exactly that purpose.

Underneath was a subtler failure. `subcategory` was carrying two questions at
once — *what is this money now* (cash, tesouro prefixado) and *where did it come
from* (proceeds, juros) — and only the first partitions a balance. Interest
arriving in cash left a `proceeds` slice standing in a pie of holdings forever,
because provenance does not net out the way money does.

## Decision

**One label, on every row: `class`.** What kind of thing the row is — renda
fixa, renda variável, a cash reserve. Free text like category and subcategory,
optional like card, and placed immediately before `category` in every column
order: the ingestion tables, the confirmed tables, the export, `query_vault`.

**The three investment columns are retired.** `amount` and `price` stay: they
are numbers a row computes with, not labels. A position is now named by its
subcategory (`asset` in the portfolio engine reads `subcategory`, then `class`,
then `category`), which is where the files were putting instrument names anyway.

**The class tests read `class` and `category`, not `subcategory`.** Category is
read because rows labelled before this existed put the answer there. Subcategory
is deliberately not: it names the particular thing, and a paper called "tesouro
- reserva 2029" is fixed income, not the cash reserve.

**Migration v15** carries `investmentClass` (or failing that `investmentType`)
into `class`, moves an `asset` into an empty `subcategory`, drops the three
fields, and clears any file assignment pointing at a target that no longer
exists.

**The money a row moved is `amount` x `price`, on every screen.** `value` is no
longer offered as an assignment — a file assigned before this still honours it —
because two rules for money was one too many: a row that is one of something has
an amount of one and a price that is the money, which is every payment and
transfer ever made, and a row that is several says how many. Every screen now
requires a date and a price; Investments requires an amount as well. `value`
stays on the confirmed row as the product, so nothing that reads money changed.

**Every column a file wrote reaches the observations**, empty cells included: a
blank under a named column says the file had nothing to say there, which is
itself something the file said. A column with no name is not a column.

## Consequences

- A `.db` written by any earlier version still opens: the importer selects NULL
  for columns a file lacks and ignores columns it no longer asks for, so `class`
  arrives empty on old rows. The export always writes today's schema, which is
  what completes the round trip.
- Provenance has nowhere to hide as a label any more, which is the point. Where
  money came from belongs in the observations, or in a category on the row that
  *received* it — never in the field a balance is sliced by.
- Seven labels is more to fill. Only `class` is new, and it is optional
  everywhere except where a dashboard needs it, so nothing that worked before
  stops working.
