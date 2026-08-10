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
    // Every API response is dynamic — never let the browser (or an
    // intermediate proxy) cache it. Without this, GET requests like
    // /customers or /users can be served stale from the browser's HTTP
    // cache after navigating back/forward, making newly added
    // customers/machines/technicians appear "missing" even though they
    // are correctly saved in the database.
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Content-Type: application/json');
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

    // A Technician's assignedCustomerId is baked into their JWT at login
    // time and never re-checked afterward. If that customer is later
    // deleted, merged, or reassigned (e.g. via Danger Zone "Forget
    // customer" or "Merge customers"), the token keeps pointing at a
    // customer row that no longer exists — every request that trusts it
    // 404s, and the Technician app has no way to recover on its own,
    // leaving it stuck on "Loading…" forever even after Refresh (since
    // Refresh just resends the same stale token). Catch that here with
    // one lightweight check and force a clean re-login instead.
    if (($payload['roleName'] ?? '') === 'Technician') {
        $assigned = $payload['assignedCustomerId'] ?? null;
        if ($assigned) {
            $stmt = db()->prepare('SELECT 1 FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
            $stmt->execute([$assigned]);
            if (!$stmt->fetch()) {
                json_error('Your assigned customer has changed. Please log out and log in again.', 401);
            }
        }
    }
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

// ---- Multi-role support -----------------------------------------------------
// A user has one primary role (users.role_id) and may have additional roles
// via the user_roles table. Their effective permissions are the union of
// every assigned role's allowed_pages. Returns null (meaning "everything")
// if any assigned role is Super Admin.
// Normalizes an allowed_pages JSON value into a flat list of page keys.
// Two historical formats exist in the data:
//   - flat array:  ["customers","checklists",...]
//   - old object:  {"customers":["view"],"checklists":["view","edit"],...}
// Passing the object form straight into array_merge/array_unique corrupts
// it (the page names are keys, not values), so every permission check
// silently fails. Always normalize to a flat array of page-name strings.
function normalize_allowed_pages($decoded): array {
    if (!is_array($decoded)) return [];
    // Flat/list form: keys are 0,1,2... and values are page-name strings.
    if (array_is_list($decoded)) {
        return array_values(array_filter($decoded, 'is_string'));
    }
    // Object form: keys ARE the page names.
    return array_keys($decoded);
}

function merged_allowed_pages_for_user(string $userId, string $primaryRoleName, ?string $primaryAllowedPagesJson): ?array {
    if ($primaryRoleName === 'Super Admin') return null;

    $pages = normalize_allowed_pages(json_decode($primaryAllowedPagesJson ?? '[]', true) ?: []);

    $stmt = db()->prepare(
        'SELECT r.name, r.allowed_pages FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ?'
    );
    $stmt->execute([$userId]);
    foreach ($stmt->fetchAll() as $extra) {
        if ($extra['name'] === 'Super Admin') return null;
        $pages = array_merge($pages, normalize_allowed_pages(json_decode($extra['allowed_pages'] ?? '[]', true) ?: []));
    }

    return array_values(array_unique($pages));
}

// Returns the full list of role IDs (primary + extra) assigned to a user.
function role_ids_for_user(string $userId, string $primaryRoleId): array {
    $stmt = db()->prepare('SELECT role_id FROM user_roles WHERE user_id = ?');
    $stmt->execute([$userId]);
    return array_values(array_unique(array_merge([$primaryRoleId], $stmt->fetchAll(PDO::FETCH_COLUMN))));
}


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

    $currentPin = belm_read_stored_pin('adminDeletePin', '1234');
    if (!hash_equals($currentPin, $pin)) json_error('Incorrect delete PIN.', 403);

    $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$user['id']]);
    $hash = $stmt->fetchColumn();
    if (!$hash || !password_verify($adminPassword, $hash)) {
        json_error('Incorrect admin password.', 403);
    }

    return $reason;
}

// ---- Edit confirmation (PIN only) -------------------------------------------
// Every save-changes action on an existing record must pass {editPin} in the
// request body. Lighter than delete confirmation (no password/reason) since
// edits are reversible, but still requires deliberate confirmation.

// Server-side, gap-free-per-type document numbering using a real
// PostgreSQL sequence (atomic — safe even with concurrent requests).
// Falls back to the legacy long-form number only if the sequence is
// somehow missing, so this never breaks a deploy that hasn't run the
// latest schema.sql yet.
function belm_next_document_number(string $prefix, string $sequenceName, int $pad = 4): string {
    try {
        $stmt = db()->query('SELECT nextval(' . db()->quote($sequenceName) . ')');
        $next = (int)$stmt->fetchColumn();
        return $prefix . '-' . str_pad((string)$next, $pad, '0', STR_PAD_LEFT);
    } catch (Throwable $error) {
        return document_number($prefix);
    }
}

