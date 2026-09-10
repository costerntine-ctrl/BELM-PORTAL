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

// Workshop Manager dashboard must show the real Job Cards already present in
// PostgreSQL, not the static sample rows supplied with the visual template.
// Older Service Request Job Cards can have the assignment stored on the source
// Service Request while the copied technician_id/name on digital_job_cards is
// still blank. Use the same effective-assignment fallback used by Billing.
$recentJobCards = [];
try {
    $recentStmt = $pdo->query(<<<'SQL'
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
  CASE
    WHEN (
      UPPER(COALESCE(bc.status,'')) <> 'COMPLETED'
      AND UPPER(COALESCE(bc.current_stage,'')) <> 'COMPLETED'
      AND UPPER(COALESCE(j.status,'')) <> 'COMPLETED'
      AND j.due_date IS NOT NULL
      AND j.due_date < CURRENT_DATE
    ) THEN 'OVERDUE'
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
  END AS display_status
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
ORDER BY
  CASE WHEN UPPER(COALESCE(j.status,'')) = 'COMPLETED' OR UPPER(COALESCE(bc.status,'')) = 'COMPLETED' THEN 1 ELSE 0 END,
  COALESCE(j.updated_at, j.created_at) DESC,
  j.created_at DESC
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
            'date' => $job['updated_at'] ?: $job['created_at'],
            'dueDate' => $job['due_date'] ?? null,
        ];
    }
} catch (Throwable $error) {
    error_log('Workshop dashboard recent Job Cards sync failed: ' . $error->getMessage());
}

// Read active BELM Technician accounts directly here so Workshop Manager does
// not need the separate Roles-manager permission just to see technicians.
// "Assigned" means the technician currently owns one or more active Job Cards;
// otherwise the active technician is shown as "Available". This avoids
// pretending that account activity is a physical attendance clock.
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
