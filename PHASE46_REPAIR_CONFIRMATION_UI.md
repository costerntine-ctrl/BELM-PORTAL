# Phase 46 — Workshop Repair Confirmation UI

- New responsive `/repair-confirmations/` page linked from Customer Workshop Portal Quick Access.
- Selects authenticated customer's machine from `/dashboard`; Job Cards and actual Customer Store ISSUE records from machine `maintenance-history` (never free-text IDs).
- Explicit confirmation form sends `jobCardId`, `storeIssueId`, `quantityInstalled`, `laborHours`, `hourlyRate`, `note` to the customer-scoped Phase 45 API.
- Shows confirmed parts/labor cost summary separately and describes accounting limitations.
- Backend authorization, machine ownership and cumulative quantity checks remain the source of truth.
- Timeline returns 50 latest items only; long machine histories may need pagination for older items.
- Schema `customer_repair_confirmations` must be applied to staging before runtime testing. No browser or PostgreSQL tests conducted.
