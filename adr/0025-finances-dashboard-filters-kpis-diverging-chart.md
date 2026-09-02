# Finances dashboard: one filter row, KPI tiles, a diverging in/out chart

## Status

Accepted — the Finances section's Overview panel, built on adr/0022's model
and adr/0024's color system. Extended by adr/0029 (KPI deltas/sparklines,
titled cards, ranked bars over a pie) without changing anything decided
here.

## Context

Overview was a single line chart (running balance) reading one hardcoded
rollup. Once tables are per-account and per-card (adr/0022), "the aggregate
or a subset of different banks for each account" is a real, asked-for
requirement, and money in vs. out is a genuine polarity around a zero
baseline — not two unrelated series that happen to share an axis, which the
dataviz skill calls the single most common charting mistake.

## Decision

Applied the dataviz skill's composition rules directly, rather than
inventing a bespoke layout:

- **One filter row, above everything it scopes** (`components/dashboard/
  filter-bar.tsx`) — never per-chart. Date range leads (presets: 30/90 days,
  this year, custom), then account/card/category dropdowns; screens that are
  scoped to one statement or card ledger can add that ledger dropdown. Every
  stat tile and the chart below read the same filtered set
  (`use-dashboard-entries.ts`), so the numbers on screen always agree with
  each other.
- **A KPI row of stat tiles** (`stat-tile.tsx`) — saldo líquido, total in,
  total out, card spend. A single current value is a stat tile, not a
  one-bar chart, per the skill's form-choice table.
- **Money in vs. out as a real diverging bar** (`diverging-bar-chart.tsx`),
  using the skill's separate blue/red diverging pair — not the categorical
  palette, which encodes identity, not polarity. One axis, one zero
  baseline, in above and out below; the two amounts are never stacked or
  given a second axis.
- **Combined flow only**: Overview keeps the diverging bar that directly
  answers money-in versus money-out. A per-account presentation toggle was
  removed: accounts are a context filter, not a second chart mode.

The filtering itself (`filterMoneyEntries` in `use-dashboard-entries.ts`) is
a plain function taking already-loaded data, kept separate from the
reactive hook wrapper around it, specifically so the join logic (entry ->
its table -> that table's kind/account/card, category resolved per the
table's own kind) is unit-testable without rendering anything. An empty
filter dimension means "every account/card/category," never "match
nothing."

## Consequences

Finances now has an actual dashboard rather than one chart with no controls
around it, and it is built to extend: a new stat tile or a new dimension
pill is additive, not a rewrite, because the filtering layer is already
generic over "any money-kind table, any account, any card, any category, and
when needed any active ledger."
The cost is real complexity concentrated in one join (table kind determines
which columns even exist — direction, category — so the filter/rollup code
has to branch on kind rather than assuming a uniform row shape); that
complexity is deliberately kept out of the UI components themselves and
lives in the one tested function.
