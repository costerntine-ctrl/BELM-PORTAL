<?php
require_once __DIR__ . '/../config/helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;

// GET /api/announcements?audience=customer  -> used by customer/tech dashboards (no page-access check, just a valid staff/customer/tech token)
// Admin management (create/deactivate) requires the 'settings' page and a full staff login.
$payload = current_token_payload();
if (!$payload) json_error('Not authenticated', 401);
$isStaff = ($payload['type'] ?? '') === 'staff';
$isCustomer = ($payload['type'] ?? '') === 'customer';
if (!$isStaff && !$isCustomer) json_error('Not authenticated', 401);

if ($method === 'GET' && ($_GET['all'] ?? '') === '1') {
    if (!$isStaff) json_error('Not authenticated', 401);
    require_page_access($payload, 'settings');
    $stmt = db()->query(
        'SELECT a.id, a.message, a.is_active, a.created_at, u.name AS created_by_name
         FROM admin_announcements a
         LEFT JOIN users u ON u.id = a.created_by
         ORDER BY a.created_at DESC
         LIMIT 100'
    );
    json_out($stmt->fetchAll());
}

if ($method === 'GET') {
    // Any logged-in staff member or customer can see the active announcements feed.
    $stmt = db()->prepare(
        'SELECT a.id, a.message, a.created_at, u.name AS created_by_name
         FROM admin_announcements a
         LEFT JOIN users u ON u.id = a.created_by
         WHERE a.is_active = 1
         ORDER BY a.created_at DESC
         LIMIT 20'
    );
    $stmt->execute();
    $messages = $stmt->fetchAll();

    $settingsStmt = db()->query(
        "SELECT \"key\", \"value\" FROM system_settings
         WHERE \"key\" IN ('whatsappAlertsEnabled','adminAlertsEnabled','technicianAlertsEnabled')"
    );
    $flags = ['whatsappAlertsEnabled' => true, 'adminAlertsEnabled' => true, 'technicianAlertsEnabled' => true];
    foreach ($settingsStmt->fetchAll() as $row) {
        $flags[$row['key']] = json_decode($row['value'], true);
    }

    json_out([
        'messages' => $messages,
        'whatsappAlertsEnabled' => $flags['whatsappAlertsEnabled'] !== false,
        'adminAlertsEnabled' => $flags['adminAlertsEnabled'] !== false,
        'technicianAlertsEnabled' => $flags['technicianAlertsEnabled'] !== false,
    ]);
}

// Everything below is admin-only management.
if (!$isStaff) json_error('Not authenticated', 401);
$user = $payload;
require_page_access($user, 'settings');

if ($method === 'POST') {
    $b = body();
    $message = trim((string)($b['message'] ?? ''));
    if ($message === '') json_error('Message is required.');
    if (strlen($message) > 1000) json_error('Message must be 1000 characters or fewer.');

    $newId = uuid();
    db()->prepare(
        'INSERT INTO admin_announcements (id, message, created_by, is_active, created_at)
         VALUES (?,?,?,1,NOW())'
    )->execute([$newId, $message, $user['id']]);
    log_activity($user['id'], 'created', 'announcement', $newId, ['message' => $message]);
    json_out(['id' => $newId], 201);
}

if ($method === 'DELETE' && $id) {
    db()->prepare('UPDATE admin_announcements SET is_active = 0 WHERE id = ?')->execute([$id]);
    log_activity($user['id'], 'deleted', 'announcement', $id);
    json_out(null, 204);
}

json_error('Unknown request', 404);
