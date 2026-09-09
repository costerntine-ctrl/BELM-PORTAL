# BELM Machine Operator Dashboard — Template

Replica ya "Machine Operator Dashboard" uliyotuma, kwa role ya `operator`
(mtumiaji wa mteja anayeendesha mashine).

## Muundo
```
belm-operator-dashboard/
├── index.html                              # badilisha kuwa dashboard-operator.php
├── assets/
│   ├── css/belm-operator-dashboard.css
│   └── js/belm-operator-dashboard.js       # ina saa/tarehe halisi
```

## Vipengele
- Sidebar: role card "MACHINE OPERATOR / CUSTOMER OPERATIONS" + menu 10
  (Home active, My Machine, Daily Checklist, Operation Log, Fuel Consumption,
  Machine Alerts, Service Status, Report Issue, Communication, Operator Reports,
  My Profile).
- Topbar: "KEEP MACHINES MOVING | A STRONGER TOMORROW" + saa/tarehe halisi +
  "BUILT FOR A TOUGHER TOMORROW".
- Kadi 4 + "START DAILY CHECK": Assigned Machine (KALMAR RS45), Operating Hours
  Today (6.8h), Fuel Used Today (74L), Checklist Status (Completed).
- **Today's Machine Status** — picha ya mashine (placeholder SVG, badilisha na
  picha halisi) + details (Fleet No., Model, Location, Engine Hours, Status).
- **Daily Safety Checklist** — vipengele 6 (Engine Oil, Gearbox Oil, Coolant Level,
  Tyres, Brakes, Lights & Warning Alarm) na buttons View Checklist/Add Comment.
- **Machine Alerts** — Hydraulic temperature (Attention) + Next service due
  (Service Due) + button kubwa "REPORT ISSUE".
- **Operation & Fuel Log** — jedwali la siku 4 zilizopita + "ADD OPERATION LOG".
- **Communication** — Message Workshop (solid) + Emergency Contact (outline,
  `tel:` link — badilisha na namba halisi ya dharura).
- **Quick Actions** bar.

**Kumbuka kuhusu picha ya mashine:** Kisanduku cha "Machine Photo" kwa sasa ni
SVG placeholder ya wireframe (rangi navy/gold) — badilisha `.belm-machine-photo`
na `<img src="assets/img/machine-photo.jpg">` ukiwa na picha halisi ya mashine
kutoka kwenye `machine_documents` au upload maalum.

## Kuunganisha na schema ya PostgreSQL (belm-db-schema)

```sql
-- Kadi 4 (kwa operator aliye-login, akijulikana kwa machine_id yake)
SELECT machine_code, machine_type, make, model, current_service_hours
FROM machines WHERE id = :machine_id;                                    -- Assigned Machine

-- Operating Hours Today / Fuel Used Today: zinahitaji jedwali la 'operation_logs'
-- (halijawekwa bado kwenye schema ya awali — angalia "Kumbuka" chini)

-- Daily Safety Checklist ya leo
SELECT ici.item_name, ici.result, ici.remarks
FROM inspection_checklist_items ici
JOIN inspections i ON i.id = ici.inspection_id
WHERE i.job_card_id IS NULL  -- au job_card maalum ya "daily check"
  AND i.inspected_at::date = CURRENT_DATE;

-- Machine Alerts
SELECT alert_type, severity, message FROM machine_alerts
WHERE machine_id = :machine_id AND is_resolved = false;
```

**Kumbuka:** Schema ya awali haina bado jedwali la `operation_logs` (Date & Time,
Start Hours, End Hours, Work Duration, Fuel Added, Activity) wala uhusiano wa
moja-kwa-moja "operator ↔ assigned machine" (kwa sasa `machines` inaunganishwa
na `company_id` tu, si `assigned_operator_id`). Niambie ukitaka nikusasishie
`schema.sql` na haya mawili ili dashboard hii ipate data halisi kikamilifu.
