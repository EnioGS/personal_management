# Inline draft row replaces the add-row form; denser table chrome

> **Superseded by adr/0032.** Finance tables are not edited in place any more, so there
> is no draft row to promote: data arrives through the ingestion centre and is corrected
> by adding a row with the same `row_id` and marking the old one. The denser table chrome
> this decision made room for stayed.

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
  to the column's type: `<input type="date">`, `<input type="number">` —
  native, so they reject non-numeric/non-date keystrokes for free, the
  same type-safety the old form leaned on `coerceValue` for — the app's
  own Radix-based `Select` for `type: 'select'`, plain text otherwise.
  A first pass used a native `<select>` for that last one; on at least
  Linux, Chrome renders a native select's popup via the OS's own widget
  toolkit, which ignores the page's dark theme entirely (near-invisible
  text on a stray white background) — `<option>` background-color isn't
  reliably stylable across platforms, so this needs a popup actually
  rendered in the DOM, which is exactly what the app's existing `Select`
  already does elsewhere.
- **The row promotes itself.** Once every required column (date/number/
  select always; text only if marked `required`) has held a value
  `coerceValue` accepts for 500ms (`COMMIT_DEBOUNCE_MS`) with no further
  edits, the draft becomes a real row via the existing `onAddRow`, and the
  same row resets to empty — ready for the next entry, no modal, no
  confirm step. An incomplete or invalid draft is left as-is rather than
  discarded, so a half-filled row survives while you fix a mistake. This
  is a debounced `useEffect` keyed on the draft object, not a focus/blur
  check — a Radix `Select`'s popup content is portalled to `document.body`,
  not a DOM descendant of the row, so "did focus leave the row" doesn't
  hold together once one of the cells is Radix-based. The debounce also
  doubles as what keeps a fast typist from having a number field commit
  after its first, already-numeric digit.
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
moved into the table. A `Select`'s `value` prop must stay a defined string
at all times rather than switching to `undefined` for "nothing chosen" —
doing that flips it between controlled and uncontrolled, and Radix's
internal state then sticks to whatever it last held instead of clearing,
which is exactly the bug that shipped in this feature's first version (the
draft row's dropdown kept showing the previous pick after a commit reset
every other cell).
