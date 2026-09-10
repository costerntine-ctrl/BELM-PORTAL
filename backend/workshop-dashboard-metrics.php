<?php
require_once __DIR__ . '/config/helpers.php';

$user = require_auth();
if (!belm_user_has_named_role($user, ['Super Admin', 'Engineer', 'Workshop Manager'])) {
    require_any_page_access($user, ['overview', 'roles', 'job-cards', 'service-requests']);
}

$pdo = db();

// Keep the Workshop Dashboard "Overdue" meaning synchronized with the live
// Breakdown Workflow. A Job Card is overdue when either its explicit due date
// has passed OR the current workflow stage has exceeded the same SLA used by
// backend/api/breakdown_workflow.php.
$sql = <<<'SQL'
WITH job_state AS (
  SELECT
    j.id,
    j.completed_at,
    j.due_date,
    bc.current_stage,
    EXTRACT(EPOCH FROM (NOW() - COALESCE(bc.stage_started_at, bc.opened_at, j.created_at))) / 3600.0 AS stage_hours,
    CASE UPPER(COALESCE(bc.current_stage,''))
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
    END AS stage_sla_hours,
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
)
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
      AND (
        (due_date IS NOT NULL AND due_date < CURRENT_DATE)
        OR (stage_sla_hours IS NOT NULL AND stage_hours > stage_sla_hours)
      )
  ) AS overdue
FROM job_state
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

// Workshop Manager dashboard must show the real Job Cards already present in
// PostgreSQL, not static visual-template rows. Older Service Request Job Cards
// may keep the assignment on the source Service Request, so use that as the
// safe fallback when the Job Card copy is blank.
$recentJobCards = [];
try {
    $recentStmt = $pdo->query(<<<'SQL'
WITH recent_state AS (
  SELECT
    j.id,
    j.job_card_no,
    COALESCE(NULLIF(TRIM(j.title),''), NULLIF(TRIM(j.fault_description),''), 'Job Card') AS issue,
    j.created_at,
    j.updated_at,
    j.due_date,
    c.name AS customer_name,
    m.brand,
    m.model,
    m.machine_type,
    m.fleet_number,
    COALESCE(j.technician_id, sr.assigned_to_id) AS technician_id,
    COALESCE(NULLIF(TRIM(j.technician_name),''), assigned_user.name) AS technician_name,
    UPPER(COALESCE(bc.current_stage,'')) AS current_stage,
    bc.current_department,
    EXTRACT(EPOCH FROM (NOW() - COALESCE(bc.stage_started_at, bc.opened_at, j.created_at))) / 3600.0 AS stage_hours,
    CASE UPPER(COALESCE(bc.current_stage,''))
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
    END AS stage_sla_hours,
    UPPER(COALESCE(bc.status,'')) AS case_status,
    UPPER(COALESCE(j.status,'')) AS job_status,
    CASE
      WHEN UPPER(COALESCE(bc.status,'')) = 'COMPLETED'
        OR UPPER(COALESCE(bc.current_stage,'')) = 'COMPLETED'
        OR UPPER(COALESCE(j.status,'')) = 'COMPLETED' THEN 'COMPLETED'
      WHEN UPPER(COALESCE(bc.current_stage,'')) = 'TESTING' THEN 'TESTING'
      WHEN UPPER(COALESCE(j.status,'')) = 'WAITING_FOR_PARTS'
        OR UPPER(COALESCE(bc.current_stage,'')) IN ('BOSS_APPROVAL','STORE_CHECK','PROCUREMENT','ACCOUNTS')
        OR EXISTS (
          SELECT 1 FROM breakdown_spare_requests bsr
          WHERE bsr.job_card_id = j.id
            AND UPPER(COALESCE(bsr.status,'')) NOT IN ('REJECTED','PARTS_READY','CANCELLED','COMPLETED')
        ) THEN 'WAITING'
      WHEN NULLIF(TRIM(COALESCE(j.diagnosis,'')), '') IS NOT NULL
        OR j.started_at IS NOT NULL THEN 'PROGRESS'
      ELSE 'OPEN'
    END AS base_status
  FROM digital_job_cards j
  JOIN breakdown_cases bc ON bc.id = j.case_id
  JOIN customers c ON c.id = j.customer_id
  LEFT JOIN machines m ON m.id = j.machine_id
  LEFT JOIN service_requests sr
    ON UPPER(COALESCE(bc.source_type,'')) = 'SERVICE_REQUEST'
   AND sr.id = bc.source_id
  LEFT JOIN users assigned_user
    ON assigned_user.id = COALESCE(j.technician_id, sr.assigned_to_id)
  WHERE UPPER(COALESCE(j.status,'')) <> 'CANCELLED'
    AND c.deleted_at IS NULL
    AND (COALESCE(c.is_machinery_admin,0)=0 OR UPPER(COALESCE(bc.source_type,''))='SERVICE_REQUEST')
)
SELECT *,
  CASE
    WHEN base_status <> 'COMPLETED' AND (
      (due_date IS NOT NULL AND due_date < CURRENT_DATE)
      OR (stage_sla_hours IS NOT NULL AND stage_hours > stage_sla_hours)
    ) THEN 'OVERDUE'
    ELSE base_status
  END AS display_status,
  CASE
    WHEN base_status <> 'COMPLETED'
      AND stage_sla_hours IS NOT NULL
      AND stage_hours > stage_sla_hours
    THEN GREATEST(stage_hours - stage_sla_hours, 0)
    ELSE 0
  END AS delay_hours
FROM recent_state
ORDER BY
  CASE WHEN base_status = 'COMPLETED' THEN 1 ELSE 0 END,
  COALESCE(updated_at, created_at) DESC,
  created_at DESC
LIMIT 10
SQL);
    foreach ($recentStmt->fetchAll() as $job) {
        $machineParts = array_values(array_filter([
            trim((string)($job['brand'] ?? '')),
            trim((string)($job['model'] ?? '')),
        ]));
        $machineLabel = trim(implode(' ', $machineParts));
        if ($machineLabel === '') $machineLabel = trim((string)($job['machine_type'] ?? 'Machine')) ?: 'Machine';
        $fleet = trim((string)($job['fleet_number'] ?? ''));
        if ($fleet !== '') $machineLabel .= ' (' . $fleet . ')';
        $recentJobCards[] = [
            'id' => (string)$job['id'],
            'jobCardNo' => (string)($job['job_card_no'] ?? ''),
            'machine' => $machineLabel,
            'customer' => (string)($job['customer_name'] ?? ''),
            'issue' => (string)($job['issue'] ?? 'Job Card'),
            'status' => (string)($job['display_status'] ?? 'OPEN'),
            'technicianId' => $job['technician_id'] !== null ? (string)$job['technician_id'] : null,
            'technicianName' => trim((string)($job['technician_name'] ?? '')),
            'currentStage' => (string)($job['current_stage'] ?? ''),
            'department' => (string)($job['current_department'] ?? ''),
            'stageHours' => round((float)($job['stage_hours'] ?? 0), 1),
            'slaHours' => $job['stage_sla_hours'] !== null ? (float)$job['stage_sla_hours'] : null,
            'delayHours' => round((float)($job['delay_hours'] ?? 0), 1),
            'date' => $job['updated_at'] ?: $job['created_at'],
            'dueDate' => $job['due_date'] ?? null,
        ];
    }
} catch (Throwable $error) {
    error_log('Workshop dashboard recent Job Cards sync failed: ' . $error->getMessage());
}

