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
         WHERE r.name = 'Technician' AND u.deleted_at IS NULL AND u.is_active = 1
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
                   cu.name AS completed_by_name, xu.name AS cancelled_by_name
            FROM service_requests sr
            LEFT JOIN customers c ON c.id = sr.customer_id
            LEFT JOIN machines m ON m.id = sr.machine_id
            LEFT JOIN users u ON u.id = sr.assigned_to_id
            LEFT JOIN customers hc ON hc.id = u.assigned_customer_id
            LEFT JOIN users cu ON cu.id = sr.completed_by_id
            LEFT JOIN users xu ON xu.id = sr.cancelled_by_id';
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
        unset(
            $r['customer_name'],
            $r['customer_phone'],
            $r['machine_model'],
            $r['machine_type'],
            $r['assigned_to_name'],
            $r['assigned_home_customer_id'],
            $r['assigned_home_customer_name'],
            $r['completed_by_name'],
            $r['cancelled_by_name']
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

    $stmt = db()->prepare('SELECT status FROM service_requests WHERE id = ?');
    $stmt->execute([$id]);
    $existing = $stmt->fetch();
    if (!$existing) json_error('Service request not found.', 404);
    $previousStatus = $existing['status'];

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
    json_out(['ok' => true]);
}

if ($method === 'PUT' && $action === 'assign') {
    $b = body();
    $assignedToId = trim((string)($b['assignedToId'] ?? ''));
    $stmt = db()->prepare('SELECT customer_id, assigned_to_id, status FROM service_requests WHERE id = ?');
    $stmt->execute([$id]);
    $request = $stmt->fetch();
    if (!$request) json_error('Service request not found.', 404);

    if ($assignedToId === '') {
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
        json_out(['ok' => true]);
    }

    $stmt = db()->prepare(
        "SELECT u.id, u.name, u.assigned_customer_id, hc.name AS home_customer_name
         FROM users u JOIN roles r ON r.id = u.role_id
         LEFT JOIN customers hc ON hc.id = u.assigned_customer_id
         WHERE u.id = ? AND r.name = 'Technician'
           AND u.deleted_at IS NULL AND u.is_active = 1
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

    db()->prepare(
        "UPDATE service_requests
         SET assigned_to_id=?, assigned_by_id=?, status='ASSIGNED', updated_at=NOW()
         WHERE id=?"
    )->execute([$assignedToId, $user['id'], $id]);
    $overrideNote = $isTemporaryOverride
        ? 'TEMPORARY OVERRIDE - Technician home customer: ' . ($technician['home_customer_name'] ?: 'Unassigned') . '. This override applies to this service request only.'
        : null;
    log_service_request_history($id, 'ASSIGNMENT', $request['assigned_to_id'], $technician['name'], $user, $overrideNote);
    if ($request['status'] !== 'ASSIGNED') {
        log_service_request_history($id, 'STATUS', $request['status'], 'ASSIGNED', $user);
    }
    notify_service_request_customer(
        (string)$id,
        'Technician Assigned — ' . $technician['name'],
        'BELM assigned Technician ' . $technician['name'] . ' to your service request.' . ($isTemporaryOverride ? ' This is a temporary job assignment.' : ''),
        $user
    );
    json_out(['ok' => true]);
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
