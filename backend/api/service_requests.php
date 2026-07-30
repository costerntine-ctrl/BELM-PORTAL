<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
require_page_access($user, 'service-requests');
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = $_GET['id'] ?? null;
$allowedStatuses = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];

function fetch_request_parts(string $requestId): array {
    $stmt = db()->prepare(
        'SELECT id, spare_name, part_number, quantity
         FROM service_request_parts
         WHERE request_id = ?
         ORDER BY created_at ASC'
    );
    $stmt->execute([$requestId]);
    $parts = $stmt->fetchAll();
    foreach ($parts as &$part) {
        $part['spareName'] = $part['spare_name'];
        $part['partNumber'] = $part['part_number'];
        unset($part['spare_name'], $part['part_number']);
    }
    unset($part);
    return $parts;
}

if ($method === 'GET' && $action === 'assignees') {
    $stmt = db()->query(
        "SELECT u.id, u.name, u.email, u.assigned_customer_id, c.name AS assigned_customer_name
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN customers c ON c.id = u.assigned_customer_id
         WHERE r.name = 'Technician' AND u.deleted_at IS NULL AND u.is_active = 1
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

if ($method === 'GET' && !$action) {
    $status = $_GET['status'] ?? null;
    $sql = 'SELECT sr.*, c.name AS customer_name, m.model AS machine_model,
                   m.machine_type, u.name AS assigned_to_name
            FROM service_requests sr
            LEFT JOIN customers c ON c.id = sr.customer_id
            LEFT JOIN machines m ON m.id = sr.machine_id
            LEFT JOIN users u ON u.id = sr.assigned_to_id';
    if ($status) {
        $stmt = db()->prepare("$sql WHERE sr.status = ? ORDER BY sr.created_at DESC");
        $stmt->execute([$status]);
    } else {
        $stmt = db()->query("$sql WHERE sr.status <> 'PENDING_CUSTOMER' ORDER BY sr.created_at DESC");
    }
    $requests = $stmt->fetchAll();
    foreach ($requests as &$r) {
        $r['customer'] = $r['customer_id']
            ? ['id' => $r['customer_id'], 'name' => $r['customer_name']]
            : null;
        $r['machine'] = $r['machine_id']
            ? [
                'id' => $r['machine_id'],
                'model' => $r['machine_model'],
                'machineType' => $r['machine_type'],
            ]
            : null;
        $r['assignedTo'] = $r['assigned_to_id']
            ? ['id' => $r['assigned_to_id'], 'name' => $r['assigned_to_name']]
            : null;
        $r['serviceType'] = $r['service_type'];
        $r['templateId'] = $r['template_id'];
        $r['createdAt'] = $r['created_at'];
        $r['updatedAt'] = $r['updated_at'];
        $r['serviceParts'] = fetch_request_parts($r['id']);
        unset(
            $r['customer_name'],
            $r['machine_model'],
            $r['machine_type'],
            $r['assigned_to_name']
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
    $stmt = db()->prepare('UPDATE service_requests SET status=?, updated_at=NOW() WHERE id=?');
    $stmt->execute([$status, $id]);
    if ($stmt->rowCount() === 0) json_error('Service request not found.', 404);
    json_out(['ok' => true]);
}

if ($method === 'PUT' && $action === 'assign') {
    $b = body();
    $assignedToId = trim((string)($b['assignedToId'] ?? ''));
    $stmt = db()->prepare('SELECT customer_id FROM service_requests WHERE id = ?');
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
        json_out(['ok' => true]);
    }

    $stmt = db()->prepare(
        "SELECT u.id, u.assigned_customer_id
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.id = ? AND r.name = 'Technician'
           AND u.deleted_at IS NULL AND u.is_active = 1"
    );
    $stmt->execute([$assignedToId]);
    $technician = $stmt->fetch();
    if (!$technician) json_error('Select an active Technician.', 422);
    if ($request['customer_id'] && $technician['assigned_customer_id'] !== $request['customer_id']) {
        json_error('This Technician is assigned to a different customer.', 422);
    }

    db()->prepare(
        "UPDATE service_requests
         SET assigned_to_id=?, status='ASSIGNED', updated_at=NOW()
         WHERE id=?"
    )->execute([$assignedToId, $id]);
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
