<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/../config/mailer.php';
require_once __DIR__ . '/table_pdf_helper.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = trim((string)($_GET['action'] ?? ''));
$id = trim((string)($_GET['id'] ?? ''));
$payload = current_token_payload();
if (!$payload) json_error('Not authenticated', 401);

const BREAKDOWN_STAGE_META = [
    'WORKSHOP_REVIEW' => ['department' => 'Workshop', 'slaHours' => 4],
    'TECHNICIAN_ASSIGNMENT' => ['department' => 'Workshop / Dispatch', 'slaHours' => 4],
    'JOB_CARD_ASSIGNED' => ['department' => 'Technician', 'slaHours' => 4],
    'DIAGNOSIS' => ['department' => 'Technician', 'slaHours' => 8],
    'BOSS_APPROVAL' => ['department' => 'Administration Approval', 'slaHours' => 4],
    'STORE_CHECK' => ['department' => 'Store Keeper', 'slaHours' => 6],
    'PROCUREMENT' => ['department' => 'Procurement', 'slaHours' => 24],
    'ACCOUNTS' => ['department' => 'Accounts', 'slaHours' => 8],
    'PARTS_READY' => ['department' => 'Workshop', 'slaHours' => 4],
    'REPAIR' => ['department' => 'Technician', 'slaHours' => 24],
    'TESTING' => ['department' => 'Workshop', 'slaHours' => 8],
    'COMPLETED' => ['department' => 'Completed', 'slaHours' => 0],
];

function bw_context(array $payload): array {
    if (($payload['type'] ?? '') === 'customer') {
        $customer = require_customer_auth();
        $permissions = $customer['permissions'] ?? null;
        $isOwner = ($customer['actorType'] ?? '') === 'owner';
        $role = strtolower(trim((string)($customer['customerRole'] ?? ($isOwner ? 'owner' : ''))));
        $allowed = $isOwner || $permissions === null || (is_array($permissions) && in_array('workflow', $permissions, true));
        if (!$allowed) json_error('Your Role Manager access does not include Breakdown Workflow.', 403);
        return [
            'kind' => 'customer', 'customerId' => (string)$customer['id'], 'isOwner' => $isOwner,
            'role' => $role, 'actorId' => (string)($customer['actorId'] ?? $customer['id']),
            'actorName' => (string)($customer['actorName'] ?? $customer['name'] ?? 'Customer User'),
            'canOverrideTechnician' => false,
        ];
    }
    $user = require_auth();
    $isTech = ($user['roleName'] ?? '') === 'Technician';
    $isCustomerManaged = false;
    if ($isTech && !empty($user['id'])) {
        $ownership = db()->prepare('SELECT is_customer_managed FROM users WHERE id = ? AND deleted_at IS NULL');
        $ownership->execute([(string)$user['id']]);
        $isCustomerManaged = !empty($ownership->fetchColumn());
    }
    if (!$isTech) require_page_access($user, 'service-requests');
    return [
        'kind' => $isCustomerManaged ? 'customer-tech' : 'belm',
        'customerId' => (string)($user['assignedCustomerId'] ?? ''),
        'isOwner' => false, 'role' => strtolower((string)($user['roleName'] ?? 'staff')),
        'actorId' => (string)($user['id'] ?? ''), 'actorName' => (string)($user['name'] ?? 'BELM'),
        'isTechnician' => $isTech, 'isCustomerManaged' => $isCustomerManaged,
        'canOverrideTechnician' => !$isTech && belm_can_override_technician_customer($user),
    ];
}

function bw_case_access(array $ctx, string $caseId): array {
    $stmt = db()->prepare(
        'SELECT bc.*, c.name AS customer_name, c.address AS customer_address, c.is_machinery_admin,
                m.brand, m.model, m.machine_type, m.serial_number, m.reg_number
         FROM breakdown_cases bc
         JOIN customers c ON c.id = bc.customer_id
         JOIN machines m ON m.id = bc.machine_id
         WHERE bc.id = ? AND c.deleted_at IS NULL AND m.deleted_at IS NULL'
    );
    $stmt->execute([$caseId]);
    $case = $stmt->fetch();
    if (!$case) json_error('Breakdown case not found.', 404);
    if ($ctx['kind'] === 'customer') {
        if ((string)$case['customer_id'] !== $ctx['customerId']) json_error('Not allowed.', 403);
    } elseif ($ctx['kind'] === 'customer-tech') {
        if ((string)$case['customer_id'] !== $ctx['customerId']) json_error('This machine is not assigned to this Technician.', 403);
        if (empty($case['is_machinery_admin'])) json_error('Customer Technician access is paused while BELM Service Provider is active.', 403);
    } else {
        $officialSupport = (($case['source_type'] ?? '') === 'SERVICE_REQUEST');
        // Provider-OFF customers remain private to their own workshop, except
        // for an official BELM Support Request that deliberately invites BELM.
        if (!empty($case['is_machinery_admin']) && !$officialSupport) {
            json_error('This customer is using its own maintenance team.', 403);
        }
        if (!empty($ctx['isTechnician'])) {
            $jobAccess = db()->prepare('SELECT 1 FROM digital_job_cards WHERE case_id=? AND technician_id=? LIMIT 1');
            $jobAccess->execute([$caseId, $ctx['actorId']]);
            $hasJob = (bool)$jobAccess->fetchColumn();
            $requestAssigned = false;
            if ($officialSupport && !empty($case['source_id'])) {
                $sr = db()->prepare('SELECT 1 FROM service_requests WHERE id=? AND assigned_to_id=? LIMIT 1');
                $sr->execute([(string)$case['source_id'], $ctx['actorId']]);
                $requestAssigned = (bool)$sr->fetchColumn();
            }
            if (!empty($case['is_machinery_admin'])) {
                if (!$hasJob && !$requestAssigned) json_error('This BELM Support Request is not assigned to this Technician.', 403);
            } elseif ($ctx['customerId'] !== '' && $ctx['customerId'] !== (string)$case['customer_id'] && !$hasJob) {
                json_error('This machine is not assigned to this Technician and no Temporary Override exists for this Job Card.', 403);
            }
        }
    }
    return $case;
}

function bw_is_technician_actor(array $ctx): bool {
    return !empty($ctx['isTechnician'])
        || $ctx['kind'] === 'customer-tech'
        || ($ctx['kind'] === 'customer' && strtolower((string)($ctx['role'] ?? '')) === 'technician');
}

function bw_require_assigned_job(array $ctx, array $job): void {
    if (!bw_is_technician_actor($ctx)) return;
    $actorId = trim((string)($ctx['actorId'] ?? ''));
    $jobTechId = trim((string)($job['technician_id'] ?? ''));
    if ($actorId !== '' && $jobTechId === $actorId) return;

    // V342: legacy/interrupted Service Request sync can leave the source request
    // assigned to the Technician while digital_job_cards.technician_id is still
    // NULL. Recover only that safe missing-assignment case; never override a Job
    // Card that is explicitly assigned to a different Technician.
    if ($actorId !== '' && $jobTechId === '' && !empty($job['id'])) {
        $recover = db()->prepare(
            "SELECT sr.assigned_to_id,u.name AS assigned_to_name
             FROM digital_job_cards j
             JOIN breakdown_cases bc ON bc.id=j.case_id
             JOIN service_requests sr ON bc.source_type='SERVICE_REQUEST' AND sr.id=bc.source_id
             LEFT JOIN users u ON u.id=sr.assigned_to_id
             WHERE j.id=? LIMIT 1"
        );
        $recover->execute([(string)$job['id']]);
        $sourceAssignment = $recover->fetch() ?: [];
        if (trim((string)($sourceAssignment['assigned_to_id'] ?? '')) === $actorId) {
            $name = trim((string)($sourceAssignment['assigned_to_name'] ?? '')) ?: (string)($ctx['actorName'] ?? 'Technician');
            db()->prepare(
                "UPDATE digital_job_cards
                 SET technician_id=?,technician_name=?,
                     status=CASE WHEN UPPER(COALESCE(status,'')) IN ('OPEN','RECEIVED') THEN 'ASSIGNED' ELSE status END,
                     updated_at=NOW()
                 WHERE id=? AND technician_id IS NULL"
            )->execute([$actorId,$name,(string)$job['id']]);
            return;
        }
    }
    json_error('This Job Card is not assigned to this Technician.', 403);
}

function bw_log(string $caseId, string $stage, string $department, string $action, ?string $note, array $ctx): void {
    db()->prepare(
        'INSERT INTO breakdown_case_events
         (id, case_id, stage, department, action, note, actor_type, actor_id, actor_name, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,NOW())'
    )->execute([uuid(), $caseId, $stage, $department, $action, $note, $ctx['kind'], $ctx['actorId'] ?: null, $ctx['actorName'],]);
}

function bw_set_stage(string $caseId, string $stage, ?string $blocker, array $ctx, string $action = 'Stage updated'): void {
    $meta = BREAKDOWN_STAGE_META[$stage] ?? null;
    if (!$meta) json_error('Invalid workflow stage.');
    $closed = $stage === 'COMPLETED';
    db()->prepare(
        'UPDATE breakdown_cases SET current_stage=?, current_department=?, blocker_reason=?, stage_started_at=NOW(),
         status=?, updated_at=NOW(), closed_at=CASE WHEN ? THEN NOW() ELSE NULL END WHERE id=?'
    )->execute([$stage, $meta['department'], $blocker ?: null, $closed ? 'COMPLETED' : 'OPEN', $closed ? 1 : 0, $caseId]);
    bw_log($caseId, $stage, $meta['department'], $action, $blocker, $ctx);
    // V220: closing a synced Breakdown Case closes its official source too.
    if ($closed) {
        try {
            $srcStmt = db()->prepare('SELECT source_type,source_id FROM breakdown_cases WHERE id=?');
            $srcStmt->execute([$caseId]);
            $src = $srcStmt->fetch();
            if ($src && ($src['source_type'] ?? '') === 'SERVICE_REQUEST' && !empty($src['source_id'])) {
                $sr = db()->prepare("SELECT status FROM service_requests WHERE id=?");
                $sr->execute([(string)$src['source_id']]);
                $previous = $sr->fetchColumn();
                if ($previous && !in_array((string)$previous,['COMPLETED','CANCELLED'],true)) {
                    db()->prepare("UPDATE service_requests SET status='COMPLETED',completed_at=COALESCE(completed_at,NOW()),updated_at=NOW() WHERE id=?")->execute([(string)$src['source_id']]);
                    $serviceActorId = $ctx['kind']==='belm' ? ($ctx['actorId'] ?: null) : null;
                    db()->prepare('INSERT INTO service_request_history(id,request_id,event_type,from_value,to_value,actor_id,actor_name,note,created_at) VALUES(?,?,?,?,?,?,?,?,NOW())')
                        ->execute([uuid(),(string)$src['source_id'],'STATUS',(string)$previous,'COMPLETED',$serviceActorId,$ctx['actorName'],'Completed from Breakdown Process']);
                }
            } elseif ($src && ($src['source_type'] ?? '') === 'OPERATOR_REPORT' && !empty($src['source_id'])) {
                db()->prepare("UPDATE operator_reports SET status='RESOLVED',resolved_at=COALESCE(resolved_at,NOW()) WHERE id=? AND status='OPEN'")->execute([(string)$src['source_id']]);
            }
        } catch (Throwable $syncError) {
            error_log('Breakdown source close sync failed: ' . $syncError->getMessage());
        }
    }
}

