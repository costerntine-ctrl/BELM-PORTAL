# BELM Portal Repair Audit V763

**Release:** `navigation-role-communication-reports-v763`  
**Review scope:** Back navigation, communication between roles, role-based report arrangement, related routing regressions, and customer/BELM access separation.

## 1. Back Navigation Review

V763 introduces a shared context-aware navigation layer: `frontend/navigation-context-v763.js`.

### Result
- All **157/157 actual frontend document pages** load the V763 navigation context.
- Back buttons now resolve to the correct role/module parent instead of relying blindly on browser history.
- `returnTo` / `back` query context is honored first. This keeps report/detail pages returning to the Role Reports or Role Communication page that opened them.
- `module=` context is respected for BELM Workshop, Finance, Procurement, Store, Settings, Reports, Bank, Registration and related submodules.
- Technician report Back handling distinguishes:
  - BELM Technician
  - Customer Technician / Operator context
  - System Coordinator checked-report context
- Dashboard roots keep their designed Home/Role navigation unless an explicit `returnTo` was supplied.
- Browser-history Back that belongs to an internal dialog/modal is intentionally preserved (for example Customers Manager modal history) because it is not page navigation.

## 2. Role Communication

### New shared Role Communication Inbox
- UI: `frontend/role-communications/`
- API: `backend/api/role_communications.php`
- Tables:
  - `role_communications`
  - `role_communication_reads`
- Shared best-effort insert helper: `belm_role_communication_insert(...)`

### Access model
- BELM staff can communicate only with roles defined by the BELM recipient matrix.
- Customer users communicate inside their own company tenant and only with permitted BELM support roles.
- Customer tenant isolation is enforced by `customer_id` in the backend.
- Customer users cannot target **BELM Bank Controller**.
- Customer communication does not expose **BELM Spare Sales / BELM Inventory**.
- BELM-to-Customer messages require a selected customer and any linked machine must belong to that customer.

### Workflow communication added
Customer workflow examples:
- Operator machine handover -> Customer Workshop Manager
- Operator machine problem -> Customer Workshop Manager
- Service-provider escalation -> BELM Workshop Manager
- Spare approval required -> Customer Administration
- Approved spare -> Customer Store Keeper
- Store shortage -> Customer Procurement
- PI waiting -> Customer Accounts
- Parts ready -> Customer Workshop Manager / Store
- Technician Job Report -> responsible Workshop Manager

BELM internal spare workflow examples:
- Technician spare request -> BELM Store Keeper
- Store identifies spare -> BELM Finance / Accounts for Proforma
- Purchase required -> BELM Procurement
- Spare fulfilled / ready -> BELM Workshop Manager

The role inbox is an operational role-to-role channel. Existing official BELM <-> Customer company communication/history remains available as a separate company-facing record.

## 3. Role-Based Reports Arrangement

### New canonical report entry
- UI: `frontend/role-reports/`
- Customer mirrored dashboards convert their sidebar report entry to **My Reports**.
- BELM module sidebar exposes **My Role Reports**.
- Customer Workshop has explicit **My Reports** and **Communication** entries.
- Legacy report shortcut pages now redirect to the canonical role report index instead of maintaining duplicate report menus.

### Customer reports
- Customer Administration: company operations + customer finance/procurement/store reports.
- Workshop Manager: technical, Job Card, machine, procurement support and store support reports.
- Technician: assigned technical / machine / Job Card reports.
- Operator: daily operation, checkup, fuel and service-related reports.
- Procurement: requests, proforma, orders, delivery and procurement analysis.
- Store Keeper: customer inventory, audit, tools and shortage reports.
- Finance / Accounts: invoices, proforma, payments, expenses, petty cash, VAT and audit.

**Customer exclusions remain:** no BELM Bank Controller reports and no BELM Spare Sales / BELM Inventory reports.

### BELM reports
- Super Admin: consolidated management, workshop, customer, procurement, store, finance, bank and system audit.
- Workshop Manager: workshop, Job Cards, machines and technical performance.
- Technician: assigned machine report center and Job Cards.
- Procurement: purchases, suppliers, orders and deliveries.
- Store Keeper: stock, audit, shortages and tools.
- Registration & Sales: customer / registration / sales-related reports.
- Finance / Accounts: billing, payments, expenses and financial reports.
- Bank Controller: bank reports only.
- System Coordinator: system / role / activity reporting.

The existing detailed report pages are retained. V763 centralizes navigation to them instead of deleting report history or recreating duplicate reporting data.

## 4. Routing Regression Repairs

The frontend uses canonical hyphenated API URLs while several endpoint files use underscore filenames. Explicit front-controller mappings were added for:

- `/api/service-requests` -> `service_requests.php`
- `/api/spare-parts` -> `spare_parts.php`
- `/api/spare-parts/requests` -> `spare_part_requests.php`
- `/api/spare-recommendations` -> `spare_recommendations.php`
- `/api/proforma-invoices` -> `proforma_invoices.php`

Nested Service Request actions such as assign, status, activate-job-card, notes, hide/unhide and assignees are also mapped explicitly.

This removes deployment-dependent failures caused by hyphen/underscore filename differences.

## 5. Data / Migration Safety

- Migration release: `navigation-role-communication-reports-v763`
- Communication tables are additive (`CREATE TABLE IF NOT EXISTS`).
- New tables are included in migration protected-table checks.
- Readiness verifies Role Communication tables and required columns.
- No `DROP TABLE`, `TRUNCATE`, or top-level `DELETE FROM` was introduced in `schema.sql`.
- Existing report history, Job Cards, machine history, finance history, customer stock and other operational records are not intentionally deleted by this release.

## 6. Regression Validation

- PHP syntax: **171 / 171 PASS**
- JavaScript syntax: **138 / 138 PASS**
- Inline JavaScript: **110 / 110 PASS**
- Actual document pages with V763 navigation: **157 / 157**
- Frontend top-level API resources checked: **50**, unresolved: **0**
- Static UI href/src references checked: **1,268**, unresolved after valid Apache/SPA routes: **0**
- Role Report local destinations checked: **58**, unresolved: **0**
- Customer Bank report route exposed: **No**
- Customer BELM Spare Inventory report route exposed: **No**
- Customer-to-Bank Role Communication target exposed: **No**
- Git conflict markers: **0**
- Destructive schema statements (`DROP TABLE` / `TRUNCATE` / top-level `DELETE FROM`): **0**

## Deployment Note

Deploy the full V763 release so the frontend, API router and additive schema migration move together. The Role Communication UI expects the new communication tables; `/api/readiness` is updated so an incomplete schema deployment is visible instead of being reported as ready.
