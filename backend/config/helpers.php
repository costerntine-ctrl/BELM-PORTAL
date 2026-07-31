<?php
require_once __DIR__ . '/database.php';
require_once __DIR__ . '/jwt.php';

/**
 * Stable request identifier returned to the browser and written to Render logs.
 */
function belm_request_id(): string
{
    static $requestId = null;
    if (is_string($requestId)) {
        return $requestId;
    }

    $incoming = trim((string)($_SERVER['HTTP_X_REQUEST_ID'] ?? ''));
    if ($incoming !== '' && preg_match('/^[A-Za-z0-9._-]{8,80}$/', $incoming)) {
        $requestId = $incoming;
    } else {
        try {
            $requestId = 'belm-' . bin2hex(random_bytes(8));
        } catch (Throwable $ignored) {
            $requestId = 'belm-' . str_replace('.', '', uniqid('', true));
        }
    }

    return $requestId;
}

/**
 * Find a PostgreSQL SQLSTATE without exposing the query or credentials.
 */
function belm_sqlstate(Throwable $error): ?string
{
    $current = $error;
    while ($current instanceof Throwable) {
        if ($current instanceof PDOException) {
            $errorInfo = $current->errorInfo ?? null;
            if (is_array($errorInfo) && isset($errorInfo[0])) {
                $state = strtoupper((string)$errorInfo[0]);
                if (preg_match('/^[0-9A-Z]{5}$/', $state)) {
                    return $state;
                }
            }
        }

        $code = strtoupper((string)$current->getCode());
        if (preg_match('/^[0-9A-Z]{5}$/', $code)) {
            return $code;
        }

        $current = $current->getPrevious();
    }

    return null;
}

/**
 * Translate internal errors into safe, actionable API messages.
 */
function belm_classify_exception(Throwable $error): array
{
    $sqlState = belm_sqlstate($error);
    $message = strtolower($error->getMessage());

    if (str_contains($message, 'pdo postgresql driver') || str_contains($message, 'could not find driver')) {
        return [
            'status' => 500,
            'code' => 'DATABASE_DRIVER_MISSING',
            'message' => 'PostgreSQL support is missing from the API image. Redeploy this build.',
            'sqlState' => $sqlState,
        ];
    }

    if (
        str_contains($message, 'database_url')
        || str_contains($message, 'database name')
        || str_contains($message, 'jwt_secret')
    ) {
        return [
            'status' => 503,
            'code' => 'SERVER_CONFIGURATION_ERROR',
            'message' => 'Server configuration is incomplete. Check DATABASE_URL and service environment variables.',
            'sqlState' => $sqlState,
        ];
    }

    if (
        str_contains($message, 'password authentication failed')
        || (str_contains($message, 'database') && str_contains($message, 'does not exist'))
        || str_contains($message, 'no pg_hba.conf entry')
    ) {
        return [
            'status' => 503,
            'code' => 'DATABASE_CREDENTIALS_INVALID',
            'message' => 'PostgreSQL rejected the configured connection. Refresh DATABASE_URL from the Render database.',
            'sqlState' => $sqlState,
        ];
    }

    if (
        ($sqlState !== null && str_starts_with($sqlState, '08'))
        || in_array($sqlState, ['57P01', '57P02', '57P03', '53300'], true)
        || str_contains($message, 'connection refused')
        || str_contains($message, 'could not translate host name')
        || str_contains($message, 'server closed the connection')
    ) {
        return [
            'status' => 503,
            'code' => 'DATABASE_UNAVAILABLE',
            'message' => 'Database is unavailable. Check the Render Postgres status and DATABASE_URL.',
            'sqlState' => $sqlState,
        ];
    }

    if ($sqlState === '42P01') {
        return [
            'status' => 500,
            'code' => 'DATABASE_TABLE_MISSING',
            'message' => 'Database schema is incomplete. Run the portal migration and redeploy.',
            'sqlState' => $sqlState,
        ];
    }

    if ($sqlState === '42703') {
        return [
            'status' => 500,
            'code' => 'DATABASE_COLUMN_MISSING',
            'message' => 'Database schema is older than the portal code. Run the compatibility migration and redeploy.',
            'sqlState' => $sqlState,
        ];
    }

    if (in_array($sqlState, ['42804', '42883', '22P02'], true)) {
        return [
            'status' => 500,
            'code' => 'DATABASE_TYPE_MISMATCH',
            'message' => 'Database column types do not match this portal version. Run the compatibility migration and redeploy.',
            'sqlState' => $sqlState,
        ];
    }

    return [
        'status' => 500,
        'code' => 'INTERNAL_SERVER_ERROR',
        'message' => 'Server error. Use the request ID to find the exact API log entry.',
        'sqlState' => $sqlState,
    ];
}

