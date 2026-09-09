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
│   │   │   ├── charts/        # thin Recharts wrappers (line/bar/pie/diverging-bar/treemap) + the shared
│   │   │   │                  # color palette; echart.tsx is the ECharts canvas — see adr/0035
│   │   │   ├── data-table/    # table workspace (selector + "+ Nova tabela") with an inline draft row + CSV
│   │   │   ├── dashboard/     # filter bar, stat tile (two deltas + sparkline), dashboard card,
│   │   │   │                  # ranked and nested bar lists,
│   │   │   │                  # category pill (Finances Overview and beyond)
│   │   │   ├── markdown/      # the Markdown renderer, shared by the chat and the notes
│   │   │   ├── chat/          # global chat panel (mounted at app root, not a section);
│   │   │   │                  # attachments are text files for the tools, images for the model
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
│   │   │   ├── prompts/                  # assistant profiles: every prompt text, per-profile — adr/0037
│   │   │   ├── journal/                  # undo log under every write, per turn — adr/0038
│   │   │   ├── sql/                      # the vault, the statement gate, write-back — adr/0039
│   │   │   ├── local-store/              # generic Dexie-table + Zustand-store factories
│   │   │   ├── model/                    # accounts/cards, source files, confirmed rows, rules — see adr/0022,
│   │   │   │                             # adr/0032 and adr/0036 (the seven labels)
│   │   │   ├── dashboard/                # date-range presets, capital evolution and its KPI
│   │   │   │                             # comparisons, movements analytics — see adr/0033
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
  persistence code — every new section that needs stored data reuses it. A write says
  which tables it changed (`refreshLocalStores('sourceRows')`) so only those are re-read;
  refreshing everything after every write meant reading every row the app holds to show a
  change to one of them, which is what an import of forty files felt like.
- Work that touches many rows is done in one pass and written once: the duplicate scan
  reads the vault a single time for a whole upload rather than once per file over a set
  growing as it goes, and the sign rewrite and the standing rules `bulkPut` their changes
  instead of opening a transaction per row.
- The chat assistant is a global overlay (`components/chat/`), not a
  section — it stays available regardless of which section/item is active.
- A request carries only the tools it might need. Every schema is paid for on every round
  of every message, and 34 of them came to ~7,800 tokens before the user typed anything —
  so a request carries the core (reading files, SQL, the guide, the label vocabulary,
  ~1,000 tokens) plus whichever sets this conversation has opened through `open_toolset`,
  whose description is the menu. An opened set is remembered with the conversation, so it
  costs one round once rather than every message, and a conversation that never touches
  the data never pays for the tools that would change it. The system prompt is short for
  the same reason: what it used to repeat is in the guide, which is fetched on demand.
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
  class); **value** is the money that moved and **amount** is how many units of a thing
  changed hands, which are different numbers and never interchangeable. A row is not
  confirmed until its file says which column holds the ones its destination needs — every
  row a date, a money row its value, an investment row its amount — because a row that
  lands with those empty sits in its table and appears on no dashboard, which is the one
  failure nobody notices. Everything unassigned is condensed into one observations column
  when the row is confirmed, so nothing is dropped and no column has to be invented. **Where a row
  came from lives in there too**, and nowhere else — the confirmed tables have no
  filename column repeating it. Duplicate checking, the balances-by-source card and the
  SQL views all read it back out of the observations, and the exported `.db` exposes it
  as a derived column, so a query still groups on `source_filename` without the fact
  being stored twice.
- Two of the six labels come from the user's own setup and are read first: **account**
  says which account a row moved through and **card** which card it was billed to. Both
  are required and validated against Settings → General, so a row cannot be confirmed
  until it says where the money sat. They are stored by name, so a table and a query read
  as words rather than as ids; renaming an account renames the vocabulary and existing
  rows keep the name they were labelled with, which is visible rather than silent. The
  assistant can register a missing account or card itself (`add_account`, `add_card`) —
  and a card is always registered against an account, for it as much as for the user.