// Shared invoice-status calculation used both when an invoice is edited
// directly and when a Receipt gets linked to an invoice (a receipt is
// recorded as a payment too, so this keeps balance/status consistent
// everywhere it's shown).
function calculated_invoice_status(float $total, float $paid, ?string $dueDate): string {
    if ($total > 0 && $paid >= $total - 0.005) return 'PAID';
    if ($paid > 0) return 'PARTIALLY_PAID';
    if ($dueDate && $dueDate < date('Y-m-d')) return 'OVERDUE';
    return 'UNPAID';
}


function belm_get_company_details(): array {
    $defaults = [
        'companyName' => 'BELM GENERAL TECH SERVICE LIMITED',
        'companyAddress' => 'P. O. BOX 8419, KINONDONI, DAR ES SALAAM',
        'companyPhone' => '+255 713 309 529 / +255 683 317 053',
        'companyEmail' => 'info@belmgeneral.co.tz',
        'companyWebsite' => 'www.belmgeneral.co.tz',
        'companyTin' => '',
        'companyVrn' => '',
        'bankAccountName' => 'BELM GENERAL TECH SERVICE LIMITED',
        'bankNmbNumber' => '20710076849',
        'bankCrdbNumber' => '0150761848600',
        'defaultVatRate' => 18,
        'defaultPaymentTerms' => '100% Paid before delivery',
        'defaultDeliveryTime' => '7-14 working days after receiving your payment',
        'defaultQuoteValidity' => 'within 7 days from the date of quotation',
        'whyChooseUs' => [
            'Premium Quality and Genuine Spare Parts',
            'Extensive Industry Experience',
            'Competitive Pricing',
            'Sit back and relax while we ensure seamless delivery.',
        ],
        'footerMessage' => 'Thank you for your business',
    ];
    $stmt = db()->query(
        "SELECT \"key\", \"value\" FROM system_settings WHERE \"key\" IN "
        . "('companyName','companyAddress','companyPhone','companyEmail','companyWebsite','companyTin','companyVrn',"
        . "'bankAccountName','bankNmbNumber','bankCrdbNumber','defaultVatRate','defaultPaymentTerms',"
        . "'defaultDeliveryTime','defaultQuoteValidity','whyChooseUs','footerMessage')"
    );
    foreach ($stmt->fetchAll() as $row) {
        $decoded = json_decode($row['value'], true);
        if ($decoded !== null && $decoded !== '') $defaults[$row['key']] = $decoded;
    }
    return $defaults;
}

// Reads a PIN previously stored via settings.php's change-pin action and
// normalizes it to a plain string, regardless of exactly how it was
// JSON-encoded (a quoted string like "2026", a bare JSON number like 2026
// from an older code path, or anything else). Without this, PHP's strict
// !== comparison could treat a numeric-looking stored value and the typed
// PIN as different types and report "Incorrect PIN" even when the digits
// match exactly.
function belm_read_stored_pin(string $key, string $default): string {
    $stmt = db()->prepare('SELECT "value" FROM system_settings WHERE "key" = ?');
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    if (!$row || $row['value'] === null) return $default;
    $decoded = json_decode($row['value'], true);
    if ($decoded !== null) return trim((string)$decoded);
    // Not valid JSON — fall back to the raw stored text as-is.
    return trim((string)$row['value'], "\" \t\n\r\0\x0B");
}

function require_edit_confirmation(array $body): void {
    $pin = trim((string)($body['editPin'] ?? ''));
    if ($pin === '') json_error('Enter the edit PIN to confirm.');

    $currentPin = belm_read_stored_pin('adminEditPin', '2026');
    if (!hash_equals($currentPin, $pin)) json_error('Incorrect edit PIN.', 403);
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

// Same as require_customer_owner(), but also allows an assistant whose own
// role is 'admin' — so a customer can delegate day-to-day team management
// (adding/editing/removing other assistants) without sharing the primary
// account's password. Admin assistants still can never touch technician
// checklist reports — that stays exclusively a BELM technician/admin action.
function require_customer_owner_or_admin(array $customer): void {
    $isOwner = ($customer['actorType'] ?? '') === 'owner';
    $isAdminAssistant = ($customer['actorType'] ?? '') === 'assistant' && ($customer['customerRole'] ?? '') === 'admin';
    $permissions = $customer['permissions'] ?? null;
    $hasAssignUsersPermission = is_array($permissions) && in_array('assign-users', $permissions, true);
    if (!$isOwner && !$isAdminAssistant && !$hasAssignUsersPermission) {
        json_error('Only the main customer account, a Company Admin, or someone granted "Assign Users" access can manage assistants.', 403);
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
