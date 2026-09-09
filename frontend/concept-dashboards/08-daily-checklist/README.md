# BELM Daily Machine Checklist — Template

Replica ya "Daily Machine Checklist" uliyotuma — ukurasa wa `operator` ndani ya
sidebar ile ile ya Machine Operator Dashboard, na "Daily Checklist" active.

## Muundo
```
belm-daily-checklist/
├── index.html                              # badilisha kuwa daily-checklist.php
├── assets/
│   ├── css/belm-daily-checklist.css
│   └── js/belm-daily-checklist.js          # tayari ina mwingiliano halisi (angalia chini)
```

## Vipengele + mwingiliano uliojengwa tayari (JS)
- Saa/tarehe **halisi** kwenye topbar na "Date & Time" ya meta card (inasasisha
  kila sekunde 30, si tuli).
- Stepper ya "Engine Hours" (▲/▼) inaongeza/inapunguza thamani moja kwa moja.
- Kila dropdown ya "Select status" **inabadilisha rangi ya mpaka/maandishi**
  kulingana na uchaguzi: Normal=kijani, Attention=gold, Unsafe/Stop=nyekundu
  (pamoja na background nyekundu hafifu), Not Applicable=kijivu — sawa na
  "Checklist Status Guide".
- "Attach Photo" — "Choose File" inaonyesha jina la faili lililochaguliwa.
- "SAVE CHECKLIST" inahitaji kwanza checkbox "I confirm this checklist is
  accurate." kuwa imewekwa tiki; ikiwa item yoyote ina "Unsafe / Stop", inatoa
  onyo kama lilivyoainishwa kwenye "Important" panel.
- "REPORT UNSAFE CONDITION" — kitufe tofauti cha haraka.

Vipengele vya kuona (visual, sawa na picha):
- Info bar: picha ya mashine (placeholder SVG) + Checklist No./Machine/Fleet No.
  + Customer/Operator/Date&Time/Engine Hours + Checklist Status Guide (legend).
- Vikundi 7 vya ukaguzi: Engine System, Transmission, Brakes & Steering,
  Hydraulic System, Electrical & Lights, Tyres & Safety, Working Parameters —
  kila item ina dropdown + comment button.
- "Important" panel (nyekundu) inayoeleza matokeo ya "Unsafe / Stop".
- Operator Comment (textarea), Attach Photo, confirmation checkbox + info bullets.
- Buttons 4: SAVE CHECKLIST (kijani), REPORT UNSAFE CONDITION (nyekundu),
  DOWNLOAD PDF (bluu), EXPORT CSV (bluu).

## Kuunganisha na schema ya PostgreSQL (belm-db-schema)

Muundo wa sasa (`inspections` + `inspection_checklist_items`) unafaa kwa hii,
lakini `checklist_result` enum ina `pass/fail/not_applicable` tu — dashibodi hii
inahitaji hasa **hatua nne**: Normal / Attention / Unsafe-Stop / Not Applicable.

```sql
-- Pendekezo la kusasisha enum (badala ya pass/fail)
ALTER TYPE checklist_result RENAME TO checklist_result_old;
CREATE TYPE checklist_result AS ENUM ('normal','attention','unsafe','not_applicable');
-- (hatua ya kuhamisha data ya zamani ikihitajika)

-- Kuhifadhi checklist moja (baada ya SAVE CHECKLIST)
INSERT INTO inspections (job_card_id, inspector_id, overall_findings)
VALUES (NULL, :operator_user_id, :operator_comment) RETURNING id;

INSERT INTO inspection_checklist_items (inspection_id, item_name, result, remarks)
VALUES (:inspection_id, 'Engine oil level', :status, :per_item_comment);
-- rudia kwa kila item (jumla ya vitu ~26 kwenye vikundi 7)

-- "Unsafe / Stop" kiotomatiki:
INSERT INTO machine_alerts (machine_id, alert_type, severity, message)
VALUES (:machine_id, 'custom', 'critical', :item_name || ': Unsafe / Stop reported');
```

**Kumbuka:** Kama ilivyotajwa kwenye README ya Machine Operator Dashboard,
schema ya awali haina bado uhusiano wa moja-kwa-moja "operator ↔ assigned
machine", wala jedwali maalum la "one checklist per machine per day" lock
(sheria "Submitted checklist locks automatically at 00:00" itahitaji column
`locked_at` au `checklist_date` yenye UNIQUE(machine_id, checklist_date)
kwenye jedwali jipya `daily_checklists` badala ya kutumia `inspections` za
jumla). Niambie ukitaka nikubuni jedwali hilo maalum.
