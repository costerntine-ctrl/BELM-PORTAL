<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
// The shared Technician role is used by both BELM field technicians and
// customer-owned technicians. In Customer Self-Service mode, technicians work
// only inside the customer's machine/checklist/operator workflow; BELM's
// central Service Requests workspace remains private. The customer explicitly
// opens a BELM support request from the Customer Portal when help is needed.
if (($user['roleName'] ?? '') === 'Technician' && !empty($user['assignedCustomerId'])) {
    $modeStmt = db()->prepare(
        'SELECT c.is_machinery_admin, u.is_customer_managed
         FROM users u JOIN customers c ON c.id = u.assigned_customer_id
         WHERE u.id = ? AND c.id = ? AND u.deleted_at IS NULL AND c.deleted_at IS NULL'
    );
    $modeStmt->execute([(string)$user['id'], (string)$user['assignedCustomerId']]);
    $modeRow = $modeStmt->fetch();
    if ($modeRow && !empty($modeRow['is_machinery_admin']) && !empty($modeRow['is_customer_managed'])) {
        json_error('BELM Service Requests workspace is not available to Customer Self-Service technicians.', 403);
    }
}
require_page_access($user, 'service-requests');
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = $_GET['id'] ?? null;
$allowedStatuses = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];

// Records one entry in a service request's audit trail — every status
// change and every (re)assignment, who did it, and when. This is what
// "Opened -> Assigned -> In Progress -> Completed/Cancelled by ..." on
// the History panel is built from.
function log_service_request_history(
    string $requestId, string $eventType, ?string $fromValue, ?string $toValue,
    array $user, ?string $note = null
): void {
    db()->prepare(
        'INSERT INTO service_request_history
         (id, request_id, event_type, from_value, to_value, actor_id, actor_name, note, created_at)
         VALUES (?,?,?,?,?,?,?,?,NOW())'
    )->execute([uuid(), $requestId, $eventType, $fromValue, $toValue, $user['id'], $user['name'], $note]);
}


function notify_service_request_customer(string $requestId, string $subject, string $message, array $user): void {
    try {
        $stmt = db()->prepare(
            'SELECT sr.customer_id, sr.machine_id, sr.description, c.name AS customer_name, m.brand, m.model
             FROM service_requests sr
             JOIN customers c ON c.id = sr.customer_id
             JOIN machines m ON m.id = sr.machine_id
             WHERE sr.id = ?'
        );
        $stmt->execute([$requestId]);
        $row = $stmt->fetch();
        if (!$row) return;
        $machine = trim(($row['brand'] ?? '') . ' ' . ($row['model'] ?? '')) ?: 'Machine';
        belm_send_customer_alert(
            (string)$row['customer_id'], (string)$row['machine_id'], ['admin'],
            $subject,
            $message . "\nMachine: $machine\nRequest: " . ($row['description'] ?? '') . "\n\nOpen the BELM Customer Portal for the latest history.",
            'SERVICE_REQUEST', $requestId, (string)($user['name'] ?? 'BELM')
        );
    } catch (Throwable $error) {
        error_log('Service request customer notification failed: ' . $error->getMessage());
    }
}

function fetch_request_parts(string $requestId): array {
    $stmt = db()->prepare(
        'SELECT srp.id, srp.spare_name, srp.part_number, srp.quantity,
                sp.name AS matched_name, sp.part_number AS matched_part_number,
                sp.stock_qty AS matched_stock_qty
         FROM service_request_parts srp
         LEFT JOIN spare_parts sp ON sp.id = srp.matched_spare_part_id AND sp.deleted_at IS NULL
         WHERE srp.request_id = ?
         ORDER BY srp.created_at ASC'
    );
    $stmt->execute([$requestId]);
    $parts = $stmt->fetchAll();
    foreach ($parts as &$part) {
        $part['spareName'] = $part['spare_name'];
        $part['partNumber'] = $part['part_number'];
        // Silent inventory match — helps whoever prepares the Proforma
        // instantly see which stock item this corresponds to, without the
        // customer ever having seen BELM's inventory themselves.
        $part['inventoryMatch'] = $part['matched_name']
            ? ['name' => $part['matched_name'], 'partNumber' => $part['matched_part_number'], 'stockQty' => (int)$part['matched_stock_qty']]
            : null;
        unset($part['spare_name'], $part['part_number'], $part['matched_name'], $part['matched_part_number'], $part['matched_stock_qty']);
    }
    unset($part);
    return $parts;
}

