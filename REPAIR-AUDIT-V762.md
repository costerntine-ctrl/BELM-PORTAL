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
