# BELM Operations Portal

Production-oriented operations portal for **BELM General Tech**. The system brings customer registration, machinery records, service operations, technician work, spare-parts inventory, finance, reporting, user/role management, and notifications into one portal.

## Core users

- **Super Admin / Staff** — approvals, customers, machines, service, inventory, billing, reports, settings, users and roles.
- **Technician** — assigned customer/machines, service tasks, checklists, service evidence and inventory requests.
- **Customer / Customer Viewer** — own machines, service requests, expenses, petty cash and account access according to role.

## Technology

- PHP 8.3 + Apache REST API
- PostgreSQL
- React production build plus focused static manager pages
- Docker deployment
- Render Blueprint (`render.yaml`)

## Production structure

```text
backend/                 PHP API, schema and database scripts
frontend/                Deployed web UI
public_website_patch/    Optional patch for the public BELM website
Dockerfile               Production container
render.yaml              Render web service + PostgreSQL blueprint
docker/                   Apache/PHP runtime configuration
docs/                     Architecture, deployment and operations docs
scripts/                  Quality-assurance helper scripts
tests/                    Existing smoke tests
```

## Start here

1. Read `docs/FEATURES.md` to understand the functional scope.
2. Read `docs/ARCHITECTURE.md` before modifying code.
3. Copy `.env.example` values into your local/deployment environment. Never commit secrets.
4. Deploy using `docs/DEPLOYMENT.md`.
5. Run `./scripts/qa.sh` before every release.

## Important production actions

The schema contains a bootstrap Administrator and a bootstrap delete PIN for first setup. **Change both immediately after the first successful login**. Do not share production credentials in documentation, screenshots, chat groups or source control.

Health endpoint:

```text
GET /api/health
```

Expected high-level state after deployment:

```json
{
  "ok": true,
  "database": "connected",
  "schemaReady": true,
  "adminReady": true
}
```

## Release

This package is the professionalized continuation of the supplied V136 notifications build. Existing runtime routes and user workflows are intentionally preserved while documentation, QA and consistency fixes are added.
