# BELM Procurement Dashboard — Template

Replica ya "Procurement Dashboard" uliyotuma, HTML/CSS/JS safi kwa role ya
`procurement_officer`.

## Muundo
```
belm-procurement-dashboard/
├── index.html                                 # badilisha kuwa dashboard-procurement.php
├── assets/
│   ├── css/belm-procurement-dashboard.css
│   └── js/belm-procurement-dashboard.js
```

## Vipengele
- Sidebar: Home (active), Spare Purchase Requests, Purchase Records, Pending Proforma,
  Purchase Orders, Suppliers, Delivery Tracking, Purchase Reports, Department Analysis,
  My Profile.
- Topbar: "BUILT FOR A STRONGER TOMORROW" + "HEAVY EQUIPMENT / STRONGER OPERATIONS".
- Hero: role chip "PROCUREMENT / PURCHASING DEPARTMENT" + "VIEW MY ROLE".
- Kadi 4: Purchase Requests (12), Pending Proforma (5), Approved Orders (8),
  Awaiting Delivery (6).
- **Spare Purchase Priority** — jedwali lenye status badges (Urgent=red, Proforma
  Pending=gold, Approved=green) na action button inayolingana (Request Quotation /
  Compare Proforma / Create PO).
- **Pending Proforma** — kadi 3 za wasambazaji (logo, nchi, bei, lead time, Review +
  Submit for Approval).
- **Delivery Tracking** — stepper ya hatua 4 (PO Approved → Supplier Confirmed →
  In Transit → Received by Store) + kisanduku cha tracking chenye "View Details".
- Footer band: "BELM OPERATIONS PLATFORM" — "RELIABLE PEOPLE. RELIABLE MACHINES.
  A STRONGER TOMORROW."

## Kuunganisha na schema ya PostgreSQL (belm-db-schema)

```sql
-- Kadi 4 za juu
SELECT count(*) FROM spare_part_requests WHERE status = 'requested';         -- Purchase Requests
SELECT count(*) FROM proforma_invoices WHERE status IN ('draft','sent');      -- Pending Proforma
SELECT count(*) FROM purchase_orders WHERE status = 'sent';                   -- Approved Orders
SELECT count(*) FROM purchase_orders WHERE status = 'partially_received';     -- Awaiting Delivery

-- Spare Purchase Priority (unganisha na required_date + priority uliyoongeza)
SELECT sp.name AS spare_part, m.machine_type, c.name AS customer,
       spr.quantity, spr.requested_at, spr.status
FROM spare_part_requests spr
JOIN spare_parts sp ON sp.id = spr.part_id
JOIN job_cards jc ON jc.id = spr.job_card_id
JOIN machines m ON m.id = jc.machine_id
JOIN companies c ON c.id = jc.company_id
ORDER BY spr.requested_at;
```

**Kumbuka:** Schema ya awali (`belm-db-schema`) haina bado column ya `priority`
(Urgent/Normal) wala `required_date` moja kwa moja kwenye `spare_part_requests`,
wala jedwali la `proforma_line_quotes` (bei/lead-time kwa kila supplier kwa
ombi moja). Kama unataka niongeze haya (na jedwali la `delivery_tracking` lenye
hatua 4 za stepper), niambie nikusasishe schema hiyo ili idashibodi hii ipate
data halisi moja kwa moja.