// ---- Operator problem reports (visible to BELM Technician/Admin staff) ----
if ($method === 'GET' && $action === 'operator-reports') {
    $statusFilter = trim((string)($_GET['status'] ?? ''));
    $sql = "SELECT opr.*, c.name AS customer_name, m.model AS machine_model, m.machine_type
            FROM operator_reports opr
            JOIN customers c ON c.id = opr.customer_id
            JOIN machines m ON m.id = opr.machine_id
            WHERE opr.notify_belm = 1";
    $params = [];
    if ($statusFilter !== '') {
        $sql .= ' AND opr.status = ?';
        $params[] = strtoupper($statusFilter);
    }
    $sql .= ' ORDER BY opr.created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $reports = $stmt->fetchAll();
    foreach ($reports as &$r) {
        $r['customer'] = ['name' => $r['customer_name']];
        $r['machine'] = ['model' => $r['machine_model'], 'machineType' => $r['machine_type']];
        $r['operatorName'] = $r['operator_name'];
        $r['operatorContact'] = $r['operator_contact'];
        $r['createdAt'] = $r['created_at'];
        $r['resolvedAt'] = $r['resolved_at'];
        unset($r['customer_name'], $r['machine_model'], $r['machine_type'], $r['operator_name'], $r['operator_contact']);
    }
    unset($r);
    json_out($reports);
}

if ($method === 'PUT' && $action === 'operator-reports') {
    $reportId = trim((string)($_GET['id'] ?? ''));
    if ($reportId === '') json_error('Report ID is required.');
    $reportStmt = db()->prepare('SELECT customer_id, machine_id, message FROM operator_reports WHERE id = ? AND notify_belm = 1');
    $reportStmt->execute([$reportId]);
    $report = $reportStmt->fetch();
    if (!$report) json_error('Report not found.', 404);
    $stmt = db()->prepare("UPDATE operator_reports SET status='RESOLVED', resolved_at=NOW(), resolved_by_id=? WHERE id=?");
    $stmt->execute([$user['id'], $reportId]);
    belm_send_customer_alert(
        (string)$report['customer_id'], (string)$report['machine_id'], ['admin'],
        'Machine Problem Resolved',
        'BELM resolved the reported problem: ' . $report['message'],
        'OPERATOR_REPORT', $reportId, (string)($user['name'] ?? 'BELM')
    );
    // V220: resolving the source report also closes its Breakdown Process case.
    belm_sync_breakdown_sources((string)$report['customer_id']);
    json_out(['ok' => true]);
}

if ($method === 'GET' && $action === 'daily-report') {
    $date = trim((string)($_GET['date'] ?? date('Y-m-d')));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) json_error('Enter a valid date (YYYY-MM-DD).');

    $stmt = db()->prepare(
        'SELECT sr.*, c.name AS customer_name, m.model AS machine_model, m.machine_type,
                cu.name AS completed_by_name, xu.name AS cancelled_by_name
         FROM service_requests sr
         LEFT JOIN customers c ON c.id = sr.customer_id
         LEFT JOIN machines m ON m.id = sr.machine_id
         LEFT JOIN users cu ON cu.id = sr.completed_by_id
         LEFT JOIN users xu ON xu.id = sr.cancelled_by_id
         WHERE (sr.status = \'COMPLETED\' AND sr.completed_at::date = ?)
            OR (sr.status = \'CANCELLED\' AND sr.cancelled_at::date = ?)
         ORDER BY COALESCE(sr.completed_at, sr.cancelled_at) DESC'
    );
    $stmt->execute([$date, $date]);
    $requests = $stmt->fetchAll();
    foreach ($requests as &$r) {
        $r['customer'] = $r['customer_id'] ? ['id' => $r['customer_id'], 'name' => $r['customer_name']] : null;
        $r['machine'] = $r['machine_id'] ? ['model' => $r['machine_model'], 'machineType' => $r['machine_type']] : null;
        $r['completedBy'] = $r['completed_by_id'] ? ['name' => $r['completed_by_name']] : null;
        $r['cancelledBy'] = $r['cancelled_by_id'] ? ['name' => $r['cancelled_by_name']] : null;
        $r['completedAt'] = $r['completed_at'];
        $r['cancelledAt'] = $r['cancelled_at'];
        unset($r['customer_name'], $r['machine_model'], $r['machine_type'], $r['completed_by_name'], $r['cancelled_by_name']);
    }
    json_out(['date' => $date, 'requests' => $requests]);
}

if ($method === 'GET' && $action === 'assignees') {
    $stmt = db()->query(
        "SELECT u.id, u.name, u.email, u.assigned_customer_id, c.name AS assigned_customer_name
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN customers c ON c.id = u.assigned_customer_id
         WHERE u.deleted_at IS NULL AND u.is_active = 1
           AND (r.name='Technician' OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles rr ON rr.id=ur.role_id WHERE ur.user_id=u.id AND rr.name='Technician' AND rr.deleted_at IS NULL))
           AND u.is_customer_managed = 0
         ORDER BY u.name ASC"
    );
    $technicians = $stmt->fetchAll();
    foreach ($technicians as &$technician) {
        $technician['assignedCustomerId'] = $technician['assigned_customer_id'];
        $technician['assignedCustomerName'] = $technician['assigned_customer_name'];
        unset($technician['assigned_customer_id'], $technician['assigned_customer_name']);
    }
    unset($technician);
    json_out($technicians);
}

