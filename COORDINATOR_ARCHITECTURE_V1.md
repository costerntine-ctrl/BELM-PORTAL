# BELM Workshop Management — Coordinator Architecture

## Main separation
- BELM Operations: BELM-owned operational records.
- Customer Workshop: customer-owned operational records.
- Coordinator: shared system-control layer only.

## Coordinator controls
- Checklist Template -> existing /checklist-manager/
- Role Controller -> existing /roles-manager/
- Report Controller -> existing /reports-manager/
- BELM Invoice / Proforma -> existing /billing-manager/
- System Settings -> existing /settings-manager/
- System Tools -> existing controller library
- BELM Service connection per customer
- Optional Customer Invoice System per customer
- Optional Customer Proforma System per customer

## Data isolation
Customer Invoice / Proforma documents use `customer_sales_documents` keyed by `customer_id`.
They are not read by BELM Billing APIs. Disabling the module only removes access; it does not delete customer documents.

## Entry point
Admin login -> /admin-menu/ -> /workshop-management-home/


## V489 Coordinator General Report
Coordinator > General Report now contains: Checklist Report, Machine Operator Report, Maintenance Report, Job Card Report, Fuel Consumption Report, Spare Usage Report, Procurement Report, General Analysis, and Sub Analysis.

## Personal theme rule
Light/Dark mode is account-scoped via `/api/preferences` and `user_preferences(account_type, account_id)`. Coordinator and Workshop Management Home now load the shared theme manager. One user's theme selection must never change another user's display preference.

## V490 — Machine Card Button Controller
Coordinator now controls Operator machine-card actions per customer. Each action can be `enabled`, `disabled`, or `hidden` without deleting code or history. Current Operator actions: Report, Check Up, Service Parts, Operation Card. Operator API enforces the same states server-side so disabled/hidden actions cannot be bypassed by direct requests.


## Database safety V6
- Customer departments are controlled by `customer_department_settings`.
- Missing department rows mean ENABLED, preserving full workflow for existing customers.
- Removing a department changes access state only; no workflow/business records are deleted.
- Coordinator feature updates merge existing JSON so future/unknown settings are not lost.
- Deployment migration no longer contains the legacy banking reset path.
- `schema.sql` is blocked if destructive `DROP TABLE`, `TRUNCATE`, or `DELETE FROM` statements are introduced.


## V11 — Coordinator Communication Control

Coordinator now includes a central **Management Mail & Notifications** control center:
- Management Mail identity and portal audit-copy preference.
- Notification Configuration for Job Card, Maintenance, Procurement, Invoice/Proforma and System events.
- Email, WhatsApp and SMS channel enable/disable controls.
- Provider status is shown without exposing credentials.
- SMS provider environment placeholders are optional and disabled until configured.
- These settings control routing/configuration only and do not delete existing message or notification history.
