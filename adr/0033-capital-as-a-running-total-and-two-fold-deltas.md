# Capital as a running total, and two comparisons per KPI

## Status

Accepted — supersedes adr/0029's delta decision (the equal-length previous
period). The rest of adr/0029 — cards, ranked bars, `goodDirection` colour —
stands.

## Context

The Movements dashboard is about financial health over time, so its headline
number is capital: everything held, month after month. Two things about the
old tiles got in the way of reading it.

A delta against "the immediately preceding, equal-length period" answers a
question nobody asks of a balance. And a single ratio against the start of the
selected period produced things like `▼ 2624% vs. starting period`: true
arithmetic about a base that happened to be near zero, and unreadable.

## Decision

**Capital is a running total over all of history, cut to the window.**
`capitalEvolution` walks from the first month with any row, accumulating every
movement and every investment, and only then drops the points outside the
selected range. Changing the filter to 24 months changes what is drawn, never
where the accumulation started.

**Movements and investments are the only inputs.** The movements are the whole
story of the accounts, spending included — a card bill and a Pix both leave as
movements, so what was spent is already netted off by summing a month's ins and
outs. The dashboard's spending series is therefore the negative half of the
movements, not the spending screen: those rows itemise bills the movements have
already paid, and reading both would count every purchase twice. The spending
screen still answers *what* the money was spent on (by card, by category); the
movements answer *how much left*.

Capital therefore measures **change since the data begins** — the accounts have
no opening balance, because no statement carries one.

**Every KPI carries two comparisons, both calendar-real**
(`lib/dashboard/capital-metric.ts`): against last month, and against the first
month the tile's own sparkline draws. The tile is then self-contained — the
line and the numbers under it describe the same months.

**The amount leads; the percentage is optional.** A change is always stated in
currency, compactly (`R$ 1,2 mil`). A percentage is added only when its base is
positive and the ratio is at most ten times over — a base of zero, of the
opposite sign, or near enough to zero to yield hundreds of percent, describes
the base rather than the change, and is left off rather than shown.

## Consequences

- A tile needs three months of data to show both comparisons and two to show
  one; below that it shows the number alone, which is honest.
- Percentages disappear from tiles whose base crosses zero — capital in a month
  it went negative, most obviously. The currency amount stays.
- Nothing in the app supplies an opening balance yet, so "current capital" is a
  net change, not a bank balance. Making it a balance means recording what was
  held on the first day the data covers.