// ---- Full audit trail for one request: Opened -> Assigned -> In Progress
// -> Completed/Cancelled by ..., merged with any notes on the same timeline.
if ($method === 'GET' && $action === 'history') {
    $requestId = trim((string)($_GET['requestId'] ?? ''));
    if ($requestId === '') json_error('requestId is required.');
    $stmt = db()->prepare('SELECT 1 FROM service_requests WHERE id = ?');
    $stmt->execute([$requestId]);
    if (!$stmt->fetch()) json_error('Service request not found.', 404);

    $stmt = db()->prepare(
        "SELECT 'STATUS' AS kind, event_type, from_value, to_value, actor_name, note, created_at
         FROM service_request_history WHERE request_id = ?
         UNION ALL
         SELECT 'NOTE' AS kind, NULL, NULL, NULL, author, note, created_at
         FROM service_notes WHERE request_id = ?
         ORDER BY created_at ASC"
    );
    $stmt->execute([$requestId, $requestId]);
    $rows = $stmt->fetchAll();
    $timeline = array_map(function ($row) {
        return [
            'kind' => $row['kind'],
            'eventType' => $row['event_type'],
            'from' => $row['from_value'],
            'to' => $row['to_value'],
            'actorName' => $row['actor_name'],
            'note' => $row['note'],
            'createdAt' => $row['created_at'],
        ];
    }, $rows);
    json_out($timeline);
}

// ---- Customer inbox: service requests + operator reports for ONE customer -
if ($method === 'GET' && $action === 'customer-inbox') {
    $customerId = trim((string)($_GET['customerId'] ?? ''));
    if ($customerId === '') json_error('customerId is required.');

    $srStmt = db()->prepare(
        "SELECT sr.id, sr.status, sr.description, sr.service_type, sr.created_at,
                m.model AS machine_model
         FROM service_requests sr
         LEFT JOIN machines m ON m.id = sr.machine_id
         WHERE sr.customer_id = ? AND sr.status NOT IN ('COMPLETED','CANCELLED')
         ORDER BY sr.created_at DESC LIMIT 15"
    );
    $srStmt->execute([$customerId]);
    $serviceRequests = array_map(function ($row) {
        return [
            'type' => 'service-request',
            'id' => $row['id'],
            'title' => 'Service Request' . ($row['machine_model'] ? " — {$row['machine_model']}" : ''),
            'detail' => $row['description'] ?: ($row['service_type'] ?: ''),
            'status' => $row['status'],
            'createdAt' => $row['created_at'],
        ];
    }, $srStmt->fetchAll());

    $opStmt = db()->prepare(
        "SELECT opr.id, opr.status, opr.message, opr.operator_name, opr.created_at,
                m.model AS machine_model
         FROM operator_reports opr
         LEFT JOIN machines m ON m.id = opr.machine_id
         WHERE opr.customer_id = ? AND opr.status = 'OPEN' AND opr.notify_belm = 1
         ORDER BY opr.created_at DESC LIMIT 15"
    );
    $opStmt->execute([$customerId]);
    $operatorReports = array_map(function ($row) {
        return [
            'type' => 'operator-report',
            'id' => $row['id'],
            'title' => 'Operator Report' . ($row['machine_model'] ? " — {$row['machine_model']}" : ''),
            'detail' => "{$row['operator_name']}: {$row['message']}",
            'status' => $row['status'],
            'createdAt' => $row['created_at'],
        ];
    }, $opStmt->fetchAll());

    $combined = array_merge($serviceRequests, $operatorReports);
    usort($combined, fn($a, $b) => strcmp($b['createdAt'], $a['createdAt']));
    json_out($combined);
}

