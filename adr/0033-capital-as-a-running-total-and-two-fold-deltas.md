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

**Holdings are counted as what is held, everywhere.** Investment rows are
written from the account's point of view — an aplicação is money leaving it, a
resgate money coming back — so both the investments series and capital subtract
them: money placed in a fund becomes a holding rather than a loss, and a
redemption that also shows up as a bank transfer nets to zero instead of being
counted twice. The tables keep saying what the broker said; only the arithmetic
reads the other way.

**Every KPI carries two comparisons, both calendar-real**
(`lib/dashboard/capital-metric.ts`): against last month, and against the first
month the tile's own sparkline draws. The tile is then self-contained — the
line and the numbers under it describe the same months.

**The amount leads; the percentage is optional.** A change is always stated in
currency, compactly (`R$ 1,2 mil`). A percentage is added only when its base is
positive and the ratio is at most ten times over — a base of zero, of the
opposite sign, or near enough to zero to yield hundreds of percent, describes
the base rather than the change, and is left off rather than shown.

**Spending gets a treemap** (`components/charts/category-treemap.tsx`). Area
carries the ranking, so forty categories fit where a list scrolled; a box says
its name, then its value, then its comparison arrow, each only once it is big
enough to hold them legibly. Two things it deliberately does not do: it draws
nothing between the boxes, a treemap being one shape divided rather than a grid
of tiles, and it colours from a single-hue ramp ordered by rank rather than from
the categorical palette — eight validated hues scattered over forty boxes read
as confetti, and a ramp running the same direction as the areas lets colour and
size agree. Movements keeps its ranked list, in the taller space freed by
retiring the two one-number tiles beside the cash flow.

**A card's bill payment is not spending.** The credit that settles a statement
arrives on the card's own file the size of everything above it, and the same
event is already in the bank as the payment that left the account. Counted on a
spending screen it cancels the purchases it paid for and lands under whatever
label the payment carried, so `isSpendingRow` excludes it — matched by a
positive value and a "Pagamento recebido" description. Refunds, IOF returned
and credit adjustments stay: those give money back on something bought.

**The cash reserve is a holding, not a remainder.** It comes from the investment
rows that name it (`isCashReserve`), like fixed and variable income do — never
from capital less what is invested, which is a different quantity: money not yet
placed is not a reserve. All three classes are always answered for, holding
anything or not, since a chart that comes and goes with the data cannot be
learned.

**A row says which pot it is about, and that decides its sign** (`heldDelta`). A
broker's file is a ledger of one account's cash, so a fund row is written from
the cash's side — money into a fund is negative — while a row about the cash
itself keeps its sign. So a holding is the opposite of a fund row's value and
the same as a cash row's, and the two readings are the two ends of one transfer:
the movement out of the bank and the holding it became now cancel instead of
being counted twice. The class is read from `investmentClass`, `category` and
`subcategory` together, since a file without a class column is labelled by hand
into whichever of the two the user chose.

**Holdings are drawn as two rings** (`components/charts/holdings-pie.tsx`): the
classes inside, what each is made of outside, tinted from the parent's colour.
Names sit on leader lines rather than in a legend — a legend makes the eye carry
a colour across the card and back, a line just points — and a slice too thin to
label legibly is left to the tooltip.

## Consequences

- A tile needs three months of data to show both comparisons and two to show
  one; below that it shows the number alone, which is honest.
- Percentages disappear from tiles whose base crosses zero — capital in a month
  it went negative, most obviously. The currency amount stays.
- Nothing in the app supplies an opening balance yet, so "current capital" is a
  net change, not a bank balance. Making it a balance means recording what was
  held on the first day the data covers.
