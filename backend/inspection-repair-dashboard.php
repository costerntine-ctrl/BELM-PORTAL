<?php
require_once __DIR__ . '/config/helpers.php';

$user = require_auth();
if (!belm_user_has_named_role($user, ['Super Admin', 'Engineer', 'Workshop Manager'])) {
    require_any_page_access($user, ['job-cards', 'service-requests']);
}

$pdo = db();
$sql = <<<'SQL'
SELECT
  j.id,
  j.case_id,
  j.job_card_no,
  j.priority,
  j.status AS job_status,
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
  UPPER(COALESCE(bc.current_stage,'WORKSHOP_REVIEW')) AS current_stage,
  bc.current_department,
  UPPER(COALESCE(bc.status,'OPEN')) AS case_status,
  EXTRACT(EPOCH FROM (NOW() - COALESCE(bc.stage_started_at, bc.opened_at, j.created_at))) / 3600.0 AS stage_hours
FROM digital_job_cards j
JOIN breakdown_cases bc ON bc.id = j.case_id
JOIN customers c ON c.id = j.customer_id
JOIN machines m ON m.id = j.machine_id
LEFT JOIN service_requests sr
  ON UPPER(COALESCE(bc.source_type,'')) = 'SERVICE_REQUEST'
 AND sr.id = bc.source_id
LEFT JOIN users assigned_user
  ON assigned_user.id = COALESCE(j.technician_id, sr.assigned_to_id)
WHERE UPPER(COALESCE(j.status,'')) <> 'CANCELLED'
  AND c.deleted_at IS NULL
  AND m.deleted_at IS NULL
  AND (COALESCE(c.is_machinery_admin,0)=0 OR UPPER(COALESCE(bc.source_type,''))='SERVICE_REQUEST')
ORDER BY
  CASE WHEN UPPER(COALESCE(j.status,''))='COMPLETED' OR UPPER(COALESCE(bc.status,''))='COMPLETED' THEN 1 ELSE 0 END,
  COALESCE(j.updated_at, j.created_at) DESC
SQL;

$rows = $pdo->query($sql)->fetchAll() ?: [];
$counts = ['pendingInspection'=>0,'diagnosis'=>0,'waitingSpare'=>0,'repair'=>0,'testing'=>0,'completed'=>0];
$active = [];

function ir_stage_group(string $stage, string $jobStatus, string $caseStatus): string {
    if ($jobStatus === 'COMPLETED' || $caseStatus === 'COMPLETED' || $stage === 'COMPLETED') return 'COMPLETED';
    if (in_array($stage, ['WORKSHOP_REVIEW','TECHNICIAN_ASSIGNMENT','JOB_CARD_ASSIGNED'], true)) return 'INSPECTION';
    if ($stage === 'DIAGNOSIS') return 'DIAGNOSIS';
    if (in_array($stage, ['BOSS_APPROVAL','STORE_CHECK','PROCUREMENT','ACCOUNTS','PARTS_READY'], true) || $jobStatus === 'WAITING_FOR_PARTS') return 'WAITING_SPARE';
    if ($stage === 'REPAIR' || $jobStatus === 'IN_PROGRESS') return 'REPAIR';
    if (in_array($stage, ['TESTING','PENDING_APPROVAL'], true)) return 'TESTING';
    return 'INSPECTION';
}

function ir_stage_label(string $stage): string {
    return match ($stage) {
        'WORKSHOP_REVIEW' => 'Workshop Review',
        'TECHNICIAN_ASSIGNMENT' => 'Technician Dispatch',
        'JOB_CARD_ASSIGNED' => 'Assigned',
        'DIAGNOSIS' => 'Diagnosis',
        'BOSS_APPROVAL' => 'Pending Approval',
        'STORE_CHECK' => 'Store Check',
        'PROCUREMENT' => 'Procurement',
        'ACCOUNTS' => 'Accounts',
        'PARTS_READY' => 'Parts Ready',
        'REPAIR' => 'Repair',
        'TESTING' => 'Testing',
        'PENDING_APPROVAL' => 'Completion Approval',
        'COMPLETED' => 'Completed',
        default => ucwords(strtolower(str_replace('_',' ', $stage ?: 'Inspection'))),
    };
}

