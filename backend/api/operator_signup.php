<?php
require_once __DIR__ . '/../config/helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

function operator_signup_machine(string $machineId): array {
    $stmt = db()->prepare(
        'SELECT m.id, m.customer_id, m.machine_type, m.brand, m.model, m.fleet_number, m.serial_number,
                c.name AS customer_name, c.is_active AS customer_is_active
         FROM machines m
         JOIN customers c ON c.id = m.customer_id
         WHERE m.id = ? AND m.deleted_at IS NULL AND c.deleted_at IS NULL
         LIMIT 1'
    );
    $stmt->execute([$machineId]);
    $row = $stmt->fetch();
    if (!$row || empty($row['customer_is_active'])) {
        json_error('This operator registration link is no longer active.', 404);
    }
    require_customer_department((string)$row['customer_id'], 'operator', 'Machine Operator Department');
    return $row;
}

if ($action === 'context' && $method === 'GET') {
    $machineId = trim((string)($_GET['machine'] ?? ''));
    if ($machineId === '') json_error('Machine registration link is incomplete.', 422);
    $machine = operator_signup_machine($machineId);
    json_out([
        'machine' => [
            'id' => (string)$machine['id'],
            'machineType' => (string)($machine['machine_type'] ?? ''),
            'brand' => (string)($machine['brand'] ?? ''),
            'model' => (string)($machine['model'] ?? ''),
            'fleetNumber' => (string)($machine['fleet_number'] ?? ''),
            'serialNumber' => (string)($machine['serial_number'] ?? ''),
        ],
        'customerName' => (string)($machine['customer_name'] ?? 'Customer'),
    ]);
}

if ($action === 'signup' && $method === 'POST') {
    $b = body();
    $machineId = trim((string)($b['machineId'] ?? ''));
    $name = trim((string)($b['name'] ?? ''));
    $contact = trim((string)($b['contact'] ?? ''));
    $pin = trim((string)($b['pin'] ?? ''));

    if ($machineId === '') json_error('Machine registration link is incomplete.', 422);
    if ($name === '' || strlen($name) > 255) json_error('Enter your full name.', 422);
    if ($contact === '' || strlen($contact) > 100) json_error('Enter your phone/contact number.', 422);
    if (!preg_match('/^\d{4,6}$/', $pin)) json_error('Create a 4–6 digit PIN.', 422);

    $machine = operator_signup_machine($machineId);
    $ip = trim((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    assert_not_rate_limited('operator-signup', $machineId . ':' . $ip, 8, 60);

    $compactContact = preg_replace('/\s+/', '', $contact);
    $dup = db()->prepare(
        "SELECT id FROM machine_operators
         WHERE machine_id = ? AND REPLACE(COALESCE(contact,''), ' ', '') = ?
         LIMIT 1"
    );
    $dup->execute([$machineId, $compactContact]);
    if ($dup->fetchColumn()) {
        record_failed_attempt('operator-signup', $machineId . ':' . $ip);
        json_error('This contact is already registered for this machine. Use Sign in instead.', 409);
    }

    $operatorId = uuid();
    db()->prepare(
        'INSERT INTO machine_operators (id, machine_id, customer_id, name, contact, pin_hash, created_at)
         VALUES (?,?,?,?,?,?,NOW())'
    )->execute([
        $operatorId,
        $machineId,
        $machine['customer_id'],
        $name,
        $contact,
        password_hash($pin, PASSWORD_BCRYPT),
    ]);

    clear_rate_limit('operator-signup', $machineId . ':' . $ip);
    try {
        db()->prepare(
            'INSERT INTO customer_activity_logs (id, customer_id, actor_name, action, created_at)
             VALUES (?,?,?,?,NOW())'
        )->execute([
            uuid(),
            $machine['customer_id'],
            $name,
            'Machine Operator signed up from the machine registration link.',
        ]);
    } catch (Throwable $ignored) {}

    $token = jwt_encode([
        'type' => 'operator',
        'id' => $operatorId,
        'name' => $name,
        'machineId' => $machineId,
        'customerId' => $machine['customer_id'],
    ], 30 * 24 * 3600);

    json_out([
        'ok' => true,
        'token' => $token,
        'operator' => [
            'id' => $operatorId,
            'name' => $name,
            'machineName' => trim((string)($machine['brand'] ?? '') . ' ' . (string)($machine['model'] ?? '')),
            'customerName' => (string)($machine['customer_name'] ?? ''),
        ],
        'message' => 'Operator registration complete.',
    ], 201);
}

json_error('Unsupported operator registration request.', 405);
