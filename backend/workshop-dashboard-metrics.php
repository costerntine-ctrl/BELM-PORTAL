<?php
require_once __DIR__ . '/config/helpers.php';

$user = require_auth();
if (!belm_user_has_named_role($user, ['Super Admin', 'Engineer', 'Workshop Manager'])) {
    require_any_page_access($user, ['overview', 'roles', 'job-cards', 'service-requests']);
}

$pdo = db();

$sql = <<<'SQL'
SELECT
  COUNT(*) FILTER (WHERE bucket = 'OPEN') AS open_jobs,
  COUNT(*) FILTER (WHERE bucket = 'PROGRESS') AS in_progress,
  COUNT(*) FILTER (WHERE bucket = 'WAITING') AS waiting_for_spare,
  COUNT(*) FILTER (WHERE bucket = 'TESTING') AS testing,
  COUNT(*) FILTER (WHERE bucket = 'COMPLETED') AS completed_total,
  COUNT(*) FILTER (
    WHERE bucket = 'COMPLETED'
      AND completed_at >= date_trunc('month', CURRENT_DATE)
      AND completed_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
  ) AS completed_this_month,
  COUNT(*) FILTER (
    WHERE bucket <> 'COMPLETED'
      AND due_date IS NOT NULL
      AND due_date < CURRENT_DATE
  ) AS overdue
FROM (
  SELECT
    j.completed_at,
    j.due_date,
    CASE
      WHEN UPPER(COALESCE(bc.status,'')) = 'COMPLETED'
        OR UPPER(COALESCE(bc.current_stage,'')) = 'COMPLETED'
        OR UPPER(COALESCE(j.status,'')) = 'COMPLETED' THEN 'COMPLETED'
      WHEN UPPER(COALESCE(bc.current_stage,'')) = 'TESTING' THEN 'TESTING'
      WHEN UPPER(COALESCE(j.status,'')) = 'WAITING_FOR_PARTS'
        OR UPPER(COALESCE(bc.current_stage,'')) IN ('BOSS_APPROVAL','STORE_CHECK','PROCUREMENT','ACCOUNTS')
        OR EXISTS (
          SELECT 1 FROM breakdown_spare_requests sr
          WHERE sr.job_card_id = j.id
            AND UPPER(COALESCE(sr.status,'')) NOT IN ('REJECTED','PARTS_READY','CANCELLED','COMPLETED')
        ) THEN 'WAITING'
      WHEN NULLIF(TRIM(COALESCE(j.diagnosis,'')), '') IS NOT NULL
        OR j.started_at IS NOT NULL THEN 'PROGRESS'
      ELSE 'OPEN'
    END AS bucket
  FROM digital_job_cards j
  JOIN breakdown_cases bc ON bc.id = j.case_id
  JOIN customers c ON c.id = j.customer_id
  WHERE UPPER(COALESCE(j.status,'')) <> 'CANCELLED'
    AND c.deleted_at IS NULL
    AND (COALESCE(c.is_machinery_admin,0)=0 OR UPPER(COALESCE(bc.source_type,''))='SERVICE_REQUEST')
) q
SQL;

$row = $pdo->query($sql)->fetch() ?: [];
$serviceDue = (int)$pdo->query(
    "SELECT COUNT(*) FROM machines m
     JOIN customers c ON c.id=m.customer_id
     WHERE m.deleted_at IS NULL AND c.deleted_at IS NULL AND c.is_active=1
       AND UPPER(COALESCE(m.service_kit,'')) ~ '(DUE|OVERDUE|REQUIRED)'"
)->fetchColumn();
$lowStock = (int)$pdo->query(
    "SELECT COUNT(*) FROM spare_parts WHERE deleted_at IS NULL AND stock_qty <= COALESCE(reorder_threshold,5)"
)->fetchColumn();

json_out([
    'ok' => true,
    'generatedAt' => date(DATE_ATOM),
    'jobCards' => [
        'open' => (int)($row['open_jobs'] ?? 0),
        'inProgress' => (int)($row['in_progress'] ?? 0),
        'waitingForSpare' => (int)($row['waiting_for_spare'] ?? 0),
        'testing' => (int)($row['testing'] ?? 0),
        'completed' => (int)($row['completed_total'] ?? 0),
        'completedThisMonth' => (int)($row['completed_this_month'] ?? 0),
        'overdue' => (int)($row['overdue'] ?? 0),
    ],
    'alerts' => [
        'serviceDue' => $serviceDue,
        'lowStock' => $lowStock,
    ],
]);
