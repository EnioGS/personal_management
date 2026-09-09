# A table has no price

## Status

Accepted — narrows adr/0035, which made `value = amount × price`.

## Context

Money was unified on `price` per unit times `amount`, so a broker file
quoting "3 units at R$50.25" and a bank file quoting "-R$284.90" could be read
by one rule. That part was right and stays.

What was wrong was carrying `price` into the confirmed row. A table then held
three numbers for the same fact — value, amount, price — of which one is the
quotient of the other two. Three consequences, all seen:

- The assistant, writing SQL, had to choose where money goes, and chose
  whichever column the question mentioned. Rows arrived with money in `price`
  and nothing in `value`, or the two disagreeing.
- The columns cannot be kept consistent by anything: an UPDATE to `value` alone
  leaves `price` asserting something else, and nothing is wrong enough to fail.
- The user reads a table with a redundant column and reasonably assumes
  something invented it.

## Decision

`price` is a *file's* word and an assignment only. A file may quote per unit,
because brokers do; confirmation multiplies `amount × price` and stores the
product as `value`. **A confirmed row has no price.** Money is `value`, units
are `amount`, and what one unit was worth is those two divided — computed where
it is needed (`asTransaction`) and stored nowhere.

Removed rather than hidden, and removed from the stored rows too (model-db v18
deletes the key), because a column nothing reads is a column something will
eventually write to.

## Consequences

Money has one home, so an UPDATE cannot make a row inconsistent with itself.
The confirmed tables lose a column, the SQL vault and the SQLite export lose it
too, and `add_confirmed_row` loses the parameter. The guide says it in one line:
a table has no price.

The cost is that a per-unit price now has to be recomputed to be shown, and a
file whose only money column is per unit still has to be assigned as `price`
rather than `value` — the one place the word survives, and the one place it
means something a table cannot.
