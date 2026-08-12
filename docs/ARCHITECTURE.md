# Architecture

## Runtime request flow

```text
Browser
  -> Apache / frontend static assets
  -> /api/*
  -> backend/index.php router
  -> backend/api/<domain>.php
  -> PostgreSQL
```

The Docker image copies `frontend/` to the Apache web root and `backend/` to `/api/`. `backend/index.php` is the API front controller and maps REST-style URLs to the existing domain endpoint files.

## Source of truth

### Data
PostgreSQL is the source of truth. Do not create browser-only parallel copies of business records beyond temporary UI state/cache.

### Authentication and authorization
`backend/config/helpers.php` and `backend/config/jwt.php` contain the shared authentication/authorization mechanics. New protected endpoints must use the existing auth helpers instead of implementing a separate login check.

### Schema
`backend/schema.sql` is the deploy-time schema source. The migration script applies it idempotently on container startup.

### UI
`frontend/` contains two UI styles that currently coexist:

1. The compiled React application for core role login/dashboard flows.
2. Focused HTML/CSS/JS manager pages for administration modules.

This is intentional compatibility debt. New work should reuse shared theme/sidebar/tooling and avoid introducing a third UI framework.

## Important shared files

- `frontend/belm-theme.css` — shared BELM visual theme.
- `frontend/admin-sidebar.js` / `.css` — admin navigation.
- `frontend/portal-tools.js` — shared portal-side helpers.
- `backend/config/helpers.php` — request, auth, permissions and shared helpers.
- `backend/config/database.php` — PostgreSQL connection and JWT secret loading.
- `backend/index.php` — API router and health endpoint.

## Engineering rules

- Preserve customer/role data boundaries.
- Every new database feature must have schema support and a clear owner/domain.
- Every new admin API must enforce authentication and page/role permission where appropriate.
- Never hardcode production secrets in JS, PHP, SQL documentation or Git.
- Prefer extending existing endpoints/managers over duplicating similar features.
- Keep deployment compatible with Docker + Render unless an explicit migration is planned.