if ($method === 'GET' && !$action) {
    $status = $_GET['status'] ?? null;
    $onlyHidden = !empty($_GET['hidden']);
    $sql = 'SELECT sr.*, c.name AS customer_name, c.phone AS customer_phone, m.model AS machine_model,
                   m.machine_type, u.name AS assigned_to_name, u.assigned_customer_id AS assigned_home_customer_id,
                   hc.name AS assigned_home_customer_name,
                   cu.name AS completed_by_name, xu.name AS cancelled_by_name,
                   jc.id AS linked_job_card_id, jc.job_card_no AS linked_job_card_no,
                   jc.status AS linked_job_card_status, jc.received_at AS linked_job_card_received_at
            FROM service_requests sr
            LEFT JOIN customers c ON c.id = sr.customer_id
            LEFT JOIN machines m ON m.id = sr.machine_id
            LEFT JOIN users u ON u.id = sr.assigned_to_id
            LEFT JOIN customers hc ON hc.id = u.assigned_customer_id
            LEFT JOIN users cu ON cu.id = sr.completed_by_id
            LEFT JOIN users xu ON xu.id = sr.cancelled_by_id
            LEFT JOIN LATERAL (
                SELECT j.id,j.job_card_no,j.status,COALESCE(j.issued_at,j.created_at) AS received_at
                FROM breakdown_cases bc
                JOIN digital_job_cards j ON j.case_id=bc.id
                WHERE bc.source_type=\'SERVICE_REQUEST\' AND bc.source_id=sr.id
                ORDER BY j.created_at ASC LIMIT 1
            ) jc ON TRUE';
    if ($onlyHidden) {
        $stmt = db()->query("$sql WHERE sr.hidden_at IS NOT NULL ORDER BY sr.hidden_at DESC");
    } elseif ($status) {
        $stmt = db()->prepare("$sql WHERE sr.status = ? AND sr.hidden_at IS NULL ORDER BY sr.created_at DESC");
        $stmt->execute([$status]);
    } else {
        $stmt = db()->query("$sql WHERE sr.status <> 'PENDING_CUSTOMER' AND sr.hidden_at IS NULL ORDER BY sr.created_at DESC");
    }
    $requests = $stmt->fetchAll();
    foreach ($requests as &$r) {
        $r['customer'] = $r['customer_id']
            ? ['id' => $r['customer_id'], 'name' => $r['customer_name'], 'phone' => $r['customer_phone']]
            : null;
        $r['machine'] = $r['machine_id']
            ? [
                'id' => $r['machine_id'],
                'model' => $r['machine_model'],
                'machineType' => $r['machine_type'],
            ]
            : null;
        $r['assignedTo'] = $r['assigned_to_id']
            ? [
                'id' => $r['assigned_to_id'],
                'name' => $r['assigned_to_name'],
                'homeCustomerId' => $r['assigned_home_customer_id'] ?? null,
                'homeCustomerName' => $r['assigned_home_customer_name'] ?? null,
                'temporaryOverride' => !empty($r['customer_id']) && !empty($r['assigned_home_customer_id'])
                    && (string)$r['customer_id'] !== (string)$r['assigned_home_customer_id'],
              ]
            : null;
        $r['completedBy'] = $r['completed_by_id']
            ? ['id' => $r['completed_by_id'], 'name' => $r['completed_by_name']]
            : null;
        $r['completedAt'] = $r['completed_at'];
        $r['cancelledBy'] = $r['cancelled_by_id']
            ? ['id' => $r['cancelled_by_id'], 'name' => $r['cancelled_by_name']]
            : null;
        $r['cancelledAt'] = $r['cancelled_at'];
        $r['serviceType'] = $r['service_type'];
        $r['templateId'] = $r['template_id'];
        $r['createdAt'] = $r['created_at'];
        $r['updatedAt'] = $r['updated_at'];
        $r['hiddenAt'] = $r['hidden_at'];
        $r['serviceParts'] = fetch_request_parts($r['id']);
        $r['jobCard'] = !empty($r['linked_job_card_id']) ? [
            'id' => $r['linked_job_card_id'],
            'jobCardNo' => $r['linked_job_card_no'],
            'status' => $r['linked_job_card_status'],
            'receivedAt' => $r['linked_job_card_received_at'],
            'receivedByBelm' => true,
        ] : null;
        unset(
            $r['customer_name'],
            $r['customer_phone'],
            $r['machine_model'],
            $r['machine_type'],
            $r['assigned_to_name'],
            $r['assigned_home_customer_id'],
            $r['assigned_home_customer_name'],
            $r['completed_by_name'],
            $r['cancelled_by_name'],
            $r['linked_job_card_id'],
            $r['linked_job_card_no'],
            $r['linked_job_card_status'],
            $r['linked_job_card_received_at']
        );
        $stmt2 = db()->prepare('SELECT * FROM service_notes WHERE request_id = ? ORDER BY created_at ASC');
        $stmt2->execute([$r['id']]);
        $r['notes'] = $stmt2->fetchAll();
        foreach ($r['notes'] as &$note) {
            $note['createdAt'] = $note['created_at'];
        }
        unset($note);
    }
    json_out($requests);
}

