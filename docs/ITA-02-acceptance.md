# ITA-02 acceptance checklist

This is the foundation only. Both developers contribute feature implementations in later stories.

- Run `bash scripts/setup-local.sh` from a clean download; no real credentials needed.
- Run backend pytest: health/readiness, missing migrations, idempotent seeds, seller/reviewer/buyer role boundaries, disabled demo login, strict request fields, opaque cookie/hash, expiry/revocation, CSRF/origin checks, fake agent outputs.
- Start backend/frontend. Open `http://localhost:5173`.
- Choose seller-a: seller workspace is empty; reviewer route shows Access denied.
- Choose reviewer-one: reviewer queue shell appears; seller API access is forbidden.
- Choose buyer-one: explicitly labeled demo buyer shell, not email verification.
- Refresh: current session persists. Sign out: protected routes require a session.
- Unknown page: not-found UI. Stop backend and refresh: safe retryable connection error.
- Set DEMO_MODE=false, restart backend: role selector disappears; POST demo session returns 403.
- Scan built frontend and git-tracked files: no PayPal secrets, LLM keys or session tokens.

The deterministic FakeProvider is a test interface only. ITA-03 adds local invoice saving; ITA-04 adds a real seller assistant; ITA-05 adds PayPal draft calls. No invoice sending, RAG, production sign-in or buyer verification is implemented here.
