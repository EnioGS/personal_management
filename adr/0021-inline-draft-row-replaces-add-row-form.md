# Inline draft row replaces the add-row form; denser table chrome

## Status

Accepted.

## Context

Every data table (Spending, Income, Variable/Fixed Income, Contributions)
added rows through a separate form above the table: one labeled field per
column plus an "Adicionar" button, its own row of vertical space, entirely
disconnected from the table it fed. Filling it out required looking away
from the table to see the result. It also ate space in a panel the user
already has to drag open (`ChartTablePanel`), on top of a table header
tall enough (`h-10`) to rival a data row, and 14px body text — at odds with
wanting these panels to show more rows/columns as the app grows, not fewer.

## Decision

- **`EditableDataTable`'s form is gone.** In its place, the table body
  always renders one extra row after the real data — faded
  (`opacity-60`), brightening to full opacity while focus is anywhere
  inside it (`focus-within`). Every cell in that row is a live input keyed
  to the column's type (`<input type="date">`, `<input type="number">`,
  a native `<select>` for `type: 'select'`, plain text otherwise) — native
  `type="date"`/`type="number"` reject non-numeric/non-date keystrokes for
  free, the same type-safety the old form leaned on `coerceValue` for.
- **The row promotes itself.** On blur (focus leaving the row) or Enter,
  once every required column (date/number/select always; text only if
  marked `required`) holds a value `coerceValue` accepts, the draft becomes
  a real row via the existing `onAddRow`, and the same row resets to empty
  — ready for the next entry, no modal, no confirm step. An incomplete or
  invalid draft is left as-is rather than discarded, so a half-filled row
  survives clicking away to fix a mistake.
- **Denser chrome throughout `components/ui/table.tsx`** (this project's
  only consumer, so changing the primitive directly was safe): body text
  `text-sm` -> `text-xs`, header row `h-10` -> `h-7`, cell padding
  `p-2` -> `px-2 py-1`. The per-row delete button and the toolbar's
  Export/Import/Delete-flagged buttons move to the existing `xs`/`icon-xs`
  button sizes instead of `sm`/`icon`.

## Consequences

Adding a row is now the same gesture as editing one, and the table itself
communicates "you can add data here" instead of a separate form above it.
Removing the form plus the shorter header/rows meaningfully increases how
many records fit in the (still drag-to-reveal) table panel without
scrolling. This does not add inline editing of *existing* rows — those
stay read-only with a delete button, same as before; only new-row entry
moved into the table. The native `<select>` (rather than the app's Radix
`Select`) is deliberate: a portal-rendered popover's content isn't a DOM
descendant of the row, which would break the blur-based commit check.
