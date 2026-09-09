# BELM Store Keeper Dashboard — Template

Replica ya "Store Keeper Dashboard" uliyotuma, kwa role ya `store_keeper`.

## Muundo
```
belm-storekeeper-dashboard/
├── index.html                                  # badilisha kuwa dashboard-storekeeper.php
├── assets/
│   ├── css/belm-storekeeper-dashboard.css
│   └── js/belm-storekeeper-dashboard.js        # pia ina saa/tarehe halisi (live clock)
```

## Vipengele
- Sidebar: role card "STORE KEEPER / INVENTORY & TOOLS" + menu 11 (Home active,
  Spare Parts Inventory, Stock In, Stock Out & Issues, Spare Requests,
  Low Stock & Shortages, Tools Register, Stock Audit, Inventory Reports,
  Department Analysis, My Profile).
- Topbar: "KEEP MACHINES MOVING | A STRONGER TOMORROW", saa/tarehe **halisi** (JS
  inasasisha kila sekunde 30), "BUILT FOR A TOUGHER TOMORROW".
- Hero + buttons "RECORD STOCK IN" (gold) / "ISSUE ITEM" (bluu).
- Kadi 4: Stock Items(486), Low Stock(18, gold border), Pending Requests(7),
  Tools Issued(24, green border).
- **Inventory Alerts** — search box + jedwali lenye status badges (Low Stock/
  Out of Stock/Available/Reorder) na actions 3 (View/Request Procurement/Adjust).
- **Pending Spare Requests** — jedwali lenye Request Status (Pending/Approved) na
  actions (Review/Issue Part).
- **Recent Stock Movements** — jedwali lenye activity type ya rangi (Stock In=kijani,
  Issued to Job Card=nyekundu, Tool Returned/Audit Adjustment=bluu) na Qty ya +/-.
- **Quick Actions** bar: Scan Item, Print Issue Note, Start Audit, Export CSV.

## Kuunganisha na schema ya PostgreSQL (belm-db-schema)

```sql
-- Kadi 4
SELECT count(*) FROM spare_parts;                                          -- Stock Items
SELECT count(*) FROM v_low_stock_parts;                                    -- Low Stock
SELECT count(*) FROM spare_part_requests WHERE status = 'requested';       -- Pending Requests
-- Tools Issued: hauna jedwali la 'tools' bado (angalia "Kumbuka" chini)

-- Inventory Alerts
SELECT part_no, name, category, current_stock, reorder_level, warehouse_location,
  CASE WHEN current_stock = 0 THEN 'out_of_stock'
       WHEN current_stock <= reorder_level THEN 'low_stock'
       ELSE 'available' END AS status
FROM spare_parts ORDER BY current_stock ASC;

-- Pending Spare Requests
SELECT jc.job_card_no, m.machine_type, u.full_name AS technician, sp.name AS part,
       spr.quantity, spr.status
FROM spare_part_requests spr
JOIN job_cards jc ON jc.id = spr.job_card_id
JOIN machines m ON m.id = jc.machine_id
JOIN spare_parts sp ON sp.id = spr.part_id
LEFT JOIN users u ON u.id = spr.requested_by
WHERE spr.status IN ('requested','approved')
ORDER BY spr.requested_at;

-- Recent Stock Movements
SELECT it.created_at, it.txn_type, sp.name, sp.part_no, it.quantity, u.full_name
FROM inventory_transactions it
JOIN spare_parts sp ON sp.id = it.part_id
LEFT JOIN users u ON u.id = it.created_by
ORDER BY it.created_at DESC LIMIT 10;
```

**Kumbuka:** Schema ya awali haina bado jedwali la `tools` / `tool_issues`
(kwa "Tools Issued 24", "Tools Register", "Tool Returned"). Pia
`inventory_transactions.txn_type` ya sasa ina `stock_in/stock_out/adjustment`
tu — dashboard hii inahitaji ubainifu zaidi (`issued_to_job_card`, `tool_returned`,
`audit_adjustment`) kutofautisha aikoni/rangi kwa usahihi. Niambie ukitaka
nikusasishie `schema.sql` na jedwali la `tools` + kuboresha enum hii.
