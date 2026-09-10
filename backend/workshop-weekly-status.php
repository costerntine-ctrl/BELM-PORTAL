<?php
require_once __DIR__ . '/config/helpers.php';

$user = require_auth();
if (!belm_user_has_named_role($user, ['Super Admin', 'Engineer', 'Workshop Manager'])) {
    require_any_page_access($user, ['overview', 'roles', 'job-cards', 'service-requests']);
}

$pdo = db();

// The Workshop Workload chart must show real workflow condition, not sample bars.
// GREEN  = completed work for that day.
// YELLOW = work still active and still inside its due-date / workflow SLA.
// RED    = active work already overdue by due date or delayed beyond stage SLA.
//
// Each day is a true snapshot of the current ISO week. Active work is counted on
// every day it remained open, while completed work appears on its completion day.
$sql = <<<'SQL'
WITH days AS (
  SELECT
    gs::date AS day,
    CASE
      WHEN gs::date < CURRENT_DATE THEN gs + INTERVAL '1 day'
      WHEN gs::date = CURRENT_DATE THEN NOW()
      ELSE NULL
    END AS snapshot_at
  FROM generate_series(
    date_trunc('week', CURRENT_DATE)::date,
    date_trunc('week', CURRENT_DATE)::date + 6,
    INTERVAL '1 day'
  ) gs
), jobs AS (
  SELECT
    j.id,
    j.case_id,
    j.created_at,
    COALESCE(j.completed_at, bc.closed_at) AS completed_at,
    j.due_date,
    bc.opened_at,
    bc.current_stage,
    bc.stage_started_at
  FROM digital_job_cards j
  JOIN breakdown_cases bc ON bc.id = j.case_id
  JOIN customers c ON c.id = j.customer_id
  WHERE UPPER(COALESCE(j.status,'')) <> 'CANCELLED'
    AND c.deleted_at IS NULL
    AND (COALESCE(c.is_machinery_admin,0)=0 OR UPPER(COALESCE(bc.source_type,''))='SERVICE_REQUEST')
), snapshots AS (
  SELECT
    d.day,
    d.snapshot_at,
    j.id,
    j.created_at,
    j.completed_at,
    j.due_date,
    COALESCE(NULLIF(UPPER(TRIM(ev.stage)), ''), 'WORKSHOP_REVIEW') AS effective_stage,
    CASE
      WHEN d.day = CURRENT_DATE
        AND UPPER(COALESCE(j.current_stage,'')) = COALESCE(NULLIF(UPPER(TRIM(ev.stage)), ''), UPPER(COALESCE(j.current_stage,'')))
      THEN COALESCE(j.stage_started_at, ev.created_at, j.opened_at, j.created_at)
      ELSE COALESCE(ev.created_at, j.opened_at, j.created_at)
    END AS stage_started_at
  FROM days d
  JOIN jobs j
    ON d.snapshot_at IS NOT NULL
   AND j.created_at <= d.snapshot_at
   AND (j.completed_at IS NULL OR j.completed_at >= d.day::timestamp)
  LEFT JOIN LATERAL (
    SELECT e.stage, e.created_at
    FROM breakdown_case_events e
    WHERE e.case_id = j.case_id
      AND e.created_at <= d.snapshot_at
    ORDER BY e.created_at DESC
    LIMIT 1
  ) ev ON TRUE
), classified AS (
  SELECT
    day,
    CASE effective_stage
      WHEN 'WORKSHOP_REVIEW' THEN 4
      WHEN 'TECHNICIAN_ASSIGNMENT' THEN 4
      WHEN 'JOB_CARD_ASSIGNED' THEN 4
      WHEN 'DIAGNOSIS' THEN 8
      WHEN 'BOSS_APPROVAL' THEN 4
      WHEN 'STORE_CHECK' THEN 6
      WHEN 'PROCUREMENT' THEN 24
      WHEN 'ACCOUNTS' THEN 8
      WHEN 'PARTS_READY' THEN 4
      WHEN 'REPAIR' THEN 24
      WHEN 'TESTING' THEN 8
      WHEN 'PENDING_APPROVAL' THEN 8
      ELSE NULL
    END AS sla_hours,
    snapshot_at,
    stage_started_at,
    completed_at,
    due_date
  FROM snapshots
), status_rows AS (
  SELECT
    day,
    CASE
      WHEN completed_at IS NOT NULL AND completed_at <= snapshot_at THEN 'GREEN'
      WHEN (due_date IS NOT NULL AND due_date < day)
        OR (
          sla_hours IS NOT NULL
          AND stage_started_at IS NOT NULL
          AND EXTRACT(EPOCH FROM (snapshot_at - stage_started_at)) / 3600.0 > sla_hours
        ) THEN 'RED'
      ELSE 'YELLOW'
    END AS status_color
  FROM classified
)
SELECT
  d.day,
  COUNT(*) FILTER (WHERE s.status_color = 'GREEN')::int AS green,
  COUNT(*) FILTER (WHERE s.status_color = 'YELLOW')::int AS yellow,
  COUNT(*) FILTER (WHERE s.status_color = 'RED')::int AS red
FROM days d
LEFT JOIN status_rows s ON s.day = d.day
GROUP BY d.day
ORDER BY d.day
SQL;

$rows = $pdo->query($sql)->fetchAll() ?: [];
$data = [];
foreach ($rows as $row) {
    $day = (string)$row['day'];
    $green = (int)($row['green'] ?? 0);
    $yellow = (int)($row['yellow'] ?? 0);
    $red = (int)($row['red'] ?? 0);
    $data[] = [
        'date' => $day,
        'day' => date('D', strtotime($day)),
        'green' => $green,
        'yellow' => $yellow,
        'red' => $red,
        'total' => $green + $yellow + $red,
    ];
}

json_out([
    'ok' => true,
    'generatedAt' => date(DATE_ATOM),
    'weekStart' => $data[0]['date'] ?? null,
    'days' => $data,
    'legend' => [
        'green' => 'Completed',
        'yellow' => 'Active / Within SLA',
        'red' => 'Overdue / Delayed',
    ],
]);
