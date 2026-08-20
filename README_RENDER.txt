BELM OPERATIONS PORTAL - DEPLOYMENT PACKAGE
==========================================

CURRENT ROLE FLOWS
------------------
BELM Admin
- Admin login: /admin/login
- Customers & Machines: customer cards, communication history, Customer Machine,
  Workshop, Procurement, General Report and Manage Customer.
- Manage Customer: Edit Customer, Reset Login, Users Control, Delete and
  Forget Permanently according to permissions.
- Customer Machine: machine status/range, Fleet No., Activity Status, Report,
  Check Up, Service Parts, Job Card, plus Admin machine management controls.

BELM Technician
- Technician login: /tech
- First face is the assigned-customer card with Phone, Email, Address and
  Communication History.
- Dashboard actions: View Machines, BELM Workshop, BELM Store, General Report,
  Expenses Rec.
- View Machines uses the compact machine card with Fleet No., full-card
  GREEN/YELLOW/RED status range, readable alert/service message, Activity Status,
  Report, Check Up, Service Parts and Job Card.
- Technician cannot Edit Machine, Delete Machine or Forget Permanently.
- Completed daily Check Up immediately refreshes the machine card and shows
  Technician checked DD/MM/YYYY - HH.MM plus the auto Checklist No. The daily
  stamp resets at 00.00 Africa/Dar_es_Salaam for the next daily check.

Customer
- Customer login: /portal/login?customer=<customer-name>
- Customer dashboard shows the customer's own company card and communication history.
- Customer machine view has machine status/range, Fleet No., Activity Status,
  Report, Check Up, Service Parts and Job Card.
- Customer machine management row: Add Machine, Edit Machine, Delete Machine,
  Forget Permanently. These controls are locked when BELM Service Provider is ON.
- General Report Center: Checklist, Fuel Consumption, Machine Expenses,
  Maintenance, Operator, Technician, Statistics Analysis, Store Keeping and
  Finance Report.

MACHINE ALERT RULE
------------------
- Strongest state wins: RED > YELLOW > GREEN.
- RED card blinks clearly; YELLOW pulses slowly; GREEN stays steady.
- Alert/service text stays readable and does not blink.

DEPLOY TO RENDER
----------------
1. Upload all files in this package to the repository root.
2. Keep Dockerfile and render.yaml in the root.
3. Connect the repository to Render Blueprint and deploy.
4. Verify /api/health after deploy.
5. Do not run database reset scripts on production unless a deliberate reset is required.

DATA SAFETY
-----------
- PostgreSQL is the persistent source of truth.
- Invoice and Proforma templates/helpers remain in backend/templates and backend/api.
- Normal deploy does not intentionally truncate customer, machine, invoice,
  proforma, checklist, Job Card or expense records.

PACKAGE ORGANIZATION
--------------------
- Historical version changelogs/audits are kept under docs/history/ instead of
  cluttering the deployment root.
- Regression tests remain under tests/.
