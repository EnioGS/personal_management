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
│   │   │   ├── ui/            # shadcn/ui primitives (button, resizable, table, chart, ...)
│   │   │   ├── charts/        # thin Recharts wrappers (line/bar/pie) + the shared color palette
│   │   │   ├── data-table/    # editable table + CSV import/export, schema-driven
│   │   │   ├── chat/          # global chat panel (mounted at app root, not a section)
│   │   │   └── layout/        # activity-bar / secondary-bar / app-shell / chart-table-panel
│   │   ├── sections/          # feature registry — the extensibility mechanism
│   │   │   ├── types.ts
│   │   │   ├── index.ts       # aggregates all sections into one array
│   │   │   ├── vault/         # brand-mark section: Data (export/import/clear) + About
│   │   │   ├── notes/         # notes.section.ts + panel/store/notes-db + locales/
│   │   │   ├── finances/      # spending/income — charts + editable table + CSV, per option
│   │   │   ├── investments/   # variable/fixed income (transaction ledger) + contributions
│   │   │   └── settings/      # settings.section.ts + appearance/general/assistant panels + locales/
│   │   ├── store/
│   │   │   ├── ui-store.ts     # active section/item, secondary-bar mode (expanded/icons/hidden)
│   │   │   ├── theme-store.ts  # light/dark/system theme
│   │   │   ├── locale-store.ts # pt/en language
│   │   │   ├── chat-store.ts   # chat messages/attachments/status, drives the tool-calling loop
│   │   │   └── chat-panel-store.ts # chat panel open/closed + unread state
│   │   ├── locales/common/    # shared strings not owned by one section
│   │   ├── lib/
│   │   │   ├── local-store/              # generic Dexie-table + Zustand-store factories
│   │   │   ├── table-schema.ts           # column schema driving tables, CSV, and add-row forms
│   │   │   ├── csv.ts                    # CSV export/import + validation
│   │   │   ├── aggregations.ts           # chart data-shaping (buckets, running totals)
│   │   │   ├── current-value.ts          # investment position value from transaction history
│   │   │   ├── data-file.ts              # whole-app export/import (.pmdata), row counts
│   │   │   ├── file-io.ts                # save-file picker (Chromium) with a download fallback
│   │   │   ├── openrouter.ts             # OpenRouter chat-completions client (incl. tool-calling wire format)
│   │   │   ├── chat-attachments.ts       # validates/reads .txt/.md/.csv files attached to a chat message
│   │   │   ├── assistant-config.ts       # API key/model (assistant-models.json is the pickable model list)
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
  for editable data tables; `papaparse` for CSV import/export.
- **Assistant**: a global chat panel calling OpenRouter (openrouter.ai) directly
  from the browser with a user-supplied API key — no backend in the loop. Tool
  calling lets the model read attached files, and read/write/correct/flag rows
  in Finances/Investments tables; see `lib/tools/` and [Decisions](#decisions)
  below.
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
- Whole-app backup is one JSON file (`.pmdata`), not per-table CSV — it
  carries every table, including the ones with no CSV UI of their own.
- No backend by design — data stays local-first or in private storage the
  user controls, not a third-party-hosted service.
- Local storage is one generic factory (`lib/local-store/`), not per-section
  persistence code — every new section that needs stored data reuses it.
- The chat assistant is a global overlay (`components/chat/`), not a
  section — it stays available regardless of which section/item is active.
- Tools the assistant can call are a flat registry (`lib/tools/registry.ts`):
  adding one is a single new `ToolDefinition` file plus one array entry,
  nothing else changes. `write_to_table` discovers writable tables and their
  columns from a small registry (`lib/tools/writable-tables.ts`) instead of
  hardcoding them, so a new Finances/Investments table is picked up
  automatically.
- Nothing the assistant does to existing Finances/Investments rows is ever a
  hard delete or in-place overwrite — a `deleted` soft-flag column marks rows
  for removal (faded, not hidden, in the table UI) or the original of a
  correction. Only the user can permanently purge flagged rows, via a
  confirm-first button in each table.
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
