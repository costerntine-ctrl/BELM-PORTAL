<?php
require_once __DIR__ . '/../config/helpers.php';

$payload = current_token_payload();
if (!$payload) json_error('Not authenticated', 401);

$action = trim((string)($_GET['action'] ?? ''));
$actorId = '';
$customerId = '';
$actorName = 'Technician';
$isCustomerTechnician = false;
$user = null;
$customer = null;

if (($payload['type'] ?? '') === 'customer') {
    $customer = require_customer_auth();
    $role = strtolower(trim((string)($customer['customerRole'] ?? '')));
    if ($role !== 'technician') json_error('Technician login required.', 403);
    $actorId = trim((string)($customer['actorId'] ?? ''));
    $customerId = trim((string)($customer['id'] ?? ''));
    $actorName = trim((string)($customer['actorName'] ?? 'Technician')) ?: 'Technician';
    $isCustomerTechnician = true;
} else {
    $user = require_auth();
    $isTechnician = ($user['roleName'] ?? '') === 'Technician' || belm_user_has_named_role($user, ['Technician']);
    if (!$isTechnician) json_error('Technician login required.', 403);
    $actorId = trim((string)($user['id'] ?? ''));
    $actorName = trim((string)($user['name'] ?? 'Technician')) ?: 'Technician';
}

if ($actorId === '') json_error('Technician account identity is missing. Please log in again.', 401);

// V751: Technician My Profile is a read-only mirror of the registration record.
// This deliberately reads the database every time instead of trusting cached
// browser profile values, so Admin/Customer registration changes stay in sync.
if ($action === 'profile' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($isCustomerTechnician) {
        $stmt = db()->prepare(
            "SELECT cu.id,cu.name,cu.email,cu.phone,cu.role,cu.is_active,cu.created_at,
                    c.id AS customer_id,c.name AS customer_name,c.email AS customer_email,
                    c.phone AS customer_phone,c.address AS customer_address
             FROM customer_users cu
             JOIN customers c ON c.id=cu.customer_id
             WHERE cu.id=? AND cu.customer_id=? AND cu.is_active=1
               AND c.deleted_at IS NULL AND c.is_active=1
             LIMIT 1"
        );
        $stmt->execute([$actorId, $customerId]);
        $row = $stmt->fetch();
        if (!$row) json_error('Technician registration record was not found.', 404);
        json_out([
            'profile' => [
                'id' => $row['id'],
                'name' => $row['name'],
                'email' => $row['email'],
                'phone' => $row['phone'],
                'role' => $row['role'] ?: 'Technician',
                'accountType' => 'Customer Technician',
                'status' => !empty($row['is_active']) ? 'Active' : 'Inactive',
                'registeredAt' => $row['created_at'],
                'assignedCustomer' => [
                    'id' => $row['customer_id'],
                    'name' => $row['customer_name'],
                    'email' => $row['customer_email'],
                    'phone' => $row['customer_phone'],
                    'address' => $row['customer_address'],
                ],
                'managedBy' => $row['customer_name'],
            ],
            'source' => 'registration',
            'syncedAt' => date('c'),
        ]);
    }

    $stmt = db()->prepare(
        "SELECT u.id,u.name,u.email,u.phone,u.is_active,u.created_at,u.is_customer_managed,
                r.name AS role_name,
                c.id AS customer_id,c.name AS customer_name,c.email AS customer_email,
                c.phone AS customer_phone,c.address AS customer_address
         FROM users u
         JOIN roles r ON r.id=u.role_id
         LEFT JOIN customers c ON c.id=u.assigned_customer_id AND c.deleted_at IS NULL
         WHERE u.id=? AND u.deleted_at IS NULL
         LIMIT 1"
    );
    $stmt->execute([$actorId]);
    $row = $stmt->fetch();
    if (!$row) json_error('Technician registration record was not found.', 404);
    json_out([
        'profile' => [
            'id' => $row['id'],
            'name' => $row['name'],
            'email' => $row['email'],
            'phone' => $row['phone'],
            'role' => $row['role_name'],
            'accountType' => !empty($row['is_customer_managed']) ? 'Customer-managed Technician' : 'BELM Technician',
            'status' => !empty($row['is_active']) ? 'Active' : 'Inactive',
            'registeredAt' => $row['created_at'],
            'assignedCustomer' => $row['customer_id'] ? [
                'id' => $row['customer_id'],
                'name' => $row['customer_name'],
                'email' => $row['customer_email'],
                'phone' => $row['customer_phone'],
                'address' => $row['customer_address'],
            ] : null,
            'managedBy' => !empty($row['is_customer_managed']) && $row['customer_name']
                ? $row['customer_name']
                : 'BELM GENERAL TECH SERVICE',
        ],
        'source' => 'registration',
        'syncedAt' => date('c'),
    ]);
}

// This feed is deliberately machine/Job-Card scoped. A Technician can see only
// communications that belong to a machine or Digital Job Card assigned to them.
// Temporary BELM overrides therefore work without exposing unrelated customer traffic.
$params = [$actorId];
$jobScope = "j.technician_id = ? AND UPPER(COALESCE(j.status,'')) <> 'CANCELLED'";
if ($isCustomerTechnician) {
    $jobScope .= ' AND j.customer_id = ?';
    $params[] = $customerId;
}

$sql = "SELECT cc.id,cc.customer_id,cc.machine_id,cc.related_type,cc.related_id,
               cc.direction,cc.channel,cc.subject,cc.message,cc.status,
               cc.created_by_name,cc.created_at,
               c.name AS customer_name,
               m.brand,m.model,m.machine_type,m.fleet_number
        FROM customer_communications cc
        JOIN customers c ON c.id=cc.customer_id AND c.deleted_at IS NULL
        LEFT JOIN machines m ON m.id=cc.machine_id
        WHERE EXISTS (
            SELECT 1
            FROM digital_job_cards j
            WHERE $jobScope
              AND j.customer_id=cc.customer_id
              AND (
                    (cc.machine_id IS NOT NULL AND cc.machine_id=j.machine_id)
                 OR (UPPER(COALESCE(cc.related_type,''))='JOB_CARD' AND cc.related_id=j.id)
              )
        )
        ORDER BY cc.created_at DESC,cc.id DESC
        LIMIT 12";

$stmt = db()->prepare($sql);
$stmt->execute($params);
$communications = $stmt->fetchAll();

foreach ($communications as &$row) {
    $machineLabel = trim((string)($row['brand'] ?? '') . ' ' . (string)($row['model'] ?? ''));
    if ($machineLabel === '') $machineLabel = trim((string)($row['machine_type'] ?? ''));
    if (!empty($row['fleet_number'])) {
        $machineLabel .= ($machineLabel !== '' ? ' / ' : '') . (string)$row['fleet_number'];
    }
    $row['machineLabel'] = $machineLabel;
}
unset($row);

json_out([
    'technician' => ['id' => $actorId, 'name' => $actorName],
    'communications' => $communications,
    'syncedAt' => date('c'),
]);
