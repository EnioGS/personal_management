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
│   │   │   └── settings/      # appearance/general/assistant/accounts-cards/ingestion panels
│   │   ├── store/
│   │   │   ├── ui-store.ts     # active section/item, secondary-bar mode (expanded/icons/hidden)
│   │   │   ├── theme-store.ts  # light/dark/system theme
│   │   │   ├── locale-store.ts # pt/en language
│   │   │   ├── chat-store.ts   # chat messages/attachments/status, drives the tool-calling loop
│   │   │   └── chat-panel-store.ts # chat panel open/closed + unread state
│   │   ├── locales/common/    # shared strings not owned by one section
│   │   ├── lib/
│   │   │   ├── local-store/              # generic Dexie-table + Zustand-store factories
│   │   │   ├── model/                    # accounts/cards, source files, confirmed rows, rules — see adr/0022 and adr/0032
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
  nothing else changes. Reading is one SQL tool over the browser database, so a
  table created mid-conversation is visible to the very next call without any
  tool being told about it.
- One export carries a whole setup, not only its rows: accounts, cards, the
  uploaded files with their assignments, the rows still being worked on, the
  confirmed rows, standing rules, notes, budgets, the assistant's prompts and its
  API keys, and the interface preferences (theme, language) that live outside
  Dexie. The export mirrors the database rather than a shape of its own, and adds a
  named view per uploaded file (`source__nubank_2026_09_08__3`) and per confirmed table
  (`confirmed__finances__spending`) with the file's own columns as real columns — so the
  `.db` is worth opening in a SQLite browser, while the canonical tables are still what
  an import reads. Clearing the data is narrower on
  purpose — it keeps the accounts and cards, which are configuration rather than
  transactions.
- Accounts and cards are user data, not compile-time constants (`lib/model/`,
  see adr/0022): their number is unbounded. They live in Settings → General, beside
  language and theme, because what they are now is **label vocabulary** — a short list
  of names set up once — rather than a place data is kept. Everything else about the
  shape of the data comes from the files themselves.
- Data enters through Settings → Data ingestion centre, and there is **one phase**
  to it (adr/0032, superseding adr/0030, adr/0031, adr/0018 and adr/0021). A dropped CSV becomes its
  own table, keeping every column the file wrote, with `source_filename` in front
  of them and four label columns after them. Only the file's own columns can be
  assigned a meaning (date, amount, asset, quantity, price, investment type and
  class); everything unassigned is condensed into one observations column when the
  row is confirmed, so nothing is dropped and no column has to be invented.
- Two more labels, both optional and both validated against Settings: **account** says
  which account a row moved through and **card** which card it was billed to. They are
  stored by name, so a table and a query read as words rather than as ids; renaming an
  account renames the vocabulary and existing rows keep the name they were labelled with,
  which is visible rather than silent.
- Four labels, not seven: **sections** and **screens** say where a row belongs and
  are validated against the app's own navigation as they are typed — a screen only
  counts inside a section the row names, and a value nothing is called stays in the
  cell in red rather than being silently dropped — while **category** and
  **subcategory** are free text, one value each, starting at `outros` and editable on
  a confirmed row, since a row can be placed before it is understood. Direction is not
  a label at all: the sign of the amount says it, negative left and positive arrived.
- Confirming a row **copies it into one table per (section, screen) pair it
  names**, every copy carrying the same `row_id` — a hash of the row's contents
  and a random seed, fixed for the row's life even if every value in it later
  changes. The row leaves the file it came from, so a file empties as it is dealt
  with. Anything counting across screens counts each `row_id` once.
- A file's signs are made to agree with ours explicitly, and only after the rows
  are labelled — the decision depends on where they are going, and `query_vault`
  reports how each confirmed table's amounts are signed today so the decision is made
  against evidence. A file may be inverted wholesale, or inverted by a condition on
  another column (`buy`/`sell`, `debit`/`credit`). The transformation rewrites the
  amount column itself, so the table shows what will be confirmed; the value the file
  wrote is kept on the row, reaches the confirmed row's observations, and comes back
  the moment the convention is set to "as imported".
