# BELM Operations Portal — Dashboard-Led Structure V717

## Non-negotiable UI rule

The supplied BELM dashboards are the visual source of truth. Their layout, colours, cards, typography, icons and sidebar presentation must not be replaced by legacy/generated pages. Functional pages are operational engines opened from the supplied dashboard structure.

## System navigation rule

`Dashboard -> Card/Button -> Module -> Record -> Workflow -> Report`

A function has one canonical record/source. Multiple dashboards may open that same function, but they must not create duplicate records or parallel workflows.

## BELM Main Dashboard

Canonical dashboard: `/concept-dashboards/01-admin-home/`

- Workshop Manager -> `/concept-dashboards/11-workshop-manager/`
- Customer Registration -> `/concept-dashboards/04-customer-registration/`
- Customer Overview -> `/customers-manager/?module=customer-overview`
- Roles & Users -> `/roles-manager/?module=roles-users`
- Workshop & Job Cards -> `/concept-dashboards/05-inspection-repair/`
- Spare Parts Inventory -> `/concept-dashboards/06-storekeeper/`
- Procurement -> `/concept-dashboards/03-procurement/`
- Finance & Accounts -> `/concept-dashboards/09-finance-accounts/`
- Bank Control -> `/bank-controller/?module=bank`
- Reports & Analysis -> `/reports-manager/?module=reports`
- System Settings -> `/concept-dashboards/10-system-settings/`

Main dashboard cards are overview/navigation controls, not separate data-entry systems.

## Workshop Manager role

Canonical dashboard: `/concept-dashboards/11-workshop-manager/`

- Job Cards -> `/belm-workshop/#job-cards`
- Machines -> Customer Overview machine records
- Technicians -> BELM Workshop technician management
- Workshop Schedule -> assigned-work view
- Spare Requests -> shared Store/Spare request records
- Service & Maintenance -> shared service tracking/report records
- Reports & Analysis -> workshop analysis
- Checklist Monitoring -> checklist reports only
- Customers -> Customer Overview
- Communication -> customer communication records
- Tools & Equipment -> BELM workshop tool-issue records
- Workshop Settings -> System Settings

Canonical Job Card process:

`Assigned/Received -> Opened -> Diagnosis Report -> Waiting for Spare -> Testing -> Completed`

The same Digital Job Card must be used by Workshop Manager, Technician, Store/Procurement and reporting.

## Technician role

Canonical dashboard: `/concept-dashboards/02-technician/`

Technician uses assigned Job Cards and updates the same canonical Job Card record for inspection, diagnosis, spare requirement, testing and completion.

## Procurement role

Canonical dashboard: `/concept-dashboards/03-procurement/`

Canonical flow:

`Request -> Supplier/RFQ -> Proforma -> Approval -> Purchase Order -> Delivery -> Store Receiving -> Closed`

A spare request received from Workshop/Store must continue as the same request chain.

## Store Keeper role

Canonical dashboard: `/concept-dashboards/06-storekeeper/`

Canonical flow:

`Request -> Verify Stock -> Reserve/Issue OR Procurement -> Receive Stock -> Audit`

Stock and tool movements must be recorded once and referenced by Job Card/request where applicable.

## Registration & Sales

Canonical dashboard: `/concept-dashboards/04-customer-registration/`

Registration is onboarding only:

`Company -> Portal Access -> Contract -> User Limit -> Machines -> Approval`

After onboarding, ongoing company/machine management belongs to Customer Overview.

## Finance & Accounts

Canonical dashboard: `/concept-dashboards/09-finance-accounts/`

Canonical flow:

`Proforma -> Approval -> Invoice -> Payment/Receipt -> Reconciliation -> Report`

Finance documents should reference the customer and Job Card/machine when applicable.

## Bank Control

Canonical module: `/bank-controller/`

Bank changes remain protected by required authorization, PIN/password/reason rules and audit history.

## Reports & Analysis

Canonical module: `/reports-manager/`

Reports consume existing operational data. They must not become duplicate data-entry workflows.

## System Settings

Canonical dashboard: `/concept-dashboards/10-system-settings/`

Configuration only. This includes:

- Company/system configuration
- Security and access
- Notification integrations
- Database/backup controls
- Module configuration
- **Checklist Templates**

Checklist Templates must not appear as a Workshop Manager template editor. Workshop uses Checklist Monitoring/Reports; template creation/editing belongs to System Settings.

## Regression rules

1. Do not replace supplied dashboards with legacy/generated dashboard markup.
2. Do not add a second sidebar for the same dashboard level.
3. Do not create a second Job Card, spare request, customer, machine, invoice or stock movement merely because another role needs to view it.
4. `View My Role` must open the canonical role dashboard.
5. Main dashboard cards/alerts must be actionable and use live data when an authoritative source exists.
6. Backend permissions remain authoritative even when a link is visible.
7. New functions must be attached to the appropriate dashboard/module before a new top-level page is introduced.
