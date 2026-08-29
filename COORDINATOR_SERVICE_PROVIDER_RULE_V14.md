# V14 Coordinator Service Provider Rule

## Authoritative rule
- Coordinator owns Customer Department and Role capability.
- Customer Technician capability requires BOTH:
  1. Technical / Workshop Department = ENABLED
  2. Technician Dashboard / Role entitlement = ENABLED
- If either is not granted, BELM Service Provider is mandatory.
- The API rejects attempts to turn BELM Service OFF while Technician capability is incomplete.
- Removing Technical Department or Technician entitlement automatically sets the historical `is_machinery_admin` flag to BELM Service Provider mode (`0`).
- No Technician account, Job Card, report, machine, or history row is deleted by this transition.
- Re-enabling both capabilities does not automatically turn BELM Service OFF. This preserves Hybrid mode until Coordinator explicitly changes service ownership.

## New customer safety
- New customers default to `technicianDashboard=false`.
- New customers start with BELM as Service Provider.
- PORTAL-CWM registration may still start with its Workshop module enabled; Technician service ownership remains controlled by Coordinator.

## Existing customer compatibility
- Existing explicit Coordinator settings are preserved.
- Missing legacy Technician feature keys remain treated as enabled to avoid unexpectedly locking historical accounts during deployment.

## Technician workflow
Admin / Workshop Manager Assign -> Technician Receive -> Diagnosis -> Work / Spare -> Testing -> Complete.
Technician does not receive assignment authority from this change.
