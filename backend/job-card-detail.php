<?php
require_once __DIR__ . '/config/helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$payload = current_token_payload();
if (!$payload) json_error('Not authenticated', 401);

$id = trim((string)($_GET['id'] ?? ''));
$jobCardNo = trim((string)($_GET['jobCardNo'] ?? ''));
if ($id === '' && $jobCardNo === '') json_error('Job Card id or number is required.', 422);

function jc_detail_context(array $payload): array {
    if (($payload['type'] ?? '') === 'customer') {
        $customer = require_customer_auth();
        $isOwner = ($customer['actorType'] ?? '') === 'owner';
        $role = strtolower(trim((string)($customer['customerRole'] ?? ($isOwner ? 'owner' : ''))));
        return [
            'kind' => 'customer',
            'customerId' => (string)($customer['id'] ?? ''),
            'actorId' => (string)($customer['actorId'] ?? $customer['id'] ?? ''),
            'actorName' => (string)($customer['actorName'] ?? $customer['name'] ?? 'Customer User'),
            'role' => $role,
            'isOwner' => $isOwner,
            'isTechnician' => $role === 'technician',
        ];
    }

    $user = require_auth();
    $roleName = trim((string)($user['roleName'] ?? ''));
    $isTechnician = strcasecmp($roleName, 'Technician') === 0;
    if (!$isTechnician) require_any_page_access($user, ['job-cards','service-requests']);
    return [
        'kind' => 'belm',
        'customerId' => (string)($user['assignedCustomerId'] ?? ''),
        'actorId' => (string)($user['id'] ?? ''),
        'actorName' => (string)($user['name'] ?? 'BELM'),
        'role' => strtolower($roleName),
        'roleName' => $roleName,
        'isOwner' => false,
        'isTechnician' => $isTechnician,
    ];
}

function jc_detail_load(string $id, string $jobCardNo): array {
    $sql = "SELECT j.*,
                   bc.current_stage,bc.current_department,bc.status AS case_status,bc.blocker_reason,
                   bc.source_type,bc.source_id,bc.opened_at AS case_opened_at,
                   c.name AS customer_name,c.address AS customer_address,
                   m.brand,m.model,m.machine_type,m.serial_number,m.fleet_number,m.reg_number
            FROM digital_job_cards j
            JOIN breakdown_cases bc ON bc.id=j.case_id
            JOIN customers c ON c.id=j.customer_id
            JOIN machines m ON m.id=j.machine_id
            WHERE ";
    if ($id !== '') {
        $stmt = db()->prepare($sql . 'j.id=? LIMIT 1');
        $stmt->execute([$id]);
    } else {
        $stmt = db()->prepare($sql . 'UPPER(j.job_card_no)=UPPER(?) LIMIT 1');
        $stmt->execute([$jobCardNo]);
    }
    $job = $stmt->fetch();
    if (!$job) json_error('Job Card not found.', 404);
    return $job;
}

function jc_detail_access(array $ctx, array $job): void {
    if ($ctx['kind'] === 'customer') {
        if ((string)$job['customer_id'] !== (string)$ctx['customerId']) json_error('Not allowed.', 403);
        if (!empty($ctx['isTechnician']) && (string)$job['technician_id'] !== (string)$ctx['actorId']) {
            json_error('This Job Card is not assigned to this Technician.', 403);
        }
        return;
    }
    if (!empty($ctx['isTechnician']) && (string)$job['technician_id'] !== (string)$ctx['actorId']) {
        json_error('This Job Card is not assigned to this Technician.', 403);
    }
}

function jc_detail_can_cancel(array $ctx, array $job): bool {
    $status = strtoupper(trim((string)($job['status'] ?? '')));
    if (in_array($status, ['COMPLETED','CANCELLED'], true)) return false;
    if (!empty($ctx['isTechnician'])) return (string)$job['technician_id'] === (string)$ctx['actorId'];
    if ($ctx['kind'] === 'customer') return !empty($ctx['isOwner']) || in_array($ctx['role'], ['admin','workshop_manager'], true);
    return in_array(strtolower((string)($ctx['roleName'] ?? '')), ['super admin','workshop manager','engineer'], true);
}

$ctx = jc_detail_context($payload);
$job = jc_detail_load($id, $jobCardNo);
jc_detail_access($ctx, $job);

