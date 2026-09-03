# Ingestion test set

Four files that overlap on purpose. Each one carries a trap that a careless import
would walk into, and together they exercise every path in the ingestion centre:
column mapping, duplicate triage across files, labelling judgement, standing rules,
and the two moves only the user can make.

Import them in the order below — the traps depend on it.

| File | What it is | What it is hiding |
| --- | --- | --- |
| `01-banco-agosto.csv` | Bank statement, August 2026 | An internal transfer to the user's own savings, a card invoice payment, and a Pix that is really a purchase |
| `02-banco-setembro.csv` | Bank statement, September 2026 | Its first three rows repeat the last three of August — the classic overlapping export |
| `03-cartao-agosto.csv` | Card statement, August 2026 | An IOF charge *and* an IOF reversal, a refund, and an instalment; the invoice it bills is the payment already in file 01 |
| `04-corretora.csv` | Broker statement | Buys, a sell and a dividend, with a column the others do not have (`ativo`, `quantidade`, `preco`) and one row duplicated inside the file itself |

## What each file should teach

**01 — bank, August.** Ordinary rows plus three judgement calls:
`Transferência para Conta Poupança` is a `transfer` between the user's own accounts
(capital unchanged); `Pagamento de fatura` is an `outflow`, not a transfer, because
card purchases never touched cash; the Pix to `MERCADO SAO JORGE` is `spending`, not a
plain movement, even though it is a Pix.

**02 — bank, September.** Rows 1–3 are byte-identical to the last three of file 01.
They must be flagged `duplicate?` on upload, before any mapping is done. Importing
everything would double the salary and the rent.

**03 — card, August.** `IOF de compra internacional` is a charge; `Estorno de IOF` is
its reversal. A blanket "IOF" rule gets one of them wrong, which is exactly the rule
the guide warns against. `Estorno Livraria Cultura` is `spending` + `rebate`, not an
inflow. `Curso de idiomas 3/12` is an instalment, not a subscription. And the total of
this statement is the invoice paid in file 01 — related, but not a duplicate of it.

**04 — broker.** Needs `asset`, `quantity` and `price`, which no bank file has, so it
proves the mapping is per-file. Rows 3 and 4 are identical: a repeat *within* one file,
which only the within-batch check catches. The `Dividendos PETR4` row is income, not a
buy.

## A run worth doing

1. Drop all four at once. Ask for a duplicate report before mapping anything.
2. Map each file; watch the broker file demand fields the bank files never had.
3. `Import new values` on file 02 — the repeats stay behind. Then look at what is left.
4. Label file 01, and ask for a standing rule for `Pagamento de fatura`.
5. Import file 03 and check whether the rule fired on its own.
6. Confirm a few rows, then relabel one and reallocate it.
