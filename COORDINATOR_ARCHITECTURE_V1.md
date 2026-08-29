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
