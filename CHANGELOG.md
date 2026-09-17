# BELM Portal — Change Log

Historical repair/audit notes, consolidated from individual per-version files into one place.

## Main Dashboard reporting navigation update

- Removed `Checklist Monitoring` from the Workshop Manager sidebar.
- Added `General Analysis` to the BELM Main Dashboard sidebar.
- Added `General Analysis` to the Customer Main Dashboard sidebar and connected it to customer-owned analysis.
- Added `General Report` to the BELM Main Dashboard sidebar.
- Connected `General Report` to the consolidated all-departments report centre.
- Renamed the consolidated report-centre heading to `General Report — All Departments`.
- Connected the shared machine-photo component to BELM machine cards and Customer machine cards, using one synchronized photo record per machine.
- Audited every BELM and Customer role dashboard and connected Light/Dark selectors to one personal theme preference; missing selectors are added automatically.
- Removed the injected Customer Portal sidebar from Workshop Store and expanded its content to fit the full desktop/mobile display.
- Added customer-company identity branding across every Customer dashboard, including combined labels such as `J LTD PROCUREMENT` and `J LTD STORE KEEPER`.
- Added the combined customer company/role label inside the Customer sidebar, for example `J LTD MACHINE OPERATOR`.


---

# BELM Portal Repair Audit — V762

## Release goal
Audit and repair the supplied BELM Portal backup so the Customer side mirrors BELM operational functions using customer-owned data, while keeping these BELM-only exclusions:

- Bank Controller / BELM bank balances, deposits and withdrawals
- BELM Spare Parts selling and BELM private spare inventory

This release also preserves the existing service-provider / customer-self-managed permission model and existing business history.

## Major repairs completed

### 1. Customer role parity
Customer workspaces now have consistent role routing for:

- Customer Admin / Owner
- Workshop Manager
- Technician
- Operator
- Procurement
- Store Keeper
- Finance / Accounts

Legacy login, Portal V2, Customer Admin and role-navigation paths were aligned so the same role opens the same customer workspace.

### 2. Customer Finance parity
Customer Finance now has customer-owned workflows for:

- Invoice and Proforma (core Finance functions)
- Payments and receipt history
- Company expenses and receipt/proof storage
- Petty Cash
- VAT / Tax reporting
- Customer / Client register
- Supplier view
- Finance Audit Logs

Bank Controller remains excluded. Customer Finance records do not write to BELM bank-account tables.

### 3. Customer Procurement parity
Customer Procurement now supports:

- Procurement queue
- Pending Proforma tracking
- Purchase-order status
- Supplier register
- Supplier references and Proforma references
- Expected-delivery tracking
- Purchase records
- Customer Store issue option

It does not expose BELM inventory or BELM spare selling.

### 4. Customer Store parity
Customer Store now includes:

- Stock inventory
- Stock movement / audit view
- Tools Register
- Tool issue to customer technician
- Expected return and overdue tracking
- Tool return condition/history

### 5. Customer Operator parity
Added a customer-scoped Operator dashboard for:

- Assigned/customer machines
- Daily Check Up
- Fuel Usage
- Operation reporting
- Report history

### 6. Technician spare-request isolation
Customer-managed Technicians no longer route into BELM Spare Parts Manager while working a customer Job Card. Spare requirements remain in the Customer Job Card / Store / Procurement workflow.

BELM Technicians keep their normal BELM spare-request workflow.

### 7. Contracts & Service repair
The active BELM Contracts & Service page previously depended on obsolete `workshop_work_orders` tables that were not present in the schema.

V762 now:

- Adds `customer_contracts` as an additive protected table
- Uses Digital Job Cards / Breakdown Cases as the workshop workboard
- Shows active contracts, covered customer machines, renewal window and Job Cards over SLA
- Opens the canonical Job Card / Breakdown Workflow instead of creating a second work-order system

### 8. Checklist workflow cleanup
The old Customer Checklist Template Manager depended on non-existent customer template APIs and conflicted with the approved centralized template design.

V762 keeps template management under BELM System Settings. Customers choose a machine and run the active Check Up template; completed customer reports remain customer/machine scoped and historical reports are preserved.

### 9. Password Security route repair
`/api/customer-portal/password-security` now correctly dispatches to the existing protected Customer Password Security handler.

### 10. Legacy / duplicate cleanup
Removed or retired dead customer code that was not used by the live pages, including:

- Old Customer Workshop runtimes that referenced obsolete `/workshop/*` APIs
- Old Customer Checklist Template manager assets
- Dead Management Group API workflow; direct visits now explain the canonical active workflows

This reduces the chance of duplicate UI, conflicting runtime patches and dead buttons.

## Database safety

- V762 schema additions are additive.
- No production business-data reset was added.
- Existing migration guards remain in place.
- `customer_contracts`, customer Finance tables and customer supplier data are included in protected migration checks.
- Existing Job Cards, machines, invoices, payments, stock records and customer history are not intentionally deleted by this release.

