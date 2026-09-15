<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
if (!belm_user_has_named_role($user, ['Super Admin', 'Engineer', 'Workshop Manager'])) {
    require_page_access($user, 'customers');
}

$pdo = db();

$countStmt = $pdo->query(
    "SELECT
        COUNT(*) FILTER (WHERE UPPER(COALESCE(status,'')) NOT IN ('COMPLETED','CANCELLED')) AS open_count,
        COUNT(*) FILTER (WHERE UPPER(COALESCE(status,'')) IN ('PROGRESS','IN_PROGRESS','DIAGNOSIS')) AS in_progress_count,
        COUNT(*) FILTER (WHERE UPPER(COALESCE(status,'')) IN ('WAITING','WAITING_FOR_SPARE','WAITING FOR SPARE')) AS waiting_spare_count,
        COUNT(*) FILTER (WHERE UPPER(COALESCE(status,''))='TESTING') AS testing_count,
        COUNT(*) FILTER (WHERE UPPER(COALESCE(status,''))='COMPLETED') AS completed_count,
        COUNT(*) FILTER (WHERE UPPER(COALESCE(status,''))='COMPLETED' AND completed_at >= date_trunc('month', CURRENT_DATE)) AS completed_month_count,
        COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date < CURRENT_DATE AND UPPER(COALESCE(status,'')) NOT IN ('COMPLETED','CANCELLED')) AS overdue_count
     FROM digital_job_cards"
);
$c = $countStmt->fetch() ?: [];

$recent = $pdo->query(
    "SELECT dj.id,dj.job_card_no,dj.title,dj.fault_description,dj.status,dj.technician_name,dj.created_at,dj.updated_at,
            c.name AS customer_name,m.brand,m.model,m.machine_type,m.fleet_number
       FROM digital_job_cards dj
       JOIN customers c ON c.id=dj.customer_id
       JOIN machines m ON m.id=dj.machine_id
      WHERE c.deleted_at IS NULL AND m.deleted_at IS NULL
      ORDER BY dj.updated_at DESC,dj.created_at DESC
      LIMIT 12"
)->fetchAll();

$recentRows = array_map(static function(array $r): array {
    $machine = trim((string)($r['brand'] ?? '') . ' ' . (string)($r['model'] ?? ''));
    if ($machine === '') $machine = (string)($r['machine_type'] ?? 'Machine');
    $fleet = trim((string)($r['fleet_number'] ?? ''));
    if ($fleet !== '') $machine .= ' · ' . $fleet;
    return [
        'id'=>(string)($r['id'] ?? ''),
        'jobCardNo'=>(string)($r['job_card_no'] ?? ''),
        'customer'=>(string)($r['customer_name'] ?? ''),
        'machine'=>$machine,
        'issue'=>(string)($r['fault_description'] ?? $r['title'] ?? ''),
        'status'=>(string)($r['status'] ?? 'OPEN'),
        'technicianName'=>(string)($r['technician_name'] ?? ''),
        'date'=>$r['created_at'] ?? null,
        'updatedAt'=>$r['updated_at'] ?? null,
    ];
}, $recent);

$techStmt = $pdo->query(
    "SELECT u.id,u.name,
            COUNT(dj.id) FILTER (WHERE UPPER(COALESCE(dj.status,'')) NOT IN ('COMPLETED','CANCELLED')) AS assigned_jobs
       FROM users u
       JOIN roles r ON r.id=u.role_id
       LEFT JOIN digital_job_cards dj ON dj.technician_id=u.id
      WHERE u.deleted_at IS NULL AND u.is_active=1
        AND LOWER(r.name) IN ('technician','engineer','workshop manager')
      GROUP BY u.id,u.name
      ORDER BY u.name"
);
$technicians = array_map(static fn(array $r): array => [
    'id'=>(string)$r['id'],
    'name'=>(string)$r['name'],
    'assignedJobs'=>(int)($r['assigned_jobs'] ?? 0),
], $techStmt->fetchAll());

$serviceDue = (int)$pdo->query(
    "SELECT COUNT(*) FROM service_due_alerts
      WHERE UPPER(COALESCE(status,'')) NOT IN ('COMPLETED','CANCELLED','CLOSED','RESOLVED')"
)->fetchColumn();

json_out([
    'ok'=>true,
    'generatedAt'=>date(DATE_ATOM),
    'jobCards'=>[
        'open'=>(int)($c['open_count'] ?? 0),
        'inProgress'=>(int)($c['in_progress_count'] ?? 0),
        'waitingForSpare'=>(int)($c['waiting_spare_count'] ?? 0),
        'testing'=>(int)($c['testing_count'] ?? 0),
        'completed'=>(int)($c['completed_count'] ?? 0),
        'completedThisMonth'=>(int)($c['completed_month_count'] ?? 0),
        'overdue'=>(int)($c['overdue_count'] ?? 0),
    ],
    'alerts'=>['serviceDue'=>$serviceDue],
    'recentJobCards'=>$recentRows,
    'technicians'=>$technicians,
]);
