# Contributing

This is a personal portfolio piece, not a maintained library, so the most useful
contribution is a precise bug report rather than a large pull request.

## Run it

```sh
npm ci
npm run dev        # API on :4100, UI on :3110
```

See the README for the seeded sign-ins and the demo export.

## Before opening a pull request

```sh
python scripts/verify.py --e2e
```

That runs typecheck, lint, the vitest suites, the build, the demo export and
Playwright with axe. A pull request that leaves any step red will not be looked at
until it is green.

## Conventions

- Conventional commit subjects (`fix:`, `feat:`, `docs:`, `test:`, `chore:`).
- Tests come with the change that needs them.
- The policy suite and the webhook signature/replay suite are the correctness
  argument for this repo; changes there need a failing case first.

## Reporting a security issue

Use [SECURITY.md](SECURITY.md), not a public issue.