// Read active BELM Technician accounts directly here so Workshop Manager does
// not need the separate Roles-manager permission just to see technicians.
$technicians = [];
try {
    $techStmt = $pdo->query(<<<'SQL'
WITH effective_jobs AS (
  SELECT
    j.id,
    COALESCE(j.technician_id, sr.assigned_to_id) AS technician_id
  FROM digital_job_cards j
  JOIN breakdown_cases bc ON bc.id = j.case_id
  JOIN customers c ON c.id = j.customer_id
  LEFT JOIN service_requests sr
    ON UPPER(COALESCE(bc.source_type,'')) = 'SERVICE_REQUEST'
   AND sr.id = bc.source_id
  WHERE UPPER(COALESCE(j.status,'')) NOT IN ('COMPLETED','CANCELLED')
    AND UPPER(COALESCE(bc.status,'')) <> 'COMPLETED'
    AND c.deleted_at IS NULL
    AND c.is_active = 1
    AND (COALESCE(c.is_machinery_admin,0)=0 OR UPPER(COALESCE(bc.source_type,''))='SERVICE_REQUEST')
), technician_users AS (
  SELECT DISTINCT u.id, u.name, u.email, u.assigned_customer_id
  FROM users u
  JOIN roles primary_role ON primary_role.id = u.role_id
  WHERE u.deleted_at IS NULL
    AND u.is_active = 1
    AND (
      primary_role.name = 'Technician'
      OR EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN roles extra_role ON extra_role.id = ur.role_id
        WHERE ur.user_id = u.id
          AND extra_role.deleted_at IS NULL
          AND extra_role.name = 'Technician'
      )
    )
)
SELECT
  tu.id,
  tu.name,
  tu.email,
  tu.assigned_customer_id,
  assigned_customer.name AS assigned_customer_name,
  COUNT(ej.id) AS assigned_jobs
FROM technician_users tu
LEFT JOIN customers assigned_customer ON assigned_customer.id = tu.assigned_customer_id
LEFT JOIN effective_jobs ej ON ej.technician_id = tu.id
GROUP BY tu.id, tu.name, tu.email, tu.assigned_customer_id, assigned_customer.name
ORDER BY COUNT(ej.id) DESC, tu.name ASC
SQL);
    foreach ($techStmt->fetchAll() as $tech) {
        $assignedJobs = (int)($tech['assigned_jobs'] ?? 0);
        $technicians[] = [
            'id' => (string)$tech['id'],
            'name' => (string)($tech['name'] ?? 'Technician'),
            'email' => (string)($tech['email'] ?? ''),
            'assignedCustomerId' => $tech['assigned_customer_id'] !== null ? (string)$tech['assigned_customer_id'] : null,
            'assignedCustomerName' => (string)($tech['assigned_customer_name'] ?? ''),
            'assignedJobs' => $assignedJobs,
            'workStatus' => $assignedJobs > 0 ? 'ASSIGNED' : 'AVAILABLE',
        ];
    }
} catch (Throwable $error) {
    error_log('Workshop dashboard Technician sync failed: ' . $error->getMessage());
}

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
    'recentJobCards' => $recentJobCards,
    'technicians' => $technicians,
    'alerts' => [
        'serviceDue' => $serviceDue,
        'lowStock' => $lowStock,
    ],
]);