## Static validation completed

- External JavaScript files checked: **135 — PASS**
- PHP files checked: **170 — PASS**
- Inline JavaScript blocks checked: **105 — PASS**
- Local UI file/route references checked: **917 — 0 unresolved**
- API top-level resources detected: **49 — 0 unresolved**
- Literal Customer Portal subroutes detected: **25 — 0 unresolved**
- Merge/conflict markers: **0**
- Old Customer mirror runtime references: **0**
- Obsolete work-order table references: **0**
- Dead Management Request API references: **0**
- Old Customer Checklist manager references: **0**
- Render startup shell syntax: **PASS**

## Deployment note
This repair was validated statically from the supplied ZIP. A live production PostgreSQL migration was **not** executed from this workspace. On Render, use the existing safe migration/startup process so the additive schema is applied to the connected database, then verify `/api/readiness` reports V762 schema ready.


---

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


---

# BELM Portal V764 - Technician Customer Machine Flow

## Scope
Reduced unnecessary navigation steps before a Technician reaches an assigned Customer Machine card.

## Previous flow
Technician Dashboard -> Customer Machines -> Customer summary card -> View Machine -> Machine Card.

## V764 flow
Technician Dashboard -> Customer Machines -> Machine Card(s).

## Changes
- Customer Machines page now renders assigned Machine Card(s) immediately.
- Removed the extra `View Machine` reveal step and hidden machine panel.
- Removed the redundant `Back to Customer` step inside the same page.
- Customer identity/contact/communication summary remains visible above the machine cards.
- Portal V2 `Customer Machines` now opens the actual technician customer-machines page instead of the generic technician-tasks page.
- Portal V2 `Communication` now opens the technician communication page directly.
- `/tech` alternate customer-machine view allows clicking the machine summary card itself to open the full Machine Card.
- Existing Machine Card actions (Check Up, Job Card, Reports) are preserved.

## Validation
- PHP syntax: PASS (`customer-machines.php`)
- Inline JavaScript syntax: PASS
- `portal-v2/portal.js`: PASS
- `technician-customer-home-v659.js`: PASS
- No remaining hidden `customerMachinePanel` flow or `viewAssignedMachines` trigger in the Technician Customer Machines page.


---

# BELM Portal Repair Audit V765

## Technician Customer Code Gate

### Required field workflow
- BELM Technician > Customer Machines no longer reveals a customer name/list immediately.
- Technician must enter a `Customer Code` first.
- Backend verifies BOTH:
  1. the authenticated user is a Technician assigned to a customer; and
  2. the entered Customer Code belongs to that same assigned customer.
- A valid code from another customer's site is rejected.
- Customer-managed Technicians remain company-scoped and do not require the BELM field-site code.
- Temporary cross-customer assignments continue through `My Job Cards`; Customer Machines does not become a cross-site browser.

### Customer Code lifecycle
- Added additive PostgreSQL column: `customers.customer_code`.
- Existing customers receive a deterministic deployment backfill code.
- Newly created/approved customers receive a unique human-readable code (`CUS-...`).
- BELM Customers Manager displays the code on the customer card with a Copy action.
- Customer Code is not returned in Technician customer list/detail responses.
- Readiness now requires `customers.customer_code` before deployment is considered schema-ready.

### UX
New BELM Technician flow:

`Technician Dashboard -> Customer Machines -> Enter Customer Code -> Assignment verification -> Customer + Machine Cards`

No customer dropdown/list is shown before verification.

### Files changed
- `backend/schema.sql`
- `backend/config/helpers.php`
- `backend/api/customers.php`
- `backend/api/applications.php`
- `backend/api/checklist_reports.php`
- `backend/index.php`
- `frontend/customers-manager/manager.js`
- `frontend/customers-manager/manager.css`
- `frontend/concept-dashboards/02-technician/customer-machines.php`

### Validation
- All 171 PHP files passed PHP syntax lint before packaging.
- Changed frontend JS passed Node syntax validation.
- Technician Customer Machines inline JavaScript passed syntax validation.
- New REST route `/api/checklist-reports/technician-customer-access` is mapped.
- Merge/conflict markers: 0.
- Technician-facing customer SQL excludes `customer_code`.

## Data safety
The migration is additive. No customer, machine, Job Card, report, financial, stock, or communication history is deleted or truncated.


---

# BELM Portal System Audit & Cleanup V766

## Scope
Full-system QA pass over the V765 codebase focused on:
- BELM and Customer role boundaries
- operational handoffs / role-to-role communication
- role-based reports
- navigation and canonical entry points
- stale labels / terminology conflicts
- fake/static dashboard values that could be mistaken for live data
- dead action links
- Bank Controller and Spare Sales boundaries
- syntax and route integrity

