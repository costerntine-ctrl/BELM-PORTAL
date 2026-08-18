<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/checklist_reports_helpers.php';
require_once __DIR__ . '/service_due_helper.php';
require_once __DIR__ . '/../config/mailer.php';

// GET /api/engineering?action=dashboard
// One combined response for the Engineering page: recent machine
// activity, open operator messages, machine status/condition summary,
// service reminders (due soon / overdue), and pending spare-part
// requests — everything an Engineer needs to scan at a glance, as cards.
$user = require_auth();
require_page_access($user, 'roles');
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';


if ($method === 'GET' && $action === 'dispatch-options') {
    if (!belm_can_override_technician_customer($user)) {
        json_error('Only BELM Super Admin or Engineer can use Technician Dispatch.', 403);
    }
    $technicians = db()->query(
        "SELECT u.id,u.name,u.email,u.assigned_customer_id,hc.name AS assigned_customer_name
         FROM users u JOIN roles r ON r.id=u.role_id
         LEFT JOIN customers hc ON hc.id=u.assigned_customer_id
         WHERE u.is_active=1 AND u.deleted_at IS NULL
           AND (r.name='Technician' OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles rr ON rr.id=ur.role_id WHERE ur.user_id=u.id AND rr.name='Technician' AND rr.deleted_at IS NULL))
           AND u.is_customer_managed=0
         ORDER BY u.name"
    )->fetchAll();
    foreach ($technicians as &$tech) {
        $tech['assignedCustomerId'] = $tech['assigned_customer_id'];
        $tech['assignedCustomerName'] = $tech['assigned_customer_name'];
        unset($tech['assigned_customer_id'],$tech['assigned_customer_name']);
    }
    unset($tech);
    $customers = db()->query(
        "SELECT id,name,is_machinery_admin FROM customers
         WHERE is_active=1 AND deleted_at IS NULL ORDER BY name"
    )->fetchAll();
    $machines = db()->query(
        "SELECT m.id,m.customer_id,m.brand,m.model,m.machine_type,m.serial_number,c.name AS customer_name
         FROM machines m JOIN customers c ON c.id=m.customer_id
         WHERE m.deleted_at IS NULL AND c.is_active=1 AND c.deleted_at IS NULL
         ORDER BY c.name,m.brand,m.model"
    )->fetchAll();
    $receivedJobCards = db()->query(
        "SELECT j.id,j.job_card_no,j.title,j.customer_id,j.machine_id,j.status,j.priority,j.due_date,
                j.technician_id,j.technician_name,j.issued_by_name,j.issued_at,
                bc.source_type,bc.source_id,c.name AS customer_name,m.brand,m.model,m.machine_type
         FROM digital_job_cards j
         JOIN breakdown_cases bc ON bc.id=j.case_id
         JOIN customers c ON c.id=j.customer_id
         JOIN machines m ON m.id=j.machine_id
         WHERE j.status IN ('RECEIVED','OPEN')
           AND bc.status <> 'COMPLETED'
           AND j.technician_id IS NULL
           AND NULLIF(TRIM(COALESCE(j.technician_name,'')),'') IS NULL
           AND (bc.source_type='SERVICE_REQUEST' OR UPPER(COALESCE(j.issued_by_type,''))='CUSTOMER')
         ORDER BY c.name,j.created_at DESC
         LIMIT 250"
    )->fetchAll();
    foreach ($receivedJobCards as &$job) {
        $job['jobCardNo']=$job['job_card_no'];
        $job['customerId']=$job['customer_id'];
        $job['machineId']=$job['machine_id'];
        $job['technicianId']=$job['technician_id'];
        $job['technicianName']=$job['technician_name'];
        $job['customerName']=$job['customer_name'];
        $job['machineLabel']=trim(($job['brand']??'').' '.($job['model']??'')) ?: ($job['machine_type']??'Machine');
        $job['sourceType']=$job['source_type'];
        $job['issuedByName']=$job['issued_by_name'];
        $job['issuedAt']=$job['issued_at'];
        $job['dispatchStatus']='RECEIVED';
    }
    unset($job);
    json_out(['technicians'=>$technicians,'customers'=>$customers,'machines'=>$machines,'receivedJobCards'=>$receivedJobCards]);
}

