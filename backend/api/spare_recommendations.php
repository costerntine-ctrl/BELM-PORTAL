<?php
require_once __DIR__ . '/../config/helpers.php';

// POST   /api/spare-recommendations              -> Technician creates a recommendation
// GET    /api/spare-recommendations               -> Technician's own recommendations, OR
//                                                     customer's pending recommendations (reference number only)
// PUT    /api/spare-recommendations/:id            -> Customer confirms -> becomes a normal OPEN service request

$method = $_SERVER['REQUEST_METHOD'];
$id = trim((string)($_GET['id'] ?? ''));

$systemLabels = [
    'ENGINE' => 'Engine',
    'TRANSMISSION' => 'Transmission / Gearbox',
    'BRAKE_SYSTEM' => 'Brake System',
    'HYDRAULIC_SYSTEM' => 'Hydraulic System',
    'ELECTRICAL_SYSTEM' => 'Electrical System',
    'OTHER' => 'Other',
];

$payload = current_token_payload();
if (!$payload) json_error('Not authenticated', 401);
$isStaff = ($payload['type'] ?? '') === 'staff';
$isCustomer = ($payload['type'] ?? '') === 'customer';
if (!$isStaff && !$isCustomer) json_error('Not authenticated', 401);

// ---- Technician: create a recommendation for an assigned customer's machine
if ($method === 'POST') {
    if (!$isStaff || ($payload['roleName'] ?? '') !== 'Technician') {
        json_error('Only a BELM Technician can record a spare-part recommendation.', 403);
    }
    $assignedCustomerId = trim((string)($payload['assignedCustomerId'] ?? ''));
    if ($assignedCustomerId === '') json_error('This Technician has not been assigned to a customer.', 403);

    $b = body();
    $machineId = trim((string)($b['machineId'] ?? ''));
    $spareName = trim((string)($b['spareName'] ?? ''));
    $referenceNumber = strtoupper(trim((string)($b['referenceNumber'] ?? '')));
    $manufacturerPartNumber = strtoupper(trim((string)($b['manufacturerPartNumber'] ?? '')));
    $systemCategory = strtoupper(trim((string)($b['systemCategory'] ?? '')));

    if ($machineId === '') json_error('Select the machine that needs this spare part.');
    if ($spareName === '') json_error('Spare name is required.');
    if (strlen($spareName) > 255) json_error('Spare name is too long.');
    if ($referenceNumber === '') json_error('Reference number is required.');
    if (strlen($referenceNumber) > 100) json_error('Reference number is too long.');
    if (strlen($manufacturerPartNumber) > 100) json_error('Manufacturer part number is too long.');
    if (!isset($systemLabels[$systemCategory])) json_error('Select a valid system.');

    $stmt = db()->prepare(
        'SELECT id, machine_type, model FROM machines
         WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
    );
    $stmt->execute([$machineId, $assignedCustomerId]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('The selected machine is not assigned to this Technician.', 403);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $requestId = uuid();
        $pdo->prepare(
            "INSERT INTO service_requests
             (id, customer_id, machine_id, service_type, description, status, priority,
              origin, customer_confirmed, created_at, updated_at)
             VALUES (?,?,?,?,?,'PENDING_CUSTOMER','NORMAL','TECHNICIAN_RECOMMENDATION',0,NOW(),NOW())"
        )->execute([
            $requestId,
            $assignedCustomerId,
            $machineId,
            $systemLabels[$systemCategory],
            'Technician-recommended spare part for ' . $machine['model'] . ': ' . $spareName,
        ]);

        $partId = uuid();
        $pdo->prepare(
            'INSERT INTO service_request_parts
             (id, request_id, spare_name, part_number, manufacturer_part_number, quantity, created_at)
             VALUES (?,?,?,?,?,1,NOW())'
        )->execute([$partId, $requestId, $spareName, $referenceNumber, $manufacturerPartNumber ?: null]);
        $pdo->prepare(
            'INSERT INTO service_request_history
             (id, request_id, event_type, from_value, to_value, actor_id, actor_name, note, created_at)
             VALUES (?,?,?,?,?,?,?,?,NOW())'
        )->execute([
            uuid(), $requestId, 'OPENED', null, 'PENDING_CUSTOMER',
            $payload['id'] ?? null, $payload['name'] ?? 'Technician',
            'Recommended for customer confirmation',
        ]);

        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    log_activity($payload['id'], 'created', 'spareRecommendation', $requestId, ['referenceNumber' => $referenceNumber]);
    json_out([
        'id' => $requestId,
        'message' => 'Spare-part recommendation sent. The customer will see the reference number and can order it.',
    ], 201);
}

// ---- GET: Technician sees their own; customer sees their own pending ones (reference number only)
if ($method === 'GET') {
    if ($isStaff) {
        if (($payload['roleName'] ?? '') !== 'Technician') json_error('Not authenticated', 401);
        $assignedCustomerId = trim((string)($payload['assignedCustomerId'] ?? ''));
        if ($assignedCustomerId === '') json_error('This Technician has not been assigned to a customer.', 403);
        $stmt = db()->prepare(
            "SELECT sr.id, sr.machine_id, sr.service_type, sr.status, sr.created_at,
                    srp.spare_name, srp.part_number, srp.manufacturer_part_number,
                    m.model AS machine_model, m.serial_number
             FROM service_requests sr
             JOIN service_request_parts srp ON srp.request_id = sr.id
             JOIN machines m ON m.id = sr.machine_id
             WHERE sr.customer_id = ? AND sr.origin = 'TECHNICIAN_RECOMMENDATION'
             ORDER BY sr.created_at DESC
             LIMIT 30"
        );
        $stmt->execute([$assignedCustomerId]);
        json_out($stmt->fetchAll());
    }

    // Customer view: reference number and part name — not the manufacturer
    // part number or technician's internal notes.
    $customer = require_customer_auth();
    $stmt = db()->prepare(
        "SELECT sr.id, sr.machine_id, sr.status, sr.created_at,
                srp.spare_name, srp.part_number AS reference_number,
                m.model AS machine_model, m.serial_number
         FROM service_requests sr
         JOIN service_request_parts srp ON srp.request_id = sr.id
         JOIN machines m ON m.id = sr.machine_id
         WHERE sr.customer_id = ? AND sr.origin = 'TECHNICIAN_RECOMMENDATION'
           AND sr.status = 'PENDING_CUSTOMER'
         ORDER BY sr.created_at DESC
         LIMIT 30"
    );
    $stmt->execute([$customer['id']]);
    json_out($stmt->fetchAll());
}

// ---- PUT: customer confirms -> becomes a normal OPEN service request
if ($method === 'PUT' && $id) {
    $customer = require_customer_auth();
    require_customer_write_access($customer);
    $stmt = db()->prepare(
        "SELECT id FROM service_requests
         WHERE id = ? AND customer_id = ? AND origin = 'TECHNICIAN_RECOMMENDATION'
           AND status = 'PENDING_CUSTOMER'"
    );
    $stmt->execute([$id, $customer['id']]);
    if (!$stmt->fetch()) json_error('Recommendation not found or already ordered.', 404);

    db()->prepare(
        "UPDATE service_requests
         SET status = 'OPEN', customer_confirmed = 1, updated_at = NOW()
         WHERE id = ?"
    )->execute([$id]);
    db()->prepare(
        'INSERT INTO service_request_history
         (id, request_id, event_type, from_value, to_value, actor_id, actor_name, created_at)
         VALUES (?,?,?,?,?,?,?,NOW())'
    )->execute([uuid(), $id, 'STATUS', 'PENDING_CUSTOMER', 'OPEN', null, trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer'))]);
    json_out(['ok' => true, 'message' => 'Service requirement sent to BELM for action.']);
}

json_error('Unknown request', 404);
