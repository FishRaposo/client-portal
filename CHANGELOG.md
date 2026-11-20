# Changelog

## [0.1.0] — 2026-11-19

First working version: a multi-tenant client portal whose isolation is enforced by
Postgres row-level security inside an embedded Postgres (PGlite), with signed,
idempotent Stripe-style webhooks and a static demo that labels its simulated denial.

### Added

- `CREATE POLICY` tenant isolation with a serialized non-owner transaction per
  request (`server/db/`), proven by the policy matrix tests.
- Role matrix for owner / member / viewer, with denials recorded in the audit log.
- Stripe-scheme signature verification, idempotent event recording and a
  definer-guarded `open → paid` transition.
- Five screens over the shared UI kit, plus a static export for GitHub Pages.
- `docs/SPIKE.md`, `docs/POLICIES.md`, `docs/CASE_STUDY.md` and `docs/verification.md`.

### Fixed

- Webhook route re-read an already-consumed request stream and hung
  ([`docs/issues/2026-11-19-webhook-double-read-hang`](docs/issues/2026-11-19-webhook-double-read-hang.json)).
- Demo e2e shared port 3111 with the other web pieces and collided
  ([`docs/issues/2026-11-19-demo-serve-port-collision`](docs/issues/2026-11-19-demo-serve-port-collision.json)).
