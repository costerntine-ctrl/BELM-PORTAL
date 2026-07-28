<?php
require_once __DIR__ . '/../config/helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// PIN verify doesn't strictly need full page access — any logged-in staff
// member can be prompted for the PIN before a delete goes through.
if ($action === 'verify-pin' && $method === 'POST') {
    require_auth();
    $b = body();
    $stmt = db()->prepare("SELECT \"value\" FROM system_settings WHERE \"key\" = 'adminDeletePin'");
    $stmt->execute();
    $currentPin = $stmt->fetchColumn();
    $currentPin = $currentPin ? json_decode($currentPin, true) : '1234';
    json_out(['ok' => $b['pin'] === $currentPin]);
}

if ($action === 'change-pin' && $method === 'PUT') {
    $pinUser = require_auth();
    require_super_admin($pinUser);
    $b = body();
    $stmt = db()->prepare("SELECT \"value\" FROM system_settings WHERE \"key\" = 'adminDeletePin'");
    $stmt->execute();
    $stored = $stmt->fetchColumn();
    $stored = $stored ? json_decode($stored, true) : '1234';
    if ($b['currentPin'] !== $stored) json_error('Current PIN is incorrect.');
    if (!preg_match('/^\d{4}$/', $b['newPin'] ?? '')) json_error('New PIN must be exactly 4 digits.');
    db()->prepare("INSERT INTO system_settings (id, \"key\", \"value\", updated_at)
                   VALUES (?,'adminDeletePin',?,NOW())
                   ON CONFLICT (\"key\") DO UPDATE
                   SET \"value\" = EXCLUDED.\"value\", updated_at = NOW()")
        ->execute([uuid(), json_encode($b['newPin'])]);
    json_out(['ok' => true]);
}

$user = require_auth();
require_page_access($user, 'settings');

if ($method === 'GET') {
    $rows = db()->query('SELECT * FROM system_settings')->fetchAll();
    $out = [];
    foreach ($rows as $r) $out[$r['key']] = json_decode($r['value'], true);
    json_out($out);
}

if ($method === 'PUT') {
    $key = $_GET['key'];
    $b = body();
    db()->prepare('INSERT INTO system_settings (id, "key", "value", updated_at)
                   VALUES (?,?,?,NOW())
                   ON CONFLICT ("key") DO UPDATE
                   SET "value" = EXCLUDED."value", updated_at = NOW()')
        ->execute([uuid(), $key, json_encode($b['value'])]);
    json_out(['ok' => true]);
}

json_error('Unknown request', 404);