if ($method === 'POST' && $action === 'dispatch') {
    if (!belm_can_override_technician_customer($user)) {
        json_error('Only BELM Super Admin or Engineer can use Technician Dispatch.', 403);
    }
    $b=body();
    $mode=strtolower(trim((string)($b['jobCardMode']??'existing')));
    if(!in_array($mode,['existing','create'],true)) json_error('Select Received Job Card or Create Job Card.');
    $technicianId=trim((string)($b['technicianId']??''));
    $customerId=trim((string)($b['customerId']??''));
    $priority=strtoupper(trim((string)($b['priority']??'NORMAL')));
    $dueDate=trim((string)($b['dueDate']??''));
    if($technicianId==='') json_error('Technician is required.');
    if(!in_array($priority,['LOW','NORMAL','HIGH','URGENT'],true)) json_error('Invalid priority.');
    if($dueDate!==''&&!preg_match('/^\d{4}-\d{2}-\d{2}$/',$dueDate)) json_error('Invalid due date.');
    $t=db()->prepare(
        "SELECT u.id,u.name,u.assigned_customer_id,hc.name AS home_customer_name
         FROM users u JOIN roles r ON r.id=u.role_id
         LEFT JOIN customers hc ON hc.id=u.assigned_customer_id
         WHERE u.id=? AND u.is_active=1 AND u.deleted_at IS NULL AND u.is_customer_managed=0
           AND (r.name='Technician' OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles rr ON rr.id=ur.role_id WHERE ur.user_id=u.id AND rr.name='Technician' AND rr.deleted_at IS NULL))"
    );
    $t->execute([$technicianId]); $tech=$t->fetch(); if(!$tech)json_error('Select an active BELM Technician.',422);

    $pdo=db();
    $pdo->beginTransaction();
    try {
        $jobId=''; $jobNo=''; $title=''; $description=''; $sourceRequestId=null; $caseId=''; $machineLabel='Machine';
        if($mode==='existing') {
            $jobId=trim((string)($b['jobCardId']??''));
            if($jobId==='') throw new RuntimeException('Select a received Job Card.');
            $j=$pdo->prepare(
                "SELECT j.*,bc.source_type,bc.source_id,bc.status AS case_status,c.name AS customer_name,c.is_machinery_admin,m.brand,m.model
                 FROM digital_job_cards j JOIN breakdown_cases bc ON bc.id=j.case_id
                 JOIN customers c ON c.id=j.customer_id JOIN machines m ON m.id=j.machine_id
                 WHERE j.id=? FOR UPDATE"
            );
            $j->execute([$jobId]); $job=$j->fetch();
            if(!$job) throw new RuntimeException('Selected Job Card was not found.');
            if(in_array(strtoupper((string)$job['status']),['COMPLETED','CANCELLED'],true) || strtoupper((string)$job['case_status'])==='COMPLETED') throw new RuntimeException('Completed/cancelled Job Cards cannot be dispatched again.');
            $customerIssued = strtoupper(trim((string)($job['issued_by_type']??''))) === 'CUSTOMER';
            if((string)$job['source_type']!=='SERVICE_REQUEST' && !$customerIssued) throw new RuntimeException('Only Customer-issued or Service Request Job Cards can be received through Technician Dispatch.');
            if(trim((string)($job['technician_id']??''))!=='' || trim((string)($job['technician_name']??''))!=='') throw new RuntimeException('This Job Card is already assigned. Use Job Card handover/reassignment instead.');
            $customerId=(string)$job['customer_id']; $caseId=(string)$job['case_id'];
            $jobNo=(string)$job['job_card_no']; $title=(string)$job['title']; $description=(string)$job['fault_description'];
            $sourceRequestId=(string)($job['source_type']==='SERVICE_REQUEST' ? ($job['source_id']??'') : '');
            $machineLabel=trim(($job['brand']??'').' '.($job['model']??'')) ?: 'Machine';
            $pdo->prepare("UPDATE digital_job_cards SET technician_id=?,technician_name=?,status='ASSIGNED',priority=?,due_date=?,updated_at=NOW() WHERE id=?")
                ->execute([$technicianId,$tech['name'],$priority,$dueDate?:null,$jobId]);
            $pdo->prepare("UPDATE breakdown_cases SET current_stage='DIAGNOSIS',current_department='Technician',blocker_reason=NULL,stage_started_at=NOW(),updated_at=NOW() WHERE id=? AND status<>'COMPLETED'")
                ->execute([$caseId]);
            $pdo->prepare("INSERT INTO breakdown_case_events(id,case_id,stage,department,action,note,actor_type,actor_id,actor_name,created_at)
                           SELECT ?,id,current_stage,current_department,?,?, 'belm',?,?,NOW() FROM breakdown_cases WHERE id=?")
                ->execute([uuid(),'Job Card '.$jobNo.' assigned to '.$tech['name'],'Technician dispatch from received Job Card',$user['id']??null,$user['name'],$caseId]);
            if($sourceRequestId!=='') {
                $sr=$pdo->prepare('SELECT status,assigned_to_id FROM service_requests WHERE id=? FOR UPDATE');
                $sr->execute([$sourceRequestId]); $old=$sr->fetch();
                if($old) {
                    $newStatus=in_array((string)$old['status'],['OPEN','ASSIGNED'],true)?'ASSIGNED':(string)$old['status'];
                    $pdo->prepare('UPDATE service_requests SET assigned_to_id=?,assigned_by_id=?,status=?,updated_at=NOW() WHERE id=?')
                        ->execute([$technicianId,$user['id']??null,$newStatus,$sourceRequestId]);
                    $pdo->prepare('INSERT INTO service_request_history(id,request_id,event_type,from_value,to_value,actor_id,actor_name,note,created_at) VALUES(?,?,?,?,?,?,?,?,NOW())')
                        ->execute([uuid(),$sourceRequestId,'ASSIGNMENT',(string)($old['assigned_to_id']??''),$technicianId,$user['id']??null,$user['name'],'Assigned through received Job Card '.$jobNo]);
                }
            }
        } else {
            $machineId=trim((string)($b['machineId']??''));
            $title=trim((string)($b['title']??''));
            $description=trim((string)($b['description']??''));
            if($customerId===''||$machineId===''||$title==='') throw new RuntimeException('Customer, machine and Job Card title are required.');
            $c=$pdo->prepare('SELECT id,name FROM customers WHERE id=? AND is_active=1 AND deleted_at IS NULL');
            $c->execute([$customerId]); $customer=$c->fetch(); if(!$customer) throw new RuntimeException('Selected customer is not available.');
            $m=$pdo->prepare('SELECT id,brand,model,machine_type FROM machines WHERE id=? AND customer_id=? AND deleted_at IS NULL');
            $m->execute([$machineId,$customerId]); $machine=$m->fetch(); if(!$machine) throw new RuntimeException('Selected machine is not available for this customer.');
            $machineLabel=trim(($machine['brand']??'').' '.($machine['model']??'')) ?: ($machine['machine_type']??'Machine');
            $caseId=uuid();
            $pdo->prepare("INSERT INTO breakdown_cases(id,customer_id,machine_id,source_type,title,description,status,current_stage,current_department,opened_at,stage_started_at,updated_at,created_by_name)
                           VALUES(?,?,?,'MANUAL',?,?,'OPEN','DIAGNOSIS','Technician',NOW(),NOW(),NOW(),?)")
                ->execute([$caseId,$customerId,$machineId,$title,$description?:$title,$user['name']]);
            $jobNo='JC-'.date('ym').'-'.str_pad((string)$pdo->query("SELECT nextval('breakdown_job_card_seq')")->fetchColumn(),4,'0',STR_PAD_LEFT);
            $jobId=uuid();
            $pdo->prepare("INSERT INTO digital_job_cards(id,case_id,customer_id,machine_id,job_card_no,title,fault_description,technician_id,technician_name,status,priority,due_date,generated_by_name,issued_by_name,issued_by_type,issued_at,created_at,updated_at)
                           VALUES(?,?,?,?,?,?,?,?,?,'ASSIGNED',?,?,?,?,? ,NOW(),NOW(),NOW())")
                ->execute([$jobId,$caseId,$customerId,$machineId,$jobNo,$title,$description?:$title,$technicianId,$tech['name'],$priority,$dueDate?:null,$user['name'],$user['name'],'BELM']);
            $pdo->prepare("INSERT INTO breakdown_case_events(id,case_id,stage,department,action,note,actor_type,actor_id,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,NOW())")
                ->execute([uuid(),$caseId,'DIAGNOSIS','Technician','Digital Job Card '.$jobNo.' created and assigned',$description?:$title,'belm',$user['id']??null,$user['name']]);
        }

        $temporary=!empty($tech['assigned_customer_id']) && (string)$tech['assigned_customer_id']!==$customerId;
        if($temporary && empty($b['temporaryOverride'])) throw new RuntimeException('Selected Technician belongs to another customer. Confirm Temporary Override for this Job Card.');
        if($temporary) {
            $pdo->prepare("INSERT INTO breakdown_case_events(id,case_id,stage,department,action,note,actor_type,actor_id,actor_name,created_at)
                           SELECT ?,id,current_stage,current_department,?,?, 'belm',?,?,NOW() FROM breakdown_cases WHERE id=?")
                ->execute([uuid(),'Temporary Technician Override - '.$tech['name'],'Home customer: '.($tech['home_customer_name']?:'Unassigned').'. Override applies only to Job Card '.$jobNo,$user['id']??null,$user['name'],$caseId]);
        }
        $pdo->commit();
        log_activity($user,'technician-dispatch','job-card',$jobId,[
            'jobCardNo'=>$jobNo,'mode'=>$mode,'technician'=>$tech['name'],'customerId'=>$customerId,
            'temporaryOverride'=>$temporary,'homeCustomer'=>$tech['home_customer_name']??null,'title'=>$title,
        ]);
        try {
            $mail=db()->prepare('SELECT email FROM users WHERE id=?'); $mail->execute([$technicianId]); $email=trim((string)$mail->fetchColumn());
            if(filter_var($email,FILTER_VALIDATE_EMAIL)) send_email($email,'DIGITAL JOB CARD '.$jobNo,
                "Job Card $jobNo has been assigned to you by {$user['name']}\nMachine: $machineLabel\nJob: $title\nPriority: $priority".
                ($dueDate!==''?"\nDue date: $dueDate":'').
                ($temporary?"\nAssignment: TEMPORARY OVERRIDE - your permanent customer has not changed.":'').
                ($description!==''?"\nDetails: $description":'')."\nOpen Technician > My Job Cards.");
        } catch(Throwable $e) {}
        json_out(['id'=>$jobId,'jobCardNo'=>$jobNo,'mode'=>$mode,'temporaryOverride'=>$temporary,'homeCustomerName'=>$tech['home_customer_name']??null],201);
    } catch(Throwable $e) {
        if($pdo->inTransaction()) $pdo->rollBack();
        json_error($e->getMessage(),422);
    }
}

if ($method === 'GET' && $action === 'dashboard') {
    // Catch-up scan: checklist submission normally creates the alert instantly,
    // but this also prepares any missed alert when Engineering opens the page
    // after a deployment/email outage. UNIQUE(machine_id, due_hour) prevents duplicates.
    belm_scan_service_due_alerts();
    // Recent activity tied to a specific machine (checklist submissions,
    // status/operational changes) — most recent first.
    $activity = db()->query(
        "SELECT cr.id, cr.created_at, cr.filled_by, cr.overall_status,
                m.brand, m.model, c.name AS customer_name
         FROM checklist_reports cr
         JOIN machines m ON m.id = cr.machine_id
         JOIN customers c ON c.id = m.customer_id
         ORDER BY cr.created_at DESC
         LIMIT 10"
    )->fetchAll();
    $activityCards = array_map(function ($row) {
        return [
            'machine' => trim(($row['brand'] ?? '') . ' ' . ($row['model'] ?? '')) ?: 'Machine',
            'customer' => $row['customer_name'],
            'filledBy' => $row['filled_by'],
            'status' => $row['overall_status'],
            'createdAt' => $row['created_at'],
        ];
    }, $activity);

    // Open operator messages (machine operators reporting an issue).
    $operatorMessages = db()->query(
        "SELECT o.id, o.message, o.operator_name, o.created_at,
                m.brand, m.model, c.name AS customer_name
         FROM operator_reports o
         JOIN machines m ON m.id = o.machine_id
         JOIN customers c ON c.id = o.customer_id
         WHERE o.status = 'OPEN' AND o.notify_belm = 1
         ORDER BY o.created_at DESC
         LIMIT 10"
    )->fetchAll();
    $operatorCards = array_map(function ($row) {
        return [
            'id' => $row['id'],
            'machine' => trim(($row['brand'] ?? '') . ' ' . ($row['model'] ?? '')) ?: 'Machine',
            'customer' => $row['customer_name'],
            'operatorName' => $row['operator_name'],
            'message' => $row['message'],
            'createdAt' => $row['created_at'],
        ];
    }, $operatorMessages);

    // Machine status/condition summary — counts by color.
    $statusCounts = db()->query(
        "SELECT COALESCE(status, 'NOT_CHECKED') AS status, COUNT(*) AS total
         FROM machines
         WHERE deleted_at IS NULL
         GROUP BY status"
    )->fetchAll();
    $statusSummary = ['GREEN' => 0, 'YELLOW' => 0, 'RED' => 0, 'NOT_CHECKED' => 0];
    foreach ($statusCounts as $row) {
        $key = strtoupper((string)$row['status']);
        if (isset($statusSummary[$key])) $statusSummary[$key] = (int)$row['total'];
    }

    // Service reminders — machines whose next service is due soon or
    // overdue, using the same interval-hours logic as the machine cards.
    $machines = db()->query(
        "SELECT m.id, m.brand, m.model, m.machine_type, c.name AS customer_name
         FROM machines m
         JOIN customers c ON c.id = m.customer_id
         WHERE m.deleted_at IS NULL"
    )->fetchAll();
    $reminders = [];
    foreach ($machines as $machine) {
        $status = compute_service_status_helper($machine['id']);
        if (!$status || !in_array($status['level'], ['YELLOW', 'RED'], true)) continue;
        $nextDue = (int)($status['dueHour'] ?? belm_next_due_hour_from_last_service((float)$status['lastServiceHours'], (float)$status['totalHours']));
        $prepStmt = db()->prepare(
            'SELECT sda.id, sda.due_hour, sda.service_interval_hours, sda.inventory_status,
                    sda.status, sda.draft_proforma_id, pi.invoice_no AS draft_proforma_no
             FROM service_due_alerts sda
             LEFT JOIN proforma_invoices pi ON pi.id = sda.draft_proforma_id
             WHERE sda.machine_id = ? AND sda.due_hour = ? LIMIT 1'
        );
        $prepStmt->execute([$machine['id'], $nextDue]);
        $prep = $prepStmt->fetch() ?: null;
        $ownerNotify = null;
        try {
            $kind = ($status['hoursRemaining'] ?? 0) <= 0 ? 'OVERDUE' : 'DUE_SOON';
            $ownerNotifyStmt = db()->prepare(
                'SELECT email_status, whatsapp_status FROM machine_service_owner_notifications
                 WHERE machine_id = ? AND due_hour = ? AND notification_kind = ? LIMIT 1'
            );
            $ownerNotifyStmt->execute([$machine['id'], $nextDue, $kind]);
            $ownerNotify = $ownerNotifyStmt->fetch() ?: null;
        } catch (Throwable $ignored) {}
        $reminders[] = [
            'machineId' => $machine['id'],
            'machine' => trim(($machine['brand'] ?? '') . ' ' . ($machine['model'] ?? '')) ?: 'Machine',
            'machineType' => $machine['machine_type'],
            'customer' => $machine['customer_name'],
            'level' => $status['level'],
            'hoursRemaining' => round($status['hoursRemaining']),
            'intervalHours' => $status['intervalHours'],
            'dueHour' => $nextDue,
            'serviceIntervalHours' => $prep ? (int)$prep['service_interval_hours'] : belm_service_interval_for_due_hour($nextDue),
            'inventoryStatus' => $prep['inventory_status'] ?? null,
            'draftProformaId' => $prep['draft_proforma_id'] ?? null,
            'draftProformaNo' => $prep['draft_proforma_no'] ?? null,
            'preparationStatus' => $prep['status'] ?? null,
            'ownerEmailStatus' => $ownerNotify['email_status'] ?? 'NOT_SENT',
            'ownerWhatsAppStatus' => $ownerNotify['whatsapp_status'] ?? 'NOT_SENT',
        ];
    }
    usort($reminders, fn($a, $b) => $a['level'] === $b['level'] ? 0 : ($a['level'] === 'RED' ? -1 : 1));
    $reminders = array_slice($reminders, 0, 10);

    // Pending spare-part requests.
    $spareRequests = db()->query(
        "SELECT spr.id, spr.description, spr.quantity, spr.requested_by_name,
                spr.machine_type, spr.created_at, sp.name AS spare_part_name,
                m.brand, m.model, c.name AS customer_name
         FROM spare_part_requests spr
         LEFT JOIN spare_parts sp ON sp.id = spr.spare_part_id
         LEFT JOIN machines m ON m.id = spr.machine_id
         LEFT JOIN customers c ON c.id = m.customer_id
         WHERE spr.status = 'PENDING'
         ORDER BY spr.created_at DESC
         LIMIT 10"
    )->fetchAll();
    $spareCards = array_map(function ($row) {
        return [
            'id' => $row['id'],
            'name' => $row['spare_part_name'] ?: $row['description'] ?: 'Spare part',
            'quantity' => (int)$row['quantity'],
            'requestedBy' => $row['requested_by_name'],
            'machine' => trim(($row['brand'] ?? '') . ' ' . ($row['model'] ?? '')) ?: ($row['machine_type'] ?: null),
            'customer' => $row['customer_name'],
            'createdAt' => $row['created_at'],
        ];
    }, $spareRequests);

    // Service-preparation review queue: one row per generated milestone.
    $prepRows = db()->query(
        "SELECT sda.id, sda.due_hour, sda.service_interval_hours, sda.current_hours,
                sda.status, sda.inventory_status, sda.created_at,
                m.id AS machine_id, m.machine_type, m.brand, m.model,
                c.name AS customer_name,
                pi.id AS proforma_id, pi.invoice_no AS proforma_no
         FROM service_due_alerts sda
         JOIN machines m ON m.id = sda.machine_id
         JOIN customers c ON c.id = sda.customer_id
         LEFT JOIN proforma_invoices pi ON pi.id = sda.draft_proforma_id
         WHERE sda.status = 'REVIEW'
         ORDER BY sda.created_at DESC
         LIMIT 20"
    )->fetchAll();
    $servicePreparations = array_map(static fn(array $row): array => [
        'id' => $row['id'],
        'dueHour' => (int)$row['due_hour'],
        'serviceIntervalHours' => (int)$row['service_interval_hours'],
        'currentHours' => (float)$row['current_hours'],
        'status' => $row['status'],
        'inventoryStatus' => $row['inventory_status'],
        'machineId' => $row['machine_id'],
        'machineType' => $row['machine_type'],
        'machine' => trim(($row['brand'] ?? '') . ' ' . ($row['model'] ?? '')) ?: $row['machine_type'],
        'customer' => $row['customer_name'],
        'draftProformaId' => $row['proforma_id'],
        'draftProformaNo' => $row['proforma_no'],
        'createdAt' => $row['created_at'],
    ], $prepRows);

    json_out([
        'activity' => $activityCards,
        'operatorMessages' => $operatorCards,
        'machineStatus' => $statusSummary,
        'serviceReminders' => $reminders,
        'servicePreparations' => $servicePreparations,
        'spareRequests' => $spareCards,
    ]);
}

json_error('Unknown request', 404);
