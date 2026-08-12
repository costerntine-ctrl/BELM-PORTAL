# BELM Portal Functional Scope

## 1. Registration and access control

- Public registration request flow for Customers, Staff and Technicians.
- Admin approval before dashboard access.
- Role-based page access.
- Super Admin controls roles and system users.
- Technician can be assigned to a specific customer.
- Customer assistants/viewers use customer-scoped access.
- Recovery-code based password reset workflow.

## 2. Customer and machinery management

- Customer records and contact/company information.
- Machine records linked to a customer.
- Machine identity: brand, type/model, serial/registration and service information.
- Operational condition/status.
- Machine-specific service and expense history.

## 3. Service operations

- Machine-aware service requests.
- Service type driven by active checklist templates.
- Synchronized service spare-parts requirements.
- Technician assignment and status progression.
- Service notes and completion workflow.
- Checklist evidence including compressed photo upload.

## 4. Spare parts and suppliers

- Spare-parts inventory with stock quantity, reorder threshold and pricing.
- Low-stock/out-of-stock visibility.
- Technician inventory requests.
- Pending request re-edit before inventory action.
- Supplier directory.
- Service/checklist part recommendations and synchronization.

## 5. Finance

- Billing and invoices.
- Proforma invoices.
- Payments and receipts.
- Company expenses.
- Bank account/withdrawal management.
- Customer machine expenses.
- Customer petty-cash operations.

## 6. Reporting and analytics

- Overview KPI cards.
- Financial performance and comparison.
- Inventory analysis.
- Attendance and employee activity.
- Service/task/machine status reporting.
- CSV export and print/PDF workflows where implemented by each manager.

## 7. Notifications and communication

- Admin announcements.
- Notification logs.
- Role/dashboard notification surfaces.
- SMTP support for workflows that send email.

## 8. Administration and safety controls

- Settings manager.
- Protected destructive actions with authenticated admin confirmation, delete PIN and reason.
- Recycle/trash flows where supported.
- Database reset tools intended for controlled administrative use.

## Product direction

The portal should remain one integrated BELM operations system. New features should extend these domains rather than adding duplicate mini-apps that store the same data independently.
