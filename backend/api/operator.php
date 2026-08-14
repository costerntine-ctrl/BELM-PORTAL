<?php
require_once __DIR__ . '/../config/helpers.php';

// POST /api/operator?action=login          { machineId, name, pin }
// GET  /api/operator?action=me              (current operator + open shift)
// POST /api/operator?action=sign-in         { }  -> opens (or resumes) today's shift
// POST /api/operator?action=log-container   { }  -> +1 to the open shift's container count
// POST /api/operator?action=sign-out        { hasProblem, problemDescription }
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($action === 'login' && $method === 'POST') {
    $b = body();
    $machineId = trim((string)($b['machineId'] ?? ''));
    $name = trim((string)($b['name'] ?? ''));
    $pin = trim((string)($b['pin'] ?? ''));
    if ($machineId === '' || $name === '' || $pin === '') {
        json_error('Enter your name and PIN, and select your machine.');
    }

    assert_not_rate_limited('operator-login', "$machineId:$name", 8, 15);

    $stmt = db()->prepare(
        'SELECT o.id, o.name, o.contact, o.pin_hash, o.customer_id, m.id AS machine_id,
                m.brand, m.model, c.name AS customer_name, c.is_active AS customer_is_active
         FROM machine_operators o
         JOIN machines m ON m.id = o.machine_id
         JOIN customers c ON c.id = o.customer_id
         WHERE o.machine_id = ? AND LOWER(o.name) = LOWER(?) AND m.deleted_at IS NULL AND c.deleted_at IS NULL'
    );
    $stmt->execute([$machineId, $name]);
    $operator = $stmt->fetch();
    if (!$operator || !$operator['pin_hash'] || !password_verify($pin, $operator['pin_hash'])) {
        record_failed_attempt('operator-login', "$machineId:$name");
        json_error('Name or PIN is incorrect. Ask your Machine Admin to check your roster PIN.', 401);
    }
    // The customer's portal service being stopped (e.g. non-payment)
    // must also block their Operators from signing in — otherwise
    // "Stop portal service" wouldn't actually stop anyone from using it.
    if (!$operator['customer_is_active']) {
        record_failed_attempt('operator-login', "$machineId:$name");
        json_error('This machine is not currently active on the portal. Contact your Machine Admin.', 403);
    }
    clear_rate_limit('operator-login', "$machineId:$name");

    $token = jwt_encode([
        'type' => 'operator',
        'id' => $operator['id'],
        'name' => $operator['name'],
        'machineId' => $operator['machine_id'],
        'customerId' => $operator['customer_id'],
    ], 12 * 3600);

    json_out([
        'token' => $token,
        'operator' => [
            'id' => $operator['id'],
            'name' => $operator['name'],
            'machineName' => trim(($operator['brand'] ?? '') . ' ' . ($operator['model'] ?? '')),
            'customerName' => $operator['customer_name'],
        ],
    ]);
}

// Everything below requires a logged-in operator.
$payload = current_token_payload();
if (!$payload || ($payload['type'] ?? '') !== 'operator') json_error('Not authenticated', 401);
$operatorId = $payload['id'];
$machineId = $payload['machineId'];

function operator_open_shift(string $operatorId): ?array {
    $stmt = db()->prepare(
        "SELECT * FROM machine_operator_shifts
         WHERE operator_id = ? AND status = 'OPEN'
         ORDER BY signed_in_at DESC LIMIT 1"
    );
    $stmt->execute([$operatorId]);
    $shift = $stmt->fetch();
    return $shift ?: null;
}

if ($action === 'me' && $method === 'GET') {
    $shift = operator_open_shift($operatorId);
    json_out([
        'operator' => ['id' => $operatorId, 'name' => $payload['name'] ?? ''],
        'openShift' => $shift ? [
            'id' => $shift['id'],
            'signedInAt' => $shift['signed_in_at'],
            'containerCount' => (int)$shift['container_count'],
        ] : null,
    ]);
}

if ($action === 'sign-in' && $method === 'POST') {
    $existing = operator_open_shift($operatorId);
    if ($existing) {
        json_out(['id' => $existing['id'], 'containerCount' => (int)$existing['container_count'], 'resumed' => true]);
    }
    $shiftId = uuid();
    db()->prepare(
        "INSERT INTO machine_operator_shifts
         (id, operator_id, machine_id, customer_id, signed_in_at, container_count, status)
         VALUES (?,?,?,?,NOW(),0,'OPEN')"
    )->execute([$shiftId, $operatorId, $machineId, $payload['customerId']]);
    json_out(['id' => $shiftId, 'containerCount' => 0, 'resumed' => false], 201);
}

if ($action === 'log-container' && $method === 'POST') {
    $shift = operator_open_shift($operatorId);
    if (!$shift) json_error('Sign in first before logging a container.', 422);
    db()->prepare("UPDATE machine_operator_shifts SET container_count = container_count + 1 WHERE id = ?")
        ->execute([$shift['id']]);
    $stmt = db()->prepare('SELECT container_count FROM machine_operator_shifts WHERE id = ?');
    $stmt->execute([$shift['id']]);
    json_out(['containerCount' => (int)$stmt->fetchColumn()]);
}

if ($action === 'sign-out' && $method === 'POST') {
    $shift = operator_open_shift($operatorId);
    if (!$shift) json_error('No open shift to sign out of.', 422);
    $b = body();
    $hasProblem = !empty($b['hasProblem']);
    $problemDescription = trim((string)($b['problemDescription'] ?? ''));
    if ($hasProblem && $problemDescription === '') {
        json_error('Describe the challenge before signing out.');
    }
    db()->prepare(
        "UPDATE machine_operator_shifts
         SET signed_out_at = NOW(), has_problem = ?, problem_description = ?, status = 'CLOSED'
         WHERE id = ?"
    )->execute([$hasProblem ? 1 : 0, $hasProblem ? $problemDescription : null, $shift['id']]);

    // A reported challenge also becomes a normal Operator Report, so it
    // shows up everywhere BELM/Engineer/Technician/Customer already look
    // for operator problem reports — one single source of truth.
    if ($hasProblem) {
        db()->prepare(
            "INSERT INTO operator_reports
             (id, machine_id, customer_id, operator_id, operator_name, operator_contact, message, status, created_at)
             VALUES (?,?,?,?,?,?,?,'OPEN',NOW())"
        )->execute([
            uuid(), $machineId, $payload['customerId'], $operatorId, $payload['name'] ?? 'Operator',
            null, "End-of-shift report: $problemDescription (Containers handled: {$shift['container_count']})",
        ]);
    }
    json_out(['ok' => true, 'containerCount' => (int)$shift['container_count']]);
}

json_error('Unknown request', 404);
