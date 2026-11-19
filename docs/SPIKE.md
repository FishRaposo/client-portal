# Milestone 0 — embedded Postgres spike

**Status: PASSED, 2026-11-19** — before any build, per the plan's hard stop rule.

## What the spike had to prove

1. Two roles, a table with `ENABLE ROW LEVEL SECURITY`, and `CREATE POLICY` keyed on a tenant setting.
2. Under `SET ROLE` as a non-owner role: same-tenant read succeeds, cross-tenant read returns no rows.
3. Writes outside the tenant fail under `WITH CHECK`.
4. Runs on Windows with Node 24+ and Python 3.11+ only — no Docker, no WSL, no database server.

## Result (PGlite 0.x, in-memory, Windows 11, Node 26)

| Check | Outcome |
|---|---|
| Same-tenant read under `SET ROLE app_user` | 1 row returned |
| Cross-tenant read | 0 rows (RLS silently filters) |
| Cross-tenant write | `new row violates row-level security policy` |
| `WITH CHECK` enforcement | enforced on INSERT |

Spike script was a throwaway Node file run with `node spike.mjs`; the shape
above is what `server/db/` now encodes as migrations + `db.tx()`.

## Decisions the spike settled

- **Runtime:** PGlite is a JS/WASM library, so the embedded Postgres hosts in a small **Node service** (`server/`), not Python. The frontend stays a pure static export — no API-route/export conflict.
- **Context passing:** PGlite is single-connection; every logical request runs in one serialized transaction with `SET LOCAL` GUCs (`app.tenant_id`, `app.user_id`, `app.actor`) so context cannot leak between queued requests.
- **Storage:** in-memory with deterministic reseed on boot — acceptable for a demo/dev piece; documented in ARCHITECTURE.
- **Note on GUCs:** `SET app.tenant_id` is session-level — any code that can issue SQL could change it. The trust boundary is therefore the API layer's serialized transaction wrapper, and policies additionally verify role from `memberships` rows rather than trusting a claimed role GUC.
