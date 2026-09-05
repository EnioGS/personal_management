# Finances Overview: card composition, KPI deltas, ranked bars over a pie

## Status

Accepted, except for the delta — extends adr/0025's dashboard (filter row,
KPI tiles, diverging chart), which stays as-is; this adds structure and
comparison around it. The delta described below (one ratio against an
equal-length preceding period) is superseded by adr/0033, which compares
against last month and against the start of the tile's own sparkline.

## Context

adr/0025's Overview was four stat tiles and one chart, both reading the
whole available panel height. A design review (kept locally as `PLAN.md`,
not checked in) covering every Finances/Investimentos screen found the same
structural gap repeated everywhere: a KPI is a bare current value with
nothing to compare it against, and the panel is one or two elements
stretched to fill the space rather than a composition of several answers.
Overview is the first screen brought in line with that review.

## Decision

**Every KPI gets a delta and a trend**, not just a number. `StatTile` gains
optional `delta`/`sparkline` props: the delta compares the current filtered
period against the immediately preceding, equal-length period
(`previousEquivalentRange` in `lib/dashboard/date-range.ts` — an adjacent
window of the same length, not a calendar-aligned "last month"), computed
by calling `useDashboardEntries` a second time with a synthesized `custom`
filter over that shifted range. `goodDirection` is per-metric ("up" is good
for balance/income, bad for outflow/card spend), so the delta's color is
semantic (good/bad), not the tile's own identity color. Each sparkline
reuses the monthly buckets already computed for the chart below it — no
separate query.

**Every piece of content lives in a titled `DashboardCard`**
(`components/dashboard/dashboard-card.tsx`) instead of floating on the
panel background — a header (title + at most one control) and a body,
  optionally a footnote. The monthly-flow card deliberately has no display
mode toggle: account is a context filter, while the card remains the one
combined diverging in/out answer.

**The category pie is replaced by `RankedBarList`.** A pie's slices stop
being legible well before the categorical palette's own cap, and — found
during this same pass — degrades to a badly-clipped half-circle at the
aspect ratios these panels actually render at. A ranked horizontal-bar list
(label, bar, value, share%) has none of that: it is self-labelling, sortable
by construction, and scrolls inside its fixed card rather than folding
small values into "Other". Colour still follows the entity via the same
`colorForKey`.

**Two more cards answer questions the old screen didn't**: a "Contas" list
(each account's live balance, computed from its own bankLedger entries —
deliberately all-time, not scoped to the filtered period, since a balance
isn't a period-bounded idea) and "Lançamentos" (every entry in the filtered
period, inside a scrollable compact table with a centred, wrapping
`CategoryPill`). Both reuse `RankedBarList`/a small fixed-width table rather
than introducing new chart types.

**`FilteredEntry` gains a `description` field** (bankLedger/cardLedger's
own text, or generic's `note`) — needed for "Últimos lançamentos" and absent
before since nothing previously read it off the filtered/joined shape.

**Two small cross-cutting fixes rode along**, both flagged by the same
review as affecting more than this screen: `DivergingBarChart` gained a
legend (it had none — a two-series chart with no way to learn which color
means what), and `ranked-bar-list.tsx`/`category-pill.tsx` introduce a
reusable `--entity-light`/`--entity-dark` + `.entity-tint`/`.entity-fill`
CSS pair (`index.css`) for resolving a hashed `ThemedColor` against the
current theme outside of a chart context — the same problem `ChartStyle`
already solves for charts, needed here for a plain bar fill and a pill.

**Card layout uses fixed heights** (`h-[320px]`/`h-[260px]`), not
`flex-1`/`min-h-0`-all-the-way-down — the review's other headline finding
was charts silently rescaling as a side effect of dragging the table
drawer. A `DashboardCard` also sets `min-h-0` on itself even with an
explicit height, because a CSS Grid item's implicit minimum size is
content-based by default and will grow past an explicit `height` unless
told not to — without it, a `RankedBarList` with more rows than fit was
overflowing upward into the card's own header instead of scrolling.

## Consequences

The same primitives (`DashboardCard`, `RankedBarList`, `CategoryPill`,
`StatTile`'s delta/sparkline) are shared across the implemented Finance
screens and remain the baseline for future screens — Overview is not a
one-off. `previousEquivalentRange` and the
`.entity-tint`/`.entity-fill` CSS pair are both intentionally generic for
the same reason. The full plan for the remaining screens lives in
`PLAN.md` at the repo root (gitignored, not part of the shipped app) until
each is actually built.