$requestId = belm_request_id();
header('X-Request-ID: ' . $requestId);

$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = array_values(array_filter(array_map(
    'trim',
    explode(',', getenv('ALLOWED_ORIGINS') ?: '')
)));
$renderHostname = getenv('RENDER_EXTERNAL_HOSTNAME') ?: '';
if ($renderHostname !== '') {
    $allowedOrigins[] = 'https://' . $renderHostname;
}
if (isset($_SERVER['HTTP_HOST'])) {
    $scheme = ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? 'https') === 'http' ? 'http' : 'https';
    $allowedOrigins[] = $scheme . '://' . $_SERVER['HTTP_HOST'];
}
if ($requestOrigin !== '' && in_array($requestOrigin, array_unique($allowedOrigins), true)) {
    header('Access-Control-Allow-Origin: ' . $requestOrigin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Request-ID');
header('Access-Control-Expose-Headers: X-Request-ID');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
ini_set('display_errors', '0');
error_reporting(E_ALL);

set_exception_handler(static function (Throwable $error): void {
    $classification = belm_classify_exception($error);
    $path = parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH) ?: '';
    $sqlState = $classification['sqlState'] ?? null;

    error_log(sprintf(
        'BELM API error requestId=%s method=%s path=%s class=%s code=%s sqlstate=%s message=%s at=%s:%d',
        belm_request_id(),
        (string)($_SERVER['REQUEST_METHOD'] ?? 'CLI'),
        $path,
        get_class($error),
        (string)$error->getCode(),
        $sqlState ?: 'none',
        preg_replace('/[\r\n]+/', ' ', $error->getMessage()),
        $error->getFile(),
        $error->getLine()
    ));

    json_out([
        'error' => $classification['message'] . ' Request ID: ' . belm_request_id(),
        'code' => $classification['code'],
        'requestId' => belm_request_id(),
    ], (int)$classification['status']);
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

function customer_portal_url(string $portalSlug, ?string $email = null): string {
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

// ---- Delete confirmation (PIN + admin password + reason) -------------------
// Every destructive delete must pass {pin, adminPassword, reason} in the
// request body. Throws a clean json_error() if any check fails.
function require_delete_confirmation(array $user, array $body): string {
    $pin = trim((string)($body['pin'] ?? ''));
    $adminPassword = (string)($body['adminPassword'] ?? '');
    $reason = trim((string)($body['reason'] ?? ''));

    if ($pin === '') json_error('Enter the delete PIN to confirm.');
    if ($adminPassword === '') json_error('Enter your admin password to confirm.');
    if ($reason === '') json_error('Enter a reason for this deletion.');
    if (mb_strlen($reason) > 500) json_error('Reason must be 500 characters or fewer.');

    $pinRow = db()->query("SELECT \"value\" FROM system_settings WHERE \"key\" = 'adminDeletePin'")->fetch();
    $currentPin = $pinRow ? json_decode($pinRow['value'], true) : '1234';
    if ($pin !== $currentPin) json_error('Incorrect delete PIN.', 403);

    $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$user['id']]);
    $hash = $stmt->fetchColumn();
    if (!$hash || !password_verify($adminPassword, $hash)) {
        json_error('Incorrect admin password.', 403);
    }

    return $reason;
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

// ---- Recycle Bin ------------------------------------------------------------
function send_to_trash(string $entityType, string $entityId, string $label, ?string $deletedBy, ?string $reason = null): void {
    $stmt = db()->prepare('INSERT INTO trash_entries (id, entity_type, entity_id, label, deleted_by, reason, deleted_at) VALUES (?,?,?,?,?,?,NOW())');
    $stmt->execute([uuid(), $entityType, $entityId, $label, $deletedBy, $reason]);
}

function soft_delete(string $table, string $id): void {
    $stmt = db()->prepare("UPDATE \"$table\" SET deleted_at = NOW() WHERE id = ?");
    $stmt->execute([$id]);
}
