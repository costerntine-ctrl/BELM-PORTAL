# Managed Contracts & Customer Workshops

## Roles
**BELM:** owns contract oversight, SLA response, escalated service jobs and overall customer support.

**Customer Workshop Manager:** manages customer sites, workshop staff and internal work orders.

**Customer Technician/Mechanic:** can be assigned to internal workshop work orders. A future release can provide individual technician logins against these staff records; V150 establishes the operational records and customer-managed assignment model.

## Workflow
1. Customer creates an internal work order against a machine.
2. Customer assigns its own workshop technician where appropriate.
3. Workshop diagnoses/handles the job internally.
4. If BELM support is needed, the job is escalated.
5. Escalation creates a BELM `service_request` with `origin=CUSTOMER_WORKSHOP` and links it back to the internal work order.
6. BELM continues its existing assignment/service/checklist/parts/billing process.

## Contract control
Contracts capture term, status, SLA response target and whether preventive maintenance, labour and parts are included. Contract machine coverage is normalized through `contract_machine_coverage` for future per-machine contract rules.

## URLs
- BELM: `/contracts-workshops/`
- Customer: `/customer-workshop/`
- APIs: `/api/contracts`, `/api/workshops/*`, `/api/customer-portal/workshop/*`
