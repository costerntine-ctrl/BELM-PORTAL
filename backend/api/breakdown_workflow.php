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
    ];
}

function bw_case_access(array $ctx, string $caseId): array {
    $stmt = db()->prepare(
        'SELECT bc.*, c.name AS customer_name, c.is_machinery_admin,
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
        // BELM can see customer workflow only while BELM Service Provider is ON.
        if (!empty($case['is_machinery_admin'])) json_error('This customer is using its own maintenance team.', 403);
        if (!empty($ctx['isTechnician']) && $ctx['customerId'] !== '' && $ctx['customerId'] !== (string)$case['customer_id']) {
            json_error('This machine is not assigned to this Technician.', 403);
        }
    }
    return $case;
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

function bw_report_scope(array $ctx): array {
    if ($ctx['kind'] === 'customer') {
        $stmt = db()->prepare('SELECT name FROM customers WHERE id=? AND deleted_at IS NULL');
        $stmt->execute([$ctx['customerId']]);
        $name = (string)($stmt->fetchColumn() ?: 'Customer');
        return ['sql' => 'bc.customer_id=?', 'jobSql' => 'j.customer_id=?', 'params' => [$ctx['customerId']], 'jobParams' => [$ctx['customerId']], 'label' => $name];
    }
    return ['sql' => 'c.is_machinery_admin=0', 'jobSql' => 'c.is_machinery_admin=0', 'params' => [], 'jobParams' => [], 'label' => 'BELM Service Provider Customers'];
}

function bw_department_report_data(array $ctx, string $period, string $anchorDate): array {
    bw_report_access($ctx);
    [$period, $start, $end, $periodLabel] = bw_report_range($period, $anchorDate);
    $scope = bw_report_scope($ctx);

    $caseBase = ' FROM breakdown_cases bc JOIN customers c ON c.id=bc.customer_id JOIN machines m ON m.id=bc.machine_id WHERE ' . $scope['sql'];
    $jobBase = ' FROM digital_job_cards j JOIN customers c ON c.id=j.customer_id JOIN machines m ON m.id=j.machine_id WHERE ' . $scope['jobSql'];

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
    $customerId = trim((string)($_GET['customerId'] ?? $ctx['customerId']));
    if (in_array($ctx['kind'],['customer','customer-tech'],true) && $customerId !== $ctx['customerId']) json_error('Not allowed.',403);
    $mode = db()->prepare('SELECT is_machinery_admin FROM customers WHERE id=?'); $mode->execute([$customerId]);
    $selfService = !empty($mode->fetchColumn());
    $sql = "SELECT u.id,u.name,u.email,u.is_customer_managed FROM users u JOIN roles r ON r.id=u.role_id
            WHERE r.name='Technician' AND u.is_active=1 AND u.deleted_at IS NULL AND u.assigned_customer_id=?";
    if ($selfService) $sql .= ' AND u.is_customer_managed=1'; else $sql .= ' AND u.is_customer_managed=0';
    $sql .= ' ORDER BY u.name';
    $stmt=db()->prepare($sql); $stmt->execute([$customerId]);
    json_out($stmt->fetchAll());
}

if ($method === 'GET' && $action === 'performance') {
    $customerId = trim((string)($_GET['customerId'] ?? $ctx['customerId']));
    if (in_array($ctx['kind'],['customer','customer-tech'],true) && $customerId !== $ctx['customerId']) json_error('Not allowed.',403);
    if ($customerId==='' && $ctx['kind']==='belm') {
        $stmt=db()->prepare(
            "SELECT j.technician_id, COALESCE(j.technician_name,'Unassigned') technician_name,
                    COUNT(*) total_jobs,
                    COUNT(*) FILTER (WHERE j.status='COMPLETED') completed_jobs,
                    COUNT(*) FILTER (WHERE j.repeat_issue=1) repeat_jobs,
                    ROUND((AVG(EXTRACT(EPOCH FROM (j.completed_at-j.started_at))/3600.0) FILTER (WHERE j.completed_at IS NOT NULL AND j.started_at IS NOT NULL))::numeric,1) avg_hours
             FROM digital_job_cards j JOIN customers c ON c.id=j.customer_id
             WHERE c.is_machinery_admin=0 GROUP BY j.technician_id,j.technician_name ORDER BY completed_jobs DESC,total_jobs DESC"
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

if ($method === 'GET' && $action === 'job-card-pdf' && $id !== '') {
    $stmt=db()->prepare('SELECT j.*,bc.customer_id,bc.current_stage,c.name customer_name,m.brand,m.model,m.machine_type,m.serial_number,m.reg_number FROM digital_job_cards j JOIN breakdown_cases bc ON bc.id=j.case_id JOIN customers c ON c.id=j.customer_id JOIN machines m ON m.id=j.machine_id WHERE j.id=?');
    $stmt->execute([$id]); $job=$stmt->fetch(); if(!$job)json_error('Job Card not found.',404); bw_case_access($ctx,$job['case_id']);
    $rows=[
        ['Job Card', $job['job_card_no']],
        ['Customer', $job['customer_name']],
        ['Machine', trim(($job['brand']??'').' '.($job['model']??''))],
        ['Machine Type', $job['machine_type']??''],
        ['Serial / Reg', $job['serial_number'] ?: ($job['reg_number'] ?: '-')],
        ['Status', $job['status']],
        ['Technician', $job['technician_name'] ?: 'Unassigned'],
        ['Fault', $job['fault_description']],
        ['Diagnosis', $job['diagnosis'] ?: '-'],
        ['Work Done', $job['work_done'] ?: '-'],
        ['Test Result', $job['test_result'] ?: '-'],
        ['Completion Note', $job['completion_note'] ?: '-'],
        ['Repeat / Rework', !empty($job['repeat_issue']) ? 'YES' : 'NO'],
        ['Started', display_date_billing($job['started_at'])],
        ['Completed', display_date_billing($job['completed_at'])],
    ];
    output_table_pdf('BELM-'.$job['job_card_no'].'.pdf','DIGITAL JOB CARD',[
        'Generated: '.date('d/m/Y H:i'),
        'Breakdown process record - BELM Operations Portal',
    ],$rows);
}

if ($method === 'GET' && $action === 'case' && $id !== '') {
    $case=bw_case_access($ctx,$id);
    $events=db()->prepare('SELECT stage,department,action,note,actor_name,created_at FROM breakdown_case_events WHERE case_id=? ORDER BY created_at ASC');
    $events->execute([$id]);
    $spares=db()->prepare('SELECT * FROM breakdown_spare_requests WHERE case_id=? ORDER BY requested_at ASC'); $spares->execute([$id]);
    $jobs=db()->prepare('SELECT * FROM digital_job_cards WHERE case_id=? ORDER BY created_at DESC'); $jobs->execute([$id]);
    json_out(['case'=>bw_case_view($case),'events'=>$events->fetchAll(),'spares'=>$spares->fetchAll(),'jobCards'=>$jobs->fetchAll()]);
}

if ($method === 'GET' && $action === 'from-report') {
    $reportId=trim((string)($_GET['reportId'] ?? '')); if($reportId==='') json_error('reportId is required.');
    $caseId=bw_ensure_case_from_report($reportId,$ctx); if(!$caseId) json_error('Report not found.',404);
    $case=bw_case_access($ctx,$caseId); json_out(['case'=>bw_case_view($case)]);
}

if ($method === 'GET' && $action === '') {
    $params=[]; $where=['1=1'];
    if(in_array($ctx['kind'],['customer','customer-tech'],true)){ $where[]='bc.customer_id=?'; $params[]=$ctx['customerId']; }
    else {
        $where[]='c.is_machinery_admin=0';
        if(!empty($ctx['isTechnician']) && $ctx['customerId']!==''){ $where[]='bc.customer_id=?'; $params[]=$ctx['customerId']; }
    }
    $machineId=trim((string)($_GET['machineId'] ?? '')); if($machineId!==''){ $where[]='bc.machine_id=?'; $params[]=$machineId; }
    $stmt=db()->prepare('SELECT bc.*,c.name customer_name,c.is_machinery_admin,m.brand,m.model,m.machine_type,m.serial_number,m.reg_number FROM breakdown_cases bc JOIN customers c ON c.id=bc.customer_id JOIN machines m ON m.id=bc.machine_id WHERE '.implode(' AND ',$where).' ORDER BY CASE WHEN bc.status=\'OPEN\' THEN 0 ELSE 1 END, bc.opened_at DESC');
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
    $b=body(); $caseId=trim((string)($b['caseId']??'')); $case=bw_case_access($ctx,$caseId);
    if($ctx['kind']==='customer' && !$ctx['isOwner'] && !in_array($ctx['role'],['workshop_manager','admin'],true)) json_error('Only Administration/Customer Admin or Workshop Manager can generate a Job Card.',403);
    if($ctx['kind']==='customer-tech') json_error('Technicians cannot generate Job Cards. Workshop Manager must issue the Job Card.',403);
    if($ctx['kind']==='belm' && empty($case['is_machinery_admin'])===false) json_error('BELM is not the active service provider.',403);
    $techId=trim((string)($b['technicianId']??'')); $techName=null;
    if($techId!==''){ $t=db()->prepare("SELECT u.name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND r.name='Technician' AND u.assigned_customer_id=? AND u.is_active=1 AND u.deleted_at IS NULL"); $t->execute([$techId,$case['customer_id']]); $techName=$t->fetchColumn(); if(!$techName)json_error('Selected Technician is not available for this customer.'); }
    $num='JC-'.date('ym').'-'.str_pad((string)db()->query("SELECT nextval('breakdown_job_card_seq')")->fetchColumn(),4,'0',STR_PAD_LEFT);
    $jobId=uuid(); $title=trim((string)($b['title']??$case['title']));
    db()->prepare("INSERT INTO digital_job_cards(id,case_id,customer_id,machine_id,job_card_no,title,fault_description,technician_id,technician_name,status,generated_by_name,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'OPEN',?,NOW(),NOW())")->execute([$jobId,$caseId,$case['customer_id'],$case['machine_id'],$num,$title,$case['description'],$techId?:null,$techName?:null,$ctx['actorName']]);
    bw_set_stage($caseId,'DIAGNOSIS',null,$ctx,'Digital Job Card '.$num.' generated');
    if ($techId!=='') {
        try { $te=db()->prepare('SELECT email FROM users WHERE id=?'); $te->execute([$techId]); $email=trim((string)$te->fetchColumn()); if(filter_var($email,FILTER_VALIDATE_EMAIL)) send_email($email,'DIGITAL JOB CARD '.$num,"Job Card $num has been assigned to you.\nMachine: ".$case['brand'].' '.$case['model']."\nFault: ".$case['description']."\nOpen Technician > Job Card / Process."); } catch(Throwable $e) {}
    }
    json_out(['id'=>$jobId,'jobCardNo'=>$num],201);
}

if ($method === 'POST' && $action === 'spare') {
    $b=body(); $caseId=trim((string)($b['caseId']??'')); $case=bw_case_access($ctx,$caseId);
    $name=trim((string)($b['spareName']??'')); $qty=(float)($b['quantity']??1); if($name===''||$qty<=0)json_error('Spare name and quantity are required.');
    $spareId=uuid(); db()->prepare("INSERT INTO breakdown_spare_requests(id,case_id,job_card_id,spare_name,part_number,quantity,unit,reason,status,requested_by_name,requested_at,updated_at) VALUES(?,?,?,?,?,?,?,?, 'WAITING_BOSS_APPROVAL',?,NOW(),NOW())")->execute([$spareId,$caseId,trim((string)($b['jobCardId']??''))?:null,$name,trim((string)($b['partNumber']??''))?:null,$qty,trim((string)($b['unit']??'pcs'))?:'pcs',trim((string)($b['reason']??''))?:null,$ctx['actorName']]);
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

if ($method === 'PUT' && $action === 'job-report' && $id !== '') {
    $stmt=db()->prepare('SELECT jc.* FROM digital_job_cards jc JOIN breakdown_cases bc ON bc.id=jc.case_id WHERE jc.id=?'); $stmt->execute([$id]); $job=$stmt->fetch(); if(!$job)json_error('Job Card not found.',404); $case=bw_case_access($ctx,$job['case_id']);
    if($ctx['kind']==='customer') json_error('Technician report must be saved from a Technician login.',403);
    if(empty($ctx['isTechnician'])) json_error('Only a Technician can save the technical Job Card report.',403);
    if($job['technician_id'] && $job['technician_id']!==$ctx['actorId']) json_error('This Job Card is assigned to another Technician.',403);
    $b=body(); $complete=!empty($b['complete']);
    $diagnosis=trim((string)($b['diagnosis']??'')); $work=trim((string)($b['workDone']??'')); if($diagnosis===''||$work==='')json_error('Diagnosis and work done are required.');
    $repeat = !empty($b['repeatIssue']);
    if ($complete && !$repeat) {
        $rp=db()->prepare("SELECT 1 FROM digital_job_cards WHERE id<>? AND machine_id=? AND status='COMPLETED' AND LOWER(TRIM(title))=LOWER(TRIM(?)) AND completed_at >= NOW()-INTERVAL '30 days' LIMIT 1");
        $rp->execute([$id,$job['machine_id'],$job['title']]);
        $repeat=(bool)$rp->fetchColumn();
    }
    db()->prepare("UPDATE digital_job_cards SET technician_id=COALESCE(technician_id,?),technician_name=?,diagnosis=?,work_done=?,test_result=?,completion_note=?,repeat_issue=?,status=?,started_at=COALESCE(started_at,NOW()),completed_at=CASE WHEN ? THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=?")->execute([$ctx['actorId'],$ctx['actorName'],$diagnosis,$work,trim((string)($b['testResult']??''))?:null,trim((string)($b['completionNote']??''))?:null,$repeat?1:0,$complete?'COMPLETED':'IN_PROGRESS',$complete?1:0,$id]);
    bw_set_stage($job['case_id'],$complete?'TESTING':'REPAIR',null,$ctx,$complete?'Technician repair completed - waiting Workshop test':'Technician Job Card updated');
    try{ customer_send_team_alert((string)$case['customer_id'],['workflow','check-up'], 'TECHNICIAN JOB CARD UPDATE - '.$job['job_card_no'], "Job Card: {$job['job_card_no']}\nTechnician: {$ctx['actorName']}\nDiagnosis: $diagnosis\nWork done: $work\nStatus: ".($complete?'Repair completed - waiting test':'In progress').($repeat?'\nRepeat/Rework: YES':''), true);}catch(Throwable $e){}
    if ($ctx['kind']==='belm' && empty($case['is_machinery_admin'])) { try { belm_send_customer_to_belm_alert(['service-requests'],'BELM TECHNICIAN JOB CARD UPDATE - '.$job['job_card_no'],"Technician: {$ctx['actorName']}\nMachine: ".$case['brand'].' '.$case['model']."\nDiagnosis: $diagnosis\nWork done: $work\nStatus: ".($complete?'Repair completed - waiting Workshop test':'In progress')); } catch(Throwable $e) {} }
    json_out(['ok'=>true,'repeatIssue'=>$repeat]);
}

if ($method === 'PUT' && $action === 'stage' && $id !== '') {
    $case=bw_case_access($ctx,$id); $b=body(); $stage=strtoupper(trim((string)($b['stage']??''))); $note=trim((string)($b['note']??''));
    if($ctx['kind']==='customer' && !$ctx['isOwner'] && !in_array($ctx['role'],['workshop_manager','admin'],true)) json_error('Only Workshop Manager or Administration can move the main breakdown stage.',403);
    if($ctx['kind']==='customer-tech') json_error('Technicians update the process through their Digital Job Card report.',403);
    bw_set_stage($id,$stage,$note?:null,$ctx,$stage==='COMPLETED'?'Machine returned to service':'Workflow stage updated'); json_out(['ok'=>true]);
}

json_error('Unknown breakdown workflow request.',404);