function ir_next_action(string $stage): string {
    return match ($stage) {
        'WORKSHOP_REVIEW' => 'Review Job Card',
        'TECHNICIAN_ASSIGNMENT' => 'Dispatch Technician',
        'JOB_CARD_ASSIGNED' => 'Technician Receive',
        'DIAGNOSIS' => 'Review Diagnosis',
        'BOSS_APPROVAL' => 'Review Approval',
        'STORE_CHECK' => 'Check Spare',
        'PROCUREMENT' => 'Procurement Follow-up',
        'ACCOUNTS' => 'Accounts Follow-up',
        'PARTS_READY' => 'Start Repair',
        'REPAIR' => 'Continue Repair',
        'TESTING' => 'Review Testing',
        'PENDING_APPROVAL' => 'Approve Completion',
        'COMPLETED' => 'View Job Card',
        default => 'Open Job Card',
    };
}

foreach ($rows as $row) {
    $stage = strtoupper((string)($row['current_stage'] ?? 'WORKSHOP_REVIEW'));
    $jobStatus = strtoupper((string)($row['job_status'] ?? 'OPEN'));
    $caseStatus = strtoupper((string)($row['case_status'] ?? 'OPEN'));
    $group = ir_stage_group($stage, $jobStatus, $caseStatus);

    if ($group === 'COMPLETED') $counts['completed']++;
    elseif ($group === 'INSPECTION') $counts['pendingInspection']++;
    elseif ($group === 'DIAGNOSIS') $counts['diagnosis']++;
    elseif ($group === 'WAITING_SPARE') $counts['waitingSpare']++;
    elseif ($group === 'REPAIR') $counts['repair']++;
    elseif ($group === 'TESTING') $counts['testing']++;

    if ($group === 'COMPLETED') continue;

    $machine = trim(implode(' ', array_filter([trim((string)($row['brand'] ?? '')), trim((string)($row['model'] ?? ''))])));
    if ($machine === '') $machine = trim((string)($row['machine_type'] ?? 'Machine')) ?: 'Machine';
    $fleet = trim((string)($row['fleet_number'] ?? ''));
    if ($fleet !== '') $machine .= ' (' . $fleet . ')';
    $priority = strtoupper(trim((string)($row['priority'] ?? 'NORMAL')));
    if (!in_array($priority, ['URGENT','HIGH','NORMAL','LOW'], true)) $priority = 'NORMAL';

    $active[] = [
        'id'=>(string)$row['id'], 'caseId'=>(string)$row['case_id'], 'jobCardNo'=>(string)($row['job_card_no'] ?? ''),
        'machine'=>$machine, 'customer'=>(string)($row['customer_name'] ?? ''),
        'technician'=>trim((string)($row['technician_name'] ?? '')) ?: 'Unassigned',
        'stage'=>$stage, 'stageLabel'=>ir_stage_label($stage), 'stageGroup'=>$group,
        'department'=>(string)($row['current_department'] ?? ''), 'priority'=>$priority,
        'issue'=>(string)($row['issue'] ?? 'Job Card'), 'nextAction'=>ir_next_action($stage),
        'stageHours'=>round((float)($row['stage_hours'] ?? 0),1), 'dueDate'=>$row['due_date'] ?? null,
        'updatedAt'=>$row['updated_at'] ?: $row['created_at'],
    ];
}

json_out(['ok'=>true,'generatedAt'=>date(DATE_ATOM),'counts'=>$counts,'activeJobCards'=>array_slice($active,0,100),'totalActive'=>count($active)]);
