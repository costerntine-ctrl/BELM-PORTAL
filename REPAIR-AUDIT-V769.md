# BELM Portal Repair Audit V769 — Claude Update Merge + Full Sync

Date: 2026-09-16

## Scope
Repaired the supplied `BELM-PORTAL-main_FIXED CLAUDE UPDATE.zip` and merged it with the approved BELM V768 canonical architecture without deleting business history.

## Main repairs
- Restored the no-duplicate role architecture: one BELM Home Dashboard and one canonical dashboard per role.
- `/belm-workshop/`, `/belm-workshop/control-center/`, and `/workshop-management-home/` are compatibility redirects, not competing dashboards.
- Removed unused legacy Workshop/Customer Workshop runtime files that could be resurrected by cache or stale references.
- Restored V765 Technician Customer Code + assigned-customer verification.
- Restored additive `customers.customer_code` schema, generator, registration/approval creation, readiness requirement, and technician-safe response filtering.
- Restored canonical hyphenated API router mappings for Service Requests, Spare Parts, Spare Recommendations, Proforma Invoices, and Role Communications.
- Restored Role Communication Inbox and role-based report entry points.
- Preserved Customer exclusions for BELM Bank Controller and BELM Spare Sales/private inventory.
- Preserved RED > YELLOW > GREEN alert precedence.
- Normalized Bank Controller wording; removed stale Bank Manager user-facing references.

## New sync repair found during V769 regression
Workshop Manager live dashboard referenced API paths that did not resolve through the PHP front controller.

Added:
- `/api/workshop-dashboard-metrics` -> `backend/api/workshop_dashboard_metrics.php`
- `/api/belm-workshop-home` -> `backend/api/belm_workshop_home.php`
- Front-controller compatibility routes for root-backed live endpoints:
  - inspection-repair-dashboard
  - job-card-detail
  - job-process-auto
  - workshop-communication
  - workshop-weekly-status

The Workshop Manager dashboard now receives live Job Card counts, overdue/waiting/testing/completed status, service-due attention count, recent Job Cards, technician workload, and machine feed through valid API routes.

## Security / role boundaries
- BELM Technician Customer Machines requires Customer Code plus authenticated assignment match.
- A valid code for another assigned site/customer does not grant access.
- Customer-managed technicians remain tenant scoped.
- Customer users cannot access BELM Bank Controller or BELM private Spare Sales/Inventory.
- Workshop Manager remains a role inside BELM Operations Portal, not a separate portal.

## Validation
- PHP syntax: 172 files PASS.
- Frontend JavaScript syntax: 133 files PASS.
- Inline JavaScript: 111 scripts PASS.
- Frontend top-level API resources: 50; unresolved: 0.
- Legacy `/workshop-management-home/` runtime references: 0.
- Legacy `BELM Workshop Manager Portal` title references: 0.
- Legacy root/control-center dashboard links: 0.
- User-facing `Bank Manager` stale labels: 0.
- Merge/conflict markers: 0.
- Critical Customer Code / Role Communication / Role Reports assertions: PASS.

## Data safety
No DROP/TRUNCATE/business-history cleanup was introduced. Customer, machine, Job Card, report, finance, stock, procurement and communication history are preserved. Schema changes remain additive.

## Deployment
Deploy the whole V769 package so frontend, router, API endpoints and schema/readiness checks move together. After Render deployment, run the normal safe migration/start process and verify `/api/readiness` before operational use. Hard-refresh the browser after deployment to discard any old cached Workshop Portal HTML/JS.
