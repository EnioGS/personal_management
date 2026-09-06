# A journal under every write

## Status

Accepted — the foundation the SQL write access in adr/0039 is built on, and
useful without it.

## Context

The assistant could change data only through tools that validated what they were
given, and could not delete at all. That is a narrow gate, and it still let a
bulk revision write `value: 0` across three hundred rows. Widening the gate to
raw SQL without a way back would be reckless; the alternative first proposed was
a mirrored database, kept in step, with the real data on one side and an
untouched copy on the other.

## Decision

**A journal, not a mirror.** Two databases that must agree is a distributed
systems problem in a browser: no cross-database transaction exists, every schema
migration has to run twice in the same order, drift is silent, and the backup
becomes the thing that cannot be trusted. A journal has one source of truth and
derives from it, so drift is not expressible. Storage is proportional to
changes rather than to data.

**Wrapped around the tables, not the store factory.** The tools write to
`confirmedRowsTable` and friends directly, so the exported Dexie tables are the
one thing every write path has in common. A proxy intercepts the seven write
methods and passes everything else — `where`, `orderBy`, `get` — straight
through, so nothing that uses Dexie has to know.

**A turn is the unit.** Everything one assistant message did shares a `turnId`,
because that is what a person undoes: not one row, and not everything since
Tuesday. A write outside a turn is a turn of one.

**Undo refuses rather than clobbers.** A row touched since the turn is left
alone and named. Restoring what somebody lost by discarding what they did
afterwards is a second loss. Undo is itself a turn, so undoing the wrong one is
recoverable.

**Two paths are deliberately not journalled**: `clear`, and imports. Both
rewrite everything, and a log holding a copy of the whole vault protects nobody
— an import is already a restore, and its own file is the record.

Retention is ninety days, trimmed by age, with a count guard against a log that
has run away.

## Consequences

- Every existing tool is now recoverable, including the ones that were never
  the concern. The protection is independent of how a write arrives, which is
  what a mirror could not have offered without the same wrapping.
- The History panel makes a large change visible after the fact: "deleted 812
  rows" is legible whether or not anybody was watching. That is the difference
  between recoverable and recovered.
- A write made outside the app's tables — a migration, a direct Dexie handle —
  is invisible to the journal. Migrations are excluded on purpose; anything else
  would be a bug in a new caller rather than in this.
