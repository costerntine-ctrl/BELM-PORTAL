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
