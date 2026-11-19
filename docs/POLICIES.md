# Row-level policies

Every tenant table has `ENABLE ROW LEVEL SECURITY` and policies in
`server/db/migrations.ts` (004). The app connects as `app_user` (NOLOGIN,
non-owner) and each request transaction sets `app.tenant_id` + `app.user_id`
(+ `app.actor`) via `SET LOCAL`.

## Role model — read from data, not asserted

There is no `app.role` GUC. Policies call:

- `portal.has_any_role()` — a memberships row exists for `(app_tenant, app_uid)`
- `portal.has_role(r)` — that row's `role = r`

Both are `SECURITY DEFINER` (they must read `memberships` without tripping
its own RLS). Consequence: role changes take effect inside the same request,
revocation denies immediately, and no caller-supplied value can escalate.

## Matrix

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| tenants | member (own tenant row) | — | — | — |
| users | self OR tenant member | — | — | — |
| memberships | tenant member | owner | owner | owner |
| projects | tenant member | owner, member | owner, member | owner |
| scopes | tenant member | owner, member | owner, member | — |
| approval_requests | tenant member | owner, member | **owner only** (decide) | — |
| delivery_notes | tenant member | owner, member | — | — |
| invoices | tenant member | owner | owner | owner |
| webhook_events | — | actor='webhook' | actor='webhook' | — |
| audit_log | **owner only** | any tenant member (append-only) | — | — |

No membership → `has_any_role()` false → all tenant reads empty, all writes
denied. That is the "no membership sees nothing" rule, enforced in SQL.

## Security-definer seams (narrow, audited)

| Function | Purpose | Guard |
|---|---|---|
| `verify_login(email)` | pre-session credential lookup | returns only id/hash/name |
| `user_tenants(uid)` | sign-in tenant resolution | definer read of memberships |
| `invoice_for_session(cs)` | webhook → owning invoice | exposes id+tenant_id only |
| `mark_invoice_paid(id)` | invoice state transition | `app_actor()='webhook'`; `open→paid` only |
| `has_role` / `has_any_role` | role proof inside policies | read-only membership check |

## Denial semantics

- `INSERT` violating `WITH CHECK` raises `new row violates row-level security`.
- `UPDATE`/`DELETE`/`SELECT` denials **silently return 0 rows** — handlers
  detect via `RETURNING` count and emit 404 + audit `deny`.
- Audit inserts run in the actor's own tenant context; a zero-membership
  actor cannot audit — documented in `server/http.ts`.

## Regression tests

`server/test/policies.test.ts` runs every row of this matrix against the real
policies (same migrations the app boots): tenant isolation, cross-tenant
read/write/update, viewer/member/owner boundaries, no-membership, audit
append-vs-read.
