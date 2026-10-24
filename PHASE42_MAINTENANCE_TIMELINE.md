# Phase 42 — Customer Machine Maintenance Timeline

- Added read-only `GET /api/customer-portal/machines/{machineId}/maintenance-history`.
- Machine ownership and non-deleted status checked against authenticated customer before querying history.
- Merges latest checkups and digital Job Cards by Machine ID; response capped at 50 records.
- Customer machine cards with a stable machine ID display a manual Load Maintenance Timeline action.
- Other roles continue using their existing report actions; no elevated cross-customer endpoint added.
- Browser and live PostgreSQL integration tests are still outstanding.