function bw_ensure_case_from_report(string $reportId, array $ctx): ?string {
    $stmt = db()->prepare(
        'SELECT o.id, o.customer_id, o.machine_id, o.message, o.operator_name,
                m.brand, m.model, c.is_machinery_admin
         FROM operator_reports o JOIN machines m ON m.id=o.machine_id JOIN customers c ON c.id=o.customer_id
         WHERE o.id=?'
    );
    $stmt->execute([$reportId]);
    $r = $stmt->fetch();
    if (!$r) return null;
    $existing = db()->prepare("SELECT id FROM breakdown_cases WHERE source_type='OPERATOR_REPORT' AND source_id=?");
    $existing->execute([$reportId]);
    $found = $existing->fetchColumn();
    if ($found) return (string)$found;
    $caseId = uuid();
    $label = trim(($r['brand'] ?? '') . ' ' . ($r['model'] ?? '')) ?: 'Machine';
    db()->prepare(
        "INSERT INTO breakdown_cases
         (id,customer_id,machine_id,source_type,source_id,title,description,status,current_stage,current_department,opened_at,stage_started_at,updated_at,created_by_name)
         VALUES (?,?,?,?,?,?,?,'OPEN','WORKSHOP_REVIEW','Workshop',NOW(),NOW(),NOW(),?)"
    )->execute([$caseId,$r['customer_id'],$r['machine_id'],'OPERATOR_REPORT',$reportId,'Breakdown - '.$label,$r['message'],$r['operator_name']]);
    bw_log($caseId,'WORKSHOP_REVIEW','Workshop','Breakdown reported',$r['message'],$ctx);
    return $caseId;
}

function bw_signed_copy_upload(string $dataUrl, string $name): array {
    $dataUrl = trim($dataUrl);
    if (!preg_match('#^data:(application/pdf|image/jpeg|image/png|image/webp);base64,(.+)$#s', $dataUrl, $m)) {
        json_error('Signed Job Card must be a PDF, JPG, PNG or WebP file.', 422);
    }
    $binary = base64_decode($m[2], true);
    if ($binary === false) json_error('Signed Job Card file is damaged.', 422);
    if (strlen($binary) > 5 * 1024 * 1024) json_error('Signed Job Card is too large (max 5MB).', 422);
    $safeName = preg_replace('/[^A-Za-z0-9._-]+/', '-', trim($name)) ?: 'signed-job-card';
    return [base64_encode($binary), $m[1], $safeName];
}

function bw_case_view(array $row): array {
    $stage = (string)$row['current_stage'];
    $meta = BREAKDOWN_STAGE_META[$stage] ?? ['slaHours'=>0];
    $opened = strtotime((string)$row['opened_at']);
    $stageStart = strtotime((string)$row['stage_started_at']);
    $now = time();
    $breakdownHours = $opened ? max(0, round(($now-$opened)/3600,1)) : 0;
    $stageHours = $stageStart ? max(0, round(($now-$stageStart)/3600,1)) : 0;
    $sla = (float)($meta['slaHours'] ?? 0);
    $delayed = $row['status'] !== 'COMPLETED' && $sla > 0 && $stageHours > $sla;
    return [
        'id'=>$row['id'],'customerId'=>$row['customer_id'],'machineId'=>$row['machine_id'],
        'customerName'=>$row['customer_name'] ?? null,'machineLabel'=>trim(($row['brand'] ?? '').' '.($row['model'] ?? '')) ?: ($row['machine_type'] ?? 'Machine'),
        'brand'=>$row['brand'] ?? null,'model'=>$row['model'] ?? null,'machineType'=>$row['machine_type'] ?? null,
        'serialNumber'=>$row['serial_number'] ?? null,'title'=>$row['title'],'description'=>$row['description'],
        'sourceType'=>$row['source_type'] ?? 'MANUAL','sourceId'=>$row['source_id'] ?? null,
        'customerManagesWorkshop'=>!empty($row['is_machinery_admin']),
        'status'=>$row['status'],'stage'=>$stage,'department'=>$row['current_department'],'blockerReason'=>$row['blocker_reason'],
        'openedAt'=>$row['opened_at'],'stageStartedAt'=>$row['stage_started_at'],'closedAt'=>$row['closed_at'],
        'breakdownHours'=>$breakdownHours,'breakdownDays'=>round($breakdownHours/24,1),'stageHours'=>$stageHours,
        'slaHours'=>$sla,'delayed'=>$delayed,'delayHours'=>$delayed ? round($stageHours-$sla,1) : 0,
    ];
}

$ctx = bw_context($payload);


function bw_report_access(array $ctx): void {
    if ($ctx['kind'] === 'customer-tech') json_error('Workshop Department Report is available to Workshop Manager / Administration.', 403);
    if ($ctx['kind'] === 'customer') {
        if (!$ctx['isOwner'] && !in_array($ctx['role'], ['workshop_manager','admin'], true)) {
            json_error('Only Workshop Manager or Administration can view the Workshop Department Report.', 403);
        }
        return;
    }
    if ($ctx['kind'] === 'belm' && !empty($ctx['isTechnician'])) {
        json_error('Technicians use Job Cards; department analysis is for Workshop Manager / Administration.', 403);
    }
}

function bw_report_range(string $period, string $anchorDate): array {
    $period = strtolower(trim($period));
    if (!in_array($period, ['daily','monthly'], true)) $period = 'daily';
    $anchorDate = trim($anchorDate);
    if (!preg_match('/^\\d{4}-\\d{2}-\\d{2}$/', $anchorDate)) $anchorDate = date('Y-m-d');
    $ts = strtotime($anchorDate . ' 00:00:00');
    if ($ts === false) $ts = time();
    if ($period === 'monthly') {
        $start = date('Y-m-01 00:00:00', $ts);
        $end = date('Y-m-01 00:00:00', strtotime('+1 month', strtotime($start)));
        $label = date('F Y', strtotime($start));
    } else {
        $start = date('Y-m-d 00:00:00', $ts);
        $end = date('Y-m-d 00:00:00', strtotime('+1 day', strtotime($start)));
        $label = date('d M Y', strtotime($start));
    }
    return [$period, $start, $end, $label];
}

function bw_machine_report_range(string $from = '', string $to = ''): array {
    $from = trim($from); $to = trim($to);
    if ($from === '' && $to === '') return [null, null, 'All time'];
    if ($from === '') $from = $to;
    if ($to === '') $to = $from;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
        json_error('Report dates must use YYYY-MM-DD.', 400);
    }
    $tz = new DateTimeZone('Africa/Dar_es_Salaam');
    try {
        $start = new DateTimeImmutable($from . ' 00:00:00', $tz);
        $endDay = new DateTimeImmutable($to . ' 00:00:00', $tz);
    } catch (Throwable $error) {
        json_error('Report date is invalid.', 400);
    }
    if ($endDay < $start) json_error('Report end date cannot be before start date.', 400);
    return [$start->format(DateTimeInterface::ATOM), $endDay->modify('+1 day')->format(DateTimeInterface::ATOM), $from === $to ? $from : ($from . ' to ' . $to)];
}

