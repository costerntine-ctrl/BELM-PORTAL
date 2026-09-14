<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/helpers.php';

$machineId = trim((string)($_GET['machineId'] ?? $_GET['id'] ?? ''));
if ($machineId === '') json_error('Machine ID is required.', 400);

$payload = current_token_payload();
if (!$payload) json_error('Not authenticated.', 401);

$pdo = db();
$pdo->exec("CREATE TABLE IF NOT EXISTS machine_card_photos (
  machine_id VARCHAR(36) PRIMARY KEY REFERENCES machines(id) ON DELETE CASCADE,
  photo_data TEXT NOT NULL,
  updated_by_name VARCHAR(255),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)");

$stmt = $pdo->prepare(
    'SELECT m.id,m.customer_id,m.brand,m.model,m.machine_type,c.is_machinery_admin
       FROM machines m
       JOIN customers c ON c.id=m.customer_id
      WHERE m.id=? AND m.deleted_at IS NULL AND c.deleted_at IS NULL AND c.is_active=1
      LIMIT 1'
);
$stmt->execute([$machineId]);
$machine = $stmt->fetch();
if (!$machine) json_error('Machine not found.', 404);

$canView = false;
$canUpload = false;
$actorName = trim((string)($payload['name'] ?? 'Portal user')) ?: 'Portal user';
$type = strtolower(trim((string)($payload['type'] ?? '')));

if ($type === 'customer') {
    $customer = require_customer_auth();
    if ((string)($customer['id'] ?? '') !== (string)$machine['customer_id']) {
        json_error('This machine does not belong to your company.', 403);
    }
    $canView = true;
    $actorType = strtolower(trim((string)($customer['actorType'] ?? 'owner')));
    $role = strtolower(trim((string)($customer['customerRole'] ?? '')));
    $isAdmin = $actorType === 'owner' || in_array($role, ['admin','customer_admin','owner'], true);
    // Customer may change the machine identity/photo only in Independent mode.
    $canUpload = $isAdmin && !empty($machine['is_machinery_admin']);
    $actorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? $actorName)) ?: $actorName;
} elseif ($type === 'staff') {
    $user = require_auth();
    $roleName = trim((string)($user['roleName'] ?? ''));
    $assignedCustomerId = trim((string)($user['assignedCustomerId'] ?? ''));
    $canView = true;

    $isManager = belm_user_has_named_role($user, ['Super Admin','Workshop Manager','Engineer']);
    $isTechnician = strcasecmp($roleName, 'Technician') === 0;
    $technicianOwnsScope = $isTechnician && $assignedCustomerId !== '' && $assignedCustomerId === (string)$machine['customer_id'];

    // Customer-managed Technician accounts pause immediately while BELM Service
    // Provider mode is active. BELM Technicians remain permitted when assigned.
    if ($technicianOwnsScope) {
        $check = $pdo->prepare('SELECT is_customer_managed FROM users WHERE id=? AND deleted_at IS NULL AND is_active=1');
        $check->execute([(string)($user['id'] ?? '')]);
        $isCustomerManaged = !empty($check->fetchColumn());
        if ($isCustomerManaged && empty($machine['is_machinery_admin'])) $technicianOwnsScope = false;
    }

    $canUpload = $isManager || $technicianOwnsScope;
    $actorName = trim((string)($user['name'] ?? $actorName)) ?: $actorName;
} else {
    json_error('This account cannot access machine photos.', 403);
}

if (!$canView) json_error('Machine photo access denied.', 403);

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT photo_data,updated_by_name,updated_at FROM machine_card_photos WHERE machine_id=? LIMIT 1');
    $stmt->execute([$machineId]);
    $row = $stmt->fetch() ?: null;
    json_out([
        'machineId' => $machineId,
        'photoData' => $row['photo_data'] ?? null,
        'updatedBy' => $row['updated_by_name'] ?? null,
        'updatedAt' => $row['updated_at'] ?? null,
        'canUpload' => $canUpload,
    ]);
}

if (!$canUpload) {
    json_error('You do not have permission to change this machine photo.', 403);
}

if ($method === 'DELETE') {
    $pdo->prepare('DELETE FROM machine_card_photos WHERE machine_id=?')->execute([$machineId]);
    json_out(['ok'=>true,'machineId'=>$machineId,'photoData'=>null,'canUpload'=>true]);
}

if (!in_array($method, ['POST','PUT'], true)) json_error('Method not allowed.', 405);

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) json_error('Invalid request body.', 400);
$photoData = trim((string)($body['photoData'] ?? ''));
if ($photoData === '') json_error('Select a machine photo first.', 400);
if (!preg_match('#^data:image/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$#', $photoData)) {
    json_error('Use a JPG, PNG or WEBP machine photo.', 400);
}
// Frontend compresses aggressively; this protects PostgreSQL and slow mobile links
// from accidental multi-megabyte originals.
if (strlen($photoData) > 900000) json_error('Machine photo is too large. Choose a smaller image.', 413);

$stmt = $pdo->prepare(
    'INSERT INTO machine_card_photos(machine_id,photo_data,updated_by_name,updated_at)
     VALUES(?,?,?,NOW())
     ON CONFLICT(machine_id) DO UPDATE SET
       photo_data=EXCLUDED.photo_data,
       updated_by_name=EXCLUDED.updated_by_name,
       updated_at=NOW()'
);
$stmt->execute([$machineId, $photoData, $actorName]);

json_out([
    'ok' => true,
    'machineId' => $machineId,
    'photoData' => $photoData,
    'updatedBy' => $actorName,
    'canUpload' => true,
]);