## Role and permission corrections
- Kept Bank Controller as a protected BELM-only control role.
- Finance / Accounts no longer calls Bank API or shows Bank Accounts / Bank Deposit unless the signed-in user is Super Admin or Bank Controller.
- Customer-side Bank Controller remains unavailable.
- Customer-side BELM Spare Sales / BELM inventory remains unavailable.
- Legacy `Engineer` compatibility is retained internally, but visible wording is normalized to Workshop Manager / Technical Department where it could confuse users.
- Visible `Bank Manager` labels were normalized to `Bank Controller`.

## Work communication chain
Role Communication remains tenant-scoped and now follows the operational chain more closely:
- Technician -> Workshop Manager / Store Keeper
- Store Keeper -> Procurement when stock is unavailable
- Procurement -> Finance / Accounts where payment or proforma action is needed
- Parts ready -> Workshop / Technician
- Operator -> Workshop / assigned technical chain
- Customer messages remain customer-company scoped
- Bank Controller is not exposed to customer communication recipients

Direct Technician -> Procurement role messaging was removed from the default matrix so shortage escalation is owned by Store, matching the workshop process.

## Communication entry points
- Workshop Manager `Communication` now opens `/role-communications/` instead of Customer Overview.
- Portal V2 Workshop Manager communication opens the same shared Role Communication Inbox.
- Existing customer-specific communication history remains available through customer records when needed.

## Role Reports cleanup
- Workshop Manager `Reports & Analysis` entry now opens `/role-reports/`.
- Technician `My Reports` entry now opens `/role-reports/` instead of only the checked-report shortcut.
- Role Reports remains role-filtered; Customer reports do not expose BELM Bank or BELM Spare Sales.

## Workshop Manager dashboard cleanup
- Quick Action wording normalized to `Technician Dispatch`.
- Removed misleading hard-coded initial operational counts; cards start at 0 until live API sync.
- Removed hard-coded date/time placeholder.
- Removed fake tool availability percentages.
- Notification badge now reflects live attention counts from overdue Job Cards, waiting spares and service-due alerts.
- Workshop Status text now reflects live workflow synchronization / attention state.
- Communication and Reports links use the canonical shared modules.

## Registration & Sales bug fixes
The live customer table contained visible actions that were dead `href="#"` links.
They now deep-link into Customers Manager:
- View -> selected customer machines
- Edit -> selected customer edit dialog
- Reset Access -> selected customer login reset flow
- Manage -> selected customer management dialog

Customers Manager now understands the `customer` + `action` deep-link parameters required by those buttons.

## Procurement cleanup
The old supplied Procurement concept dashboard contains static/demo table actions and is not safe as the live operational landing page.
Production role entry now uses the canonical live Procurement workspace:
`/workshop-management-home/?role=procurement`
The concept page remains available only for local/preview visual reference.

## Text cleanup
Normalized user-facing wording including:
- Bank Manager -> Bank Controller
- Engineering -> Technical Department where operational copy was stale
- Engineers -> Workshop Managers in the technical workspace copy
- Open Job Card quick action -> Technician Dispatch where assignment is the intended action

## Validation
- PHP syntax: 80 files PASS
- Frontend JavaScript syntax: 138 files PASS
- Inline JavaScript: 111 scripts PASS
- API top-level route coverage: 50 used segments, 0 missing handlers
- Merge/conflict markers: 0
- Existing V765 Customer Code + Technician assignment gate retained
- No destructive database cleanup added

## Data safety
No DROP/TRUNCATE/business-history deletion was added. Existing customers, machines, Job Cards, reports, finance records, stock history and communications remain intact.


---

# BELM Portal Repair Audit V767

Date: 2026-09-15

## Safety alert priority

V767 standardizes the machine alert precedence across Customer, Operator and Technician views:

- RED overrides YELLOW.
- YELLOW overrides GREEN.
- GREEN is used only when there is no active RED or YELLOW source.
- UNKNOWN is the lowest priority.

Equivalent rule: `RED > YELLOW > GREEN > UNKNOWN`.

Examples:

- Machine condition RED + service YELLOW = RED.
- Machine condition YELLOW + service RED = RED.
- Machine condition GREEN + service YELLOW = YELLOW.
- GROUNDED activity forces overall RED alert priority.

## Files updated

- `frontend/operator/operator.js`
  - Operator machine-card shell now uses the highest active alert source across condition, service and GROUNDED activity.
- `frontend/technician-dashboard-v658.js`
  - Technician machine-card shell and Check Up warning indicator now use the highest active alert source.
- `frontend/machine-alert-zone-v612.css`
  - Added explicit RED dominance where legacy RED/YELLOW classes coexist.
- `frontend/technician-machine-page-v655.js`
  - Added explicit RED variable precedence for mixed legacy status/range classes.
- Cache-busting references updated for the affected runtime/CSS files.

## Validation

- Changed JavaScript files: `node --check` PASS.
- Alert CSS brace balance PASS.
- Release ZIP integrity verified.

No business records, customers, machines, Job Cards, finance records or report history were deleted by this change.