if ($method === 'PUT' && $action === 'status') {
    $b = body();
    $status = strtoupper(trim((string)($b['status'] ?? '')));
    if (!in_array($status, $allowedStatuses, true)) json_error('Invalid service request status.');

    $stmt = db()->prepare('SELECT status,machine_id,assigned_to_id FROM service_requests WHERE id = ?');
    $stmt->execute([$id]);
    $existing = $stmt->fetch();
    if (!$existing) json_error('Service request not found.', 404);
    $previousStatus = $existing['status'];
    if (in_array($previousStatus, ['COMPLETED','CANCELLED'], true) && $status !== $previousStatus) {
        json_error('A completed/cancelled Service Request cannot be reopened from this status control.', 409);
    }
    if ($status === 'OPEN' && !empty($existing['assigned_to_id'])) {
        json_error('Unassign the Technician first before returning this Service Request to OPEN.', 409);
    }
    if (in_array($status, ['ASSIGNED','IN_PROGRESS'], true) && empty($existing['assigned_to_id'])) {
        json_error('Assign a Technician before setting this Service Request to ' . str_replace('_', ' ', $status) . '.', 409);
    }
    if (!empty($existing['machine_id']) && in_array($status, ['OPEN','ASSIGNED','IN_PROGRESS'], true)) {
        $jobStateStmt = db()->prepare(
            "SELECT j.status,j.technician_id FROM digital_job_cards j
             JOIN breakdown_cases bc ON bc.id=j.case_id
             WHERE bc.source_type='SERVICE_REQUEST' AND bc.source_id=?
             ORDER BY j.created_at ASC LIMIT 1"
        );
        $jobStateStmt->execute([$id]);
        $jobState = $jobStateStmt->fetch();
        if ($jobState) {
            $jobStatus = strtoupper((string)($jobState['status'] ?? ''));
            if ($previousStatus !== $status && $status === 'OPEN' && !in_array($jobStatus, ['OPEN','RECEIVED'], true)) {
                json_error('The linked Job Card has already been assigned/started. Keep the Service Request in progress and manage the work from Job Card Dispatch.', 409);
            }
            if ($previousStatus !== $status && $status === 'ASSIGNED' && !in_array($jobStatus, ['OPEN','RECEIVED','ASSIGNED'], true)) {
                json_error('The linked Job Card has already started. Manage Technician handover from Job Card Dispatch.', 409);
            }
            if ($status === 'IN_PROGRESS' && empty($jobState['technician_id'])) {
                json_error('Assign the linked Job Card to a Technician before starting work.', 409);
            }
        }
    }
    if ($status === 'COMPLETED' && !empty($existing['machine_id'])) {
        // Official machine Service Requests are one operational record with
        // their Job Card. Ensure legacy requests receive a Job Card too, then
        // refuse completion until the technician has completed that card.
        belm_sync_breakdown_case_from_service_request((string)$id, (string)($user['name'] ?? 'BELM'));
        $jobCheck = db()->prepare(
            "SELECT j.status FROM digital_job_cards j
             JOIN breakdown_cases bc ON bc.id=j.case_id
             WHERE bc.source_type='SERVICE_REQUEST' AND bc.source_id=?
             ORDER BY j.created_at ASC LIMIT 1"
        );
        $jobCheck->execute([$id]);
        $jobStatus = strtoupper((string)($jobCheck->fetchColumn() ?: ''));
        if ($jobStatus !== 'COMPLETED') {
            json_error('Complete the Technician Job Card before closing this Service Request.', 409);
        }
        // V307: Technician completion only advances the operational case to
        // TESTING. The Service Request must not be closed manually until the
        // Workshop has actually accepted the test and closed the synced case.
        $caseCheck = db()->prepare(
            "SELECT status,current_stage FROM breakdown_cases
             WHERE source_type='SERVICE_REQUEST' AND source_id=? LIMIT 1"
        );
        $caseCheck->execute([$id]);
        $caseState = $caseCheck->fetch();
        if (!$caseState
            || strtoupper((string)$caseState['status']) !== 'COMPLETED'
            || strtoupper((string)$caseState['current_stage']) !== 'COMPLETED') {
            json_error('Workshop test is still pending. Complete the Maintenance Process test before closing this Service Request.', 409);
        }
    }

    if ($status === 'COMPLETED') {
        $stmt = db()->prepare(
            'UPDATE service_requests SET status=?, updated_at=NOW(), completed_by_id=?, completed_at=NOW() WHERE id=?'
        );
        $stmt->execute([$status, $user['id'], $id]);
    } elseif ($status === 'CANCELLED') {
        $stmt = db()->prepare(
            'UPDATE service_requests SET status=?, updated_at=NOW(), cancelled_by_id=?, cancelled_at=NOW() WHERE id=?'
        );
        $stmt->execute([$status, $user['id'], $id]);
    } elseif ($status === 'IN_PROGRESS') {
        $stmt = db()->prepare(
            'UPDATE service_requests SET status=?, updated_at=NOW(), started_by_id=?, started_at=NOW() WHERE id=?'
        );
        $stmt->execute([$status, $user['id'], $id]);
    } else {
        $stmt = db()->prepare('UPDATE service_requests SET status=?, updated_at=NOW() WHERE id=?');
        $stmt->execute([$status, $id]);
    }
    if ($stmt->rowCount() === 0) json_error('Service request not found.', 404);
    if ($previousStatus !== $status) {
        log_service_request_history($id, 'STATUS', $previousStatus, $status, $user, trim((string)($b['note'] ?? '')) ?: null);
        notify_service_request_customer(
            (string)$id,
            'Service Request Update — ' . str_replace('_', ' ', $status),
            'BELM changed your service request status from ' . str_replace('_', ' ', $previousStatus) . ' to ' . str_replace('_', ' ', $status) . '.',
            $user
        );
    }
    belm_sync_breakdown_case_from_service_request((string)$id, (string)($user['name'] ?? 'BELM'));
    json_out(['ok' => true]);
}

