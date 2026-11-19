# AGENTS.md — Client Portal

## What this repo is

The portal Fish runs his own client work through: a client signs in and sees only their own projects, scopes, approvals, delivery notes and invoices. Tenant isolation is enforced by Postgres row-level policies; invoices are paid through Stripe Checkout with signed, idempotent webhooks.

Type: web app (flagship). Portfolio piece of Fish (Vinícius Raposo), Full-Stack & AI Engineer. Planned 2026-11-17; update this line when the first version exists.

## Read first

- `README.md` — what the piece does and the 30-second / 2-minute / 30-minute path.
- `docs/ARCHITECTURE.md` — runtime modes, data flow, the decision boundary.
- `docs/ISSUE_REGISTER.md` — the issue-register rule and record format (summarised below).
- `docs/NO_INFRA.md`, `docs/DEMO_CONTRACT.md`, `docs/CASE_STUDY.md`, `docs/verification.md`.
- `docs/POLICIES.md` (row-level policies and role matrix), `docs/SPIKE.md` (embedded-Postgres spike result).

## Register every issue you find

This is a standing instruction for every agent and person working in this repo. The records are the data for Fix Bench and for this repo's case study.

1. **When you find an issue, register it before you fix it.** An issue is any real defect: a policy bypass, a role mischeck, a webhook replay or out-of-order event, an invoice-state error, a failed migration; also any failed build or CI run, failing or flaky test, tool or review finding, security gap, or doc that caused a wrong action. Issues you caused yourself count.
2. **Write one file:** `docs/issues/<YYYY-MM-DD>-<short-slug>.json`, in the format in `docs/ISSUE_REGISTER.md`. Start with `"repo": "client-portal"`, `"status": "open"`, the symptom, the exact commands that reproduce it, and `failing_revision` (commit the failing state first if it is not committed).
3. **Fix it with a regression test** that fails before the fix and passes after.
4. **Update the same file:** `fix_commit`, `regression_test`, `root_cause`, `"status": "fixed"`, and `bench_candidate` (`yes` only if a test decides pass or fail, the failing revision is committed, and the fix is one bounded change).
5. **Never delete a record** and never stage an issue to have one. A mistaken record is marked `not-a-bug` with the reason.
6. **No secrets, keys, personal data, client names or client code** in a record.
7. **Say it in your report:** every hand-back lists the issue ids you registered or updated, or says "no issues found".

The hub collects these files into its central register with `python scripts/collect_issues.py` (run from the hub root). This repo's file is the source; correct it here.

## Rules for this piece

- Milestone 0 comes first: the embedded-Postgres spike. If row-level policies are not enforced under `SET ROLE` on Windows without Docker, stop and report; do not fall back to SQLite or an application-level policy engine.
- Access rules live in SQL as `CREATE POLICY` statements. The application connects as a non-owner role. No scattered permission checks in application code.
- Stripe: the local signer and the optional real test-mode adapter share one verifier. Never real payments, never live keys, never a key in the repo.
- The static demo simulates the cross-tenant denial; the local run enforces it. Say so wherever the demo is described.

## Rules for every piece

- **Real, not staged.** No fake broken state, no synthetic rescue, no invented result. The case study names a real issue from `docs/issues/`.
- **No-infra local run.** Python 3.11+ and Node 24+ only: no Docker, WSL, database server, cloud account or key on the default path. Real adapters are optional and behind an explicit flag.
- **No claims.** Nothing in the repo says it has users, clients, payments or production use, and no metric appears without the dated run that produced it.
- **Run a real check before reporting done:** the repo's verification command, or the tests that exercise the change. A syntax check does not count. If a check could not run, say which and why.
- **Keep the docs current:** a change to behaviour updates the README, the affected `docs/` file and this file in the same change.
- **Owner-only actions:** pushing, opening the repo to the public, releases, Pages deploys, pins, spending money on a model or service, and any message or pull request outside this repo are Fish's. Commit locally; prepare the rest and name what is left for him.
- **English**, plain and factual.

## Commands

Nothing is built yet. When the launcher and the verification command exist, list them here exactly as the README gives them: install, run, verify.

## Commands

```sh
npm ci                          # install (root lockfile covers frontend + server + shared)
npm run dev                     # API (embedded Postgres, seeded) :4100 + UI :3110
npm run server                  # API only
python scripts/build_demo.py    # static demo -> site/
python scripts/verify.py --e2e  # typecheck, lint, vitest, build, demo export, playwright+axe
python shared/demo/check_live.py --dir site --base-path client-portal --deep-link /projects/3/
```
