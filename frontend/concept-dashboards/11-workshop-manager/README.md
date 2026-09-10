# BELM Workshop Manager Dashboard — Template

Replica ya "Workshop Manager Dashboard" uliyotuma, kwa role ya `workshop_manager`.
Mtindo mwepesi (light theme), sawa na System Settings/Finance dashboards.

## Muundo
```
belm-workshop-manager-dashboard/
├── index.html
├── assets/
│   ├── css/belm-workshop-manager.css
│   ├── js/belm-workshop-manager.js     # saa/tarehe halisi
│   └── img/belm-logo-v2.png
```

## Vipengele
- Header + sidebar (Home Dashboard active, menu 12: Job Cards, Machines,
  Technicians, Workshop Schedule, Spare Requests, Service & Maintenance,
  Reports & Analysis, Checklist Monitoring, Customers, Communication,
  Tools & Equipment, Workshop Settings; chini: My Profile, Help & Support, Logout).
- Welcome banner + "Workshop Running / All systems operational" badge.
- Kadi 5 za rangi kamili: Open Job Cards(12), In Progress(8), Waiting for
  Spare(4), Completed This Month(28, +27%), Overdue(3).
- **Job Card Status** — donut chart ya SVG (47 Total Jobs, sehemu 6).
- **Workshop Workload** — bar chart yenye mfululizo 2 (Jobs Assigned/Completed)
  kwa siku 7.
- **Quick Actions** — buttons 6 (Create Job Card, Assign Technician, Request
  Spare, View Schedule, Inspection Report, Service Reminders).
- **Recent/Active Job Cards** — jedwali kamili lenye status pills 6 tofauti.
- **Alerts & Reminders** — 4 items (Overdue, Waiting for Spare, Service Due,
  Checklists Pending).
- **Technicians On Duty** — avatars 5 (4 on duty, 1 off duty).
- **Workshop Tools & Equipment** — mini-cards 3 (% availability).
- **Today's Schedule** — ratiba 4 za siku.

## Kuunganisha na schema ya PostgreSQL (belm-db-schema)

```sql
-- Kadi 5
SELECT count(*) FROM job_cards WHERE status = 'received';                    -- Open
SELECT count(*) FROM job_cards WHERE status = 'repair_in_progress';          -- In Progress
SELECT count(*) FROM job_cards WHERE status = 'waiting_for_spare';           -- Waiting for Spare
SELECT count(*) FROM job_cards WHERE status = 'completed'
  AND completed_at >= date_trunc('month', now());                           -- Completed (This Month)
SELECT count(*) FROM job_cards WHERE status NOT IN ('completed','cancelled')
  AND received_at < now() - interval '3 days';                              -- Overdue (mfano wa sheria)

-- Job Card Status donut
SELECT status, count(*) FROM job_cards GROUP BY status;

-- Workshop Workload (wiki hii)
SELECT date_trunc('day', received_at) AS day, count(*) AS assigned
FROM job_cards WHERE received_at >= date_trunc('week', now()) GROUP BY 1;
SELECT date_trunc('day', completed_at) AS day, count(*) AS completed
FROM job_cards WHERE completed_at >= date_trunc('week', now()) GROUP BY 1;

-- Recent/Active Job Cards
SELECT jc.job_card_no, m.machine_type, m.model, c.name AS customer,
       jc.problem_description, jc.status, u.full_name AS technician, jc.received_at
FROM job_cards jc
JOIN machines m ON m.id = jc.machine_id
JOIN companies c ON c.id = jc.company_id
LEFT JOIN users u ON u.id = jc.assigned_technician_id
ORDER BY jc.received_at DESC LIMIT 6;

-- Technicians On Duty (schema mpya inahitajika — angalia "Kumbuka")
```

**Kumbuka:** Schema ya awali haina bado dhana ya "On Duty/Off Duty" kwa
`users` (technicians), wala jedwali la "Tools & Equipment" (availability %),
wala "Today's Schedule" (ratiba za kila siku za workshop). Niambie ukitaka
nikusasishie `schema.sql` na majedwali haya matatu (`technician_duty_status`,
`workshop_equipment`, `workshop_schedule_events`).