if ($method === 'PUT' && $action === 'assign') {
    $b = body();
    $assignedToId = trim((string)($b['assignedToId'] ?? ''));
    $stmt = db()->prepare('SELECT customer_id, assigned_to_id, status FROM service_requests WHERE id = ?');
    $stmt->execute([$id]);
    $request = $stmt->fetch();
    if (!$request) json_error('Service request not found.', 404);

    if (in_array((string)$request['status'], ['COMPLETED','CANCELLED'], true)) {
        json_error('A completed/cancelled Service Request cannot be assigned again.', 409);
    }

    $linkedJobStmt = db()->prepare(
        "SELECT j.status FROM digital_job_cards j
         JOIN breakdown_cases bc ON bc.id=j.case_id
         WHERE bc.source_type='SERVICE_REQUEST' AND bc.source_id=?
         ORDER BY j.created_at ASC LIMIT 1"
    );
    $linkedJobStmt->execute([$id]);
    $linkedJobStatus = strtoupper((string)($linkedJobStmt->fetchColumn() ?: ''));
    // RECEIVED/legacy OPEN cards have not started. A merely ASSIGNED card can
    // still be unassigned back to RECEIVED, but assigning a different Technician
    // after assignment must go through Job Card Dispatch so handover is audited.
    if ($assignedToId === '') {
        if ($linkedJobStatus !== '' && !in_array($linkedJobStatus, ['OPEN','RECEIVED','ASSIGNED'], true)) {
            json_error('This Service Request Job Card has already started. Use Job Card Dispatch/Workshop flow to change assignment.', 409);
        }
        if (!in_array((string)$request['status'], ['OPEN','ASSIGNED'], true)) {
            json_error('Only an Open/Assigned Service Request can be unassigned. Put active work back through the Job Card/Workshop flow.', 409);
        }
        db()->prepare(
            "UPDATE service_requests
             SET assigned_to_id=NULL,
                 status=CASE WHEN status='ASSIGNED' THEN 'OPEN' ELSE status END,
                 updated_at=NOW()
             WHERE id=?"
        )->execute([$id]);
        if ($request['assigned_to_id']) {
            log_service_request_history($id, 'ASSIGNMENT', $request['assigned_to_id'], null, $user);
        }
        belm_sync_breakdown_case_from_service_request((string)$id, (string)($user['name'] ?? 'BELM'));
        json_out(['ok' => true]);
    }

    if ($linkedJobStatus !== '' && !in_array($linkedJobStatus, ['OPEN','RECEIVED'], true)) {
        json_error('This Service Request Job Card is already assigned/started. Change Technician from Job Card Dispatch so the handover remains auditable.', 409);
    }

    $stmt = db()->prepare(
        "SELECT u.id, u.name, u.assigned_customer_id, hc.name AS home_customer_name
         FROM users u JOIN roles r ON r.id = u.role_id
         LEFT JOIN customers hc ON hc.id = u.assigned_customer_id
         WHERE u.id = ?
           AND u.deleted_at IS NULL AND u.is_active = 1
           AND (r.name='Technician' OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles rr ON rr.id=ur.role_id WHERE ur.user_id=u.id AND rr.name='Technician' AND rr.deleted_at IS NULL))
           AND u.is_customer_managed = 0"
    );
    $stmt->execute([$assignedToId]);
    $technician = $stmt->fetch();
    if (!$technician) json_error('Select an active Technician.', 422);
    $isTemporaryOverride = $request['customer_id']
        && !empty($technician['assigned_customer_id'])
        && (string)$technician['assigned_customer_id'] !== (string)$request['customer_id'];
    if ($isTemporaryOverride) {
        if (empty($b['temporaryOverride'])) {
            json_error('This Technician belongs to another customer. Confirm Temporary Override to assign this specific job.', 409);
        }
        if (!belm_can_override_technician_customer($user)) {
            json_error('Only BELM Super Admin or Engineer can use a Temporary Technician Override.', 403);
        }
    }

    $nextRequestStatus = (string)$request['status'] === 'OPEN' ? 'ASSIGNED' : (string)$request['status'];
    db()->prepare(
        "UPDATE service_requests
         SET assigned_to_id=?, assigned_by_id=?, status=?, updated_at=NOW()
         WHERE id=?"
    )->execute([$assignedToId, $user['id'], $nextRequestStatus, $id]);
    $overrideNote = $isTemporaryOverride
        ? 'TEMPORARY OVERRIDE - Technician home customer: ' . ($technician['home_customer_name'] ?: 'Unassigned') . '. This override applies to this service request only.'
        : null;
    log_service_request_history($id, 'ASSIGNMENT', $request['assigned_to_id'], $technician['name'], $user, $overrideNote);
    if ((string)$request['status'] !== $nextRequestStatus) {
        log_service_request_history($id, 'STATUS', (string)$request['status'], $nextRequestStatus, $user);
    }
    notify_service_request_customer(
        (string)$id,
        'Technician Assigned — ' . $technician['name'],
        'BELM assigned Technician ' . $technician['name'] . ' to your service request.' . ($isTemporaryOverride ? ' This is a temporary job assignment.' : ''),
        $user
    );
    belm_sync_breakdown_case_from_service_request((string)$id, (string)($user['name'] ?? 'BELM'));
    json_out(['ok' => true]);
}

