<?php
require_once __DIR__ . '/../config/helpers.php';

$payload = current_token_payload();
if (!$payload) json_error('Not authenticated', 401);

$actorId = '';
$customerId = '';
$actorName = 'Technician';
$isCustomerTechnician = false;

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