- Four labels, not seven: **sections** and **screens** say where a row belongs and
  are validated against the app's own navigation as they are typed — a screen only
  counts inside a section the row names, and a value nothing is called stays in the
  cell in red rather than being silently dropped — while **category** and
  **subcategory** are free text, one value each, **starting empty** and editable on a
  confirmed row, since a row can be placed before it is understood. They used to start at
  `outros`, which read on every screen as a decision somebody had made — the app calling
  a row "other" before anyone had looked at it. An empty cell asks to be looked at;
  charts show a dash for one. Direction is not
  a label at all: the sign of the amount says it, negative left and positive arrived.
- A confirmed row's section and screen are not a label beside it — they *are* which
  table it is in, and both are shown and editable there: change one and the row moves,
  keeping the id every copy of it shares. `place_confirmed_rows` does the same for the
  assistant, with a `copy` mode for a row that turns out to belong on a second screen.
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
- Duplicate flagging is narrow on purpose. Two identical rows *inside one file* are two
  real transactions, so a row is only ever flagged against a row from a **different**
  file — and only when everything it says matches, the date and the money and every other
  column the file wrote, since two payments of the same size on the same day are not the
  same payment. A file is also flagged or when a newly uploaded file's name is very close to one
  already imported (measured against the shorter name). A flag is advisory and
  removes nothing.
- **Marking for elimination** is a table-wide mode rather than a per-row control:
  one checkbox above the table, then clicking a row toggles its mark, and clicking
  anything that is not a row turns the mode off. A marked row is invisible to every
  dashboard and still visible in its table — the single thing this app hides, and
  what makes marking safe to hand out.
- Correcting confirmed rows in bulk keeps the same discipline rather than escaping it:
  `revise_confirmed_rows` adds the corrected row and marks the old one for every row a
  query picks out, so a change of account across three hundred rows is one call and both
  versions stay readable, sharing their `row_id`. Only the fields named change, and
  removing a card is a word of its own (`clearCard`) rather than an empty name — an empty
  string is what a caller filling in every field writes, and it must not be able to strip
  a card off rows that have one.
- A source file's own text is not kept once its rows are parsed out of it. It was stored
  beside them and never read again, so every reload of the file list decoded every byte
  of every file imported — which is what a vault with a few dozen files felt like.
- The user and the assistant have the same powers over the data, with exactly one
  exception: both mark and unmark, and **only the user deletes**. Correcting a
  confirmed row is never an in-place edit — the corrected row is added with the
  same `row_id` and the old one is marked, which is what keeps the history
  readable.
- What a rule cannot express becomes a **classification note**: free text, written by the
  user or the assistant, saying what a rule has no way to say — that an unrecognisable
  merchant sells food, that one file's rows for a month were a rebalance, how a borderline
  case should be treated. A note labels nothing by itself; it is appended to the ingestion
  guide, which the assistant reads before touching an import, so an explanation given once
  keeps working. Notes belong to a stage the way rules do, and sit below them in the panel.
  Either of you can redraft one — double-click it, or `edit_classification_note` — and a
  rewritten note keeps its place in the list, recording who went over it, because prose is
  got right by redrafting and a correction is not a new discovery. Every note carries a
  **scope** — account, card, section, screen, class, category, subcategory, and which lines
  — each field a few words or the word `global`; a blank is refused, because a blank says
  nobody has decided rather than that it holds everywhere.
- The assistant keeps its own **memory** below the notes: the same shape, the same scope,
  its own table and its own tools, read whole rather than split by stage, and *not*
  appended to the guide — it reads it when it
  needs it. It writes there tersely what it could not label and what was missing, what it
  could label once the user explained, and anything said to it that will matter again, so
  the next conversation does not ask the same questions. **One entry per scope**, enforced:
  a scope or a title an entry already holds is refused, naming the entry to rewrite. What
  organises the memory is what a fact is about, not what kind of fact it is — so a scope
  must name a section, screen, account and card that exist, may not be `global` in every
  field at once, and an entry is capped at 1200 characters. Each of those was something a
  written instruction asked for and did not get. The instruction to keep the record at all
  lives in the system prompt rather than the guide, because a model that does not know it
  keeps one has no reason to read the document that would have said so. Titles name their
  subject — "PagHiper — payment intermediary, buyer unknown", not "Reference facts" — since
  a list of entries is read by its titles. Reading the memory back also reports whatever in
  it is disordered — an entry holding several subjects, titled after none, or scoped to
  everything — so the assistant puts it right unasked rather than adding to the mess.
