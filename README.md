# Centro Moxa · WhatsApp booking demo

Conversational booking assistant for Centro Moxa (traditional Chinese medicine centre).
Clients book, check or cancel appointments in natural language (text or voice notes);
bookings show up in the owner's calendar view.

| Folder | What it is | Runs in a cloud sandbox? |
|---|---|---|
| `web/` | Next.js playground deployed on Vercel (Neon Postgres + OpenAI). Web chat + calendar. | Yes |
| `bot/` | Real WhatsApp bot: Evolution API (Docker) + Express + OpenAI + SQLite + 24h reminders. | Only the `/chat` and `/calendar` views; WhatsApp needs a phone paired by QR |

Both share the same conversation logic (system prompt + tools `list_services`,
`get_available_slots`, `book_appointment`, `get_my_appointments`, `cancel_appointment`).

## Secrets

No secrets are committed. Provide them as environment variables (Claude Code environment
settings, Vercel, or a local `.env.local` — gitignored).

| Variable | `web/` | `bot/` |
|---|---|---|
| `OPENAI_API_KEY` | required | required |
| `OPENAI_MODEL` | optional (default `gpt-4o`) | optional (default `gpt-4o-mini`) |
| `DATABASE_URL` | required (Neon) | — |
| `TZ` | optional (`Europe/Madrid`) | optional (`Europe/Madrid`) |
| `EVOLUTION_API_KEY` | — | required at boot (any value without WhatsApp; `moxa-demo-key-change-me` matches `docker-compose.yml`) |
| `EVOLUTION_API_URL` / `EVOLUTION_INSTANCE` | — | optional, only for WhatsApp |
| `ALLOWED_PHONES` | — | comma-separated whitelist; empty = answers everyone |
| `PORT` / `PUBLIC_URL` | — | optional |

## Run `web/`

```bash
cd moxa/web
pnpm install
# env: either export OPENAI_API_KEY + DATABASE_URL, or pull from Vercel:
#   vercel env pull .env.local --yes   (project already linked via .vercel/project.json)
pnpm dev            # http://localhost:3000 → /chat, /calendar
pnpm typecheck
```

Schema and service catalog are created on first request (`ensureSchema` / `seedServices`,
idempotent). No migrations to run.

## Run `bot/` without WhatsApp

```bash
cd moxa/bot
pnpm install
export OPENAI_API_KEY=...
export EVOLUTION_API_KEY=moxa-demo-key-change-me   # validated at boot, unused without WhatsApp
pnpm dev            # http://localhost:3000/chat (web chat), /calendar (owner view)
pnpm typecheck
```

SQLite file `data/moxa.db` is created on start and the 5 services are seeded automatically.

## Run `bot/` with WhatsApp (local Mac only)

Requires Docker and a phone to pair. Full walkthrough in [`bot/README.md`](bot/README.md):
`docker compose up -d` → create instance `moxa` in Evolution Manager (`localhost:8080/manager`)
→ scan QR → webhook `http://host.docker.internal:3000/webhook/evolution` (event `MESSAGES_UPSERT`)
→ `pnpm dev`.