// V331 - one-click handoff from Service Requests to the operational Job Card.
// The customer request already IS the Job Card source: description = work instructions.
// OK/Activate verifies/repairs the linked Job Card and then removes the request from
// the active Service Requests inbox. The request remains intact in History/HIDDEN and
// the work continues in Engineering -> Job Cards.
if ($method === 'PUT' && $action === 'activate-job-card') {
    $stmt = db()->prepare(
        'SELECT id,customer_id,machine_id,status,assigned_to_id,description,service_type
         FROM service_requests WHERE id=?'
    );
    $stmt->execute([$id]);
    $request = $stmt->fetch();
    if (!$request) json_error('Service request not found.', 404);
    if (empty($request['machine_id'])) {
        json_error('Select/link a machine before activating a Job Card.', 409);
    }
    if (in_array(strtoupper((string)$request['status']), ['COMPLETED','CANCELLED'], true)) {
        json_error('Completed or cancelled requests cannot be activated as a new Job Card.', 409);
    }
    if (empty($request['assigned_to_id'])) {
        json_error('Select an Assigned Technician first, then press OK to activate the Job Card.', 409);
    }

    try {
        $caseId = belm_sync_breakdown_case_from_service_request((string)$id, (string)($user['name'] ?? 'BELM'), true);
        if (!$caseId) json_error('Job Card activation could not create the maintenance case.', 500);

        $jobStmt = db()->prepare(
            "SELECT j.id,j.job_card_no,j.status,j.technician_id,j.technician_name,j.fault_description
             FROM digital_job_cards j
             JOIN breakdown_cases bc ON bc.id=j.case_id
             WHERE bc.source_type='SERVICE_REQUEST' AND bc.source_id=?
             ORDER BY j.created_at ASC LIMIT 1"
        );
        $jobStmt->execute([$id]);
        $job = $jobStmt->fetch();
        if (!$job) json_error('Job Card activation did not produce a Job Card. Try Sync / Refresh.', 500);

        // The request description is the Job Card instruction. The sync helper keeps
        // it current until work begins; explicitly repair legacy blank instructions too.
        if (trim((string)($job['fault_description'] ?? '')) === '') {
            db()->prepare(
                "UPDATE digital_job_cards SET fault_description=?,updated_at=NOW()
                 WHERE id=? AND status IN ('OPEN','RECEIVED','ASSIGNED')"
            )->execute([(string)($request['description'] ?? ''),(string)$job['id']]);
            $job['fault_description'] = (string)($request['description'] ?? '');
        }

        // Activation is the inbox handoff. Keep the source record for audit/customer
        // history, but hide it from the active BELM Service Request inbox so there is
        // only one operational work item: the Digital Job Card.
        db()->prepare(
            'UPDATE service_requests
             SET hidden_at=NOW(),hidden_by_id=?,updated_at=NOW()
             WHERE id=?'
        )->execute([$user['id'],$id]);
        log_service_request_history(
            (string)$id,
            'JOB_CARD_ACTIVATED',
            (string)$request['status'],
            (string)$job['status'],
            $user,
            'Activated '.$job['job_card_no'].' and handed work to Engineering Job Cards.'
        );

        json_out([
            'ok' => true,
            'hidden' => true,
            'jobCard' => [
                'id' => $job['id'],
                'jobCardNo' => $job['job_card_no'],
                'status' => $job['status'],
                'technicianId' => $job['technician_id'],
                'technicianName' => $job['technician_name'],
                'instructions' => $job['fault_description'],
            ],
        ]);
    } catch (Throwable $error) {
        if ($error instanceof RuntimeException) throw $error;
        error_log('Service Request Job Card activation failed: '.$error->getMessage());
        json_error('Could not activate the Job Card. Use Sync / Refresh and try again.', 500);
    }
}

