# Security policy

This is a portfolio project: a multi-tenant portal whose isolation is enforced by
Postgres row-level security. The trust boundaries, the policy model and the
webhook verification path are described in [docs/POLICIES.md](docs/POLICIES.md)
and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

It is not a hosted service and has no production deployment, no real users and no
real payments. The seeded tenants are synthetic.

## Reporting a vulnerability

Open a [security advisory](https://github.com/FishRaposo/client-portal/security/advisories/new)
or email fishraposo@gmail.com with the subject `[client-portal security]`. Please
do not open a public issue for a security report.

## Supported versions

Security fixes target `main` and the latest tagged release.
