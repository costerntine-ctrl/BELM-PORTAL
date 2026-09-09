# BELM Customer Registration & Management — Template

Replica ya "Customer Registration & Management" uliyotuma, kwa role ya
`super_admin` / `system_coordinator`.

## Muundo
```
belm-customer-registration/
├── index.html                                  # badilisha kuwa register-customer.php
├── assets/
│   ├── css/belm-customer-registration.css
│   └── js/belm-customer-registration.js
```

## Vipengele
- Sidebar: Home, **Register Customer (active)**, All Customers, Pending Approvals,
  Portal Access, Customer Users, Contracts & Service, Customer Machines,
  Communication, Customer Reports, Activity Log, My Profile.
- Topbar: user chip "BELM ADMIN / SUPER ADMIN".
- Hero: "Customer Registration & Management" + "POWERING A STRONGER TOMORROW".
- Kadi 4: Active Customers(12), Pending Approval(3), Active Contracts(9),
  Registered Machines(24).
- **Register New Customer** — fomu kamili: Company Name, Location, TIN, VRN, Email,
  Phone, Service Provider (select), Contract Start/End (date), User Limit (select),
  buttons "Save Customer" (kijani) / "Clear Form" (bluu).
- **Registered Customers** — search box + jedwali: Company, Location, Portal Access
  (dot ya rangi Active/Pending), Users (x/y), Contract, Machines, Actions
  (View/Edit/Reset Access/Manage).

Search box ina JS ya client-side filter tayari (inachuja rows kwa company/location/TIN).

## Kuunganisha na schema ya PostgreSQL (belm-db-schema)

```sql
-- Kadi 4
SELECT count(*) FROM companies WHERE status = 'active';                       -- Active Customers
SELECT count(*) FROM contracts WHERE status = 'pending';                      -- Pending Approval
SELECT count(*) FROM contracts WHERE status = 'active';                       -- Active Contracts
SELECT count(*) FROM machines;                                                -- Registered Machines

-- Save Customer (POST) — mfano wa transaction
INSERT INTO companies (company_code, name, tin_number, address, phone, email, status)
VALUES (:code, :name, :tin, :location, :phone, :email, 'pending')
RETURNING id;

INSERT INTO contracts (contract_no, company_id, service_type, start_date, end_date, status)
VALUES (:contract_no, :company_id, :service_provider, :start_date, :end_date, 'pending');

-- Registered Customers table
SELECT c.name, c.address AS location,
       (SELECT bool_and(is_enabled) FROM customer_access ca WHERE ca.company_id = c.id) AS portal_active,
       (SELECT count(*) FROM users u WHERE u.company_id = c.id) AS users_count,
       ct.service_type, (SELECT count(*) FROM machines m WHERE m.company_id = c.id) AS machines_count
FROM companies c
LEFT JOIN contracts ct ON ct.company_id = c.id AND ct.status IN ('active','pending')
ORDER BY c.created_at DESC;
```

**Kumbuka:** `VRN` (Value Added Tax Registration Number) na `User Limit` havipo bado
kwenye `companies`/`contracts` — ni fields rahisi za kuongeza (`vrn_number VARCHAR(30)`
kwenye `companies`, na `user_limit INT` kwenye `contracts`). Niambie ukitaka
nikusasishie `schema.sql` na hizi column mbili.
