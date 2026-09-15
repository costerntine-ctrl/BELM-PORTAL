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
