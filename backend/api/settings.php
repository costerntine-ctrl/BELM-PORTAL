<?php
require_once __DIR__ . '/../config/helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// PIN verify doesn't strictly need full page access — any logged-in staff
// member can be prompted for the PIN before a delete goes through.
if ($action === 'verify-pin' && $method === 'POST') {
    $pinUser = require_auth();
    $b = body();
    $provided = trim((string)($b['pin'] ?? ''));
    $currentPin = belm_read_stored_pin('adminDeletePin', '');
    if ($currentPin === '') json_error('Delete PIN is not configured. Super Admin must set it in System Settings.', 409);
    assert_not_rate_limited('delete-pin-verify', (string)$pinUser['id'], 8, 15);
    $ok = hash_equals($currentPin, $provided);
    if (!$ok) record_failed_attempt('delete-pin-verify', (string)$pinUser['id']);
    else clear_rate_limit('delete-pin-verify', (string)$pinUser['id']);
    json_out(['ok' => $ok]);
}

if ($action === 'change-pin' && $method === 'PUT') {
    $pinUser = require_auth();
    require_super_admin($pinUser);
    $b = body();
    $pinKey = in_array($b['pinKey'] ?? '', ['adminEditPin', 'adminDeletePin'], true) ? $b['pinKey'] : 'adminDeletePin';
    if (!preg_match('/^\d{4}$/', $b['newPin'] ?? '')) json_error('New PIN must be exactly 4 digits.');
    db()->prepare('INSERT INTO system_settings (id, "key", "value", updated_at)
                   VALUES (?,?,?,NOW())
                   ON CONFLICT ("key") DO UPDATE
                   SET "value" = EXCLUDED."value", updated_at = NOW()')
        ->execute([uuid(), $pinKey, json_encode($b['newPin'])]);
    // Never log the PIN value itself — only which security PIN was changed.
    log_activity($pinUser, 'security-pin-changed', 'system_settings', $pinKey, ['pinKey' => $pinKey]);
    json_out(['ok' => true, 'message' => 'PIN updated successfully.']);
}

$user = require_auth();
require_page_access($user, 'settings');

// Management Mail routing directory. This is intentionally under System
// Settings permission rather than Customers/Users permissions because the
// System Coordinator/Super Admin needs one safe directory for company mail
// routing without exposing passwords or unrelated customer data.
if ($method === 'GET' && $action === 'management-mail-directory') {
    $companies = db()->query(
        "SELECT id, name, email
         FROM customers
         WHERE deleted_at IS NULL AND is_active = 1
         ORDER BY name ASC"
    )->fetchAll();

    $byId = [];
    foreach ($companies as $company) {
        $companyId = (string)$company['id'];
        $byId[$companyId] = [
            'id' => $companyId,
            'name' => (string)$company['name'],
            'email' => (string)($company['email'] ?? ''),
            'recipients' => [],
        ];
        if (filter_var($company['email'] ?? '', FILTER_VALIDATE_EMAIL)) {
            $byId[$companyId]['recipients'][] = [
                'name' => (string)$company['name'],
                'email' => strtolower((string)$company['email']),
                'role' => 'Customer Admin',
                'source' => 'customer-account',
            ];
        }
    }

    $customerUsers = db()->query(
        "SELECT customer_id, name, email, role
         FROM customer_users
         WHERE is_active = 1
         ORDER BY created_at ASC"
    )->fetchAll();
    foreach ($customerUsers as $mailUser) {
        $companyId = (string)($mailUser['customer_id'] ?? '');
        if (!isset($byId[$companyId]) || !filter_var($mailUser['email'] ?? '', FILTER_VALIDATE_EMAIL)) continue;
        $byId[$companyId]['recipients'][] = [
            'name' => (string)($mailUser['name'] ?? ''),
            'email' => strtolower((string)$mailUser['email']),
            'role' => (string)($mailUser['role'] ?? 'Company User'),
            'source' => 'customer-user',
        ];
    }

    $staffUsers = db()->query(
        "SELECT u.assigned_customer_id AS customer_id, u.name, u.email, r.name AS role
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.assigned_customer_id IS NOT NULL
           AND u.deleted_at IS NULL AND u.is_active = 1
         UNION ALL
         SELECT u.assigned_customer_id AS customer_id, u.name, u.email, r.name AS role
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         WHERE u.assigned_customer_id IS NOT NULL
           AND u.deleted_at IS NULL AND u.is_active = 1"
    )->fetchAll();
    foreach ($staffUsers as $mailUser) {
        $companyId = (string)($mailUser['customer_id'] ?? '');
        if (!isset($byId[$companyId]) || !filter_var($mailUser['email'] ?? '', FILTER_VALIDATE_EMAIL)) continue;
        $byId[$companyId]['recipients'][] = [
            'name' => (string)($mailUser['name'] ?? ''),
            'email' => strtolower((string)$mailUser['email']),
            'role' => (string)($mailUser['role'] ?? 'Company User'),
            'source' => 'assigned-user',
        ];
    }

    foreach ($byId as &$company) {
        $seen = [];
        $unique = [];
        foreach ($company['recipients'] as $recipient) {
            $key = strtolower(trim((string)$recipient['email'])) . '|' . strtolower(trim((string)$recipient['role']));
            if ($key === '|' || isset($seen[$key])) continue;
            $seen[$key] = true;
            $unique[] = $recipient;
        }
        $company['recipients'] = $unique;
    }
    unset($company);

    json_out([
        'companies' => array_values($byId),
        'defaultRoles' => [
            'Customer Admin',
            'Boss / Administration',
            'Workshop Manager',
            'Technician',
            'Operator',
            'Store Keeper',
            'Procurement',
            'Finance / Accountant',
        ],
    ]);
}

if ($method === 'GET') {
    $rows = db()->query("SELECT * FROM system_settings WHERE \"key\" NOT IN ('adminEditPin','adminDeletePin')")->fetchAll();
    $out = [];
    foreach ($rows as $r) $out[$r['key']] = json_decode($r['value'], true);
    json_out($out);
}

if ($method === 'PUT') {
    $key = trim((string)($_GET['key'] ?? ''));
    if ($key === '') json_error('Setting key is required.', 400);
    if (in_array($key, ['adminEditPin','adminDeletePin'], true)) {
        json_error('Security PINs can only be changed through the protected change-PIN action.', 403);
    }
    $b = body();
    db()->prepare('INSERT INTO system_settings (id, "key", "value", updated_at)
                   VALUES (?,?,?,NOW())
                   ON CONFLICT ("key") DO UPDATE
                   SET "value" = EXCLUDED."value", updated_at = NOW()')
        ->execute([uuid(), $key, json_encode($b['value'] ?? null)]);
    log_activity($user, 'system-setting-changed', 'system_settings', $key, ['key' => $key]);
    json_out(['ok' => true]);
}

json_error('Unknown request', 404);
