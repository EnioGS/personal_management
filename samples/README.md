# Ingestion test set

Four files that overlap on purpose. Each one carries a trap that a careless import
would walk into, and together they exercise every path in the ingestion centre:
column assignment, duplicate flagging across files, labelling judgement, sign
conventions, standing rules, and the one move only the user can make.

Import them in the order below — the traps depend on it.

| File | What it is | What it is hiding |
| --- | --- | --- |
| `01-banco-agosto.csv` | Bank statement, August 2026 | An internal transfer to the user's own savings, a card invoice payment, and a Pix that is really a purchase |
| `02-banco-setembro.csv` | Bank statement, September 2026 | Its first three rows repeat the last three of August — the classic overlapping export |
| `03-cartao-agosto.csv` | Card statement, August 2026 | An IOF charge *and* an IOF reversal, a refund, and an instalment; the invoice it bills is the payment already in file 01 |
| `04-corretora.csv` | Broker statement | Buys, a sell and a dividend, with a column the others do not have (`ativo`, `quantidade`, `preco`) and one row duplicated inside the file itself |

## What each file should teach

**01 — bank, August.** Ordinary rows plus three judgement calls, all now settled by
the sign rather than by a label: the transfer to the user's own savings leaves one
account negative and arrives somewhere positive, so capital is unchanged by
arithmetic and neither side is hidden; `Pagamento de fatura` is money that left; and
the Pix to `MERCADO SAO JORGE` belongs on the spending screen as well as movements,
which is what confirming a row onto two screens is for.

**02 — bank, September.** Rows 1–3 are byte-identical to the last three of file 01.
They come from a *different* file, so they are exactly what duplicate flagging is
still for. Importing everything would double the salary and the rent.

**03 — card, August.** `IOF de compra internacional` is a charge; `Estorno de IOF` is
its reversal. A blanket "IOF" rule gets one of them wrong, which is exactly the rule
the guide warns against. `Estorno Livraria Cultura` is a refund: same spending screen,
opposite sign. A card export that writes purchases as positive is the case for
inverting the whole file — decide that *after* the rows are labelled, and sample the
spending table first. And the total of this statement is the invoice paid in file 01 —
related, but not a duplicate of it.

**04 — broker.** Needs `asset`, `quantity` and `price`, which no bank file has, so it
proves assignment is per-file. Rows 3 and 4 are identical — and *within one file* that
is two real transactions, not a duplicate: nothing should flag them. The
`Dividendos PETR4` row is income, not a buy.

## A run worth doing

1. Drop all four at once. Ask what the assistant sees — it reads them with SQL.
2. Assign each file's columns; watch the broker file need fields the bank files
   never had.
3. Label file 01's sections and screens, then decide its sign convention — in that
   order, and after sampling where the rows are going.
4. Ask for a standing source rule for `Pagamento de fatura`, then upload file 03 and
   check whether it landed already labelled.
5. `Import new values` on file 01 — what is ready moves, what is not stays.
6. Mark a confirmed row for elimination, watch it leave the dashboards and stay in
   its table, then unmark it. Deleting it is yours alone.
