<?php
require_once __DIR__ . '/../config/helpers.php';

$payload = current_token_payload();
if (!$payload) json_error('Not authenticated', 401);

$type = (string)($payload['type'] ?? '');
$accountType = '';
$accountId = '';

if ($type === 'staff') {
    $accountType = 'staff';
    $accountId = (string)($payload['id'] ?? '');
} elseif ($type === 'customer') {
    if (($payload['actorType'] ?? '') === 'assistant') {
        $accountType = 'customer-assistant';
        $accountId = (string)($payload['actorId'] ?? '');
    } else {
        $accountType = 'customer-owner';
        $accountId = (string)($payload['id'] ?? '');
    }
} elseif ($type === 'operator') {
    $accountType = 'operator';
    $accountId = (string)($payload['id'] ?? '');
} else {
    json_error('This account type does not support personal preferences.', 403);
}

if ($accountId === '') json_error('Account identity is missing from this session.', 401);

// Defensive creation keeps an upgraded live deployment working even before
// the normal schema migration command has been run. schema.sql contains the
// same definition and remains the source of truth for fresh installations.
db()->exec(
    "CREATE TABLE IF NOT EXISTS user_preferences (
        account_type VARCHAR(32) NOT NULL,
        account_id VARCHAR(36) NOT NULL,
        display_theme VARCHAR(10) NOT NULL DEFAULT 'light',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (account_type, account_id)
    )"
);

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = db()->prepare(
        'SELECT display_theme, updated_at FROM user_preferences WHERE account_type = ? AND account_id = ?'
    );
    $stmt->execute([$accountType, $accountId]);
    $row = $stmt->fetch();
    json_out([
        'theme' => $row ? $row['display_theme'] : null,
        'accountType' => $accountType,
        'accountId' => $accountId,
        'updatedAt' => $row ? $row['updated_at'] : null,
    ]);
}

if ($method === 'PUT') {
    $b = body();
    $theme = strtolower(trim((string)($b['theme'] ?? '')));
    if (!in_array($theme, ['light', 'dark'], true)) {
        json_error('Theme must be light or dark.');
    }
    db()->prepare(
        'INSERT INTO user_preferences (account_type, account_id, display_theme, updated_at)
         VALUES (?,?,?,NOW())
         ON CONFLICT (account_type, account_id) DO UPDATE
         SET display_theme = EXCLUDED.display_theme, updated_at = NOW()'
    )->execute([$accountType, $accountId, $theme]);
    json_out(['ok' => true, 'theme' => $theme]);
}

json_error('Method not allowed', 405);
