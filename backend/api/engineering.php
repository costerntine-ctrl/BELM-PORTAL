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
    json_out(['technicians'=>$technicians,'customers'=>$customers]);
}

if ($method === 'POST' && $action === 'dispatch') {
    if (!belm_can_override_technician_customer($user)) {
        json_error('Only BELM Super Admin or Engineer can use Technician Dispatch.', 403);
    }
    $b=body();
    $technicianId=trim((string)($b['technicianId']??''));
    $customerId=trim((string)($b['customerId']??''));
    $title=trim((string)($b['title']??''));
    $description=trim((string)($b['description']??''));
    $priority=strtoupper(trim((string)($b['priority']??'NORMAL')));
    $dueDate=trim((string)($b['dueDate']??''));
    if($technicianId===''||$customerId===''||$title==='') json_error('Technician, customer and job title are required.');
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
    $c=db()->prepare('SELECT id,name FROM customers WHERE id=? AND is_active=1 AND deleted_at IS NULL');
    $c->execute([$customerId]); $customer=$c->fetch(); if(!$customer)json_error('Selected customer is not available.',422);
    $temporary=!empty($tech['assigned_customer_id']) && (string)$tech['assigned_customer_id']!==$customerId;
    $id=uuid();
    db()->prepare("INSERT INTO tasks(id,assigned_to_id,customer_id,title,description,due_date,priority,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,'PENDING',?,NOW())")
        ->execute([$id,$technicianId,$customerId,$title,$description?:null,$dueDate?:null,$priority,$user['name']]);
    log_activity($user,'technician-dispatch','task',$id,[
        'technician'=>$tech['name'],'customer'=>$customer['name'],'temporaryOverride'=>$temporary,
        'homeCustomer'=>$tech['home_customer_name']??null,'title'=>$title,
    ]);
    try {
        $mail=db()->prepare('SELECT email FROM users WHERE id=?'); $mail->execute([$technicianId]); $email=trim((string)$mail->fetchColumn());
        if(filter_var($email,FILTER_VALIDATE_EMAIL)) send_email($email,'BELM TECHNICIAN DISPATCH - '.$title,
            "Job assigned by {$user['name']}\nCustomer: {$customer['name']}\nJob: $title\nPriority: $priority".
            ($temporary?"\nAssignment: TEMPORARY OVERRIDE - your permanent customer has not changed.":'').
            ($description!==''?"\nDetails: $description":'')."\nOpen Technician > My Tasks.");
    } catch(Throwable $e) {}
    json_out(['id'=>$id,'temporaryOverride'=>$temporary,'homeCustomerName'=>$tech['home_customer_name']??null,'customerName'=>$customer['name']],201);
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
