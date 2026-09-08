# What a dashboard should say

## Status

Accepted — applies to Spending and Investments what adr/0033 established on
Movements.

## Context

Movements was rebuilt around one question: what is it now, and is that better or
worse than it was. Spending and Investments were not, and it showed. Their
headline numbers were sums over whatever window the filter happened to hold —
widen the filter and "total spent" grows, which is a fact about the filter
rather than about the spending. Entry counts and single largest expenses sat
where trends should have been.

Investments had a second problem. It computed positions from `asset`, `amount`
and `price`, and `asset` was retired when one `class` label replaced the three
investment-only columns (adr/0036). Half the screen was reading a field that no
longer exists, while the correct holdings arithmetic sat unused one screen over.

## Decision

**A tile is the latest month, two comparisons and a line.** `capitalMetric` was
generalised from the capital points to any monthly series, so every screen asks
for the same tile rather than writing it three times.

**A "by category" panel is a monthly average**, with the recent quarter compared
against it — the reckoning `monthlyAverageByCategory` already did for spending,
now shared with income and read the same way on both screens.

**Spending gains what it lacked**: the month against the month before rather
than a window total; `committed`, the part of a month already decided by
subscriptions and instalments, which is the difference between a month that was
expensive and one that was chosen to be; and *this month so far against the
last, day by day* — the only chart that answers "am I over, right now", asked
honestly by comparing the fifteenth with the fifteenth.

**The treemap's colour changes meaning.** Size already says how much, so colour
says which way a category is drifting against its own average. Two facts in the
space of one chart, and the question a person actually has about a category
whose size they already know.

**Investments is rebuilt on the holdings model** — `investmentMonths` walks the
classes month by month the way capital walks the accounts — and drops positions,
allocation-by-asset and the buy/sell/income word-matching that depended on the
retired columns.

**No return is shown, deliberately.** These files are cash flows: they say what
was put in and taken out, never what a holding is worth today. Held, received,
and how the composition moved are all honest; "up 7%" would not be. What is
received is read from what the rows call themselves, and the card says so.

## Consequences

- Widening the date filter no longer inflates a headline number on any screen.
- Investments needs a valuation — a price column, or a place to type today's
  value — before it can show gain or return. That is a feature to decide on, not
  a bug to fix.
- `computePositions` and the asset-based allocation remain in the code for the
  leaf panels that still use them, and are no longer on the main screen.
