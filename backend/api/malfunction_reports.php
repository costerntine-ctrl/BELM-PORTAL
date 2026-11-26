<?php
require_once __DIR__ . '/../config/helpers.php';

// Machine Malfunctioning Report flow (Phase 55)
//   POST ?action=report            { machineId, description, checkupReportId? }   Technician / Operator / Workshop
//   GET  ?action=list[&status=]    open reports (alerts) + history, scoped to actor
//   GET  ?action=technicians       technicians the Workshop Manager may pick
//   POST ?action=create-job-card   { id, technicianId, instruction }              Workshop Manager
//   GET  ?action=job&id=<report>   report + job card + 5 progress steps
//   POST ?action=step              { id, step, note }                             assigned Technician (or manager)
//   GET  ?action=dashboard         role-aware counters + lists (Technician / Workshop Manager)
//   GET  ?action=jobs&state=       assigned|in_progress|pending|completed|history|all (+ counts)
//   GET  ?action=machines          machines this actor may see (Technician: assigned only)
//   POST ?action=assign / unassign { machineId, technicianId }  Workshop Manager (assignment history is kept)
// Steps: INITIAL_INSPECTION, FINDINGS_REPORT, SOLUTION, PENDING (note = why), SOLVED.
// SOLVED closes the Job Card (it then shows in Completed Maintenance Reports)
// and the report leaves the alert list.
$method = $_SERVER['REQUEST_METHOD'];
$action = trim((string)($_GET['action'] ?? ''));
$payload = current_token_payload();
if (!$payload) json_error('Not authenticated', 401);

const MF_STEPS = ['INITIAL_INSPECTION','FINDINGS_REPORT','SOLUTION','PENDING','SOLVED'];

function mf_actor(array $payload): array {
    $type = (string)($payload['type'] ?? '');
    if ($type === 'operator') {
        return ['kind'=>'operator','scope'=>'CUSTOMER','customerId'=>(string)($payload['customerId'] ?? ''),
            'machineId'=>(string)($payload['machineId'] ?? ''),'actorId'=>(string)($payload['id'] ?? ''),
            'actorName'=>(string)($payload['name'] ?? 'Operator'),'role'=>'operator','isManager'=>false,'isTechnician'=>false];
    }
    if ($type === 'customer') {
        $c = require_customer_auth();
        $owner = ($c['actorType'] ?? '') === 'owner';
        $role = strtolower(trim((string)($c['customerRole'] ?? ($owner ? 'owner' : ''))));
        return ['kind'=>'customer','scope'=>'CUSTOMER','customerId'=>(string)$c['id'],'machineId'=>'',
            'actorId'=>(string)($c['actorId'] ?? $c['id']),'actorName'=>(string)($c['actorName'] ?? $c['name'] ?? 'Customer'),
            'role'=>$role,'isManager'=>$owner || in_array($role, ['admin','workshop_manager'], true),
            'isTechnician'=>$role === 'technician'];
    }
    $u = require_auth();
    $roleName = (string)($u['roleName'] ?? '');
    $isTech = $roleName === 'Technician';
    $isManager = !$isTech && belm_user_has_named_role($u, ['Super Admin','Engineer','Workshop Manager']);
    if ($isTech && !empty($u['id'])) {
        // Customer-managed Technicians belong to the customer's own workshop.
        $own = db()->prepare('SELECT is_customer_managed,assigned_customer_id FROM users WHERE id=? AND deleted_at IS NULL');
        $own->execute([(string)$u['id']]);
        $o = $own->fetch();
        if ($o && !empty($o['is_customer_managed'])) {
            return ['kind'=>'customer','scope'=>'CUSTOMER','customerId'=>(string)$o['assigned_customer_id'],'machineId'=>'',
                'actorId'=>(string)$u['id'],'actorName'=>(string)($u['name'] ?? 'Technician'),'role'=>'technician',
                'isManager'=>false,'isTechnician'=>true];
        }
    }
    if (!$isTech && !$isManager) require_any_page_access($u, ['job-cards','service-requests']);
    return ['kind'=>'belm','scope'=>'BELM','customerId'=>(string)($u['assignedCustomerId'] ?? ''),'machineId'=>'',
        'actorId'=>(string)($u['id'] ?? ''),'actorName'=>(string)($u['name'] ?? 'BELM'),
        'role'=>strtolower($roleName),'isManager'=>$isManager,'isTechnician'=>$isTech];
}