- Dates and amounts are read the way statements write them, not the way a parser
  wishes they did: `15/08/2025` is day-first, `87,40` and `1.234,56` are numbers,
  and whichever of `.` or `,` comes last is the decimal point.
- Duplicate flagging is narrow on purpose: two identical rows *inside one file*
  are two real transactions, so a row is only ever flagged against a row from a
  **different** file, or when a newly uploaded file's name is very close to one
  already imported (measured against the shorter name). A flag is advisory and
  removes nothing.
- **Marking for elimination** is a table-wide mode rather than a per-row control:
  one checkbox above the table, then clicking a row toggles its mark, and clicking
  anything that is not a row turns the mode off. A marked row is invisible to every
  dashboard and still visible in its table — the single thing this app hides, and
  what makes marking safe to hand out.
- The user and the assistant have the same powers over the data, with exactly one
  exception: both mark and unmark, and **only the user deletes**. Correcting a
  confirmed row is never an in-place edit — the corrected row is added with the
  same `row_id` and the old one is marked, which is what keeps the history
  readable.
- What was worked out once becomes a **standing labelling rule**, and rules belong
  to one of two stages that never cross: a *source* rule runs as a file arrives, so
  an import can land already labelled, and a *confirmed* rule fills in meaning on
  rows already in a table. A rule matches by substring, `equals`, `startsWith` or
  regex (validated when it is saved, not when it runs), stacks conditions that must
  all hold, fills only labels a row does not already have, and carries a rationale
  saying why those labels are right for everything matching it. The panel shows the
  rules of a stage only while a table of that stage is open, and the user writes one
  there through the same validation the assistant's tool applies.
- The assistant reads with SQL and writes through a small set of validating tools:
  it assigns columns, sets the sign convention, labels rows one by one or by a
  match, marks and unmarks, and confirms what is ready. Retiring a file along with
  what is marked on it needs the user's word first. Its whole workflow knowledge is
  one retrievable document (`read_ingestion_guide`), editable and resettable under
  Settings → Assistant.
- Tables sort from any column header (alphabetic or numeric, either direction,
  chosen rather than sniffed), filter by text or by a numeric range where leaving
  one side empty means "above" or "below", and render one page at a time, growing
  as the container nears the bottom. The assistant asks the same questions in SQL
  instead of paging a backlog it cannot filter.
- The chat reports what it costs: tokens for the last message and the requests it
  took, the session total, and how full the model's context window is when that
  window can be looked up.
- Chart colors open on the brand's own hue, then the dataviz skill's
  remaining validated hues (adr/0024) — never a generated or cycled color
  past that fixed set, per the skill's accessibility rule. A color follows
  its entity (a category, an account) via a stable hash, not the entity's
  position in whatever is currently on screen, so filtering never repaints
  a survivor.
- Finances' Movements dashboard is a real dashboard (adr/0025): one context row
  (date range, category) scopes a KPI row and a combined diverging in/out chart —
  not a single hardcoded chart. Capital means everything of value held,
  investments included, which is what *Current capital* and the capital line both
  show.
- Orçamento, Recorrentes, Posições, Proventos and Alocação (adr/0026) all read
  from data the model already had — a budget compares category spend already
  computed elsewhere, positions/allocation share one weighted-average-price
  calculation (`lib/current-value.ts`), recurring detection is pattern
  matching over existing entries, not a declared schedule.
- The assistant's Connections list supports more than one provider — one
  saved connection per provider, detected from the key's own prefix rather
  than a picker, with exactly one active at a time (adr/0027). Nothing in
  Settings → Assistant has a Save button: a connected key and an edited
  system prompt already persist themselves, with a reset button restoring
  the default prompt for anyone who'd rather not hand-edit it.
- The dense table chrome (smaller text, shorter header row) comes from adr/0021,
  written when tables still had an inline draft row; the row went with the editable
  finance tables (adr/0032), the chrome stayed.
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
