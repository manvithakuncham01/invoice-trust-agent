# Invoice Trust Agent — ITA-03 invoice drafts

Python/FastAPI backend and Vue/JavaScript app shell for pre-send invoice review.
**Implemented:** seller invoice form, editable preview, exact totals, local draft saving and seller-owned draft retrieval. Live agent, RAG, PayPal integration and real payments remain later stories.

## Requirements

- Python 3.11 or newer (tested with 3.12).
- Node.js 22.12+ (or compatible current LTS), npm and Git.
- macOS/Linux shell. Setup installs dependencies from package registries.

## 1. Set up locally

Extract the folder, open Terminal and enter it:

```bash
cd /path/to/invoice-trust-agent
bash scripts/setup-local.sh
```

This creates an ignored local `.env`, enables local demo mode, generates a private configuration secret, installs dependencies, runs Alembic migrations, seeds five test identities and installs frontend dependencies. No PayPal/LLM key is needed. Re-running preserves the existing `.env` and seed users. If your `.env` has demo mode disabled, seeding intentionally fails; explicitly enable it for the local demo.

The database is SQLite at `backend/invoice_trust.db`. No Docker or PostgreSQL installation is needed to begin. PostgreSQL/pgvector is planned for later stories; this is not a vector-store implementation.

## 2. Run the backend — Terminal 1

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Backend: http://127.0.0.1:8000 · Swagger: http://127.0.0.1:8000/docs · Health: `/health` · Readiness: `/ready`.

## 3. Run the frontend — Terminal 2

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173**. Vite proxies API requests to FastAPI. Use the role selector to open seller, reviewer or buyer shells. Role switching is restricted to local demo mode, not real authentication. Browser sessions use HttpOnly cookies. State-changing session requests use a CSRF token returned by the server, plus an origin allowlist.

## 4. Test and build

```bash
cd backend
.venv/bin/python -m pytest
```

```bash
cd frontend
npm run build
```

Read `docs/ITA-02-acceptance.md` for UI checks. The archive contains source and dependency lockfiles, not `.env`, virtual environments, installed packages, databases or tokens.

## Included endpoints

| Endpoint | Purpose |
|---|---|
| GET /health | Process liveness, no model calls |
| GET /ready | Database and migration readiness |
| GET /api/config | Public feature flags only |
| GET /api/demo/users | Local demo identities, disabled outside demo mode |
| POST /api/demo/session | Local demo session for an allowlisted seed identity |
| GET /api/auth/session | Current session and CSRF token |
| POST /api/auth/logout | Revoke session; CSRF token required |
| GET /api/seller/workspace | Seller-only empty workspace |
| GET /api/reviewer/workspace | Reviewer-only empty queue |
| GET /api/buyer/workspace | Demo buyer shell only |

Use header `X-CSRF-Token` for authenticated POSTs. The session credential itself is never returned as JSON or stored in browser localStorage. Production account signup/login is not implemented; keep this demo bound to localhost. Nonlocal settings reject demo mode and require secure-cookie configuration, but that does not make this a production-ready deployment.

## Configuration

Copy `.env.example` to `.env` only if not using the setup script. Backend loads root `.env`. Configure `DEMO_MODE=true` and `APP_ENV=local` to seed demo identities. PayPal sandbox values are placeholders for ITA-05; the starter never calls PayPal. Never put secrets into frontend files or commit `.env` / populated Postman exports.

`APP_SECRET` is reserved deployment configuration; current session credentials are independently generated random tokens hashed in the database, not signed using this secret. Only the deterministic fake agent provider is implemented. It returns example clarification data without calling an external LLM and cannot authorize sending.

## Project layout

```text
backend/app/          Python API, settings, models, fake agent adapter
backend/migrations/  Alembic schema migration
backend/tests/       Foundation tests
frontend/src/        Vue app shell and CSS
scripts/             Local setup helper
docs/                Acceptance checklist and next steps
```

## Get the code from GitHub

```bash
git clone https://github.com/manvithakuncham01/invoice-trust-agent.git
cd invoice-trust-agent
bash scripts/setup-local.sh
```

Then run the backend and frontend in separate terminals as described above.
See `docs/NEXT-STEPS.md` for ITA-03 onward.

## ITA-03 — invoice drafts

After selecting a seller demo identity, click **New invoice**. Add buyer email, one or more USD line items and an optional note. Review the live preview beside the form, edit any field, then save. The saved draft detail can be reopened from the seller workspace or its URL. A draft is local and unsent; saving does not invoke PayPal or the agent.

Existing checkouts: install updated backend requirements and run `alembic upgrade head` from `backend` before starting the server. Run `npm ci` from `frontend` for the new test dependency.

- `POST /api/invoices`: requires seller session, CSRF header and a unique `Idempotency-Key`. Returns 201 for a new draft, 200 for an identical retry, 409 if the key is reused with different details.
- `GET /api/invoices/{case_id}`: owner-only immutable version 1; other sellers receive 404.
- `GET /api/seller/workspace`: seller-owned invoice summaries.
- Monetary input uses decimal strings; backend totals use Decimal. UI preview uses integer cents with BigInt. Backend is authoritative.
- App limits: 100 items, quantity 1–1,000,000, positive unit price at most 999,999,999.99. These are prototype limits, not PayPal limits.
- Frontend component tests: `cd frontend && npm test`. Backend tests: `cd backend && python -m pytest`.

See `docs/ITA-03-acceptance.md` for manual QA.

### Updated screen layout

The UI now follows the supplied screen designs: compact top navigation, seller invoice table, side-by-side form and preview, and a saved invoice/status view. Demo account switching is inside the account menu. Restored seller sessions land directly on Invoices. Later workflow screens remain unimplemented.
