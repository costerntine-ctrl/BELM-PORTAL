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