if ($method === 'PUT') {
    $b = body();
    $action = strtolower(trim((string)($b['action'] ?? '')));
    if ($action !== 'cancel') json_error('Unsupported Job Card action.', 422);
    if (!jc_detail_can_cancel($ctx, $job)) json_error('You are not allowed to cancel this Job Card.', 403);
    $reason = trim((string)($b['reason'] ?? ''));
    if ($reason === '') json_error('Cancellation reason is required.', 422);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare("UPDATE digital_job_cards SET status='CANCELLED',updated_at=NOW() WHERE id=?")
            ->execute([(string)$job['id']]);
        $pdo->prepare(
            'INSERT INTO breakdown_case_events
             (id,case_id,stage,department,action,note,actor_type,actor_id,actor_name,created_at)
             VALUES (?,?,?,?,?,?,?,?,?,NOW())'
        )->execute([
            uuid(), (string)$job['case_id'], (string)($job['current_stage'] ?: 'WORKSHOP_REVIEW'), 'Workshop',
            'JOB_CARD_CANCELLED', $reason, $ctx['kind'], $ctx['actorId'] ?: null, $ctx['actorName']
        ]);

        $active = $pdo->prepare("SELECT COUNT(*) FROM digital_job_cards WHERE case_id=? AND status NOT IN ('COMPLETED','CANCELLED')");
        $active->execute([(string)$job['case_id']]);
        if ((int)$active->fetchColumn() === 0) {
            $pdo->prepare("UPDATE breakdown_cases
                          SET current_stage='WORKSHOP_REVIEW',current_department='Workshop',status='OPEN',
                              blocker_reason=?,stage_started_at=NOW(),updated_at=NOW(),closed_at=NULL
                          WHERE id=?")
                ->execute(['Job Card cancelled - Workshop review / reassignment required. Reason: '.$reason, (string)$job['case_id']]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    json_out(['ok'=>true,'status'=>'CANCELLED','jobCardNo'=>$job['job_card_no']]);
}

if ($method !== 'GET') json_error('Method not allowed.', 405);

$eventsStmt = db()->prepare('SELECT stage,department,action,note,actor_name,created_at FROM breakdown_case_events WHERE case_id=? ORDER BY created_at ASC');
$eventsStmt->execute([(string)$job['case_id']]);
$events = $eventsStmt->fetchAll();

// Assigned Technicians receive the maintenance history needed to do the job,
// but not unrelated Finance/Accounts commentary from the case.
if (!empty($ctx['isTechnician'])) {
    $events = array_values(array_filter($events, static function(array $event): bool {
        $department = strtoupper((string)($event['department'] ?? ''));
        $action = strtoupper((string)($event['action'] ?? ''));
        if (str_contains($department, 'ACCOUNTS')) return false;
        return str_contains($department, 'TECHNICIAN')
            || str_contains($department, 'WORKSHOP')
            || str_contains($department, 'PROCUREMENT')
            || str_contains($department, 'STORE')
            || str_contains($action, 'JOB_CARD')
            || str_contains($action, 'SPARE')
            || str_contains($action, 'PARTS')
            || str_contains($action, 'TEST')
            || str_contains($action, 'DIAGNOSIS')
            || str_contains($action, 'REPAIR');
    }));
}

$sparesStmt = db()->prepare('SELECT spare_name,part_number,quantity,unit,status,requested_by_name,requested_at,updated_at FROM breakdown_spare_requests WHERE job_card_id=? ORDER BY requested_at ASC');
$sparesStmt->execute([(string)$job['id']]);
$spares = $sparesStmt->fetchAll();

$job['machineLabel'] = trim((string)($job['brand'] ?? '').' '.(string)($job['model'] ?? '')) ?: (string)($job['machine_type'] ?? 'Machine');
$job['jobLocation'] = trim((string)($job['job_location'] ?? '')) ?: trim((string)($job['customer_address'] ?? ''));
$job['technicianName'] = trim((string)($job['technician_name'] ?? '')) ?: 'Unassigned';
$job['jobCardNo'] = (string)$job['job_card_no'];
$job['customerName'] = (string)$job['customer_name'];
$job['fleetNumber'] = (string)($job['fleet_number'] ?? '');
$job['serialNumber'] = (string)($job['serial_number'] ?? '');
$job['requestedBy'] = trim((string)($job['issued_by_name'] ?? '')) ?: trim((string)($job['generated_by_name'] ?? '')) ?: 'BELM / Customer';

json_out([
    'job'=>$job,
    'events'=>$events,
    'spares'=>$spares,
    'permissions'=>[
        'canCancel'=>jc_detail_can_cancel($ctx,$job),
        'canReceive'=>!empty($ctx['isTechnician']) && !in_array(strtoupper((string)$job['status']), ['RECEIVED','IN_PROGRESS','WAITING_FOR_PARTS','PENDING_APPROVAL','COMPLETED','CANCELLED'], true),
        'canWork'=>!empty($ctx['isTechnician']) && !in_array(strtoupper((string)$job['status']), ['PENDING_APPROVAL','COMPLETED','CANCELLED'], true),
        'canDispatch'=>empty($ctx['isTechnician']) && $ctx['kind']==='belm',
    ],
]);
