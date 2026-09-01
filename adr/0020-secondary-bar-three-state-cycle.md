# Secondary bar: three-state cycle, fixed widths, no titles

## Status

Accepted — refines adr/0007 (two-level navigation registry).

## Context

The secondary bar had two states (expanded / hidden, toggled by re-clicking
the active activity-bar icon) *and* a drag handle to resize it, *and* a
persisted width in localStorage. Three mechanisms controlled one column's
width, which is two more than the column needed. The all-or-nothing toggle
also made hiding it expensive: dropping the bar to reclaim horizontal space
cost the ability to switch items without bringing the whole bar back.

Separately, both navigation levels labeled themselves redundantly: the
secondary bar repeated the section name as an uppercase title above its
items, and every panel repeated its own item name as a heading in its
top-left corner — three copies of "Finances → Spending" on screen at once,
in a layout whose whole point is that the active icon and the active item
already show where you are.

## Decision

- The secondary bar has **three states**, cycled by clicking the active
  section's activity-bar icon: `expanded` (icons + labels) → `icons`
  (icon-only strip, the item buttons keeping their exact height and icon
  size) → `hidden` → back to `expanded`. `store/ui-store.ts` models this as
  `secondaryBarMode`, not a boolean. Selecting a *different* section always
  resets to `expanded`.
- Widths are **fixed per state** (`w-56` / `w-12` / not rendered), set in
  `app-shell.tsx`. The bar is no longer a `ResizablePanel`: the drag handle,
  the panel group and the persisted layout are gone from the shell.
  `react-resizable-panels` stays where a drag genuinely has no substitute —
  the chart/table split inside a panel (`chart-table-panel.tsx`).
- The secondary bar's **section title is removed** — items start at the top —
  and each panel's **duplicate name heading is removed**, so panels open
  directly on their content. In icon mode the item labels move into
  tooltips, matching the activity bar.

## Consequences

One control (the section icon) owns the column's width, with a middle state
that keeps item switching available while giving the content nearly all the
space. Users lose per-pixel width control, which the fixed steps replace;
the `icons` step is what makes that trade acceptable. Panels no longer
carry a self-identifying header, so anything a panel needs to say about
itself (the Data panel's explanation, for instance) has to earn its place as
content rather than ride along in a title bar.
