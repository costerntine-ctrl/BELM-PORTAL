<?php
require_once __DIR__ . '/database.php';
require_once __DIR__ . '/jwt.php';

$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = array_values(array_filter(array_map(
    'trim',
    explode(',', getenv('ALLOWED_ORIGINS') ?: '')
)));
$renderHostname = getenv('RENDER_EXTERNAL_HOSTNAME') ?: '';
if ($renderHostname !== '') $allowedOrigins[] = 'https://' . $renderHostname;
if (isset($_SERVER['HTTP_HOST'])) {
    $scheme = ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? 'https') === 'http' ? 'http' : 'https';
    $allowedOrigins[] = $scheme . '://' . $_SERVER['HTTP_HOST'];
}
if ($requestOrigin !== '' && in_array($requestOrigin, array_unique($allowedOrigins), true)) {
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
header('Content-Type: application/json');
ini_set('display_errors', '0');
error_reporting(E_ALL);

set_exception_handler(static function (Throwable $error): void {
    error_log('BELM API error: ' . $error->getMessage());
    json_error('Server error. Check the API error log and database configuration.', 500);
});

/**
 * Convert database snake_case keys to the camelCase names used by the
 * React portal. Password hashes are never returned to the browser.
 */
function api_shape($value) {
    if (!is_array($value)) return $value;

    $isList = array_is_list($value);
    $out = [];
    foreach ($value as $key => $item) {
        if (is_string($key) && in_array($key, ['password', 'password_hash', 'recovery_code_hash'], true)) {
            continue;
        }

        $apiKey = $key;
        if (is_string($key)) {
            $apiKey = preg_replace_callback(
                '/_([a-z])/',
                static fn(array $match): string => strtoupper($match[1]),
                $key
            );
        }
        $out[$apiKey] = api_shape($item);
    }

    return $isList ? array_values($out) : $out;
}

function json_out($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode(api_shape($data), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(string $message, int $status = 400): void {
    json_out(['error' => $message], $status);
}

function body(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function uuid(): string {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function portal_base_url(): string {
    // Use the host the customer/admin is currently visiting. This keeps every
    // generated customer link working on both the Render URL and the custom
    // portal domain while DNS is being configured.
    $forwardedHost = trim(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_HOST'] ?? ''))[0]);
    $host = $forwardedHost !== '' ? $forwardedHost : trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host !== '' && preg_match('/^[a-zA-Z0-9.-]+(?::\d+)?$/', $host)) {
        $forwardedProto = strtolower(trim(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0]));
        $scheme = in_array($forwardedProto, ['http', 'https'], true)
            ? $forwardedProto
            : ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http');
        return $scheme . '://' . $host;
    }
    return rtrim(getenv('PORTAL_URL') ?: 'https://portal.belmgeneraltech.co.tz', '/');
}

/**
 * Generate a short, readable and unique customer portal identifier from the
 * company name, for example "ECLS ICD" -> "ecls-icd".
 */
function customer_portal_slug(string $customerName, ?string $excludeCustomerId = null): string {
    $ascii = function_exists('iconv')
        ? iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $customerName)
        : $customerName;
    if ($ascii === false) $ascii = $customerName;
    $base = strtolower(trim((string)preg_replace('/[^a-zA-Z0-9]+/', '-', $ascii), '-'));
    if ($base === '') $base = 'customer';
    $base = substr($base, 0, 30);

    $candidate = $base;
    $counter = 2;
    while (true) {
        if ($excludeCustomerId) {
            $stmt = db()->prepare(
                'SELECT 1 FROM customers
                 WHERE portal_link = ? AND id <> ?'
            );
            $stmt->execute([$candidate, $excludeCustomerId]);
        } else {
            $stmt = db()->prepare(
                'SELECT 1 FROM customers
                 WHERE portal_link = ?'
            );
            $stmt->execute([$candidate]);
        }
        if (!$stmt->fetch()) return $candidate;
        $suffix = '-' . $counter++;
        $candidate = substr($base, 0, 36 - strlen($suffix)) . $suffix;
    }
}

function customer_portal_url(string $portalSlug): string {
    return portal_base_url() . '/portal/login?customer=' . rawurlencode($portalSlug);
}

function document_number(string $prefix): string {
    $suffix = strtoupper(substr(str_replace('-', '', uuid()), 0, 6));
    return $prefix . '-' . date('Ymd-His') . '-' . $suffix;
}

function secure_account_secret(int $length = 14): string {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
    $secret = '';
    $maximum = strlen($alphabet) - 1;
    for ($index = 0; $index < $length; $index++) {
        $secret .= $alphabet[random_int(0, $maximum)];
    }
    return $secret;
}

function account_recovery_code(): string {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $parts = [];
    for ($group = 0; $group < 4; $group++) {
        $part = '';
        for ($index = 0; $index < 4; $index++) {
            $part .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        $parts[] = $part;
    }
    return 'BELM-' . implode('-', $parts);
}

// ---- Staff auth ------------------------------------------------------------
// Call at the top of any admin-only endpoint. Exits with 401 if not logged
// in. Returns the token payload: id, email, name, roleName, allowedPages,
// assignedCustomerId.
function require_auth(): array {
    $payload = current_token_payload();
    if (!$payload || ($payload['type'] ?? '') !== 'staff') json_error('Not authenticated', 401);
    return $payload;
}

// Checks the logged-in user's role allows a given dashboard page — mirrors
// the static-site / Node backend's allowedPages model. Super Admin (null
// allowedPages) always passes.
function require_page_access(array $user, string $pageKey): void {
    if ($user['roleName'] === 'Super Admin') return;
    $allowed = $user['allowedPages'] ?? [];
    if (!in_array($pageKey, $allowed, true)) {
        json_error("Your role doesn't have access to \"$pageKey\".", 403);
    }
}

function require_super_admin(array $user): void {
    if (($user['roleName'] ?? '') !== 'Super Admin') {
        json_error('Super Admin access is required.', 403);
    }
}

// ---- Customer portal auth ---------------------------------------------------
function require_customer_auth(): array {
    $payload = current_token_payload();
    if (!$payload || ($payload['type'] ?? '') !== 'customer') json_error('Not authenticated', 401);

    $actorType = $payload['actorType'] ?? null;
    if (!in_array($actorType, ['owner', 'assistant'], true)) {
        json_error('Your session has expired after a security update. Please log in again.', 401);
    }

    $stmt = db()->prepare('SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
    $stmt->execute([$payload['id'] ?? '']);
    if (!$stmt->fetch()) json_error('Customer account is not available.', 401);

    if ($actorType === 'assistant') {
        $stmt = db()->prepare(
            'SELECT id, name, role FROM customer_users
             WHERE id = ? AND customer_id = ? AND is_active = 1'
        );
        $stmt->execute([$payload['actorId'] ?? '', $payload['id'] ?? '']);
        $assistant = $stmt->fetch();
        if (!$assistant) json_error('Assistant account is no longer active.', 401);
        $payload['actorName'] = $assistant['name'];
        $payload['customerRole'] = $assistant['role'];
    }
    return $payload;
}

function require_customer_owner(array $customer): void {
    if (($customer['actorType'] ?? '') !== 'owner') {
        json_error('Only the main customer account can manage assistants.', 403);
    }
}

function require_customer_write_access(array $customer): void {
    if (($customer['actorType'] ?? '') === 'assistant' && ($customer['customerRole'] ?? '') === 'viewer') {
        json_error('This assistant has read-only access.', 403);
    }
}

// ---- Cross-entity activity feed --------------------------------------------
// Call after any create/update/delete on customers, billing, spare parts,
// users, tasks or suppliers so an Activity Log view can show a unified feed
// instead of technician checkups only.
function log_activity(string $userId, string $action, string $entity, ?string $entityId = null, array $metadata = []): void {
    try {
        $stmt = db()->prepare(
            'INSERT INTO activity_logs (id, user_id, action, entity, entity_id, metadata, created_at)
             VALUES (?,?,?,?,?,?,NOW())'
        );
        $stmt->execute([uuid(), $userId, $action, $entity, $entityId, json_encode($metadata)]);
    } catch (Throwable $ignored) {
        // Activity logging must never break the primary action.
    }
}

// ---- Recycle Bin ------------------------------------------------------------
function send_to_trash(string $entityType, string $entityId, string $label, ?string $deletedBy): void {
    $stmt = db()->prepare('INSERT INTO trash_entries (id, entity_type, entity_id, label, deleted_by, deleted_at) VALUES (?,?,?,?,?,NOW())');
    $stmt->execute([uuid(), $entityType, $entityId, $label, $deletedBy]);
}

function soft_delete(string $table, string $id): void {
    $stmt = db()->prepare("UPDATE \"$table\" SET deleted_at = NOW() WHERE id = ?");
    $stmt->execute([$id]);
}