// Hides a request from the main daily list without deleting it — it
// remains fully intact for the daily report and its History timeline.
// Only allowed once a request has reached a final state.
if ($method === 'PUT' && $action === 'hide') {
    $stmt = db()->prepare('SELECT status FROM service_requests WHERE id = ?');
    $stmt->execute([$id]);
    $existing = $stmt->fetch();
    if (!$existing) json_error('Service request not found.', 404);
    if (!in_array($existing['status'], ['COMPLETED', 'CANCELLED'], true)) {
        json_error('Only Completed or Cancelled requests can be hidden.');
    }
    db()->prepare('UPDATE service_requests SET hidden_at = NOW(), hidden_by_id = ? WHERE id = ?')
        ->execute([$user['id'], $id]);
    log_service_request_history($id, 'HIDDEN', null, null, $user, 'Hidden from the daily list');
    json_out(['ok' => true]);
}

if ($method === 'PUT' && $action === 'unhide') {
    db()->prepare('UPDATE service_requests SET hidden_at = NULL, hidden_by_id = NULL WHERE id = ?')
        ->execute([$id]);
    log_service_request_history($id, 'HIDDEN', null, null, $user, 'Restored to the daily list');
    json_out(['ok' => true]);
}

if ($method === 'POST' && $action === 'notes') {
    $b = body();
    $note = trim((string)($b['note'] ?? ''));
    if ($note === '') json_error('Write a service note before saving.');
    $stmt = db()->prepare('SELECT 1 FROM service_requests WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) json_error('Service request not found.', 404);
    db()->prepare('INSERT INTO service_notes (id, request_id, author, note, created_at) VALUES (?,?,?,?,NOW())')
        ->execute([uuid(), $id, $user['name'], $note]);
    json_out(['ok' => true], 201);
}

json_error('Unknown request', 404);