- What was worked out once becomes a **standing labelling rule**, and rules belong
  to one of two stages that never cross: a *source* rule runs as a file arrives, so
  an import can land already labelled, and a *confirmed* rule fills in meaning on
  rows already in a table. A rule matches by substring, `equals`, `startsWith` or
  regex (validated when it is saved, not when it runs), stacks conditions that must
  all hold, fills only labels a row does not already have, and carries a rationale
  saying why those labels are right for everything matching it. The panel shows the
  rules of a stage only while a table of that stage is open, and the user writes one
  there through the same validation the assistant's tool applies. Either of you can
  rewrite a rule as well — double-click it, or `edit_label_rule` — and it keeps its place
  and its authorship, recording who went over it; what it already labelled stays
  labelled, because a rule fills blanks and its past is in the rows.
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
- **Chat history saves itself.** Every conversation is written to the browser as it
  happens — once the message is sent, again when the reply lands — comes back on reload
  (the one last written to), and travels in the export. A bar above the messages starts a
  new conversation and opens any of the old ones; the list is read from the database when
  it is opened rather than kept in step with every keystroke, and a row's trash appears
  under the pointer so a list of names does not read as a list of delete buttons. A
  conversation names itself from its opening message through a one-shot request the
  assistant never carries in context, and renames on request (`set_conversation_title`).
- The chat reports what it costs: tokens for the last message and the requests it took,
  the conversation's total, and how full the model's context window is when that window
  can be looked up. That total is **saved with the conversation**, so reopening one
  continues its own count rather than claiming it cost nothing, and the coins icon in the
  chat's bar lists every conversation's tokens and cost with two sums under it — what the
  conversations still here have cost, and what has been spent since the beginning, which
  keeps counting for conversations that were deleted, because deleting one does not
  unspend it. Both travel in the export.
- Chart colors open on the brand's own hue, then the dataviz skill's
  remaining validated hues (adr/0024) — never a generated or cycled color
  past that fixed set, per the skill's accessibility rule. A color follows
  its entity (a category, an account) via a stable hash, not the entity's
  position in whatever is currently on screen, so filtering never repaints
  a survivor.
- Finances' Movements dashboard reads top to bottom in order of what matters (adr/0025):
  four tiles above the fold — what is held, what the month netted, what it spent, what is
  invested — then the shape of it over time, then the detail for whoever scrolls: in and
  out by month, what was kept of what arrived, how long the capital covers the spending,
  balances by account, where money came from, what each card was billed, an average month,
  and the largest movements. Capital is everything of value held: every movement and every
  investment, accumulated from the first month there is. **Spending is deliberately not
  part of it** — a spending row is a copy of the movement that paid for it, and counting
  both would spend the money twice. Each tile's own line draws the last four months; the
  chart below is bounded only by the period on the bar.
- Orçamento, Recorrentes, Posições, Proventos and Alocação (adr/0026) all read
  from data the model already had — a budget compares category spend already
  computed elsewhere, positions/allocation share one weighted-average-price
  calculation (`lib/current-value.ts`), recurring detection is pattern
  matching over existing entries, not a declared schedule.
- A request adapts to what the model will accept rather than to a table of which model
  wants what, since that table is wrong within a month: the length limit is asked for
  under its current name and retried under the old one, and a model that refuses function
  tools alongside its reasoning is sent to OpenAI's Responses API instead — where it keeps
  both — rather than having its thinking switched off to keep its tools.
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
