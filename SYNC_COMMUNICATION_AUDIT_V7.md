# BELM SYNC & COMMUNICATION AUDIT V7

## Architecture checked
- BELM <-> Coordinator <-> Customer separation
- Customer department Add/Remove permissions
- Operator dashboard/action permissions
- Technician Job Card assignment/receive flow
- Customer <-> BELM communication audit trail
- Procurement / Store / Finance / Reports route scoping

## Fixes applied
1. Closed the legacy development bypass that exposed customer expense/procurement data to BELM staff by default.
2. Coordinator department states are now enforced at customer API level, not only in UI.
3. Removed departments preserve all rows/history; API returns 403 rather than deleting anything.
4. Operator department removal blocks login and all authenticated Operator endpoints.
5. Customer Technician/Workshop breakdown workflow is blocked when Technical department is removed.
6. Finance removal also hides Customer Invoice/Proforma entry from Customer Workshop home.
7. Official BELM <-> Customer communication remains available for support/audit continuity.

## Job Card workflow verified
Admin / Workshop Manager -> Assign Technician -> Technician Receive Job Card -> Open/Diagnosis -> Spare/Repair -> Testing -> Review/Complete.
Technician assignment endpoints explicitly reject Technician actors.

## Sync behavior
Operational workflow pages poll fresh server state (no-store) and refresh on focus. Job Card process boards poll approximately every 15 seconds; technician task lists poll approximately every 30 seconds. Database remains the source of truth.

## Data safety
No business data DELETE/DROP/TRUNCATE was introduced. Existing customer department defaults remain ENABLED when no Coordinator override exists.
