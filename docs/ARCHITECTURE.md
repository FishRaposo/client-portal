# Architecture

## Two runtimes, one process each

```
browser ──► Next.js static UI (frontend/)          ──► served statically or via `next dev`
   │                │ lib/api.ts — one adapter switch
   │                ├─ local: HttpAdapter → http://localhost:4100/api/*
   │                └─ demo:  MockAdapter → frontend/lib/demo-data.ts (zero network)
   ▼
server/ — node:http REST on :4100
   ├─ auth.ts      scrypt hashes + HMAC session cookie
   ├─ stripe.ts    Stripe-scheme signer + verifier (shared)
   ├─ http.ts      routes; resolves session → db.tx(actor, fn)
   └─ db/client.ts PGlite singleton; serialized tx with SET LOCAL context
        └─ db/migrations.ts  schema + roles + CREATE POLICY
        └─ db/seed.ts        two synthetic tenants
```

## The decision boundary

Every request handler resolves the session, then calls
`db.tx({tenantId, userId, actor}, fn)`. `tx` opens a transaction as the
non-owner `app_user` role, sets `app.tenant_id`/`app.user_id`/`app.actor` with
`SET LOCAL`, and serializes all transactions through a promise mutex (PGlite
is single-connection). Inside, handlers write plain SQL — **no permission
checks**. Access is decided entirely by `CREATE POLICY` statements in
`server/db/migrations.ts`.

Session GUCs carry identity only. A caller cannot claim a role: every policy
derives the role from the `memberships` row via `portal.has_role()` /
`portal.has_any_role()` (SECURITY DEFINER, so the check itself bypasses RLS
safely). A forged or stale session cannot escalate — `has_any_role()` goes
false the moment the membership row is gone.

## RLS semantics that shaped the API

- `SELECT`/`UPDATE`/`DELETE` denials are **silent row filters**, not errors:
  a member's UPDATE on `approval_requests` affects 0 rows. Handlers therefore
  check affected-row counts (`RETURNING`) and translate empty results into
  404 + a `deny` audit row. Only `INSERT`/`WITH CHECK` violations raise.
- Denied attempts are logged from a second transaction in the actor's own
  tenant (append-only `audit_log`); a user with no membership anywhere cannot
  append — documented limit in `http.ts`.

## Webhook path

`POST /api/webhooks/stripe` verifies `Stripe-Signature` (`t`,`v1`, HMAC-SHA256
over `t.payload`, 5-minute tolerance) before anything else. Verified events
insert into `webhook_events` (idempotency anchor, `ON CONFLICT DO NOTHING` →
`already_processed`). The webhook actor cannot read `invoices` — a
SECURITY DEFINER lookup (`invoice_for_session`) resolves the owning
invoice+tenant, then `mark_invoice_paid` (also definer) enforces
webhook-only caller and the guarded `open→paid` transition. A second event
for the same session cannot reopen a paid invoice.

`POST /api/checkout/:session/complete` is the local stand-in for Stripe's
hosted page: it signs a `checkout.session.completed` event and POSTs it to
this server's real webhook route — the same verification and idempotency path
a live delivery takes. Local only; never a card.

## Demo mode

`NEXT_PUBLIC_DEMO_MODE=true` at build time swaps the adapter to
`frontend/lib/mock-routes.ts` — deterministic routes mirroring the real API's
shapes, including a simulated cross-tenant denial and an audit deny row. The
sample-data label is rendered in the header; the README and DEMO_CONTRACT
state that the demo simulates what the local run enforces.

## Boundaries

- **In-memory PGlite:** boot re-seeds deterministically; restart resets
  state. Chosen deliberately — every checkout of the repo starts identical.
- **Session cookie:** HMAC-signed `{uid, tid, role, exp}`, HttpOnly. `role`
  is display-only; authorization comes from `memberships` via policy.
- **Secrets:** `PORTAL_SESSION_SECRET` / `PORTAL_WEBHOOK_SECRET` have
  dev-only defaults; env overrides exist. No real keys anywhere.
- **CORS:** dev only, `PORTAL_CORS_ORIGIN` (default `http://localhost:3110`),
  credentials included.
