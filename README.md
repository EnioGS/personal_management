# Personal Management

A personal management tool: a frontend and the glue (Docker Compose, env
config, CI) to track, update, and stay on top of day-to-day life —
obligations, notes, future plans, spending/credit cards/investments, and
other similar things. No backend by design — data stays in your browser
(see [Backend](#backend)), with one-file export/import to move it between
machines.

Two things it optimizes for:
- **Extensible by area** — each aspect of personal life (notes, finances,
  plans, obligations, ...) plugs in as a self-contained section, so new
  areas can be added without fighting the architecture.
- **Sober design language** — a neutral, VSCode-inspired visual structure
  (icon sidebar, panels, no flashy color) rather than a "branded" UI kit look.

## Structure

```
.
├── frontend/                  # Vite + React + TypeScript + Tailwind + shadcn/ui
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/            # shadcn/ui primitives (button, resizable, table, chart, dropdown-menu, ...)
│   │   │   ├── charts/        # thin Recharts wrappers (line/bar/pie/diverging-bar) + the shared color palette
│   │   │   ├── data-table/    # table workspace (selector + "+ Nova tabela") with an inline draft row + CSV
│   │   │   ├── dashboard/     # filter bar, stat tile (delta+sparkline), dashboard card,
│   │   │   │                  # ranked bar list, category pill (Finances Overview and beyond)
│   │   │   ├── chat/          # global chat panel (mounted at app root, not a section)
│   │   │   └── layout/        # activity-bar / secondary-bar / app-shell / chart-table-panel
│   │   ├── sections/          # feature registry — the extensibility mechanism
│   │   │   ├── types.ts
│   │   │   ├── index.ts       # aggregates all sections into one array
│   │   │   ├── vault/         # brand-mark section: Data (export/import/clear) + About
│   │   │   ├── notes/         # notes.section.ts + panel/store/notes-db + locales/
│   │   │   ├── finances/      # Movimentações / Gastos / Investimentos / Recorrentes
│   │   │   ├── investments/   # shared investment analytics, ledgers, allocation components
│   │   │   └── settings/      # appearance/general/assistant/accounts-cards/ingestion/tables panels
│   │   ├── store/
│   │   │   ├── ui-store.ts     # active section/item, secondary-bar mode (expanded/icons/hidden)
│   │   │   ├── theme-store.ts  # light/dark/system theme
│   │   │   ├── locale-store.ts # pt/en language
│   │   │   ├── chat-store.ts   # chat messages/attachments/status, drives the tool-calling loop
│   │   │   └── chat-panel-store.ts # chat panel open/closed + unread state
│   │   ├── locales/common/    # shared strings not owned by one section
│   │   ├── lib/
│   │   │   ├── local-store/              # generic Dexie-table + Zustand-store factories
│   │   │   ├── model/                    # configurable records + ingestion sources/labels — see adr/0022 and adr/0030
│   │   │   ├── dashboard/                # date-range presets/resolution (lib side of components/dashboard/)
│   │   │   ├── table-schema.ts           # column schema driving tables, CSV, and the draft-row inputs
│   │   │   ├── csv.ts                    # CSV export/import + validation
│   │   │   ├── aggregations.ts           # chart data-shaping (buckets, running totals, top-N + "Outros" fold)
│   │   │   ├── current-value.ts          # investment position value from transaction history
│   │   │   ├── data-file.ts              # whole-app export/import (in-memory v4 shape + v2/v3 upgraders), row counts
│   │   │   ├── sqlite-schema.ts          # DataExportFile <-> typed SQLite columns, per table (adr/0028)
│   │   │   ├── sqlite-export.ts          # sql.js glue: build/parse the actual .db file bytes
│   │   │   ├── file-io.ts                # save-file picker (Chromium) with a download fallback
│   │   │   ├── openrouter.ts             # OpenRouter chat-completions client (incl. tool-calling wire format)
│   │   │   ├── openai-client.ts          # OpenAI direct chat-completions client, same wire format
│   │   │   ├── ai-providers.ts           # provider registry + key-prefix detection (adr/0027)
│   │   │   ├── chat-attachments.ts       # validates/reads .txt/.md/.csv files attached to a chat message
│   │   │   ├── assistant-config.ts       # one connection (provider/key/model) per row — see adr/0027
│   │   │   ├── assistant-prompts.ts      # editable system prompt (not translated, see adr/0016)
│   │   │   ├── tools/                    # tool-calling: registry.ts + one file per tool + run-conversation.ts loop
│   │   │   ├── utils.ts       # cn() helper (shadcn convention)
│   │   │   └── locale.ts      # Locale type, storage key, Intl locale-tag mapping
│   │   ├── i18n.ts            # i18next init — registers every namespace's resources
│   │   ├── i18next.d.ts       # type-checks t() keys against the English resources
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile             # multi-stage: deps → dev / build → production (nginx)
│   ├── nginx.conf             # serves the production static build
│   ├── components.json        # shadcn/ui config (style, aliases, neutral base color)
│   └── .nvmrc                 # pinned Node version
├── backend/                    # empty — no backend by design, see adr/0009
├── adr/                        # architecture decision records (Nygard format)
├── .github/workflows/
│   ├── frontend-ci.yml        # lint + test + build on push/PR touching frontend/
│   └── deploy-pages.yml       # builds + publishes frontend/ to GitHub Pages
├── docker-compose.yml         # frontend service only; backend commented out
├── .env.example               # copy to .env and fill in
├── .env                        # local secrets/config, gitignored
├── .editorconfig
├── AGENTS.md / CLAUDE.md      # local-only agent instructions, gitignored
└── README.md
```

## Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS v4 + shadcn/ui —
  fast to build with, sober default look.
- **Local-first storage**: Dexie (IndexedDB) + Zustand — client-side data
  that never reaches a backend. No passphrase and no encryption layer: the
  app opens straight into whatever is stored in the browser (see
  [Decisions](#decisions)).
- **Charts**: Recharts via shadcn/ui's `chart` wrapper; `@tanstack/react-table`
  for editable data tables; `papaparse` for CSV import/export; `sql.js`
  (SQLite compiled to WASM) for the whole-app SQLite export/import.
- **Assistant**: a global chat panel calling either OpenRouter (openrouter.ai)
  or OpenAI directly from the browser, whichever connection is active — no
  backend in the loop. The provider is detected from the pasted API key's own
  format (adr/0027), user-supplied and stored per connection. Tool calling
  lets the model read attached files, and read/write/correct/flag rows in
  whichever tables the user has created; see `lib/tools/` and
  [Decisions](#decisions) below.
- **i18n**: react-i18next, default Portuguese, namespace-per-section.
- **Testing**: Vitest, colocated with the code it covers.
- **Containerization**: Docker, one multi-stage Dockerfile (dev / production
  via nginx).

## Decisions

- Dockerfiles colocated per component, not a shared `deploy/`.
- Two-level, VSCode-style navigation as a data-driven registry
  (`src/sections/`), replacing shadcn/ui's `Sidebar`.
- Clicking the active section's icon cycles the secondary bar through
  expanded → icon-only → hidden. Its widths are fixed per state rather than
  drag-resizable, and neither the bar nor the panels repeat the name of what
  is already selected.
- Reskinning is two files — `vault/vault.section.ts` (icon) + two CSS tokens.
- The brand-mark icon is a real, clickable section (`vault`), not decoration
  — it's the default landing section, holding data management (Data:
  export / import / clear) and project info (About).
- No passphrase, no encryption at rest: rows are plain JSON in IndexedDB and
  every store loads itself on import, so the app opens on the user's data
  instead of on an unlock form.
- Whole-app backup is one file, not per-table CSV — it carries every table,
  including the ones with no CSV UI of their own. It's a real SQLite `.db`
  (adr/0028, built client-side with `sql.js`), one typed table per app
  table, openable in any SQLite browser or the `sqlite3` CLI — not a JSON
  blob wearing a `.db` extension. An old `.pmdata` (JSON) backup still
  imports; format is detected from the file's own bytes, not its name.
- No backend by design — data stays local-first or in private storage the
  user controls, not a third-party-hosted service.
- Local storage is one generic factory (`lib/local-store/`), not per-section
  persistence code — every new section that needs stored data reuses it.
- The chat assistant is a global overlay (`components/chat/`), not a
  section — it stays available regardless of which section/item is active.
- Tools the assistant can call are a flat registry (`lib/tools/registry.ts`):
  adding one is a single new `ToolDefinition` file plus one array entry,
  nothing else changes. `write_to_table` and friends read the current table
  list from `lib/tools/writable-tables.ts` fresh on every call rather than a
  fixed array, so a table created in the UI mid-conversation is visible to
  the very next tool call.
- Tables, accounts, cards and the category vocabulary are user data, not
  compile-time constants (`lib/model/`, see adr/0022) — a `TableKind` fixes
  a table's columns, but the number of tables, accounts and cards is
  unbounded. The data ingestion centre's source provenance, mappings, staged
  rows and label sidecars travel in the v5 export too, so
  importing into a blank browser restores the whole setup.
- Data enters Finance through Settings → Data ingestion centre (adr/0030,
  adr/0031). The drop zone takes CSV files and exported `.db` databases alike — a
  database is split into one dataset per user table it contains, so rows from
  another vault or an old backup arrive unlabelled and go through the same door
  as a bank statement, rather than being restored into a finance table (that is
  still Vault → import, which replaces everything). CSV source columns are
  mapped without rewriting the original file,
  sparse sources may gain explicitly blank supplemental columns, and only
  user-confirmed ready rows are written into a destination table. A row nobody
  has labelled is not in a finance table at all — it waits in the worklist, so
  every chart, KPI and position reads confirmed labels only. Labels are a single
  Finance destination plus flow role, settlement channel, spending
  expense/rebate treatment, recurrence, category and destination table. An
  explicit label always beats a guess: description-based recurring/instalment
  detection only runs over rows still labelled `undecided`.
- The category vocabulary *is* the category labels (adr/0031, superseding
  adr/0023): naming a category on a row creates it. There is no rule engine and
  no Categories settings screen — one classification path, decided per row.
- Confirmed rows stay editable: the ingestion centre's third dataset lists what
  is already in a Finance table, relabelling one marks it for reallocation, and
  *Confirm and reallocate rows* rewrites that entry in place — same entry id, new
  destination and labels, every Finance screen following immediately. An edit
  whose new destination cannot hold the row keeps its error and stays put.
- An uploaded file is triaged before it is staged: every row is scanned on arrival
  and shows as ready, duplicate? or eliminate beside itself. A row counts as a
  duplicate only when everything it actually carries matches a stored row —
  columns the ingestion centre added are not evidence, blank or not. *Add to
  imported known new values* takes only the unflagged rows; *Add to imported
  unlabelled data* takes everything except eliminations, and asks first when
  duplicates are unresolved. Staged rows leave the file's table, so it empties as
  it is dealt with.
- The same transaction arrives twice more often than expected, so duplicates are
  detected by comparing only the fields two rows *both* have: a file missing a
  column is still checked on the columns it does have, and a missing column is
  never evidence that two rows differ. An identical fingerprint is proof, three
  agreeing fields is strong, two agreeing with the third missing is worth a look.
  A row judged a copy is discarded with a reason — set aside, still readable,
  restorable, and never promotable — rather than deleted.
- What was worked out once becomes a **standing labelling rule**: it matches text
  in a field, fills only labels a row does not already have, runs by itself when
  rows are staged, and carries a rationale saying why that label set is safe for
  everything matching it. A rule may claim a row only when the user confirmed it
  with the rule's own labels intact — computed from the rows every time rather
  than tallied, so "overridden" honestly reports a rule that was wrong.
- Confirmed rows can be read table by table: the Confirmed button carries an arrow
  that lists the user's tables grouped the way the app is navigated — a heading per
  section, a sub-heading per screen, and only the ones that own tables. Any column
  also filters, by text or by a numeric range where leaving one side empty means
  "above" or "below".
- Tables sort from any column header (alphabetic or numeric, either direction,
  chosen rather than sniffed) and render one page at a time, growing as the
  container nears the bottom. The assistant asks the same questions through
  count/group/query tools instead of paging a backlog it cannot filter.
- The chat reports what it costs: tokens for the last message and the requests it
  took, the session total, and how full the model's context window is when that
  window can be looked up.
- A source file whose rows have all been dealt with can be removed from the
  Confirmed view: discarded duplicates count as dealt with, since by definition
  they never reach a Finance table, while a row still waiting in the worklist
  blocks removal. Confirmed rows survive with their raw values and are stamped
  with the filename they came from, so provenance outlives the file.
- A rule ("everything mentioning IOF is a card rebate") is applied with one
  matched bulk call rather than row by row, and that call previews by default:
  it returns the match count and examples, changes nothing, and only labels once
  the user has confirmed the rule really describes those rows. Ready rows sort to
  the top of the worklist, since they are what the confirmation button acts on.
- Finance tables are read-only to the assistant: no tool writes to one. Every
  change — adding data, correcting it, taking it out — happens in the ingestion
  centre, so a row on a dashboard always has raw values and explicit labels behind
  it. Discarding a confirmed row flags its entry, which restoring undoes.
- The assistant can map columns, edit staged values, label rows and validate
  them, but has no tool for the steps that move data (staging a mapped
  source, promoting labelled rows); those are the user's clicks. Its whole
  workflow knowledge is one retrievable document (`read_ingestion_guide`),
  editable and resettable under Settings → Assistant.
- Chart colors open on the brand's own hue, then the dataviz skill's
  remaining validated hues (adr/0024) — never a generated or cycled color
  past that fixed set, per the skill's accessibility rule. A color follows
  its entity (a category, an account) via a stable hash, not the entity's
  position in whatever is currently on screen, so filtering never repaints
  a survivor.
- Finances' Movements dashboard is a real dashboard (adr/0025): one dropdown-based
  context row (date range, account, card, category) scopes a KPI row and a
  combined diverging in/out chart — not a single hardcoded chart.
- Orçamento, Recorrentes, Posições, Proventos, Alocação, and a Settings ->
  Tabelas listing every table across every section (adr/0026) all read from
  data the model already had — a budget compares category spend already
  computed elsewhere, positions/allocation share one weighted-average-price
  calculation (`lib/current-value.ts`), recurring detection is pattern
  matching over existing entries, not a declared schedule.
- The assistant's Connections list supports more than one provider — one
  saved connection per provider, detected from the key's own prefix rather
  than a picker, with exactly one active at a time (adr/0027). Nothing in
  Settings → Assistant has a Save button: a connected key and an edited
  system prompt already persist themselves, with a reset button restoring
  the default prompt for anyone who'd rather not hand-edit it.
- Nothing the assistant does to an existing row in a writable table is ever a
  hard delete or in-place overwrite — a `deleted` soft-flag column marks rows
  for removal (faded, not hidden, in the table UI) or the original of a
  correction. Only the user can permanently purge flagged rows, via a
  confirm-first button in each table.
- Every table adds rows through an always-present, faded draft row at the
  bottom instead of a separate add-row form — it promotes itself into a
  real row once its required columns hold valid values, then resets. See
  adr/0021, which also covers the denser table chrome (smaller text,
  shorter header row) this made room for.
- CI intentionally minimal: lint + test + build, frontend only for now.
- Agent commits carry no AI attribution.
- Dual deployment (Docker anywhere + GitHub Pages) from one build output.

See [adr/](adr/) for the full reasoning behind these and the stack choices
above.

## Frontend

```bash
docker compose up   # dev server at http://localhost:5173, hot reload
```

Add more shadcn/ui components with `npx shadcn@latest add <component>` (run
on the host — needs Node/npm installed locally).

Tests: `npm run test` (Vitest, also part of CI).

## Backend

None by design. Data stays local-first — client-side browser storage (see
Stack above) — or, if remote persistence is ever needed, targets private
storage the user controls (self-hosted, private cloud bucket) rather than a
conventional application backend. See
[adr/0009](adr/0009-no-backend-privacy-first.md). `backend/` stays empty and
the `backend` service in `docker-compose.yml` stays commented out unless
that changes.

## Docker Compose

```bash
cp .env.example .env   # if not already present
docker compose up --build
```

`BUILD_TARGET` in `.env` picks the Dockerfile stage: `dev` (default) or
`production` (nginx serving the optimized static build).

## Deployment

Two independent paths:

- **Docker, anywhere Docker runs**:
  ```bash
  docker build --target production -t <name> ./frontend
  ```
  Platforms that assign the port dynamically (Heroku, Cloud Run) need an
  entrypoint step templating `$PORT` into `nginx.conf` — not needed for a
  static host/VPS where you control the port mapping directly.
- **GitHub Pages**: `.github/workflows/deploy-pages.yml` builds and deploys
  on every push to `main`. One-time manual step: repo **Settings → Pages →
  Source: GitHub Actions**.

## Environment variables

See `.env.example` — `BUILD_TARGET`/`FRONTEND_CONTAINER_PORT` (Docker stage
selection), `FRONTEND_PORT`, etc. Copy it to `.env`, which is gitignored.

## License

[GNU AGPL-3.0](LICENSE).

Copyright (C) 2026 EnioGS
