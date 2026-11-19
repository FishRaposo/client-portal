# Verification — Client Portal

All commands from the repo root, Windows 11 + Node 26 / Python 3.15. Dated
2026-11-19.

## Gate

| Check | Command | Result |
|---|---|---|
| Milestone 0 spike | `node spike.mjs` (throwaway) | PASS — RLS enforced under `SET ROLE`, see `docs/SPIKE.md` |
| Typecheck | `npm run typecheck` | PASS |
| Lint | `npm run lint` | PASS — 0 errors; warnings are vendored files only |
| Unit/policy/webhook | `npm run unit` | PASS — vitest: policy matrix, tenant isolation, signature valid/invalid/tampered/stale, pay-once, replay, no-backward, auth, denied→audit |
| Build | `npm run build` | PASS — static export, 11 pages |
| Demo export | `python scripts/build_demo.py` | PASS — `site/` at `/client-portal` |
| e2e + axe | `npx playwright test` | PASS — journey (persona→projects→denied link→audit), deep link, axe ×4, zero off-origin, clean console |
| Demo contract | `python shared/demo/check_live.py --dir site --base-path client-portal --deep-link /projects/3/` | PASS 4/4 — sample label, deep link boots, zero off-origin, clean console |
| Full verify | `python scripts/verify.py --e2e` | **PASS 7/7** |

## Honest notes

- The demo's denial is simulated (no DB in a static export); the local run's
  denial is real — `server/test/policies.test.ts` asserts it against the same
  policies the app boots.
- PGlite state is in-memory: restart re-seeds deterministically.
- `npm run lint` reports warnings on vendored `shared/` + `postcss.config.mjs`
  only — zero errors.
- Unverified items stay explicit: GitHub remote, Pages deploy, About/topics
  are owner actions, pending.
