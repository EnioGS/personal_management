# Whole-vault export/import as one encrypted file

## Status

Accepted — builds on the shared vault unlock decision.

## Context

Each origin's IndexedDB is completely isolated by the browser (confirmed:
platform-level partitioning, not something the app controls), so there was
no way to move data between machines or browsers at all — no backup, no
migration path. Separately, the brand-mark icon in the activity bar was pure
decoration, not a real navigation entry, so there was nowhere natural to put
this kind of whole-app action (it doesn't belong to any one section).

## Decision

Turn the brand-mark icon into a real, first-position section (`vault`,
`brand: true` on `AppSection` — a sibling flag to the existing `pinned`) with
two items: **Get Started** (the app's new default landing screen) and
**About**. Get Started can create a fresh vault, import a previously
exported one, continue into the currently stored one, or export it — reusing
the shared vault passphrase (adr/0014) rather than introducing a second one.

The export format (`lib/vault-file.ts`) is a single JSON file (`.pmvault`)
containing the *raw already-encrypted rows* from all six tables, versioned
(`{version, exportedAt, tables}`). Since every row is individually encrypted
with a key derived from the vault passphrase, the file is encrypted by
construction — no additional encryption layer is needed to guarantee it's
only readable with that passphrase. Import/Continue actively verify the
passphrase by test-decrypting one real row before treating it as correct,
rather than silently "succeeding" into an empty-looking vault on a typo —
the one place in the app that does this (elsewhere, a wrong passphrase still
fails closed silently, per adr/0002/adr/0014).

Saving picks a location via the File System Access API where available
(`lib/file-io.ts`), falling back to a plain browser download elsewhere.
That API is Chromium-only (Chrome/Edge/Opera) — Firefox and Safari have no
equivalent, and Mozilla has stated privacy objections to it. This only
matters for *saving*; reading a file back in (Import) uses a plain
`<input type="file">`, which has no such limitation.

## Consequences

Data can be backed up and moved to a new machine/browser in one file, with
no server involved. The save-location picker is a nicer experience on
Chromium than the download fallback elsewhere, but both work. This is
manual-trigger only — auto-saving to a chosen file on every change (which
the File System Access API's persistent handles could support) was
deliberately scoped out as a separate, larger feature: it needs UI to manage
a remembered file, write-through hooks into every store, and failure
handling for a moved/permission-revoked file, none of which a one-click
manual export needs.