// Which workshop owns this customer's maintenance? Provider-ON (is_machinery_admin=0)
// means BELM Workshop Manager; provider-OFF means the customer's own Workshop Manager.
function mf_machine(string $machineId): array {
    $s = db()->prepare('SELECT m.id,m.customer_id,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number,
                               c.name AS customer_name,c.address AS customer_address,c.is_machinery_admin
                        FROM machines m JOIN customers c ON c.id=m.customer_id
                        WHERE m.id=? AND m.deleted_at IS NULL AND c.deleted_at IS NULL');
    $s->execute([$machineId]);
    $m = $s->fetch();
    if (!$m) json_error('Machine not found.', 404);
    return $m;
}
function mf_label(array $m): string {
    return trim(((string)($m['brand'] ?? '')) . ' ' . ((string)($m['model'] ?? ''))) ?: (string)($m['machine_type'] ?? 'Machine');
}
function mf_workshop_scope(array $m): string { return empty($m['is_machinery_admin']) ? 'BELM' : 'CUSTOMER'; }

// A Technician sees only machines assigned to him (active assignment) or with an
// open Job Card for him.
function mf_tech_assigned(string $machineId, string $techId): bool {
    if ($techId === '') return false;
    $s = db()->prepare("SELECT 1 WHERE EXISTS (SELECT 1 FROM machine_technician_assignments a WHERE a.machine_id=? AND a.technician_id=? AND a.ended_at IS NULL)
                           OR EXISTS (SELECT 1 FROM digital_job_cards j WHERE j.machine_id=? AND j.technician_id=? AND j.status NOT IN ('COMPLETED','CANCELLED'))");
    $s->execute([$machineId, $techId, $machineId, $techId]);
    return (bool)$s->fetchColumn();
}

function mf_check_machine_access(array $a, array $m): void {
    if ($a['kind'] === 'operator') {
        if ($a['machineId'] !== (string)$m['id'] || $a['customerId'] !== (string)$m['customer_id']) json_error('This is not your machine.', 403);
        return;
    }
    if ($a['kind'] === 'customer') {
        if ($a['customerId'] !== (string)$m['customer_id']) json_error('Not allowed.', 403);
    } elseif (!empty($m['is_machinery_admin'])) {
        json_error('This customer is using its own maintenance team.', 403);
    }
    if ($a['isTechnician'] && !mf_tech_assigned((string)$m['id'], $a['actorId'])) json_error('This machine is not assigned to you.', 403);
}

// SQL fragment limiting machines (alias m, customers alias c) to what the actor may see.
function mf_machine_where(array $a, array &$p): string {
    if ($a['kind'] === 'operator') { $p[] = $a['machineId']; return 'm.id=?'; }
    $w = 'm.deleted_at IS NULL AND c.deleted_at IS NULL';
    if ($a['kind'] === 'customer') { $w .= ' AND m.customer_id=?'; $p[] = $a['customerId']; }
    else $w .= ' AND c.is_machinery_admin=0';
    if ($a['isTechnician']) {
        $w .= " AND (EXISTS (SELECT 1 FROM machine_technician_assignments a WHERE a.machine_id=m.id AND a.technician_id=? AND a.ended_at IS NULL)
                  OR EXISTS (SELECT 1 FROM digital_job_cards j WHERE j.machine_id=m.id AND j.technician_id=? AND j.status NOT IN ('COMPLETED','CANCELLED')))";
        $p[] = $a['actorId']; $p[] = $a['actorId'];
    }
    return $w;
}

// SQL fragment limiting Job Cards of this module (alias j, bc, c) to the actor.
function mf_job_where(array $a, array &$p): string {
    if ($a['kind'] === 'operator') json_error('Operators cannot open Job Cards.', 403);
    $w = "bc.source_type='MALFUNCTION_REPORT'";
    if ($a['kind'] === 'customer') { $w .= ' AND j.customer_id=?'; $p[] = $a['customerId']; }
    else $w .= ' AND c.is_machinery_admin=0';
    if ($a['isTechnician']) { $w .= ' AND j.technician_id=?'; $p[] = $a['actorId']; }
    return $w;
}

const MF_STATE_SQL = [
    'assigned' => "UPPER(j.status) IN ('ASSIGNED','RECEIVED','OPEN','CREATED')",
    'in_progress' => "UPPER(j.status)='IN_PROGRESS'",
    'pending' => "UPPER(j.status) IN ('WAITING_FOR_PARTS','WAITING_PARTS')",
    'completed' => "UPPER(j.status)='COMPLETED'",
    'history' => "UPPER(j.status) IN ('COMPLETED','CANCELLED')",
    'all' => '1=1',
];

function mf_report_access(array $a, string $id): array {
    $s = db()->prepare('SELECT r.*,c.is_machinery_admin,c.name AS customer_name,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number
                        FROM machine_malfunction_reports r
                        JOIN customers c ON c.id=r.customer_id JOIN machines m ON m.id=r.machine_id
                        WHERE r.id=?');
    $s->execute([$id]);
    $r = $s->fetch();
    if (!$r) json_error('Malfunction report not found.', 404);
    if ($a['kind'] === 'operator') {
        if ($a['machineId'] !== (string)$r['machine_id']) json_error('Not allowed.', 403);
    } elseif ($a['kind'] === 'customer') {
        if ($a['customerId'] !== (string)$r['customer_id']) json_error('Not allowed.', 403);
    } elseif (!empty($r['is_machinery_admin'])) {
        json_error('This customer is using its own maintenance team.', 403);
    }
    if ($a['isTechnician']) {
        $own = false;
        if (!empty($r['job_card_id'])) { $j = db()->prepare('SELECT technician_id FROM digital_job_cards WHERE id=?'); $j->execute([$r['job_card_id']]); $own = (string)$j->fetchColumn() === $a['actorId']; }
        if (!$own && !mf_tech_assigned((string)$r['machine_id'], $a['actorId'])) json_error('This machine is not assigned to you.', 403);
    }
    return $r;
}

function mf_shape(array $r): array {
    return [
        'id'=>$r['id'],'customerId'=>$r['customer_id'],'customerName'=>$r['customer_name'] ?? '','machineId'=>$r['machine_id'],
        'machineLabel'=>mf_label($r),'fleetNumber'=>$r['fleet_number'] ?? '','serialNumber'=>$r['serial_number'] ?? '',
        'reporterKind'=>$r['reporter_kind'],'reporterName'=>$r['reporter_name'],'description'=>$r['description'],
        'status'=>$r['status'],'caseId'=>$r['case_id'],'jobCardId'=>$r['job_card_id'],
        'jobCardNo'=>$r['job_card_no'] ?? null,'technicianName'=>$r['technician_name'] ?? null,'jobStatus'=>$r['job_status'] ?? null,
        'createdAt'=>$r['created_at'],'jobCardCreatedAt'=>$r['job_card_created_at'],'resolvedAt'=>$r['resolved_at'],
    ];
}

function mf_log(string $caseId, string $stage, string $dept, string $act, ?string $note, array $a): void {
    db()->prepare('INSERT INTO breakdown_case_events (id,case_id,stage,department,action,note,actor_type,actor_id,actor_name,created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,NOW())')
        ->execute([uuid(), $caseId, $stage, $dept, $act, $note !== null ? mb_substr($note, 0, 1000) : null,
                   $a['kind'], $a['actorId'] ?: null, $a['actorName']]);
}

function mf_notify(array $a, array $r, string $scope, string $role, string $subject, string $msg, string $prio, string $url): void {
    $sender = $a['scope'] === 'BELM' ? 'BELM' : 'CUSTOMER';
    belm_role_communication_insert((string)$r['customer_id'], $sender, strtolower($sender) . '-malfunction:' . ($a['actorId'] ?: 'system'),
        $a['actorName'], preg_replace('/[^a-z0-9]+/', '_', $a['role']) ?: 'staff', $scope, $role, $subject, $msg, $prio,
        'MALFUNCTION_REPORT', (string)$r['id'], (string)$r['machine_id'], $url);
}

// ---------------------------------------------------------------- shared helpers
function mf_insert_report(array $a, array $m, string $desc, string $checkup = ''): string {
    $id = uuid();
    db()->prepare('INSERT INTO machine_malfunction_reports (id,customer_id,machine_id,reporter_kind,reporter_id,reporter_name,description,checkup_report_id)
                   VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$id, (string)$m['customer_id'], (string)$m['id'], $a['kind'], $a['actorId'] ?: null, $a['actorName'], $desc, $checkup ?: null]);
    return $id;
}

// Operational (no open Job Card), Under Repair (Job Card assigned, not started),
// In Maintenance (Technician is working or waiting for parts).
function mf_machine_status_label(array $row): string {
    if (empty($row['active_job_no'])) return 'Operational';
    return in_array(strtoupper((string)($row['active_job_status'] ?? '')), ['IN_PROGRESS','WAITING_FOR_PARTS','WAITING_PARTS'], true) ? 'In Maintenance' : 'Under Repair';
}

// Machine rows with status and the Technicians currently assigned. $w comes from mf_machine_where().
function mf_machine_rows(string $w, array $p, int $limit): array {
    $s = db()->prepare("SELECT m.id,m.brand,m.model,m.machine_type,m.serial_number,m.fleet_number,m.customer_id,c.name AS customer_name,
            (SELECT j.job_card_no FROM digital_job_cards j WHERE j.machine_id=m.id AND j.status NOT IN ('COMPLETED','CANCELLED') ORDER BY j.created_at DESC LIMIT 1) AS active_job_no,
            (SELECT j.status FROM digital_job_cards j WHERE j.machine_id=m.id AND j.status NOT IN ('COMPLETED','CANCELLED') ORDER BY j.created_at DESC LIMIT 1) AS active_job_status,
            (SELECT string_agg(u.name, ', ' ORDER BY u.name) FROM machine_technician_assignments x JOIN users u ON u.id=x.technician_id WHERE x.machine_id=m.id AND x.ended_at IS NULL) AS technicians,
            (SELECT string_agg(x.technician_id, ',') FROM machine_technician_assignments x WHERE x.machine_id=m.id AND x.ended_at IS NULL) AS technician_ids
            FROM machines m JOIN customers c ON c.id=m.customer_id WHERE $w ORDER BY c.name, m.fleet_number, m.model LIMIT " . (int)$limit);
    $s->execute($p);
    return array_map(fn($r)=>['id'=>$r['id'],'label'=>mf_label($r),'machineType'=>$r['machine_type'],'serialNumber'=>$r['serial_number'] ?? '','fleetNumber'=>$r['fleet_number'] ?? '',
        'customerId'=>$r['customer_id'],'customerName'=>$r['customer_name'],'status'=>mf_machine_status_label($r),'activeJobNo'=>$r['active_job_no'],
        'technicians'=>$r['technicians'] ?? '','technicianIds'=>$r['technician_ids'] ? explode(',', $r['technician_ids']) : []], $s->fetchAll());
}

// ---------------------------------------------------------------- report (Report It)
if ($method === 'POST' && $action === 'report') {
    $a = mf_actor($payload);
    $b = body();
    $machineId = trim((string)($b['machineId'] ?? '')) ?: $a['machineId'];
    $desc = trim((string)($b['description'] ?? ''));
    if ($machineId === '') json_error('Select the machine.', 422);
    if (mb_strlen($desc) < 5) json_error('Write the machine problem (at least 5 characters).', 422);
    if (mb_strlen($desc) > 2000) json_error('Description is too long (max 2000 characters).', 422);
    $m = mf_machine($machineId);
    mf_check_machine_access($a, $m);
    $checkup = trim((string)($b['checkupReportId'] ?? ''));
    if ($checkup !== '') {
        $cs = db()->prepare('SELECT 1 FROM checklist_reports WHERE id=? AND machine_id=?');
        $cs->execute([$checkup, $machineId]);
        if (!$cs->fetchColumn()) $checkup = '';
    }
    $dup = db()->prepare("SELECT id FROM machine_malfunction_reports WHERE machine_id=? AND status='OPEN' AND description=? AND created_at > NOW() - INTERVAL '10 minutes' LIMIT 1");
    $dup->execute([$machineId, $desc]);
    if ($existing = $dup->fetchColumn()) json_out(['id'=>$existing,'duplicate'=>true], 200);

    $id = mf_insert_report($a, $m, $desc, $checkup);
    $scope = mf_workshop_scope($m);
    $row = ['id'=>$id,'customer_id'=>$m['customer_id'],'machine_id'=>$machineId];
    mf_notify($a, $row, $scope, 'workshop_manager',
        'MACHINE MALFUNCTION - ' . mf_label($m),
        mf_label($m) . ($m['fleet_number'] ? ' (' . $m['fleet_number'] . ')' : '') . ' reported by ' . $a['actorName'] . ': ' . $desc . ' - Create a Job Card and write the job description for a Technician.',
        'URGENT', '/malfunction-reports/?view=machine-reports&actor=' . ($scope === 'BELM' ? 'admin' : 'customer') . '&report=' . rawurlencode($id));
    json_out(['id'=>$id,'status'=>'OPEN'], 201);
}

// ---------------------------------------------------------------- list (reports / alerts)
if ($method === 'GET' && $action === 'list') {
    $a = mf_actor($payload);
    $where = ['1=1']; $p = [];
    if ($a['kind'] === 'operator') { $where[] = 'r.machine_id=?'; $p[] = $a['machineId']; }
    elseif ($a['kind'] === 'customer') { $where[] = 'r.customer_id=?'; $p[] = $a['customerId']; }
    else $where[] = 'c.is_machinery_admin=0';
    if ($a['isTechnician']) {
        $where[] = "(j.technician_id=? OR EXISTS (SELECT 1 FROM machine_technician_assignments x WHERE x.machine_id=r.machine_id AND x.technician_id=? AND x.ended_at IS NULL))";
        $p[] = $a['actorId']; $p[] = $a['actorId'];
    }
    $machineId = trim((string)($_GET['machineId'] ?? ''));
    if ($machineId !== '') { $where[] = 'r.machine_id=?'; $p[] = $machineId; }
    $status = strtoupper(trim((string)($_GET['status'] ?? '')));
    if ($status === 'ALERTS') $where[] = "r.status IN ('OPEN','JOB_CARD_CREATED')";
    elseif (in_array($status, ['OPEN','JOB_CARD_CREATED','RESOLVED','CANCELLED'], true)) { $where[] = 'r.status=?'; $p[] = $status; }
    $s = db()->prepare("SELECT r.*,c.name AS customer_name,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number,
                               j.job_card_no,j.technician_name,j.status AS job_status
                        FROM machine_malfunction_reports r
                        JOIN customers c ON c.id=r.customer_id JOIN machines m ON m.id=r.machine_id
                        LEFT JOIN digital_job_cards j ON j.id=r.job_card_id
                        WHERE " . implode(' AND ', $where) . ' ORDER BY r.created_at DESC LIMIT 200');
    $s->execute($p);
    json_out(['reports'=>array_map('mf_shape', $s->fetchAll()),
              'canCreateJobCard'=>$a['isManager'],'isTechnician'=>$a['isTechnician'],'kind'=>$a['kind']], 200);
}

// ---------------------------------------------------------------- machines
if ($method === 'GET' && $action === 'machines') {
    $a = mf_actor($payload);
    $p = []; $w = mf_machine_where($a, $p);
    json_out(['machines'=>mf_machine_rows($w, $p, 300),'canManage'=>$a['isManager'],'isTechnician'=>$a['isTechnician'],'kind'=>$a['kind']], 200);
}

// ---------------------------------------------------------------- technicians
if ($method === 'GET' && $action === 'technicians') {
    $a = mf_actor($payload);
    if (!$a['isManager']) json_error('Only the Workshop Manager can see the Technician list.', 403);
    $sql = "SELECT u.id,u.name,
              (SELECT COUNT(*) FROM digital_job_cards j WHERE j.technician_id=u.id AND j.status NOT IN ('COMPLETED','CANCELLED')) AS active_jobs,
              (SELECT COUNT(*) FROM machine_technician_assignments x WHERE x.technician_id=u.id AND x.ended_at IS NULL) AS machines
            FROM users u JOIN roles ro ON ro.id=u.role_id
            WHERE u.is_active=1 AND u.deleted_at IS NULL
              AND (ro.name='Technician' OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles rr ON rr.id=ur.role_id
                   WHERE ur.user_id=u.id AND rr.name='Technician' AND rr.deleted_at IS NULL))";
    $p = [];
    if ($a['scope'] === 'CUSTOMER') { $sql .= ' AND u.is_customer_managed=1 AND u.assigned_customer_id=?'; $p[] = $a['customerId']; }
    else $sql .= ' AND COALESCE(u.is_customer_managed,0)=0';
    $s = db()->prepare($sql . ' ORDER BY u.name');
    $s->execute($p);
    json_out(['technicians'=>array_map(fn($t)=>['id'=>$t['id'],'name'=>$t['name'],'activeJobs'=>(int)$t['active_jobs'],'machines'=>(int)$t['machines']], $s->fetchAll())], 200);
}

function mf_valid_technician(array $a, string $techId, string $customerId): array {
    $t = db()->prepare("SELECT u.id,u.name,u.is_customer_managed,u.assigned_customer_id FROM users u JOIN roles ro ON ro.id=u.role_id
                        WHERE u.id=? AND u.is_active=1 AND u.deleted_at IS NULL
                          AND (ro.name='Technician' OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles rr ON rr.id=ur.role_id
                               WHERE ur.user_id=u.id AND rr.name='Technician' AND rr.deleted_at IS NULL))");
    $t->execute([$techId]);
    $tech = $t->fetch();
    if (!$tech) json_error('Selected Technician is not available.', 422);
    if ($a['scope'] === 'CUSTOMER' && (empty($tech['is_customer_managed']) || (string)$tech['assigned_customer_id'] !== $customerId)) json_error('Select one of this customer\'s own Technicians.', 403);
    if ($a['scope'] === 'BELM' && !empty($tech['is_customer_managed'])) json_error('Select a BELM Technician.', 403);
    return $tech;
}

function mf_assign_machine(array $a, string $machineId, string $techId): void {
    db()->prepare('INSERT INTO machine_technician_assignments(id,machine_id,technician_id,assigned_by_name) VALUES(?,?,?,?) ON CONFLICT DO NOTHING')
        ->execute([uuid(), $machineId, $techId, $a['actorName']]);
}

// ---------------------------------------------------------------- assign / unassign machines
if ($method === 'POST' && ($action === 'assign' || $action === 'unassign')) {
    $a = mf_actor($payload);
    if (!$a['isManager']) json_error('Only the Workshop Manager can assign machines.', 403);
    $b = body();
    $m = mf_machine(trim((string)($b['machineId'] ?? '')));
    if ($a['scope'] === 'CUSTOMER' ? $a['customerId'] !== (string)$m['customer_id'] : !empty($m['is_machinery_admin'])) json_error('This machine belongs to another workshop.', 403);
    $techId = trim((string)($b['technicianId'] ?? ''));
    mf_valid_technician($a, $techId, (string)$m['customer_id']);
    if ($action === 'assign') mf_assign_machine($a, (string)$m['id'], $techId);
    else db()->prepare('UPDATE machine_technician_assignments SET ended_at=NOW() WHERE machine_id=? AND technician_id=? AND ended_at IS NULL')->execute([$m['id'], $techId]);
    json_out(['ok'=>true], 200);
}

// ---------------------------------------------------------------- create-job-card
// Either { id } of an existing malfunction report, or { machineId } for a Job Card
// the Workshop Manager writes directly (a report row is recorded so every Job Card
// of this module has the same history). { technicianId, instruction, priority }.
if ($method === 'POST' && $action === 'create-job-card') {
    $a = mf_actor($payload);
    if (!$a['isManager']) json_error('Only the Workshop Manager can create a Job Card.', 403);
    $b = body();
    $techId = trim((string)($b['technicianId'] ?? ''));
    $instruction = trim((string)($b['instruction'] ?? ''));
    $priority = strtoupper(trim((string)($b['priority'] ?? 'NORMAL')));
    if (!in_array($priority, ['LOW','NORMAL','HIGH','URGENT'], true)) json_error('Invalid priority.', 422);
    if ($techId === '') json_error('Select a Technician.', 422);
    if (mb_strlen($instruction) < 3) json_error('Write the job description for the Technician.', 422);
    if (mb_strlen($instruction) > 1000) json_error('Job description is too long (max 1000 characters).', 422);

    $reportId = trim((string)($b['id'] ?? ''));
    if ($reportId === '') {
        $m0 = mf_machine(trim((string)($b['machineId'] ?? '')));
        if ($a['scope'] === 'CUSTOMER' ? $a['customerId'] !== (string)$m0['customer_id'] : !empty($m0['is_machinery_admin'])) json_error('This machine belongs to another workshop.', 403);
        $reportId = mf_insert_report($a, $m0, $instruction);
    }
    $r = mf_report_access($a, $reportId);
    if ($r['status'] !== 'OPEN') json_error('A Job Card was already created for this report.', 409);
    if (($a['scope'] === 'BELM') === !empty($r['is_machinery_admin'])) json_error('This report belongs to another workshop.', 403);
    $tech = mf_valid_technician($a, $techId, (string)$r['customer_id']);
    $load = db()->prepare("SELECT COUNT(*) FROM digital_job_cards WHERE technician_id=? AND status NOT IN ('COMPLETED','CANCELLED')");
    $load->execute([$techId]);
    if ((int)$load->fetchColumn() >= 5) json_error($tech['name'] . ' is FULL with 5 active jobs. Pick another Technician.', 409);

    $m = mf_machine((string)$r['machine_id']);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $caseId = uuid();
        $title = mb_substr('Malfunction: ' . mf_label($m), 0, 250);
        $pdo->prepare("INSERT INTO breakdown_cases(id,customer_id,machine_id,source_type,source_id,title,description,status,current_stage,current_department,opened_at,stage_started_at,updated_at,created_by_name)
                       VALUES(?,?,?,'MALFUNCTION_REPORT',?,?,?,'OPEN','WORKSHOP_REVIEW','Workshop',NOW(),NOW(),NOW(),?)")
            ->execute([$caseId, $r['customer_id'], $r['machine_id'], $r['id'], $title, $r['description'], $r['reporter_name']]);
        $jobNo = belm_next_job_card_number();
        $jobId = uuid();
        $pdo->prepare("INSERT INTO digital_job_cards(id,case_id,customer_id,machine_id,job_card_no,title,fault_description,technician_id,technician_name,status,priority,job_location,generated_by_name,issued_by_name,issued_by_type,issued_at,created_at,updated_at)
                       VALUES(?,?,?,?,?,?,?,?,?,'ASSIGNED',?,?,?,?,?,NOW(),NOW(),NOW())")
            ->execute([$jobId, $caseId, $r['customer_id'], $r['machine_id'], $jobNo, $title, $r['description'], $techId, $tech['name'], $priority,
                       trim((string)($m['customer_address'] ?? '')) ?: null, $a['actorName'], $a['actorName'], $a['scope']]);
        $pdo->prepare("UPDATE breakdown_cases SET current_stage='JOB_CARD_ASSIGNED',current_department='Technician',stage_started_at=NOW(),updated_at=NOW() WHERE id=?")->execute([$caseId]);
        mf_log($caseId, 'WORKSHOP_REVIEW', 'Workshop', 'Malfunction report received', $r['description'], $a);
        mf_log($caseId, 'JOB_CARD_ASSIGNED', 'Workshop', 'Digital Job Card ' . $jobNo . ' created and assigned to ' . $tech['name'], null, $a);
        mf_log($caseId, 'JOB_CARD_ASSIGNED', 'Workshop', 'WORKSHOP_MANAGER_INSTRUCTION', $instruction, $a);
        $pdo->prepare("UPDATE machine_malfunction_reports SET status='JOB_CARD_CREATED',case_id=?,job_card_id=?,job_card_created_at=NOW() WHERE id=? AND status='OPEN'")
            ->execute([$caseId, $jobId, $r['id']]);
        mf_assign_machine($a, (string)$r['machine_id'], $techId);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('Malfunction job card failed: ' . $e->getMessage());
        json_error('Job Card could not be created. Try again.', 500);
    }
    mf_notify($a, $r, $a['scope'], 'technician', 'NEW JOB CARD ' . $jobNo . ' - ' . mf_label($m),
        'Job description: ' . $instruction . ' (Problem: ' . $r['description'] . ')', $priority === 'URGENT' || $priority === 'HIGH' ? 'URGENT' : 'ATTENTION',
        '/malfunction-reports/?view=job&actor=' . ($a['scope'] === 'BELM' ? 'technician' : 'customer') . '&report=' . rawurlencode($r['id']));
    json_out(['id'=>$r['id'],'jobCardId'=>$jobId,'jobCardNo'=>$jobNo,'caseId'=>$caseId], 201);
}

// ---------------------------------------------------------------- jobs (list by state)
if ($method === 'GET' && $action === 'jobs') {
    $a = mf_actor($payload);
    $state = strtolower(trim((string)($_GET['state'] ?? 'all')));
    if (!isset(MF_STATE_SQL[$state])) json_error('Invalid state.', 422);
    $p = []; $base = mf_job_where($a, $p);
    $from = "FROM digital_job_cards j JOIN breakdown_cases bc ON bc.id=j.case_id JOIN customers c ON c.id=j.customer_id
             JOIN machines m ON m.id=j.machine_id JOIN machine_malfunction_reports r ON r.id=bc.source_id";
    $counts = [];
    foreach (['assigned','in_progress','pending','completed','history'] as $k) {
        $cs = db()->prepare("SELECT COUNT(*) $from WHERE $base AND " . MF_STATE_SQL[$k]); $cs->execute($p); $counts[$k] = (int)$cs->fetchColumn();
    }
    $s = db()->prepare("SELECT r.id AS report_id,j.id,j.job_card_no,j.status,j.priority,j.technician_name,j.created_at,j.completed_at,j.fault_description,
                               c.name AS customer_name,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number
                        $from WHERE $base AND " . MF_STATE_SQL[$state] . ' ORDER BY COALESCE(j.completed_at,j.created_at) DESC LIMIT 200');
    $s->execute($p);
    $rows = array_map(fn($r)=>['reportId'=>$r['report_id'],'id'=>$r['id'],'jobCardNo'=>$r['job_card_no'],'status'=>$r['status'],'priority'=>$r['priority'],
        'technicianName'=>$r['technician_name'],'createdAt'=>$r['created_at'],'completedAt'=>$r['completed_at'],'description'=>$r['fault_description'],
        'customerName'=>$r['customer_name'],'machineLabel'=>mf_label($r),'fleetNumber'=>$r['fleet_number'] ?? ''], $s->fetchAll());
    json_out(['jobs'=>$rows,'counts'=>$counts,'isTechnician'=>$a['isTechnician'],'canCreateJobCard'=>$a['isManager']], 200);
}

// ---------------------------------------------------------------- dashboard
if ($method === 'GET' && $action === 'dashboard') {
    $a = mf_actor($payload);
    if ($a['kind'] === 'operator') json_error('Operators use the Operator dashboard.', 403);
    $p = []; $w = mf_machine_where($a, $p);
    $machines = mf_machine_rows($w, $p, 60);
    $jp = []; $jw = mf_job_where($a, $jp);
    $from = "FROM digital_job_cards j JOIN breakdown_cases bc ON bc.id=j.case_id JOIN customers c ON c.id=j.customer_id
             JOIN machines m ON m.id=j.machine_id JOIN machine_malfunction_reports r ON r.id=bc.source_id";
    $c = [];
    foreach (['assigned','in_progress','pending','completed'] as $k) {
        $cs = db()->prepare("SELECT COUNT(*) $from WHERE $jw AND " . MF_STATE_SQL[$k]); $cs->execute($jp); $c[$k] = (int)$cs->fetchColumn();
    }
    $as = db()->prepare("SELECT r.id AS report_id,j.job_card_no,j.status,j.technician_name,m.brand,m.model,m.machine_type,m.fleet_number
                         $from WHERE $jw AND UPPER(j.status) NOT IN ('COMPLETED','CANCELLED') ORDER BY j.created_at DESC LIMIT 5");
    $as->execute($jp);
    $active = array_map(fn($r)=>['reportId'=>$r['report_id'],'jobCardNo'=>$r['job_card_no'],'status'=>$r['status'],'technicianName'=>$r['technician_name'],'machineLabel'=>mf_label($r),'fleetNumber'=>$r['fleet_number'] ?? ''], $as->fetchAll());
    // Alerts: Workshop Manager = reports still waiting for a Job Card; Technician = Job Cards assigned but not started.
    if ($a['isManager']) {
        $ap = []; $aw = $a['kind'] === 'customer' ? 'r.customer_id=?' : 'c.is_machinery_admin=0'; if ($a['kind'] === 'customer') $ap[] = $a['customerId'];
        $aq = db()->prepare("SELECT COUNT(*) FROM machine_malfunction_reports r JOIN customers c ON c.id=r.customer_id WHERE $aw AND r.status='OPEN'"); $aq->execute($ap);
        $alerts = (int)$aq->fetchColumn();
    } else $alerts = $c['assigned'];
    $out = ['machines'=>$machines,'counts'=>['machines'=>count($machines),'active'=>$c['assigned'] + $c['in_progress'],'pending'=>$c['pending'],'completed'=>$c['completed'],'alerts'=>$alerts],'activeJobs'=>$active,'isTechnician'=>$a['isTechnician'],'canManage'=>$a['isManager']];
    if ($a['isManager']) {
        $tp = []; $ts = "SELECT COUNT(*) FROM users u JOIN roles ro ON ro.id=u.role_id WHERE u.is_active=1 AND u.deleted_at IS NULL
                         AND (ro.name='Technician' OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles rr ON rr.id=ur.role_id WHERE ur.user_id=u.id AND rr.name='Technician' AND rr.deleted_at IS NULL))";
        if ($a['scope'] === 'CUSTOMER') { $ts .= ' AND u.is_customer_managed=1 AND u.assigned_customer_id=?'; $tp[] = $a['customerId']; } else $ts .= ' AND COALESCE(u.is_customer_managed,0)=0';
        $q = db()->prepare($ts); $q->execute($tp); $out['counts']['technicians'] = (int)$q->fetchColumn();
        $rp = []; $rw = $a['kind'] === 'customer' ? 'r.customer_id=?' : 'c.is_machinery_admin=0'; if ($a['kind'] === 'customer') $rp[] = $a['customerId'];
        $rs = db()->prepare("SELECT r.*,c.name AS customer_name,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number FROM machine_malfunction_reports r
                             JOIN customers c ON c.id=r.customer_id JOIN machines m ON m.id=r.machine_id WHERE $rw AND r.status IN ('OPEN','JOB_CARD_CREATED') ORDER BY r.created_at DESC LIMIT 5");
        $rs->execute($rp);
        $out['recentReports'] = array_map('mf_shape', $rs->fetchAll());
    }
    json_out($out, 200);
}

// ---------------------------------------------------------------- job / step
function mf_job_bundle(array $r): array {
    $job = null; $steps = [];
    if (!empty($r['job_card_id'])) {
        $j = db()->prepare('SELECT id,job_card_no,title,status,priority,technician_id,technician_name,completed_at,created_at FROM digital_job_cards WHERE id=?');
        $j->execute([$r['job_card_id']]);
        $job = $j->fetch() ?: null;
        $s = db()->prepare('SELECT step_key,note,actor_name,updated_at,is_draft,resolved_at FROM job_card_progress_steps WHERE job_card_id=?');
        $s->execute([$r['job_card_id']]);
        foreach ($s->fetchAll() as $x) $steps[$x['step_key']] = ['note'=>$x['note'],'by'=>$x['actor_name'],'at'=>$x['updated_at'],'draft'=>(int)$x['is_draft'] === 1,'cleared'=>!empty($x['resolved_at'])];
        $i = db()->prepare("SELECT note FROM breakdown_case_events WHERE case_id=? AND action='WORKSHOP_MANAGER_INSTRUCTION' ORDER BY created_at DESC LIMIT 1");
        $i->execute([$r['case_id']]);
        $job['instruction'] = (string)($i->fetchColumn() ?: '');
    }
    return ['job'=>$job,'steps'=>(object)$steps];
}

if ($method === 'GET' && $action === 'job') {
    $a = mf_actor($payload);
    $r = mf_report_access($a, trim((string)($_GET['id'] ?? '')));
    json_out(['report'=>mf_shape($r)] + mf_job_bundle($r) + ['canCreateJobCard'=>$a['isManager'],'isTechnician'=>$a['isTechnician']], 200);
}

if ($method === 'POST' && $action === 'step') {
    $a = mf_actor($payload);
    if ($a['kind'] === 'operator') json_error('Operators cannot update Job Card progress.', 403);
    $b = body();
    $r = mf_report_access($a, trim((string)($b['id'] ?? '')));
    $step = strtoupper(trim((string)($b['step'] ?? '')));
    $note = trim((string)($b['note'] ?? ''));
    $draft = !empty($b['draft']);
    if (!in_array($step, MF_STEPS, true)) json_error('Invalid step.', 422);
    if (empty($r['job_card_id']) || $r['status'] !== 'JOB_CARD_CREATED') json_error('No active Job Card for this report.', 409);
    if (mb_strlen($note) > 2000) json_error('Note is too long (max 2000 characters).', 422);
    $jq = db()->prepare('SELECT * FROM digital_job_cards WHERE id=?'); $jq->execute([$r['job_card_id']]);
    $job = $jq->fetch();
    if (!$job || in_array(strtoupper((string)$job['status']), ['COMPLETED','CANCELLED'], true)) json_error('This Job Card is closed.', 409);
    if (!$a['isManager'] && (string)$job['technician_id'] !== $a['actorId']) json_error('This Job Card is not assigned to this Technician.', 403);
    if (!$a['isManager'] && !$a['isTechnician']) json_error('Not allowed.', 403);

    if ($draft) {
        // Save Draft: keep the note only. A step already marked done stays done.
        db()->prepare('INSERT INTO job_card_progress_steps(job_card_id,step_key,note,actor_name,updated_at,is_draft) VALUES(?,?,?,?,NOW(),1)
                       ON CONFLICT(job_card_id,step_key) DO UPDATE SET note=EXCLUDED.note,actor_name=EXCLUDED.actor_name,updated_at=NOW()')
            ->execute([$job['id'], $step, $note !== '' ? $note : null, $a['actorName']]);
        json_out(['ok'=>true,'draft'=>true,'step'=>$step], 200);
    }

    $have = [];
    $hs = db()->prepare('SELECT step_key,note FROM job_card_progress_steps WHERE job_card_id=? AND is_draft=0 AND resolved_at IS NULL'); $hs->execute([$job['id']]);
    foreach ($hs->fetchAll() as $x) $have[$x['step_key']] = (string)$x['note'];
    $order = ['INITIAL_INSPECTION','FINDINGS_REPORT','SOLUTION'];
    $idx = array_search($step, $order, true);
    if ($idx !== false && $idx > 0 && !isset($have[$order[$idx - 1]])) json_error('Finish the previous step first.', 409);
    if (in_array($step, ['FINDINGS_REPORT','SOLUTION','PENDING','SOLVED'], true) && $note === '') json_error('Write a note for this step.', 422);
    if (in_array($step, ['PENDING','SOLVED'], true) && !isset($have['SOLUTION']) && !isset($have['FINDINGS_REPORT'])) json_error('Record the findings first.', 409);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO job_card_progress_steps(job_card_id,step_key,note,actor_name,updated_at,is_draft,resolved_at) VALUES(?,?,?,?,NOW(),0,NULL)
                       ON CONFLICT(job_card_id,step_key) DO UPDATE SET note=EXCLUDED.note,actor_name=EXCLUDED.actor_name,updated_at=NOW(),is_draft=0,resolved_at=NULL')
            ->execute([$job['id'], $step, $note !== '' ? $note : null, $a['actorName']]);
        $have[$step] = $note;
        // Work continued after a Pending: keep the reason, mark it resolved (never deleted).
        if ($step !== 'PENDING' && isset($have['PENDING'])) {
            $pdo->prepare("UPDATE job_card_progress_steps SET resolved_at=NOW() WHERE job_card_id=? AND step_key='PENDING' AND resolved_at IS NULL")->execute([$job['id']]);
            unset($have['PENDING']);
        }
        $labels = ['INITIAL_INSPECTION'=>'Initial inspection done','FINDINGS_REPORT'=>'Findings report done','SOLUTION'=>'Solution done','PENDING'=>'Pending','SOLVED'=>'Solved'];
        mf_log((string)$r['case_id'], $step === 'SOLVED' ? 'COMPLETED' : 'REPAIR', 'Technician', $labels[$step] . ' - ' . $job['job_card_no'], $note !== '' ? $note : null, $a);
        $diag = ['DIAGNOSIS / INSPECTION' => $have['INITIAL_INSPECTION'] ?? '', 'FINDINGS' => $have['FINDINGS_REPORT'] ?? '', 'SOLUTION' => $have['SOLUTION'] ?? ''];
        $text = '';
        foreach ($diag as $k => $v) if (trim((string)$v) !== '') $text .= $k . ":\n" . trim((string)$v) . "\n\n";
        $status = $step === 'PENDING' ? 'WAITING_FOR_PARTS' : 'IN_PROGRESS';
        if ($step === 'SOLVED') {
            $test = "TEST DURATION: 0 MIN\nTEST STARTED: " . date('c') . "\nFINAL RESULT: OK\nTEST NOTES: " . $note;
            $pdo->prepare("UPDATE digital_job_cards SET diagnosis=?,work_done=?,test_result=?,status='COMPLETED',completion_note=?,started_at=COALESCE(started_at,NOW()),received_at=COALESCE(received_at,NOW()),completed_at=NOW(),updated_at=NOW() WHERE id=?")
                ->execute([rtrim($text), $note, $test, 'FINAL RESULT OK - solved by ' . $a['actorName'], $job['id']]);
            $pdo->prepare("UPDATE breakdown_cases SET current_stage='COMPLETED',current_department='Completed',blocker_reason=NULL,status='COMPLETED',closed_at=NOW(),updated_at=NOW() WHERE id=?")->execute([$r['case_id']]);
            $pdo->prepare("UPDATE machine_malfunction_reports SET status='RESOLVED',resolved_at=NOW() WHERE id=?")->execute([$r['id']]);
            // Hide from alerts without deleting the message record.
            $pdo->prepare("UPDATE role_communications SET archived_at=NOW() WHERE related_type='MALFUNCTION_REPORT' AND related_id=? AND archived_at IS NULL")->execute([$r['id']]);
        } else {
            $pdo->prepare("UPDATE digital_job_cards SET diagnosis=?,status=?,started_at=COALESCE(started_at,NOW()),received_at=COALESCE(received_at,NOW()),updated_at=NOW() WHERE id=?")
                ->execute([rtrim($text), $status, $job['id']]);
            $pdo->prepare('UPDATE breakdown_cases SET current_stage=?,current_department=?,blocker_reason=?,updated_at=NOW() WHERE id=?')
                ->execute(['REPAIR', 'Technician', $step === 'PENDING' ? mb_substr($note, 0, 500) : null, $r['case_id']]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        error_log('Malfunction step failed: ' . $e->getMessage());
        json_error('Step could not be saved. Try again.', 500);
    }
    $scope = mf_workshop_scope(['is_machinery_admin'=>$r['is_machinery_admin']]);
    if ($step === 'SOLVED' || $step === 'PENDING') {
        mf_notify($a, $r, $scope, 'workshop_manager',
            ($step === 'SOLVED' ? 'SOLVED - ' : 'PENDING - ') . $job['job_card_no'],
            $step === 'SOLVED' ? 'Job Card ' . $job['job_card_no'] . ' solved and saved to Completed Maintenance Reports.' : 'Job Card ' . $job['job_card_no'] . ' is pending. Reason: ' . $note,
            $step === 'SOLVED' ? 'NORMAL' : 'ATTENTION', '/malfunction-reports/?view=job&actor=' . ($scope === 'BELM' ? 'admin' : 'customer') . '&report=' . rawurlencode($r['id']));
    }
    json_out(['ok'=>true,'step'=>$step,'status'=>$step === 'SOLVED' ? 'RESOLVED' : 'JOB_CARD_CREATED'], 200);
}

json_error('Unknown action.', 404);
