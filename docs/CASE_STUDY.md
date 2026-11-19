# Case study — Client Portal

**Offer:** `L5`/`G5` full-stack web app and `L6`/`G6` (Supabase Auth, RLS, Stripe webhooks)
**Live demo:** <https://fishraposo.github.io/client-portal/> *(publish pending — owner action)*
**Source:** <https://github.com/FishRaposo/client-portal> *(remote pending — owner action)*

## The problem

A freelancer needs a workspace where each client sees only their own
projects, scopes, notes and invoices — and where "only their own" is not a
convention but a database-enforced fact.

## What was built

A Next.js UI over a small Node service hosting an embedded Postgres
(PGlite). Every request runs inside a serialized transaction as a non-owner
role with `SET LOCAL` tenant context; access is decided entirely by
`CREATE POLICY` statements that derive roles from `memberships` rows.
Invoices are paid through a local Stripe-Checkout-style flow whose webhooks
use Stripe's published signature scheme, idempotent event recording, and a
definer-guarded `open→paid` transition.

## A real bug found while building it

**Issue:** `2026-11-19-webhook-double-read-hang`
**Found by:** the first run of the webhook test suite (`server/test/webhooks.test.ts`)

**Symptom.** Every `POST /api/webhooks/stripe` hung — all four signature
tests timed out at 5 s while every policy test passed.

**Root cause.** The request dispatcher already consumed the body
(`readRaw(req)`) and passed it to handlers as the `raw` argument. The
webhook handler then called `readRaw(req)` a second time. On a consumed
stream `data`/`end` never fire, so the second promise never resolved — a
hang, not an error, and only reachable through the signature path that needs
the raw bytes.

**Failing revision:** pre-commit — the defect was caught by the first real
test run before the repo's initial commit; the record preserves it instead
of staging a broken commit. `fix_commit` is the initial build commit;
`regression_test` is the webhook suite that timed out on the defect and now
passes in milliseconds.

**Fix.** The handler uses the `raw` argument instead of re-reading the
stream. Same fix prevents the whole class: the dispatcher owns stream
consumption, handlers own parsing.

**Why it matters.** Webhook signature verification needs the exact bytes — a
JSON round-trip would break HMAC. The bug lived precisely where the
correctness-sensitive path was, and the test caught it before any human did.

## What it does not prove

Live Supabase/Stripe, real card payments, production scale, or client
usage. The seeded people and tenants are synthetic; the Pages demo
simulates the denial that the local run enforces.
