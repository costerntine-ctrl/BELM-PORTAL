# Phase 43 — Maintenance timeline: service requests, parts and notes

- Extended customer-authenticated, read-only machine timeline with service requests by Machine ID and Customer ID.
- Service request parts are **requested parts**, never labeled as installed or used without a confirmed consumption record.
- Service notes are shown as notes, **not verified repair completion**.
- Queries for parts/notes additionally join and filter on customer and machine to avoid cross-tenant leaks.
- Read-only; no production deployment or migration.
- Browser/PostgreSQL integration and verification of true parts-usage records remain outstanding.
