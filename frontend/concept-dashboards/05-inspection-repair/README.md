# BELM Inspection, Diagnosis & Repair — Template

Replica ya "Inspection, Diagnosis & Repair" uliyotuma, kwa role ya
`workshop_manager` / `technician`.

## Muundo
```
belm-inspection-repair/
├── index.html                              # badilisha kuwa inspection-repair.php
├── assets/
│   ├── css/belm-inspection-repair.css
│   └── js/belm-inspection-repair.js
```

## Vipengele
- Sidebar: Home, **Inspection Requests (active)**, Inspection Checklists, Diagnosis,
  Repair Jobs, Waiting for Spares, Testing & Completion, Service Reports,
  Machine History, Communication, Department Analysis, My Profile.
- Topbar: "HEAVY MACHINES / RELIABLE OPERATIONS / HIGHER TOMORROW", role chip
  "WORKSHOP MANAGER / TECHNICAL DEPARTMENT", button "NEW INSPECTION" (gold).
- Kadi 4 zenye border ya rangi + chevron: Pending Inspection(12), Under Diagnosis(8),
  Repair in Progress(6), Ready for Testing(4).
- **Service Workflow** — stepper ya hatua 7: Opened → Inspection → Diagnosis →
  Waiting for Spare → Repair → Testing → Completed.
- **Active Job Cards** — search box + jedwali: Job Card, Machine, Customer,
  Technician, Current Stage (badge), Priority (Urgent/High/Normal), Next Action
  (button inayolingana na stage).
- **Latest Inspection Findings** — orodha ya mifumo (Engine/Electrical/Hydraulic/
  Mechanism) na tag ya hali (Attention/Fault Found/Normal/Check Required).
- **Promo panel** — "INSPECT DIAGNOSE REPAIR KEEP MOVING" + buttons 4: Open Checklist,
  Add Findings, Assign Technician, Generate Report.

## Kuunganisha na schema ya PostgreSQL (belm-db-schema)

```sql
-- Kadi 4
SELECT count(*) FROM job_cards WHERE status = 'received';                 -- Pending Inspection
SELECT count(*) FROM job_cards WHERE status = 'diagnosis';                -- Under Diagnosis
SELECT count(*) FROM job_cards WHERE status = 'repair_in_progress';       -- Repair in Progress
SELECT count(*) FROM job_cards WHERE status = 'testing';                  -- Ready for Testing

-- Active Job Cards
SELECT jc.job_card_no, m.machine_type, m.make, m.model, c.name AS customer,
       u.full_name AS technician, jc.status, jc.priority
FROM job_cards jc
JOIN machines m ON m.id = jc.machine_id
JOIN companies c ON c.id = jc.company_id
LEFT JOIN users u ON u.id = jc.assigned_technician_id
WHERE jc.status NOT IN ('completed','cancelled')
ORDER BY jc.priority DESC, jc.received_at;

-- Latest Inspection Findings
SELECT ici.item_name AS system, ici.result, ici.remarks, i.inspected_at
FROM inspection_checklist_items ici
JOIN inspections i ON i.id = ici.inspection_id
ORDER BY i.inspected_at DESC LIMIT 4;
```

**Kumbuka:** "Service Workflow" hapa ina hatua 7 (Opened/Inspection/Diagnosis/
Waiting for Spare/Repair/Testing/Completed) — schema ya awali ina enum ya
`job_card_status` yenye hatua 6 (`received/diagnosis/waiting_for_spare/
repair_in_progress/testing/completed`). "Opened" na "Inspection" ni sehemu
ndogo za `received` kwenye schema ya sasa. Kama unataka `job_card_status`
ivunjwe kwa usahihi zaidi (`opened` tofauti na `inspection`), niambie
nikusasishie enum na `job_card_status_history` ipasavyo.

Tags za "Attention/Fault Found/Normal/Check Required" zinaweza kutoka moja kwa
moja kwenye `inspection_checklist_items.result` (enum `checklist_result`) — kwa sasa
ina `pass/fail/not_applicable` tu; ongeza `attention` na `check_required` kama
unahitaji ubainifu huu kamili.
