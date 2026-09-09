# BELM Technician Dashboard — Template

Replica ya "Technician Dashboard" uliyotuma, HTML/CSS/JS safi, tayari kubandikwa
kwenye BELM Portal (PHP/JS/PostgreSQL) kama role ya `technician`.

## Muundo
```
belm-technician-dashboard/
├── index.html                                 # badilisha kuwa dashboard-technician.php
├── assets/
│   ├── css/belm-technician-dashboard.css
│   └── js/belm-technician-dashboard.js
```

## Vipengele
- Sidebar: Home (active), My Job Cards, Customer Machines, Diagnosis & Repair,
  Spare Requests, Testing & Completion, Daily Checklists, Communication, My Reports,
  My Profile — Light mode / Log out chini.
- Topbar: hamburger + "BUILT FOR A STRONGER TOMORROW" kicker, notification bell
  (dot ya kijani badala ya namba), user chip "TECHNICIAN / TECHNICAL DEPARTMENT".
- Hero: "Technician Dashboard" + "VIEW MY ROLE" (button ya bluu), wireframe SVG
  ya reachstacker (badilishika kwa picha yako halisi).
- Kadi 4: Assigned Jobs (8), In Progress (3), Waiting for Spares (2),
  Ready for Testing (1) — kila moja na `border-left` ya rangi tofauti.
- Communication History — orodha ya ujumbe wenye avatar za rangi (green/blue/gold)
  + "Keep communication clear. Keep machines moving."
- My Active Job Cards — jedwali: Machine, Customer, Job Card, Status (pill ya rangi
  kulingana na status), Next Action (buttons mbili: "Open Job" + action inayolingana
  na status — Update Diagnosis / Request Spare / Start Testing).

## Kuunganisha na data halisi (PostgreSQL)

Tumia schema uliyopokea awali (`belm-db-schema`):

```sql
-- Kadi 4 za juu
SELECT count(*) FROM job_cards WHERE assigned_technician_id = :uid
  AND status NOT IN ('completed','cancelled');                         -- Assigned Jobs
SELECT count(*) FROM job_cards WHERE assigned_technician_id = :uid
  AND status = 'repair_in_progress';                                    -- In Progress
SELECT count(*) FROM job_cards WHERE assigned_technician_id = :uid
  AND status = 'waiting_for_spare';                                     -- Waiting for Spares
SELECT count(*) FROM job_cards WHERE assigned_technician_id = :uid
  AND status = 'testing';                                               -- Ready for Testing

-- My Active Job Cards
SELECT jc.job_card_no, m.machine_type, m.make, m.model, c.name AS customer, jc.status
FROM job_cards jc
JOIN machines m ON m.id = jc.machine_id
JOIN companies c ON c.id = jc.company_id
WHERE jc.assigned_technician_id = :uid
  AND jc.status NOT IN ('completed','cancelled')
ORDER BY jc.updated_at DESC;
```

Button ya "Next Action" ibadilishwe kimtiririko: `waiting_for_spare` → "Request Spare"
(link kwa `spare-requests.php?job_card=ID`), `diagnosis` → "Update Diagnosis", `testing`
→ "Start Testing" — link zote kwa `diagnosis-repair.php` / `testing-completion.php` yako.

Communication History inaweza kutoka kwenye jedwali jipya `communication_logs`
(halijawekwa kwenye schema ya awali — niambie nikuongezee kama unataka module hii
kamili kwenye database, pamoja na notifications za real-time).