function bw_machine_report_access(array $ctx, string $machineId): array {
    $stmt = db()->prepare('SELECT m.id,m.customer_id,m.brand,m.model,m.machine_type,m.serial_number,m.reg_number,c.name AS customer_name,c.is_machinery_admin
                           FROM machines m JOIN customers c ON c.id=m.customer_id
                           WHERE m.id=? AND m.deleted_at IS NULL AND c.deleted_at IS NULL AND c.is_active=1');
    $stmt->execute([$machineId]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine not found.', 404);
    if ($ctx['kind'] === 'customer') {
        if ((string)$machine['customer_id'] !== (string)$ctx['customerId']) json_error('Not allowed.', 403);
        return $machine;
    }
    if ($ctx['kind'] === 'customer-tech') {
        if ((string)$machine['customer_id'] !== (string)$ctx['customerId']) json_error('This machine is not assigned to this Technician.', 403);
        if (empty($machine['is_machinery_admin'])) json_error('Customer Technician access is paused while BELM Service Provider is active.', 403);
        return $machine;
    }
    require_belm_customer_privacy((string)$machine['customer_id'], 'maintenanceRecords', 'internal maintenance and Job Card reports', $machineId);
    if (!empty($ctx['isTechnician'])) {
        $assigned = (string)($ctx['customerId'] ?? '');
        $hasJob = false;
        if (!empty($ctx['actorId'])) {
            $job = db()->prepare('SELECT 1 FROM digital_job_cards WHERE machine_id=? AND technician_id=? LIMIT 1');
            $job->execute([$machineId, (string)$ctx['actorId']]);
            $hasJob = (bool)$job->fetchColumn();
        }
        if ($assigned !== (string)$machine['customer_id'] && !$hasJob) json_error('You are not assigned to this machine.', 403);
    }
    return $machine;
}

function bw_report_scope(array $ctx): array {
    if ($ctx['kind'] === 'customer') {
        $stmt = db()->prepare('SELECT name FROM customers WHERE id=? AND deleted_at IS NULL');
        $stmt->execute([$ctx['customerId']]);
        $name = (string)($stmt->fetchColumn() ?: 'Customer');
        return ['sql' => 'bc.customer_id=?', 'jobSql' => 'j.customer_id=?', 'params' => [$ctx['customerId']], 'jobParams' => [$ctx['customerId']], 'label' => $name];
    }
    return ['sql' => "(c.is_machinery_admin=0 OR bc.source_type='SERVICE_REQUEST')", 'jobSql' => "(c.is_machinery_admin=0 OR bcj.source_type='SERVICE_REQUEST')", 'params' => [], 'jobParams' => [], 'label' => 'BELM Provider + Official Support Work'];
}

function bw_department_report_data(array $ctx, string $period, string $anchorDate): array {
    bw_report_access($ctx);
    [$period, $start, $end, $periodLabel] = bw_report_range($period, $anchorDate);
    $scope = bw_report_scope($ctx);

    $caseBase = ' FROM breakdown_cases bc JOIN customers c ON c.id=bc.customer_id JOIN machines m ON m.id=bc.machine_id WHERE ' . $scope['sql'];
    $jobBase = ' FROM digital_job_cards j JOIN breakdown_cases bcj ON bcj.id=j.case_id JOIN customers c ON c.id=j.customer_id JOIN machines m ON m.id=j.machine_id WHERE ' . $scope['jobSql'];

    $stmt = db()->prepare('SELECT bc.*,c.name customer_name,c.is_machinery_admin,m.brand,m.model,m.machine_type,m.serial_number,m.reg_number' . $caseBase . " AND bc.status='OPEN' ORDER BY bc.opened_at ASC");
    $stmt->execute($scope['params']);
    $openRows = $stmt->fetchAll();
    $openCases = [];
    $delayed = 0;
    $bottleneckMap = [];
    foreach ($openRows as $row) {
        $view = bw_case_view($row);
        $openCases[] = $view;
        if ($view['delayed']) $delayed++;
        $dept = (string)($view['department'] ?: 'Unknown');
        if (!isset($bottleneckMap[$dept])) $bottleneckMap[$dept] = ['department'=>$dept,'openCases'=>0,'delayedCases'=>0,'totalWaitHours'=>0.0,'oldestWaitHours'=>0.0];
        $bottleneckMap[$dept]['openCases']++;
        if ($view['delayed']) $bottleneckMap[$dept]['delayedCases']++;
        $bottleneckMap[$dept]['totalWaitHours'] += (float)$view['stageHours'];
        $bottleneckMap[$dept]['oldestWaitHours'] = max($bottleneckMap[$dept]['oldestWaitHours'], (float)$view['stageHours']);
    }
    $bottlenecks = [];
    foreach ($bottleneckMap as $b) {
        $b['avgWaitHours'] = $b['openCases'] ? round($b['totalWaitHours'] / $b['openCases'], 1) : 0;
        unset($b['totalWaitHours']);
        $b['oldestWaitHours'] = round($b['oldestWaitHours'], 1);
        $bottlenecks[] = $b;
    }
    usort($bottlenecks, fn($a,$b) => ($b['delayedCases'] <=> $a['delayedCases']) ?: ($b['openCases'] <=> $a['openCases']) ?: ($b['oldestWaitHours'] <=> $a['oldestWaitHours']));

    $countCase = function(string $extra, array $extraParams=[]) use ($caseBase,$scope): int {
        $q = db()->prepare('SELECT COUNT(*)' . $caseBase . $extra);
        $q->execute(array_merge($scope['params'], $extraParams));
        return (int)$q->fetchColumn();
    };
    $newBreakdowns = $countCase(' AND bc.opened_at>=? AND bc.opened_at<?', [$start,$end]);
    $closedBreakdowns = $countCase(' AND bc.closed_at>=? AND bc.closed_at<?', [$start,$end]);

    $jobStmt = db()->prepare('SELECT j.*,m.brand,m.model,m.machine_type,m.serial_number,m.reg_number' . $jobBase . ' AND ((j.created_at>=? AND j.created_at<?) OR (j.completed_at>=? AND j.completed_at<?)) ORDER BY COALESCE(j.completed_at,j.updated_at,j.created_at) DESC');
    $jobStmt->execute(array_merge($scope['jobParams'], [$start,$end,$start,$end]));
    $jobRows = $jobStmt->fetchAll();

    $createdJobs = 0; $completedJobs = 0; $repeatJobs = 0; $resolutionTotal = 0.0; $resolutionCount = 0;
    $tech = []; $faults = [];
    $recentJobs = [];
    foreach ($jobRows as $j) {
        $startTs = strtotime($start); $endTs = strtotime($end);
        $createdTs = !empty($j['created_at']) ? strtotime((string)$j['created_at']) : false;
        $completedTs = !empty($j['completed_at']) ? strtotime((string)$j['completed_at']) : false;
        $createdIn = $createdTs !== false && $createdTs >= $startTs && $createdTs < $endTs;
        $completedIn = $completedTs !== false && $completedTs >= $startTs && $completedTs < $endTs;
        if ($createdIn) $createdJobs++;
        if ($completedIn) {
            $completedJobs++;
            if (!empty($j['repeat_issue'])) $repeatJobs++;
            if (!empty($j['started_at'])) {
                $h = max(0, (strtotime((string)$j['completed_at']) - strtotime((string)$j['started_at'])) / 3600);
                $resolutionTotal += $h; $resolutionCount++;
            }
            $faultKey = strtolower(trim((string)$j['title']));
            if ($faultKey !== '') {
                if (!isset($faults[$faultKey])) $faults[$faultKey] = ['title'=>$j['title'],'count'=>0,'repeatCount'=>0];
                $faults[$faultKey]['count']++;
                if (!empty($j['repeat_issue'])) $faults[$faultKey]['repeatCount']++;
            }
        }
        $name = trim((string)($j['technician_name'] ?? '')) ?: 'Unassigned';
        if (!isset($tech[$name])) $tech[$name] = ['technicianName'=>$name,'totalJobs'=>0,'completedJobs'=>0,'repeatJobs'=>0,'resolutionTotal'=>0.0,'resolutionCount'=>0];
        if ($createdIn) $tech[$name]['totalJobs']++;
        if ($completedIn) {
            $tech[$name]['completedJobs']++;
            if (!empty($j['repeat_issue'])) $tech[$name]['repeatJobs']++;
            if (!empty($j['started_at'])) {
                $h = max(0, (strtotime((string)$j['completed_at']) - strtotime((string)$j['started_at'])) / 3600);
                $tech[$name]['resolutionTotal'] += $h; $tech[$name]['resolutionCount']++;
            }
        }
        if (count($recentJobs) < 40) {
            $resolution = null;
            if (!empty($j['completed_at']) && !empty($j['started_at'])) $resolution = round(max(0,(strtotime((string)$j['completed_at'])-strtotime((string)$j['started_at']))/3600),1);
            $recentJobs[] = [
                'jobCardNo'=>$j['job_card_no'],'machine'=>trim(($j['brand']??'').' '.($j['model']??'')) ?: ($j['machine_type']??'Machine'),
                'title'=>$j['title'],'technician'=>$name,'status'=>$j['status'],'repeatIssue'=>!empty($j['repeat_issue']),
                'createdAt'=>$j['created_at'],'completedAt'=>$j['completed_at'],'resolutionHours'=>$resolution,
            ];
        }
    }
    $techRows = [];
    foreach ($tech as $t) {
        if ($t['totalJobs']===0 && $t['completedJobs']===0) continue;
        $completionBase = max($t['totalJobs'], $t['completedJobs']);
        $t['completionRate'] = $completionBase ? round($t['completedJobs'] * 100 / $completionBase, 1) : 0;
        $t['firstTimeFixRate'] = $t['completedJobs'] ? round(max(0,$t['completedJobs']-$t['repeatJobs']) * 100 / $t['completedJobs'], 1) : 0;
        $t['avgResolutionHours'] = $t['resolutionCount'] ? round($t['resolutionTotal'] / $t['resolutionCount'], 1) : 0;
        unset($t['resolutionTotal'],$t['resolutionCount']);
        $techRows[] = $t;
    }
    usort($techRows, fn($a,$b) => ($b['completedJobs'] <=> $a['completedJobs']) ?: ($a['repeatJobs'] <=> $b['repeatJobs']));

    $faultRows = array_values($faults);
    usort($faultRows, fn($a,$b) => ($b['count'] <=> $a['count']) ?: ($b['repeatCount'] <=> $a['repeatCount']));
    $faultRows = array_slice($faultRows, 0, 8);

    $waitingAdministration = count(array_filter($openCases, fn($c) => $c['stage']==='BOSS_APPROVAL'));
    $waitingParts = count(array_filter($openCases, fn($c) => in_array($c['stage'], ['STORE_CHECK','PROCUREMENT','ACCOUNTS','PARTS_READY'], true)));
    $avgResolution = $resolutionCount ? round($resolutionTotal/$resolutionCount,1) : 0;
    $firstTimeFix = $completedJobs ? round(max(0,$completedJobs-$repeatJobs)*100/$completedJobs,1) : 0;

    return [
        'period'=>$period,'periodLabel'=>$periodLabel,'start'=>$start,'end'=>$end,'scopeLabel'=>$scope['label'],'generatedAt'=>date('c'),
        'summary'=>[
            'newBreakdowns'=>$newBreakdowns,'closedBreakdowns'=>$closedBreakdowns,'jobCardsCreated'=>$createdJobs,'completedJobs'=>$completedJobs,
            'openBreakdowns'=>count($openCases),'delayedBreakdowns'=>$delayed,'waitingAdministration'=>$waitingAdministration,'waitingParts'=>$waitingParts,
            'repeatJobs'=>$repeatJobs,'firstTimeFixRate'=>$firstTimeFix,'avgResolutionHours'=>$avgResolution,
        ],
        'bottlenecks'=>$bottlenecks,'technicians'=>$techRows,'repeatFaults'=>$faultRows,'recentJobs'=>$recentJobs,
    ];
}

if ($method === 'GET' && $action === 'technicians') {
    if (bw_is_technician_actor($ctx)) json_error('Technicians use My Job Cards; technician roster management is restricted.',403);
    $customerId = trim((string)($_GET['customerId'] ?? $ctx['customerId']));
    if (in_array($ctx['kind'],['customer','customer-tech'],true) && $customerId !== $ctx['customerId']) json_error('Not allowed.',403);
    $mode = db()->prepare('SELECT is_machinery_admin FROM customers WHERE id=?'); $mode->execute([$customerId]);
    $selfService = !empty($mode->fetchColumn());

    // Customer-side assignment is strictly organization-owned: when the customer
    // runs its own workshop, Customer Admin / Workshop Manager may assign only
    // customer-managed Technicians. When BELM is the active provider, the customer
    // does not receive BELM staff in this roster; Customer Admin sends a Job Card to
    // BELM and BELM Admin/Engineer performs the BELM-side assignment.
    if ($ctx['kind']==='customer' && !$selfService) {
        json_out([]);
    }

    if ($ctx['kind']==='belm' && empty($ctx['isTechnician']) && !empty($ctx['canOverrideTechnician'])) {
        // Super Admin / Engineer sees every active BELM-owned Technician.
        // Home-customer labels let them intentionally pick a cross-customer
        // technician and confirm a Temporary Override in the Job Card dialog.
        $stmt = db()->query(
            "SELECT u.id,u.name,u.email,u.is_customer_managed,u.assigned_customer_id, hc.name AS assigned_customer_name
             FROM users u JOIN roles r ON r.id=u.role_id
             LEFT JOIN customers hc ON hc.id=u.assigned_customer_id
             WHERE u.is_active=1 AND u.deleted_at IS NULL
               AND (r.name='Technician' OR EXISTS (
                    SELECT 1 FROM user_roles ur JOIN roles rr ON rr.id=ur.role_id
                    WHERE ur.user_id=u.id AND rr.name='Technician' AND rr.deleted_at IS NULL
               ))
               AND u.is_customer_managed=0
             ORDER BY u.name"
        );
        $rows=$stmt->fetchAll();
        foreach($rows as &$row){
            $row['assignedCustomerId']=$row['assigned_customer_id'];
            $row['assignedCustomerName']=$row['assigned_customer_name'];
            $row['temporaryForCustomer']=!empty($row['assigned_customer_id']) && $customerId!=='' && (string)$row['assigned_customer_id']!==$customerId;
            unset($row['assigned_customer_id'],$row['assigned_customer_name']);
        }
        unset($row);
        json_out($rows);
    }

    $sql = "SELECT u.id,u.name,u.email,u.is_customer_managed,u.assigned_customer_id, hc.name AS assigned_customer_name
            FROM users u JOIN roles r ON r.id=u.role_id
            LEFT JOIN customers hc ON hc.id=u.assigned_customer_id
            WHERE u.is_active=1 AND u.deleted_at IS NULL AND u.assigned_customer_id=?
              AND (r.name='Technician' OR EXISTS (
                   SELECT 1 FROM user_roles ur JOIN roles rr ON rr.id=ur.role_id
                   WHERE ur.user_id=u.id AND rr.name='Technician' AND rr.deleted_at IS NULL
              ))";
    if ($ctx['kind']==='belm') $sql .= ' AND u.is_customer_managed=0';
    else $sql .= ' AND u.is_customer_managed=1';
    $sql .= ' ORDER BY u.name';
    $stmt=db()->prepare($sql); $stmt->execute([$customerId]);
    $rows=$stmt->fetchAll();
    foreach($rows as &$row){
        $row['assignedCustomerId']=$row['assigned_customer_id'];
        $row['assignedCustomerName']=$row['assigned_customer_name'];
        $row['temporaryForCustomer']=false;
        unset($row['assigned_customer_id'],$row['assigned_customer_name']);
    }
    unset($row);
    json_out($rows);
}

if ($method === 'GET' && $action === 'performance') {
    if (bw_is_technician_actor($ctx)) json_error('Technicians can view their own Job Card reports, not department performance.',403);
    $customerId = trim((string)($_GET['customerId'] ?? $ctx['customerId']));
    if (in_array($ctx['kind'],['customer','customer-tech'],true) && $customerId !== $ctx['customerId']) json_error('Not allowed.',403);
    if ($customerId==='' && $ctx['kind']==='belm') {
        $stmt=db()->prepare(
            "SELECT j.technician_id, COALESCE(j.technician_name,'Unassigned') technician_name,
                    COUNT(*) total_jobs,
                    COUNT(*) FILTER (WHERE j.status='COMPLETED') completed_jobs,
                    COUNT(*) FILTER (WHERE j.repeat_issue=1) repeat_jobs,
                    ROUND((AVG(EXTRACT(EPOCH FROM (j.completed_at-j.started_at))/3600.0) FILTER (WHERE j.completed_at IS NOT NULL AND j.started_at IS NOT NULL))::numeric,1) avg_hours
             FROM digital_job_cards j JOIN breakdown_cases bc ON bc.id=j.case_id JOIN customers c ON c.id=j.customer_id
             WHERE (c.is_machinery_admin=0 OR bc.source_type='SERVICE_REQUEST') GROUP BY j.technician_id,j.technician_name ORDER BY completed_jobs DESC,total_jobs DESC"
        );
        $stmt->execute();
    } else {
        $stmt=db()->prepare(
            "SELECT technician_id, COALESCE(technician_name,'Unassigned') technician_name,
                    COUNT(*) total_jobs,
                    COUNT(*) FILTER (WHERE status='COMPLETED') completed_jobs,
                    COUNT(*) FILTER (WHERE repeat_issue=1) repeat_jobs,
                    ROUND((AVG(EXTRACT(EPOCH FROM (completed_at-started_at))/3600.0) FILTER (WHERE completed_at IS NOT NULL AND started_at IS NOT NULL))::numeric,1) avg_hours
             FROM digital_job_cards WHERE customer_id=? GROUP BY technician_id,technician_name ORDER BY completed_jobs DESC,total_jobs DESC"
        );
        $stmt->execute([$customerId]);
    }
    $rows=[];
    foreach($stmt->fetchAll() as $r){
        $total=(int)$r['total_jobs']; $completed=(int)$r['completed_jobs']; $repeat=(int)$r['repeat_jobs'];
        $rows[]=['technicianId'=>$r['technician_id'],'technicianName'=>$r['technician_name'],'totalJobs'=>$total,'completedJobs'=>$completed,
            'completionRate'=>$total?round($completed*100/$total,1):0,'repeatJobs'=>$repeat,
            'firstTimeFixRate'=>$completed?round(max(0,$completed-$repeat)*100/$completed,1):0,'avgResolutionHours'=>(float)($r['avg_hours'] ?? 0)];
    }
    json_out($rows);
}


if ($method === 'GET' && $action === 'department-report') {
    $period = (string)($_GET['period'] ?? 'daily');
    $date = (string)($_GET['date'] ?? date('Y-m-d'));
    json_out(bw_department_report_data($ctx, $period, $date));
}

if ($method === 'GET' && $action === 'department-report-pdf') {
    $period = (string)($_GET['period'] ?? 'daily');
    $date = (string)($_GET['date'] ?? date('Y-m-d'));
    $r = bw_department_report_data($ctx, $period, $date);
    $s = $r['summary'];
    $rows = [
        ['WORKSHOP SUMMARY'],
        ['New breakdowns', (string)$s['newBreakdowns']],
        ['Breakdowns closed', (string)$s['closedBreakdowns']],
        ['Job Cards created', (string)$s['jobCardsCreated']],
        ['Jobs completed', (string)$s['completedJobs']],
        ['Open breakdowns now', (string)$s['openBreakdowns']],
        ['Delayed / SLA exceeded', (string)$s['delayedBreakdowns']],
        ['Waiting Administration approval', (string)$s['waitingAdministration']],
        ['Waiting Store / Procurement / Accounts', (string)$s['waitingParts']],
        ['First-time-fix rate', $s['firstTimeFixRate'].'%'],
        ['Repeat / rework jobs', (string)$s['repeatJobs']],
        ['Average repair resolution', $s['avgResolutionHours'].' hrs'],
        [''],
        ['CURRENT BOTTLENECKS'],
        ['Department','Open','Delayed','Avg wait','Oldest wait'],
    ];
    foreach ($r['bottlenecks'] as $b) $rows[] = [$b['department'],(string)$b['openCases'],(string)$b['delayedCases'],$b['avgWaitHours'].' hrs',$b['oldestWaitHours'].' hrs'];
    $rows[]=['']; $rows[]=['TECHNICIAN PERFORMANCE'];
    $rows[]=['Technician','Jobs','Completed','Completion','First-time fix','Avg hrs','Repeat'];
    foreach ($r['technicians'] as $t) $rows[] = [$t['technicianName'],(string)$t['totalJobs'],(string)$t['completedJobs'],$t['completionRate'].'%',$t['firstTimeFixRate'].'%',$t['avgResolutionHours'].' hrs',(string)$t['repeatJobs']];
    $rows[]=['']; $rows[]=['REPEAT / COMMON FAULTS'];
    $rows[]=['Fault / Job','Completed','Repeat'];
    foreach ($r['repeatFaults'] as $f) $rows[] = [$f['title'],(string)$f['count'],(string)$f['repeatCount']];
    $rows[]=['']; $rows[]=['JOB CARD ACTIVITY'];
    $rows[]=['Job Card','Machine','Technician','Status','Resolution','Repeat'];
    foreach ($r['recentJobs'] as $j) $rows[] = [$j['jobCardNo'],$j['machine'],$j['technician'],$j['status'],$j['resolutionHours']===null?'-':$j['resolutionHours'].' hrs',$j['repeatIssue']?'YES':'NO'];
    $filePeriod = $r['period']==='monthly' ? date('Y-m', strtotime($r['start'])) : date('Y-m-d', strtotime($r['start']));
    output_table_pdf('Workshop-Department-Report-'.$filePeriod.'.pdf','WORKSHOP DEPARTMENT REPORT',[
        'Company / scope: '.$r['scopeLabel'],
        'Period: '.$r['periodLabel'].' ('.strtoupper($r['period']).')',
        'Generated: '.date('d/m/Y H:i'),
        'Operational analysis from Breakdown Workflow and Digital Job Cards',
    ],$rows);
}

// V274 - staff-side "Job Card / Daily Report" list for one machine, used
// by the "Checkup Report" button on the Message Customer dialog and
// anywhere else BELM Admin wants a machine's Job Card history without
// digging through Breakdown Workflow case by case. Read-only, never
// deletes or hides anything.
if ($method === 'GET' && $action === 'machine-job-cards' && !empty($_GET['machineId'])) {
    if (bw_is_technician_actor($ctx)) json_error('Technicians can view only their assigned Job Cards in My Job Cards.',403);
    $machineId = trim((string)$_GET['machineId']);
    bw_machine_report_access($ctx, $machineId);
    [$fromTs, $toTs] = bw_machine_report_range((string)($_GET['from'] ?? ''), (string)($_GET['to'] ?? ''));
    $sql = 'SELECT id, job_card_no, title, fault_description, status, technician_name,
                   diagnosis, work_done, test_result, completion_note, repeat_issue,
                   started_at, completed_at, created_at
            FROM digital_job_cards WHERE machine_id = ?';
    $params = [$machineId];
    if ($fromTs !== null) { $sql .= ' AND created_at >= ?'; $params[] = $fromTs; }
    if ($toTs !== null) { $sql .= ' AND created_at < ?'; $params[] = $toTs; }
    $sql .= ' ORDER BY created_at DESC LIMIT 250';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    json_out($stmt->fetchAll());
}

if ($method === 'GET' && $action === 'machine-job-cards-pdf' && !empty($_GET['machineId'])) {
    if (bw_is_technician_actor($ctx)) json_error('Technicians can download only their assigned Job Card/Report PDFs.',403);
    $machineId = trim((string)$_GET['machineId']);
    $machine = bw_machine_report_access($ctx, $machineId);
    [$fromTs, $toTs, $periodLabel] = bw_machine_report_range((string)($_GET['from'] ?? ''), (string)($_GET['to'] ?? ''));
    $sql = 'SELECT job_card_no,title,status,technician_name,created_at,completed_at
            FROM digital_job_cards WHERE machine_id=?';
    $params = [$machineId];
    if ($fromTs !== null) { $sql .= ' AND created_at >= ?'; $params[] = $fromTs; }
    if ($toTs !== null) { $sql .= ' AND created_at < ?'; $params[] = $toTs; }
    $sql .= ' ORDER BY created_at DESC';
    $stmt = db()->prepare($sql); $stmt->execute($params); $jobCards = $stmt->fetchAll();
    $rows = array_map(static fn(array $jc): array => [
        (string)$jc['job_card_no'],
        (string)$jc['title'],
        (string)$jc['status'],
        (string)($jc['technician_name'] ?: 'Unassigned'),
        display_date_billing($jc['created_at']),
    ], $jobCards);
    $machineLabel = trim((string)($machine['brand'] ?? '') . ' ' . (string)($machine['model'] ?? '')) ?: 'Machine';
    output_table_pdf(
        'BELM-job-card-report-history.pdf',
        'JOB CARD REPORTS',
        [
            'Customer: ' . (string)($machine['customer_name'] ?? 'Customer'),
            'Machine: ' . $machineLabel,
            'Serial / Registration: ' . (string)($machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded')),
            'Period: ' . $periodLabel,
            'Job Card  |  Title  |  Status  |  Technician  |  Date',
        ],
        $rows
    );
}

if ($method === 'GET' && $action === 'job-card-pdf' && $id !== '') {
    $stmt=db()->prepare('SELECT j.*,bc.customer_id,bc.current_stage,c.name customer_name,c.address AS customer_address,m.brand,m.model,m.machine_type,m.serial_number,m.reg_number,
        u.assigned_customer_id AS technician_home_customer_id,hc.name AS technician_home_customer_name
        FROM digital_job_cards j JOIN breakdown_cases bc ON bc.id=j.case_id JOIN customers c ON c.id=j.customer_id JOIN machines m ON m.id=j.machine_id
        LEFT JOIN users u ON u.id=j.technician_id LEFT JOIN customers hc ON hc.id=u.assigned_customer_id WHERE j.id=?');
    $stmt->execute([$id]); $job=$stmt->fetch(); if(!$job)json_error('Job Card not found.',404); bw_case_access($ctx,$job['case_id']); bw_require_assigned_job($ctx,$job);
    $rows=[
        ['Job Card', $job['job_card_no']],
        ['Customer', $job['customer_name']],
        ['Machine', trim(($job['brand']??'').' '.($job['model']??''))],
        ['Machine Type', $job['machine_type']??''],
        ['Serial / Reg', $job['serial_number'] ?: ($job['reg_number'] ?: '-')],
        ['Status', $job['status']],
        ['Priority', $job['priority'] ?: 'NORMAL'],
        ['Due Date', !empty($job['due_date']) ? display_date_billing($job['due_date']) : '-'],
        ['Job Location', trim((string)($job['job_location'] ?? '')) ?: (trim((string)($job['customer_address'] ?? '')) ?: '-')],
        ['Issued By', $job['issued_by_name'] ?: ($job['generated_by_name'] ?: $job['customer_name'])],
        ['Issued At', display_date_billing($job['issued_at'] ?: $job['created_at'])],
        ['Technician', $job['technician_name'] ?: 'Unassigned'],
        ['Assignment', !empty($job['technician_id']) && !empty($job['technician_home_customer_id']) && (string)$job['technician_home_customer_id'] !== (string)$job['customer_id']
            ? 'TEMPORARY OVERRIDE - Home: '.($job['technician_home_customer_name'] ?: 'Other customer')
            : 'Normal / home-customer assignment'],
        ['Fault', $job['fault_description']],
        ['Diagnosis', $job['diagnosis'] ?: '-'],
        ['Work Done', $job['work_done'] ?: '-'],
        ['Test Result', $job['test_result'] ?: '-'],
        ['Completion Note', $job['completion_note'] ?: '-'],
        ['Repeat / Rework', !empty($job['repeat_issue']) ? 'YES' : 'NO'],
        ['Started', display_date_billing($job['started_at'])],
        ['Completed', display_date_billing($job['completed_at'])],
        ['Customer Sign-Off', !empty($job['signed_copy_data']) ? 'SIGNED COPY UPLOADED - '.($job['customer_signed_by_name'] ?: 'Customer') : 'WAITING CUSTOMER SIGNATURE'],
        ['Billing / Procurement', $job['billing_status'] ?: 'NOT_READY'],
        ['', ''],
        ['Technician Signature', '_________________________  Date: ______________'],
        ['Customer / Supervisor Signature', '_________________________  Date: ______________'],
        ['Issued By', ($job['issued_by_name'] ?: ($job['generated_by_name'] ?: $job['customer_name'])) . '  Date: ' . display_date_billing($job['issued_at'] ?: $job['created_at'])],
    ];
    output_table_pdf('BELM-'.$job['job_card_no'].'.pdf','DIGITAL JOB CARD',[
        'Generated: '.date('d/m/Y H:i'),
        'Breakdown process record - BELM Operations Portal',
        'Print, sign, and keep this copy for office records.',
    ],$rows);
}

if ($method === 'PUT' && $action === 'signed-job-card' && $id !== '') {
    if ($ctx['kind'] !== 'belm' || !empty($ctx['isTechnician'])) {
        json_error('BELM Workshop / Administration must upload the customer-signed Job Card.', 403);
    }
    $stmt=db()->prepare('SELECT * FROM digital_job_cards WHERE id=?');
    $stmt->execute([$id]);
    $job=$stmt->fetch();
    if(!$job) json_error('Job Card not found.',404);
    $case=bw_case_access($ctx,(string)$job['case_id']);
    if (($case['source_type'] ?? '') !== 'SERVICE_REQUEST') {
        json_error('Customer signed-copy upload is used for BELM Service Request Job Cards.', 422);
    }
    if (strtoupper((string)$job['status']) !== 'COMPLETED') {
        json_error('Complete the Technician Job Card before uploading the customer-signed copy.', 409);
    }
    if (strtoupper((string)($case['status'] ?? '')) !== 'COMPLETED') {
        json_error('Workshop testing must be completed and the machine returned to service before the signed Job Card is uploaded.', 409);
    }
    $b=body();
    $signedBy=trim((string)($b['signedByName']??''));
    $fileData=trim((string)($b['fileData']??''));
    $fileName=trim((string)($b['fileName']??''));
    if($signedBy==='') json_error('Enter the customer / supervisor name who signed the Job Card.');
    if($fileData==='') json_error('Choose the signed Job Card PDF or photo.');
    [$copyData,$copyMime,$copyName]=bw_signed_copy_upload($fileData,$fileName);
    db()->prepare(
        "UPDATE digital_job_cards SET customer_signed_by_name=?,customer_signed_at=NOW(),signed_copy_data=?,signed_copy_mime=?,signed_copy_name=?,signed_uploaded_by_name=?,signed_uploaded_at=NOW(),billing_status='READY_FOR_PROCUREMENT',updated_at=NOW() WHERE id=?"
    )->execute([$signedBy,$copyData,$copyMime,$copyName,$ctx['actorName'],$id]);
    bw_log((string)$job['case_id'],'COMPLETED','Procurement','Customer-signed Job Card uploaded - ready for Proforma / Invoice','Signed by '.$signedBy.'; uploaded by '.$ctx['actorName'],$ctx);
    try {
        customer_send_team_alert((string)$job['customer_id'],['machine-expenses'], 'SIGNED JOB CARD READY FOR PROCUREMENT - '.$job['job_card_no'],
            "Job Card {$job['job_card_no']} is complete and the customer-signed copy has been uploaded. Procurement can now follow Proforma / Invoice status.", true);
    } catch(Throwable $ignored) {}
    json_out(['ok'=>true,'billingStatus'=>'READY_FOR_PROCUREMENT','message'=>'Signed Job Card uploaded. Procurement / Billing follow-up is now active.']);
}

if ($method === 'GET' && $action === 'signed-job-card-file' && $id !== '') {
    $stmt=db()->prepare('SELECT id,case_id,job_card_no,technician_id,signed_copy_data,signed_copy_mime,signed_copy_name FROM digital_job_cards WHERE id=?');
    $stmt->execute([$id]);
    $job=$stmt->fetch();
    if(!$job) json_error('Job Card not found.',404);
    bw_case_access($ctx,(string)$job['case_id']);
    bw_require_assigned_job($ctx,$job);
    if(empty($job['signed_copy_data'])) json_error('Signed Job Card has not been uploaded yet.',404);
    $binary=base64_decode((string)$job['signed_copy_data'],true);
    if($binary===false) json_error('Signed Job Card file is damaged.',500);
    $mime=in_array((string)$job['signed_copy_mime'],['application/pdf','image/jpeg','image/png','image/webp'],true)?(string)$job['signed_copy_mime']:'application/pdf';
    $name=preg_replace('/[^A-Za-z0-9._-]+/','-',(string)($job['signed_copy_name']?:('Signed-'.$job['job_card_no'].'.pdf')));
    header('Content-Type: '.$mime);
    header('Content-Length: '.strlen($binary));
    header('Content-Disposition: '.(!empty($_GET['download'])?'attachment':'inline').'; filename="'.$name.'"');
    echo $binary; exit;
}

if ($method === 'GET' && $action === 'technician-jobs') {
    $isTechActor = !empty($ctx['isTechnician']) || ($ctx['kind']==='customer' && $ctx['role']==='technician');
    if(!$isTechActor) json_error('Technician login required.',403);
    $actorId=trim((string)($ctx['actorId']??''));
    if($actorId==='') json_error('Technician account identity is missing. Please log in again.',401);

    // V342 self-heal: Service Request assignment and Digital Job Card assignment
    // are one operational record. If an older/interrupted sync left the Job Card
    // without technician_id, repair it when that source request is assigned to
    // the logged-in Technician. Do not overwrite an explicit different assignee.
    try {
        db()->prepare(
            "UPDATE digital_job_cards j
             SET technician_id=sr.assigned_to_id,
                 technician_name=COALESCE(NULLIF(TRIM(u.name),''),NULLIF(TRIM(j.technician_name),''),?),
                 status=CASE WHEN UPPER(COALESCE(j.status,'')) IN ('OPEN','RECEIVED') THEN 'ASSIGNED' ELSE j.status END,
                 updated_at=NOW()
             FROM breakdown_cases bc
             JOIN service_requests sr ON bc.source_type='SERVICE_REQUEST' AND sr.id=bc.source_id
             LEFT JOIN users u ON u.id=sr.assigned_to_id
             WHERE j.case_id=bc.id
               AND sr.assigned_to_id=?
               AND j.technician_id IS NULL
               AND UPPER(COALESCE(j.status,''))<>'CANCELLED'"
        )->execute([(string)($ctx['actorName']??'Technician'),$actorId]);
        db()->prepare(
            "UPDATE digital_job_cards SET technician_name=?,updated_at=NOW()
             WHERE technician_id=? AND COALESCE(TRIM(technician_name),'')=''"
        )->execute([(string)($ctx['actorName']??'Technician'),$actorId]);
    } catch(Throwable $e) {
        error_log('Technician Job Card assignment recovery failed: '.$e->getMessage());
    }

    $params=[$actorId,$actorId];
    $where=["(j.technician_id=? OR (j.technician_id IS NULL AND bc.source_type='SERVICE_REQUEST' AND EXISTS (SELECT 1 FROM service_requests sr_fix WHERE sr_fix.id=bc.source_id AND sr_fix.assigned_to_id=?)))"];
    if($ctx['kind']==='customer') { $where[]='j.customer_id=?'; $params[]=$ctx['customerId']; }
    $machineId=trim((string)($_GET['machineId']??''));
    if($machineId!==''){ $where[]='j.machine_id=?'; $params[]=$machineId; }
    $stmt=db()->prepare(
        "SELECT j.id,j.case_id,j.customer_id,j.machine_id,j.job_card_no,j.title,j.fault_description,j.status,
                j.technician_id,j.technician_name,j.priority,j.due_date,j.job_location,j.diagnosis,j.work_done,j.test_result,j.completion_note,j.repeat_issue,
                j.issued_by_name,j.issued_by_type,j.issued_at,j.started_at,j.completed_at,j.created_at,j.updated_at,
                bc.status AS case_status,bc.current_stage,bc.current_department,bc.blocker_reason,bc.source_type,bc.source_id,
                c.name AS customer_name,c.address AS customer_address,m.brand,m.model,m.machine_type,m.serial_number,m.reg_number,
                (SELECT COUNT(*) FROM breakdown_spare_requests sr WHERE sr.job_card_id=j.id AND sr.status NOT IN ('REJECTED','PARTS_READY')) AS open_spare_requests,
                (SELECT string_agg(sr.spare_name, ', ' ORDER BY sr.requested_at) FROM breakdown_spare_requests sr WHERE sr.job_card_id=j.id AND sr.status NOT IN ('REJECTED','PARTS_READY')) AS required_spare
         FROM digital_job_cards j
         JOIN breakdown_cases bc ON bc.id=j.case_id
         JOIN customers c ON c.id=j.customer_id
         JOIN machines m ON m.id=j.machine_id
         WHERE ".implode(' AND ',$where)."
         ORDER BY CASE WHEN j.status='COMPLETED' THEN 1 ELSE 0 END, COALESCE(j.due_date,DATE '9999-12-31'), j.created_at DESC"
    );
    $stmt->execute($params); $rows=$stmt->fetchAll();
    foreach($rows as &$row){
        $row['machineLabel']=trim(($row['brand']??'').' '.($row['model']??'')) ?: ($row['machine_type']??'Machine');
        $row['openSpareRequests']=(int)($row['open_spare_requests']??0);
        $row['requiredSpare']=trim((string)($row['required_spare']??''));
        $row['assignedTechnicianId']=$row['technician_id']??null;
        $row['assignedTechnicianName']=trim((string)($row['technician_name']??'')) ?: (string)($ctx['actorName']??'Technician');
        // V343 portable field dispatch: every assigned Job Card carries the work site.
        $row['jobLocation']=trim((string)($row['job_location']??'')) ?: trim((string)($row['customer_address']??''));
        $row['remoteDispatch']=!empty($row['jobLocation']);
        unset($row['open_spare_requests'],$row['required_spare']);
    }
    unset($row);
    json_out($rows);
}

if ($method === 'GET' && $action === 'case' && $id !== '') {
    if (bw_is_technician_actor($ctx)) json_error('Technicians use My Job Cards; full Maintenance Process detail is restricted.',403);
    $case=bw_case_access($ctx,$id);
    $events=db()->prepare('SELECT stage,department,action,note,actor_name,created_at FROM breakdown_case_events WHERE case_id=? ORDER BY created_at ASC');
    $events->execute([$id]);
    $spares=db()->prepare('SELECT * FROM breakdown_spare_requests WHERE case_id=? ORDER BY requested_at ASC'); $spares->execute([$id]);
    $jobs=db()->prepare('SELECT j.*,u.name AS technician_account_name,u.assigned_customer_id AS technician_home_customer_id,hc.name AS technician_home_customer_name
        FROM digital_job_cards j LEFT JOIN users u ON u.id=j.technician_id LEFT JOIN customers hc ON hc.id=u.assigned_customer_id
        WHERE j.case_id=? ORDER BY j.created_at DESC'); $jobs->execute([$id]);
    $jobRows=$jobs->fetchAll();

    // V336: an older/interrupted Service Request may already be ASSIGNED while
    // the linked Job Card row is missing its copied Technician name/id. The
    // Service Request assignment remains authoritative for that legacy case, so
    // expose it as the effective assignment instead of showing "Select Technician".
    $sourceTechnicianId=''; $sourceTechnicianName='';
    if (strtoupper((string)($case['source_type'] ?? '')) === 'SERVICE_REQUEST' && !empty($case['source_id'])) {
        $sourceTech=db()->prepare('SELECT sr.assigned_to_id,u.name AS assigned_to_name FROM service_requests sr LEFT JOIN users u ON u.id=sr.assigned_to_id WHERE sr.id=? LIMIT 1');
        $sourceTech->execute([(string)$case['source_id']]);
        $sourceTechRow=$sourceTech->fetch() ?: [];
        $sourceTechnicianId=trim((string)($sourceTechRow['assigned_to_id'] ?? ''));
        $sourceTechnicianName=trim((string)($sourceTechRow['assigned_to_name'] ?? ''));
    }
    foreach($jobRows as &$jobRow){
        $jobTechId=trim((string)($jobRow['technician_id'] ?? ''));
        $jobTechName=trim((string)($jobRow['technician_name'] ?? ''));
        if ($jobTechName==='' && $jobTechId!=='') {
            $jobTechName=trim((string)($jobRow['technician_account_name'] ?? ''));
        }
        $jobState=strtoupper((string)($jobRow['status'] ?? ''));
        if ($jobTechId==='' && $sourceTechnicianId!=='' && in_array($jobState,['ASSIGNED','IN_PROGRESS'],true)) {
            $jobTechId=$sourceTechnicianId;
            $jobTechName=$sourceTechnicianName ?: 'Assigned Technician';
            $jobRow['technician_assignment_source']='SERVICE_REQUEST';
        }
        $jobRow['technician_id']=$jobTechId;
        $jobRow['technician_name']=$jobTechName;
        $jobRow['technicianId']=$jobTechId;
        $jobRow['technicianName']=$jobTechName;
        $jobRow['temporary_override']=$jobTechId!=='' && !empty($jobRow['technician_home_customer_id'])
            && (string)$jobRow['technician_home_customer_id'] !== (string)$jobRow['customer_id'];
        $jobRow['has_signed_copy']=!empty($jobRow['signed_copy_data']);
        unset($jobRow['signed_copy_data'],$jobRow['technician_account_name']);
    }
    unset($jobRow);
    json_out(['case'=>bw_case_view($case),'events'=>$events->fetchAll(),'spares'=>$spares->fetchAll(),'jobCards'=>$jobRows]);
}

if ($method === 'GET' && $action === 'sync') {
    if (bw_is_technician_actor($ctx)) json_error('Maintenance source synchronization is restricted to Workshop/Administration.',403);
    $scopeCustomer = in_array($ctx['kind'], ['customer','customer-tech'], true) ? $ctx['customerId'] : null;
    if ($ctx['kind']==='belm' && !empty($ctx['isTechnician'])) {
        if ($ctx['customerId']==='') json_out(['ok'=>true,'sync'=>['created'=>0,'serviceRequests'=>0,'operatorReports'=>0]]);
        $scopeCustomer = $ctx['customerId'];
    }
    $sync = belm_sync_breakdown_sources($scopeCustomer ?: null);
    json_out(['ok'=>true,'sync'=>$sync]);
}

if ($method === 'GET' && $action === 'from-report') {
    if (bw_is_technician_actor($ctx)) json_error('Technicians use assigned Job Cards; report-to-case management is restricted.',403);
    $reportId=trim((string)($_GET['reportId'] ?? '')); if($reportId==='') json_error('reportId is required.');
    $caseId=bw_ensure_case_from_report($reportId,$ctx); if(!$caseId) json_error('Report not found.',404);
    $case=bw_case_access($ctx,$caseId); json_out(['case'=>bw_case_view($case)]);
}

if ($method === 'GET' && $action === '') {
    if (bw_is_technician_actor($ctx)) json_error('Technicians use My Job Cards; full Maintenance Process list is restricted.',403);
    $params=[]; $where=['1=1'];
    if($ctx['kind']==='customer'){
        $where[]='bc.customer_id=?'; $params[]=$ctx['customerId'];
    } elseif($ctx['kind']==='customer-tech'){
        $where[]='bc.customer_id=?'; $params[]=$ctx['customerId'];
        $where[]='c.is_machinery_admin=1';
    } else {
        if(!empty($ctx['isTechnician'])) {
            // BELM technicians see provider-ON work for their home customer,
            // explicit Job Card overrides, or an official support request
            // assigned to them even when the customer runs its own workshop.
            if($ctx['customerId']!=='') {
                $where[]='((c.is_machinery_admin=0 AND bc.customer_id=?) OR EXISTS (SELECT 1 FROM digital_job_cards tj WHERE tj.case_id=bc.id AND tj.technician_id=?) OR (bc.source_type=\'SERVICE_REQUEST\' AND EXISTS (SELECT 1 FROM service_requests sr WHERE sr.id=bc.source_id AND sr.assigned_to_id=?)))';
                $params[]=$ctx['customerId'];
                $params[]=$ctx['actorId'];
                $params[]=$ctx['actorId'];
            } else {
                $where[]='(EXISTS (SELECT 1 FROM digital_job_cards tj WHERE tj.case_id=bc.id AND tj.technician_id=?) OR (bc.source_type=\'SERVICE_REQUEST\' AND EXISTS (SELECT 1 FROM service_requests sr WHERE sr.id=bc.source_id AND sr.assigned_to_id=?)))';
                $params[]=$ctx['actorId'];
                $params[]=$ctx['actorId'];
            }
        } else {
            // BELM Admin/Engineer normally sees provider-ON customers.
            // Exception: an official BELM Support Request is intentionally
            // visible even when the customer uses its own maintenance team.
            $where[]='(c.is_machinery_admin=0 OR bc.source_type=\'SERVICE_REQUEST\')';
        }
    }
    $machineId=trim((string)($_GET['machineId'] ?? '')); if($machineId!==''){ $where[]='bc.machine_id=?'; $params[]=$machineId; }
    $where[]="bc.status <> 'COMPLETED'";
    $stmt=db()->prepare('SELECT bc.*,c.name customer_name,c.is_machinery_admin,m.brand,m.model,m.machine_type,m.serial_number,m.reg_number FROM breakdown_cases bc JOIN customers c ON c.id=bc.customer_id JOIN machines m ON m.id=bc.machine_id WHERE '.implode(' AND ',$where).' ORDER BY bc.opened_at DESC, bc.updated_at DESC');
    $stmt->execute($params); $out=[]; foreach($stmt->fetchAll() as $r)$out[]=bw_case_view($r); json_out($out);
}

if ($method === 'POST' && $action === 'case') {
    if($ctx['kind']!=='customer') json_error('Create the case from the customer workflow or problem report.',403);
    if(!$ctx['isOwner'] && !in_array($ctx['role'],['workshop_manager','admin'],true)) json_error('Only Administration/Customer Admin or Workshop Manager can open a manual Breakdown Case. Operators should use Report Problem.',403);
    $b=body(); $machineId=trim((string)($b['machineId']??'')); $desc=trim((string)($b['description']??'')); $title=trim((string)($b['title']??'Machine Breakdown'));
    if($machineId===''||$desc==='') json_error('Machine and problem description are required.');
    $m=db()->prepare('SELECT 1 FROM machines WHERE id=? AND customer_id=? AND deleted_at IS NULL'); $m->execute([$machineId,$ctx['customerId']]); if(!$m->fetch())json_error('Machine not found.',404);
    $caseId=uuid(); db()->prepare("INSERT INTO breakdown_cases(id,customer_id,machine_id,title,description,status,current_stage,current_department,opened_at,stage_started_at,updated_at,created_by_name) VALUES(?,?,?,?,?,'OPEN','WORKSHOP_REVIEW','Workshop',NOW(),NOW(),NOW(),?)")->execute([$caseId,$ctx['customerId'],$machineId,$title,$desc,$ctx['actorName']]);
    bw_log($caseId,'WORKSHOP_REVIEW','Workshop','Breakdown case opened',$desc,$ctx); json_out(['id'=>$caseId],201);
}

if ($method === 'POST' && $action === 'job-card') {
    if (bw_is_technician_actor($ctx)) json_error('Technicians cannot issue Job Cards. Workshop/Administration must issue and assign them.',403);
    $b=body(); $caseId=trim((string)($b['caseId']??'')); $case=bw_case_access($ctx,$caseId);
    if($ctx['kind']==='customer' && !$ctx['isOwner'] && !in_array($ctx['role'],['workshop_manager','admin'],true)) json_error('Only Customer Admin or Workshop Manager can issue an internal Customer Job Card.',403);
    if($ctx['kind']==='customer' && empty($case['is_machinery_admin'])) json_error('BELM is the active service provider for this customer. Customer staff cannot assign BELM employees. Customer Admin must send the Job Card to BELM Support, then BELM Admin/Engineer assigns a BELM Technician.',403);
    if($ctx['kind']==='customer-tech') json_error('Technicians cannot generate or assign Job Cards. Customer Admin / Workshop Manager must issue the Job Card.',403);
    if($ctx['kind']==='belm' && empty($case['is_machinery_admin'])===false) json_error('This customer uses its own maintenance team. BELM can work here only after an official Job Card / Support Request is sent by Customer Admin.',403);
    $techId=trim((string)($b['technicianId']??'')); $techName=null; $temporaryOverride=false; $techHomeName=null;
    if($techId!==''){
        $t=db()->prepare("SELECT u.name,u.assigned_customer_id,u.is_customer_managed,hc.name AS home_customer_name
                          FROM users u JOIN roles r ON r.id=u.role_id
                          LEFT JOIN customers hc ON hc.id=u.assigned_customer_id
                          WHERE u.id=? AND u.is_active=1 AND u.deleted_at IS NULL
                            AND (r.name='Technician' OR EXISTS (
                                 SELECT 1 FROM user_roles ur JOIN roles rr ON rr.id=ur.role_id
                                 WHERE ur.user_id=u.id AND rr.name='Technician' AND rr.deleted_at IS NULL
                            ))");
        $t->execute([$techId]); $tech=$t->fetch(); if(!$tech)json_error('Selected Technician is not available.');
        $techName=(string)$tech['name']; $techHomeName=$tech['home_customer_name']??null;
        $temporaryOverride=!empty($tech['assigned_customer_id']) && (string)$tech['assigned_customer_id']!==(string)$case['customer_id'];
        if($ctx['kind']==='belm') {
            if(!empty($tech['is_customer_managed'])) json_error('Customer-managed Technicians cannot be borrowed by BELM. Select a BELM Technician.',403);
            if($temporaryOverride) {
                if(empty($b['temporaryOverride'])) json_error('Selected Technician belongs to another customer. Confirm Temporary Override for this Job Card.',409);
                if(empty($ctx['canOverrideTechnician'])) json_error('Only BELM Super Admin or Engineer can use a Temporary Technician Override.',403);
            }
        } else {
            if($temporaryOverride || (string)$tech['assigned_customer_id']!==(string)$case['customer_id']) json_error('Selected Technician is not available for this customer.',403);
        }
    }
    $title=trim((string)($b['title']??$case['title']));
    $jobLocation=trim((string)($b['jobLocation']??''));
    if($jobLocation==='') $jobLocation=trim((string)($case['customer_address']??''));
    $initialJobStatus=$techId!==''?'ASSIGNED':'RECEIVED';
    // V314 - a case created FROM a customer's Service Request already gets
    // its Job Card auto-issued the moment the request comes in (see
    // belm_ensure_service_request_job_card()) — that's the one card
    // Engineering "receives" per the intended flow: Customer Service
    // Request -> BELM Engineering receives the Job Card -> BELM Admin
    // assigns a Technician. This button had no check at all for that
    // already-existing card and always inserted a brand new one, so
    // every case with a Service-Request-issued card ended up with two
    // Job Cards the moment anyone used this button too. Now: if an
    // open (not completed/cancelled) Job Card already exists for this
    // case, assign/update THAT one instead of creating a second.
    $existingJob = db()->prepare(
        "SELECT id, job_card_no, status, technician_id FROM digital_job_cards
         WHERE case_id = ? AND status NOT IN ('COMPLETED','CANCELLED')
         ORDER BY created_at ASC LIMIT 1"
    );
    $existingJob->execute([$caseId]);
    $existingJobRow = $existingJob->fetch();
    if ($existingJobRow) {
        if (!empty($existingJobRow['technician_id'] ?? null) || in_array(strtoupper((string)$existingJobRow['status']), ['ASSIGNED', 'IN_PROGRESS'], true)) {
            json_error('Job Card '.$existingJobRow['job_card_no'].' already exists for this case and is already assigned. Use Technician Dispatch / handover instead of generating a new one.', 409);
        }
        $jobId = (string)$existingJobRow['id'];
        $num = (string)$existingJobRow['job_card_no'];
        db()->prepare(
            "UPDATE digital_job_cards
             SET technician_id=?,technician_name=?,status=?,job_location=COALESCE(NULLIF(?,''),job_location),updated_at=NOW()
             WHERE id=?"
        )->execute([$techId?:null,$techName?:null,$initialJobStatus,$jobLocation,$jobId]);
    } else {
        $num='JC-'.date('ym').'-'.str_pad((string)db()->query("SELECT nextval('breakdown_job_card_seq')")->fetchColumn(),4,'0',STR_PAD_LEFT);
        $jobId=uuid();
        db()->prepare("INSERT INTO digital_job_cards(id,case_id,customer_id,machine_id,job_card_no,title,fault_description,technician_id,technician_name,status,job_location,generated_by_name,issued_by_name,issued_by_type,issued_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())")->execute([$jobId,$caseId,$case['customer_id'],$case['machine_id'],$num,$title,$case['description'],$techId?:null,$techName?:null,$initialJobStatus,$jobLocation?:null,$ctx['actorName'],$ctx['actorName'],strtoupper((string)$ctx['kind']),date('c')]);
    }
    if ($techId !== '') {
        bw_set_stage($caseId,'JOB_CARD_ASSIGNED',null,$ctx,'Digital Job Card '.$num.' generated and assigned');
    } else {
        bw_set_stage($caseId,'TECHNICIAN_ASSIGNMENT','Awaiting Technician Assignment',$ctx,'Digital Job Card '.$num.' generated - waiting Technician assignment');
    }
    if ($temporaryOverride && $techId!=='') {
        bw_log($caseId,'JOB_CARD_ASSIGNED','Technician','Temporary Technician Override - '.$techName,
            'Home customer: '.($techHomeName ?: 'Unassigned').'. Override applies only to Job Card '.$num.'.', $ctx);
    }
    if ($techId!=='') {
        try { $te=db()->prepare('SELECT email FROM users WHERE id=?'); $te->execute([$techId]); $email=trim((string)$te->fetchColumn()); if(filter_var($email,FILTER_VALIDATE_EMAIL)) send_email($email,'DIGITAL JOB CARD '.$num,"Job Card $num has been assigned to you.".($temporaryOverride?"\nAssignment: TEMPORARY OVERRIDE (your permanent customer has not changed).":"")."\nMachine: ".$case['brand'].' '.$case['model'].($jobLocation!==''?"\nJob location: $jobLocation\nNavigate: https://www.google.com/maps/dir/?api=1&destination=".rawurlencode($jobLocation):'')."\nFault: ".$case['description']."\nOpen Technician > My Job Cards."); } catch(Throwable $e) {}
    }
    json_out(['id'=>$jobId,'jobCardNo'=>$num],201);
}

if ($method === 'POST' && $action === 'spare') {
    $b=body(); $caseId=trim((string)($b['caseId']??'')); $case=bw_case_access($ctx,$caseId);
    $jobCardId=trim((string)($b['jobCardId']??''));
    if (bw_is_technician_actor($ctx) && $jobCardId==='') json_error('A Technician spare request must come from an assigned Job Card.',403);
    if ($jobCardId!=='') {
        $jobCheck=db()->prepare('SELECT id,case_id,technician_id FROM digital_job_cards WHERE id=?');
        $jobCheck->execute([$jobCardId]); $jobForSpare=$jobCheck->fetch();
        if(!$jobForSpare || (string)$jobForSpare['case_id']!==$caseId) json_error('The selected Job Card does not belong to this maintenance case.',422);
        bw_require_assigned_job($ctx,$jobForSpare);
    }
    $name=trim((string)($b['spareName']??'')); $qty=(float)($b['quantity']??1); if($name===''||$qty<=0)json_error('Spare name and quantity are required.');
    $spareId=uuid(); db()->prepare("INSERT INTO breakdown_spare_requests(id,case_id,job_card_id,spare_name,part_number,quantity,unit,reason,status,requested_by_name,requested_at,updated_at) VALUES(?,?,?,?,?,?,?,?, 'WAITING_BOSS_APPROVAL',?,NOW(),NOW())")->execute([$spareId,$caseId,$jobCardId!==''?$jobCardId:null,$name,trim((string)($b['partNumber']??''))?:null,$qty,trim((string)($b['unit']??'pcs'))?:'pcs',trim((string)($b['reason']??''))?:null,$ctx['actorName']]);
    bw_set_stage($caseId,'BOSS_APPROVAL','Waiting for Administration approval of spare request',$ctx,'Spare requested - waiting Administration approval');
    try {
        $owner = db()->prepare('SELECT email FROM customers WHERE id=? AND is_active=1 AND deleted_at IS NULL');
        $owner->execute([(string)$case['customer_id']]);
        $ownerEmail = trim((string)$owner->fetchColumn());
        if (filter_var($ownerEmail, FILTER_VALIDATE_EMAIL)) {
            send_email($ownerEmail, 'SPARE APPROVAL REQUIRED - '.$case['model'],
                "Administration approval required\nMachine: ".$case['brand'].' '.$case['model']."\nSpare: $name\nQty: $qty\nRequested by: ".$ctx['actorName']."\nOpen Breakdown Workflow to approve or reject.");
        }
    } catch(Throwable $e) {}
    json_out(['id'=>$spareId],201);
}

if ($method === 'PUT' && $action === 'approve-spare' && $id !== '') {
    if($ctx['kind']!=='customer'||!$ctx['isOwner']) json_error('Only the main Customer Administration/Owner can approve spare requests.',403);
    $stmt=db()->prepare('SELECT bsr.*,bc.customer_id FROM breakdown_spare_requests bsr JOIN breakdown_cases bc ON bc.id=bsr.case_id WHERE bsr.id=?'); $stmt->execute([$id]); $s=$stmt->fetch(); if(!$s||$s['customer_id']!==$ctx['customerId'])json_error('Spare request not found.',404);
    $b=body(); $approve=!empty($b['approve']); $status=$approve?'APPROVED':'REJECTED';
    db()->prepare('UPDATE breakdown_spare_requests SET status=?,approved_by_name=?,approved_at=NOW(),approval_note=?,updated_at=NOW() WHERE id=?')->execute([$status,$ctx['actorName'],trim((string)($b['note']??''))?:null,$id]);
    bw_set_stage($s['case_id'],$approve?'STORE_CHECK':'DIAGNOSIS',$approve?null:'Spare rejected by Administration',$ctx,$approve?'Spare approved by Administration':'Spare rejected by Administration');
    if ($approve) { try { customer_send_team_alert($ctx['customerId'],['store'],'SPARE APPROVED - STORE ACTION REQUIRED',"Administration approved spare: {$s['spare_name']} x {$s['quantity']}. Check Customer Store; if unavailable send to Procurement.",false); } catch(Throwable $e) {} }
    json_out(['ok'=>true,'status'=>$status]);
}

if ($method === 'PUT' && $action === 'spare-status' && $id !== '') {
    if (bw_is_technician_actor($ctx)) json_error('Technicians request spares from Job Cards; Store/Procurement status is managed by authorized departments.',403);
    $stmt=db()->prepare('SELECT bsr.*,bc.customer_id FROM breakdown_spare_requests bsr JOIN breakdown_cases bc ON bc.id=bsr.case_id WHERE bsr.id=?'); $stmt->execute([$id]); $s=$stmt->fetch(); if(!$s)json_error('Spare request not found.',404); bw_case_access($ctx,$s['case_id']);
    $b=body(); $status=strtoupper(trim((string)($b['status']??''))); $allowed=['STORE_AVAILABLE','PROCUREMENT_REQUIRED','PI_WAITING_ACCOUNTS','ORDERED','PARTS_READY']; if(!in_array($status,$allowed,true))json_error('Invalid spare process status.');
    if ($ctx['kind']==='customer' && !$ctx['isOwner']) {
        $role=$ctx['role'];
        if (in_array($status,['STORE_AVAILABLE','PROCUREMENT_REQUIRED','PARTS_READY'],true) && !in_array($role,['store_keeper','workshop_manager','admin'],true)) json_error('Store Keeper or Workshop Manager action required.',403);
        if (in_array($status,['PI_WAITING_ACCOUNTS','ORDERED'],true) && !in_array($role,['procurement','accounts','admin'],true)) json_error('Procurement or Accounts action required.',403);
    }
    $stage=match($status){'STORE_AVAILABLE','PARTS_READY'=>'PARTS_READY','PROCUREMENT_REQUIRED','ORDERED'=>'PROCUREMENT','PI_WAITING_ACCOUNTS'=>'ACCOUNTS',default=>'STORE_CHECK'};
    db()->prepare('UPDATE breakdown_spare_requests SET status=?,fulfilled_by_name=CASE WHEN ?=\'PARTS_READY\' THEN ? ELSE fulfilled_by_name END,fulfilled_at=CASE WHEN ?=\'PARTS_READY\' THEN NOW() ELSE fulfilled_at END,updated_at=NOW() WHERE id=?')->execute([$status,$status,$ctx['actorName'],$status,$id]);
    bw_set_stage($s['case_id'],$stage,trim((string)($b['note']??''))?:null,$ctx,'Spare process: '.$status);
    try {
        if ($status==='PROCUREMENT_REQUIRED') customer_send_team_alert((string)$s['customer_id'],['service-request','store'],'PROCUREMENT ACTION REQUIRED','Approved spare is not available in Store. Procurement action is required. Open Breakdown Workflow.',true);
        if ($status==='PI_WAITING_ACCOUNTS') customer_send_team_alert((string)$s['customer_id'],['email'],'ACCOUNTS / PI ACTION REQUIRED','Procurement has sent a breakdown spare requirement to Accounts. Open Breakdown Workflow.',true);
        if ($status==='PARTS_READY') customer_send_team_alert((string)$s['customer_id'],['workflow'],'PARTS READY - REPAIR CAN CONTINUE','Required spare is ready. Workshop / Technician can continue repair.',true);
    } catch(Throwable $e) {}
    json_out(['ok'=>true]);
}


// V403 - opening the assigned Job Card is a real process event.
// This is idempotent: repeat opens never create duplicate history events.
if ($method === 'PUT' && $action === 'job-open' && $id !== '') {
    $stmt=db()->prepare('SELECT jc.*,bc.current_stage,bc.status AS case_status FROM digital_job_cards jc JOIN breakdown_cases bc ON bc.id=jc.case_id WHERE jc.id=?');
    $stmt->execute([$id]);
    $job=$stmt->fetch();
    if(!$job) json_error('Job Card not found.',404);
    bw_case_access($ctx,(string)$job['case_id']);
    if(!bw_is_technician_actor($ctx)) json_error('Only the assigned Technician can open this Job Card.',403);
    bw_require_assigned_job($ctx,$job);
    $firstOpen=empty($job['started_at']);
    if($firstOpen){
        db()->prepare("UPDATE digital_job_cards SET started_at=COALESCE(started_at,NOW()),status=CASE WHEN UPPER(COALESCE(status,'')) IN ('ASSIGNED','OPEN','RECEIVED') THEN 'IN_PROGRESS' ELSE status END,updated_at=NOW() WHERE id=?")
            ->execute([$id]);
        $stage=strtoupper(trim((string)($job['current_stage']??'')));
        if(in_array($stage,['JOB_CARD_ASSIGNED','TECHNICIAN_ASSIGNMENT','WORKSHOP_REVIEW'],true)){
            bw_set_stage((string)$job['case_id'],'DIAGNOSIS',null,$ctx,'Technician opened Job Card');
        }else{
            bw_log((string)$job['case_id'],$stage?:'DIAGNOSIS','Technician','Technician opened Job Card',null,$ctx);
        }
    }
    json_out(['ok'=>true,'firstOpen'=>$firstOpen,'process'=>'OPENED']);
}

if ($method === 'PUT' && $action === 'job-report' && $id !== '') {
    $stmt=db()->prepare('SELECT jc.* FROM digital_job_cards jc JOIN breakdown_cases bc ON bc.id=jc.case_id WHERE jc.id=?'); $stmt->execute([$id]); $job=$stmt->fetch(); if(!$job)json_error('Job Card not found.',404); $case=bw_case_access($ctx,$job['case_id']);
    if($ctx['kind']==='customer' && $ctx['role']!=='technician') json_error('Technician report must be saved from a Technician login.',403);
    $isTechActor=!empty($ctx['isTechnician']) || ($ctx['kind']==='customer' && $ctx['role']==='technician');
    if(!$isTechActor) json_error('Only a Technician can save the technical Job Card report.',403);
    bw_require_assigned_job($ctx,$job);
    $b=body(); $complete=!empty($b['complete']);
    $diagnosis=trim((string)($b['diagnosis']??''));
    $work=trim((string)($b['workDone']??''));
    $requiredSpare=trim((string)($b['requiredSpare']??''));
    $requiredSpareQty=(float)($b['requiredSpareQty']??1);
    if($requiredSpare!=='' && $requiredSpareQty<=0) json_error('Required Spare quantity must be greater than zero.');
    if($diagnosis==='') json_error('Diagnosis is required.');
    if($complete && $work==='') json_error('Work done is required before sending the Job Card to Testing.');
    $activeSpareStmt=db()->prepare("SELECT COUNT(*) AS total,string_agg(spare_name, ', ' ORDER BY requested_at) AS names FROM breakdown_spare_requests WHERE job_card_id=? AND UPPER(COALESCE(status,'')) NOT IN ('REJECTED','PARTS_READY')");
    $activeSpareStmt->execute([$id]);
    $activeSpareRow=$activeSpareStmt->fetch()?:['total'=>0,'names'=>''];
    $activeSpareCount=(int)($activeSpareRow['total']??0);
    $activeSpareNames=trim((string)($activeSpareRow['names']??''));
    if($complete && ($requiredSpare!=='' || $activeSpareCount>0)) json_error('A Job Card with a Required Spare must wait for the spare before Testing.',409);
    $repeatProvided=array_key_exists('repeatIssue',$b);
    $repeat=!empty($b['repeatIssue']);
    if ($complete && !$repeatProvided) {
        $rp=db()->prepare("SELECT 1 FROM digital_job_cards WHERE id<>? AND machine_id=? AND status='COMPLETED' AND LOWER(TRIM(title))=LOWER(TRIM(?)) AND completed_at >= NOW()-INTERVAL '30 days' LIMIT 1");
        $rp->execute([$id,$job['machine_id'],$job['title']]);
        $repeat=(bool)$rp->fetchColumn();
    }
    db()->prepare("UPDATE digital_job_cards SET technician_id=?,technician_name=?,diagnosis=?,work_done=?,test_result=?,completion_note=?,repeat_issue=?,status=?,started_at=COALESCE(started_at,NOW()),completed_at=CASE WHEN ? THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=?")
        ->execute([$ctx['actorId'],$ctx['actorName'],$diagnosis,$work?:null,trim((string)($b['testResult']??''))?:null,trim((string)($b['completionNote']??''))?:null,$repeat?1:0,$complete?'COMPLETED':'IN_PROGRESS',$complete?1:0,$id]);
    $spareCreated=false;
    if($requiredSpare!==''){
        $existingSpare=db()->prepare("SELECT id FROM breakdown_spare_requests WHERE job_card_id=? AND LOWER(TRIM(spare_name))=LOWER(TRIM(?)) AND UPPER(COALESCE(status,'')) NOT IN ('REJECTED','PARTS_READY') LIMIT 1");
        $existingSpare->execute([$id,$requiredSpare]);
        if(!$existingSpare->fetchColumn()){
            db()->prepare("INSERT INTO breakdown_spare_requests(id,case_id,job_card_id,spare_name,quantity,unit,reason,status,requested_by_name,requested_at,updated_at) VALUES(?,?,?,?,?,'pcs','Required from Technician Diagnosis Report','WAITING_BOSS_APPROVAL',?,NOW(),NOW())")
                ->execute([uuid(),$job['case_id'],$id,$requiredSpare,$requiredSpareQty,$ctx['actorName']]);
            $spareCreated=true;
            try{
                $owner=db()->prepare('SELECT email FROM customers WHERE id=? AND is_active=1 AND deleted_at IS NULL');
                $owner->execute([(string)$job['customer_id']]);
                $ownerEmail=trim((string)$owner->fetchColumn());
                if(filter_var($ownerEmail,FILTER_VALIDATE_EMAIL)) send_email($ownerEmail,'SPARE APPROVAL REQUIRED - JOB CARD '.$job['job_card_no'],"Required spare from Technician Diagnosis Report
Job Card: {$job['job_card_no']}
Spare: $requiredSpare x $requiredSpareQty
Technician: {$ctx['actorName']}
Open Breakdown Workflow to approve or reject.");
            }catch(Throwable $e){}
        }
        bw_set_stage($job['case_id'],'BOSS_APPROVAL','Required spare: '.$requiredSpare,$ctx,'Diagnosis saved - waiting required spare');
    }elseif($activeSpareCount>0){
        bw_set_stage($job['case_id'],'BOSS_APPROVAL','Required spare: '.($activeSpareNames?:'Waiting for spare'),$ctx,'Diagnosis updated - required spare still waiting');
    }else{
        bw_set_stage($job['case_id'],$complete?'TESTING':'REPAIR',null,$ctx,$complete?'Technician repair completed - waiting Workshop test':'Technician Diagnosis Report saved');
    }
    if (($case['source_type'] ?? '') === 'SERVICE_REQUEST' && !empty($case['source_id'])) {
        // Technician work means the support request is operationally in progress.
        // Completion remains a Workshop decision after testing; do not close it here.
        $srState=db()->prepare('SELECT status FROM service_requests WHERE id=?');
        $srState->execute([(string)$case['source_id']]);
        $oldSrStatus=strtoupper((string)($srState->fetchColumn() ?: ''));
        if (in_array($oldSrStatus,['OPEN','ASSIGNED'],true)) {
            db()->prepare("UPDATE service_requests SET status='IN_PROGRESS',started_by_id=COALESCE(started_by_id,?),started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE id=?")
                ->execute([$ctx['kind']==='belm' ? ($ctx['actorId']??null) : null,(string)$case['source_id']]);
            db()->prepare('INSERT INTO service_request_history(id,request_id,event_type,from_value,to_value,actor_id,actor_name,note,created_at) VALUES(?,?,?,?,?,?,?,?,NOW())')
                ->execute([uuid(),(string)$case['source_id'],'STATUS',$oldSrStatus,'IN_PROGRESS',$ctx['kind']==='belm'?($ctx['actorId']??null):null,$ctx['actorName'],'Synchronized from Technician Job Card '.$job['job_card_no']]);
        }
    }
    // V324: Technician Job Report delivery is explicit and auditable. The
    // Job Card/workflow update is already committed before notification, so
    // email failures never make the Technician lose the technical report.
    $customerDelivery=['sent'=>0,'failed'=>0,'recipients'=>[]];
    $belmDelivery=['sent'=>0,'failed'=>0,'recipients'=>[]];
    $portalCommunicationId=null;
    $customerSubject='TECHNICIAN JOB CARD UPDATE - '.$job['job_card_no'];
    $jobReportStatus=($requiredSpare!==''||$activeSpareCount>0)?'Waiting for Spare':($complete?'Testing':'Diagnosis Report / In progress');
    $customerBody="Job Card: {$job['job_card_no']}\nTechnician: {$ctx['actorName']}\nDiagnosis: $diagnosis\nWork done: $work\nStatus: $jobReportStatus".(($requiredSpare!==''||$activeSpareNames!=='')?"\nRequired spare: ".($requiredSpare?:$activeSpareNames):'').($repeat?'\nRepeat/Rework: YES':'');
    try {
        $customerDelivery=customer_send_team_alert((string)$case['customer_id'],['workflow','check-up'],$customerSubject,$customerBody,true);
    } catch(Throwable $e) {}

    // Any BELM-owned Technician who can update this Job Card must notify BELM,
    // including official Support Requests for a self-managed Customer. V323
    // incorrectly skipped that latter case because is_machinery_admin=1.
    if ($ctx['kind']==='belm') {
        $portalCommunicationId=belm_log_customer_communication(
            (string)$case['customer_id'],
            (string)$job['machine_id'],
            'BELM_TO_CUSTOMER',
            'PORTAL',
            $customerSubject,
            $customerBody,
            'JOB_CARD',
            (string)$job['id'],
            (string)$ctx['actorName'],
            'SENT'
        );
        try {
            $belmDelivery=belm_send_customer_to_belm_alert(
                ['service-requests'],
                'BELM TECHNICIAN JOB CARD UPDATE - '.$job['job_card_no'],
                "Technician: {$ctx['actorName']}\nMachine: ".$case['brand'].' '.$case['model']."\nDiagnosis: $diagnosis\nWork done: $work\nStatus: $jobReportStatus".(($requiredSpare!==''||$activeSpareNames!=='')?"\nRequired spare: ".($requiredSpare?:$activeSpareNames):'')
            );
        } catch(Throwable $e) {}
    }
    json_out([
        'ok'=>true,
        'repeatIssue'=>$repeat,
        'requiredSpare'=>$requiredSpare,
        'spareRequestCreated'=>$spareCreated,
        'delivery'=>[
            'customer'=>[
                'portalRecorded'=>true,
                'emailsSent'=>(int)($customerDelivery['sent']??0),
                'emailFailures'=>(int)($customerDelivery['failed']??0),
            ],
            'belm'=>[
                'required'=>$ctx['kind']==='belm',
                'workflowSynced'=>true,
                'portalCommunicationId'=>$portalCommunicationId,
                'emailsSent'=>(int)($belmDelivery['sent']??0),
                'emailFailures'=>(int)($belmDelivery['failed']??0),
            ],
        ],
    ]);
}

if ($method === 'PUT' && $action === 'stage' && $id !== '') {
    if (bw_is_technician_actor($ctx)) json_error('Technicians update work through My Job Cards; main Maintenance Process stages are restricted.',403);
    $case=bw_case_access($ctx,$id); $b=body(); $stage=strtoupper(trim((string)($b['stage']??''))); $note=trim((string)($b['note']??''));
    if($ctx['kind']==='customer' && !$ctx['isOwner'] && !in_array($ctx['role'],['workshop_manager','admin'],true)) json_error('Only Workshop Manager or Administration can move the main breakdown stage.',403);
    if($ctx['kind']==='customer-tech') json_error('Technicians update the process through their Digital Job Card report.',403);
    if (in_array($stage, ['JOB_CARD_ASSIGNED','DIAGNOSIS','REPAIR'], true)) {
        $assignedJob = db()->prepare("SELECT 1 FROM digital_job_cards WHERE case_id=? AND status NOT IN ('COMPLETED','CANCELLED') AND technician_id IS NOT NULL LIMIT 1");
        $assignedJob->execute([$id]);
        if (!$assignedJob->fetchColumn()) {
            json_error('Assign a Technician to the active Job Card before moving this case to Technician Diagnosis/Repair.',409);
        }
    }
    if ($stage === 'COMPLETED') {
        // V307: a Service Request cannot skip the Technician Job Card / Workshop
        // test simply by moving the main process directly to COMPLETED.
        $jobCount = db()->prepare(
            "SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE status='COMPLETED') AS completed
             FROM digital_job_cards WHERE case_id=?"
        );
        $jobCount->execute([$id]);
        $jobs = $jobCount->fetch() ?: ['total'=>0,'completed'=>0];
        $totalJobs = (int)($jobs['total'] ?? 0);
        $completedJobs = (int)($jobs['completed'] ?? 0);
        if (($case['source_type'] ?? '') === 'SERVICE_REQUEST' && $totalJobs === 0) {
            json_error('Create and complete the Service Request Job Card before Workshop closure.',409);
        }
        if ($totalJobs > 0 && $completedJobs !== $totalJobs) {
            json_error('All Job Cards must be completed before Workshop can return the machine to service.',409);
        }
    }
    bw_set_stage($id,$stage,$note?:null,$ctx,$stage==='COMPLETED'?'Machine returned to service':'Workflow stage updated'); json_out(['ok'=>true]);
}

json_error('Unknown breakdown workflow request.',404);
