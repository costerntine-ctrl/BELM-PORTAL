<?php
require_once __DIR__ . '/database.php';
require_once __DIR__ . '/jwt.php';

// Default number of portal users (assistants) a customer can add for
// themselves before hitting the limit — overridable per-customer via
// customers.user_limit (set from the Customers page in BELM Admin).
const DEFAULT_CUSTOMER_USER_LIMIT = 3;

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
    // V355: API clients must receive JSON from byte 1. If an included PHP file
    // accidentally echoed debug text/notices, discard that buffered output here.
    if (ob_get_level() > 0) {
        ob_clean();
    }
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
    // V352: public links must NEVER inherit Render's internal container port
    // (normally :10000). PORTAL_URL is the canonical external address and is
    // intentionally preferred over HTTP_HOST / X-Forwarded-Host in production.
    $configured = trim((string)(getenv('PORTAL_URL') ?: ''));
    if ($configured !== '') {
        $parts = parse_url($configured);
        $scheme = strtolower((string)($parts['scheme'] ?? ''));
        $host = (string)($parts['host'] ?? '');
        if (in_array($scheme, ['http', 'https'], true) && $host !== '') {
            $portNumber = isset($parts['port']) ? (int)$parts['port'] : null;
            // :10000 is Render's container listener, never a public HTTPS port.
            if ($scheme === 'https' && $portNumber === 10000) $portNumber = null;
            $port = $portNumber !== null ? ':' . $portNumber : '';
            $path = rtrim((string)($parts['path'] ?? ''), '/');
            return $scheme . '://' . $host . $port . $path;
        }
    }

    $forwardedHost = trim(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_HOST'] ?? ''))[0]);
    $host = $forwardedHost !== '' ? $forwardedHost : trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host !== '' && preg_match('/^[a-zA-Z0-9.-]+(?::\d+)?$/', $host)) {
        $forwardedProto = strtolower(trim(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0]));
        $scheme = in_array($forwardedProto, ['http', 'https'], true)
            ? $forwardedProto
            : ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http');

        // Render forwards traffic to the container on $PORT (usually 10000).
        // That port is not a public HTTPS port and must not be published in
        // customer links, emails, QR URLs or redirects. Keep local HTTP dev
        // ports untouched; only sanitize an HTTPS production-style origin.
        if ($scheme === 'https') {
            $internalPort = trim((string)(getenv('PORT') ?: '10000'));
            if ($internalPort !== '' && preg_match('/^\d+$/', $internalPort)) {
                $host = preg_replace('/:' . preg_quote($internalPort, '/') . '$/', '', $host);
            }
            $host = preg_replace('/:10000$/', '', $host);
        }
        return $scheme . '://' . $host;
    }
    return 'https://portal.belmgeneraltech.co.tz';
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

function public_app_base_url(): string {
    $configured = trim((string)(getenv('PUBLIC_APP_URL') ?: ''));
    if ($configured !== '') {
        $parts = parse_url($configured);
        $scheme = strtolower((string)($parts['scheme'] ?? ''));
        $host = (string)($parts['host'] ?? '');
        if (in_array($scheme, ['http', 'https'], true) && $host !== '') {
            $portNumber = isset($parts['port']) ? (int)$parts['port'] : null;
            if ($scheme === 'https' && $portNumber === 10000) $portNumber = null;
            $port = $portNumber !== null ? ':' . $portNumber : '';
            $path = rtrim((string)($parts['path'] ?? ''), '/');
            return $scheme . '://' . $host . $port . $path;
        }
    }
    return portal_base_url();
}

function public_login_url(): string {
    // V353: authentication always belongs to the portal web service itself.
    // Never route a login through a wrapper/main-site origin and never inherit
    // Render's internal listener port from the current request.
    return portal_base_url() . '/login';
}

function customer_portal_url(string $portalSlug, ?string $email = null): string {
    // Keep the customer portal slug in the database for identity, scoping and
    // compatibility with legacy /app/<company> bookmarks, but new credentials
    // always publish the same canonical login link.
    return public_login_url();
}


/**
 * Friendly BELM staff entry aliases.
 * Technician always receives TECH@BELM. Other BELM staff receive a readable
 * <name>@BELM alias. These aliases are entry links only; authentication still
 * uses the staff member's own email/password and role permissions.
 */
function belm_staff_login_slug(string $name, string $roleName): string {
    if (strcasecmp(trim($roleName), 'Technician') === 0) return 'TECH@BELM';
    $ascii = function_exists('iconv') ? iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name) : $name;
    if ($ascii === false) $ascii = $name;
    $base = strtolower(trim((string)preg_replace('/[^a-zA-Z0-9]+/', '-', (string)$ascii), '-'));
    if ($base === '') $base = 'staff';
    $base = substr($base, 0, 24);
    return $base . '@BELM';
}

function belm_staff_login_url(string $name, string $roleName): string {
    // V303: staff and Technicians receive the same canonical login URL as
    // customers. Friendly @BELM slugs remain recognized only for old links.
    return public_login_url();
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

// ---- Customer-controlled BELM privacy --------------------------------------
// Optional internal data is private by default. Basic company/machine identity,
// official support requests and direct BELM<->Customer communications remain
// available because they are required to operate the account and honor requests.
const BELM_CUSTOMER_PRIVACY_DEFAULTS = [
    'maintenanceRecords' => false,
    'expenseReceipts' => false,
    'teamDirectory' => false,
    'storeAndParts' => false,
];

// V351 DEVELOPMENT ACCESS: Customer expense/procurement records are temporarily
// visible to authenticated BELM staff while the portal is still being built and
// tested. The customer's saved privacy preference is NOT overwritten, so this
// bypass can be closed later without losing the preference they selected. Set
// BELM_OPEN_CUSTOMER_EXPENSES_FOR_DEVELOPMENT=false to close the bypass early.
const BELM_DEVELOPMENT_OPEN_CUSTOMER_EXPENSE_ACCESS = true;

function belm_development_customer_expense_access_enabled(): bool {
    $raw = getenv('BELM_OPEN_CUSTOMER_EXPENSES_FOR_DEVELOPMENT');
    if ($raw !== false && trim((string)$raw) !== '') {
        return in_array(strtolower(trim((string)$raw)), ['1', 'true', 'yes', 'on'], true);
    }
    return BELM_DEVELOPMENT_OPEN_CUSTOMER_EXPENSE_ACCESS;
}

function belm_customer_privacy_normalize($raw): array {
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        $raw = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($raw)) $raw = [];
    $out = BELM_CUSTOMER_PRIVACY_DEFAULTS;
    foreach ($out as $key => $default) {
        if (array_key_exists($key, $raw)) $out[$key] = !empty($raw[$key]);
    }
    return $out;
}

function belm_customer_privacy_row(string $customerId): ?array {
    static $cache = [];
    if (array_key_exists($customerId, $cache)) return $cache[$customerId];
    $stmt = db()->prepare(
        'SELECT id, is_machinery_admin, privacy_preferences
         FROM customers WHERE id = ? AND deleted_at IS NULL'
    );
    $stmt->execute([$customerId]);
    $row = $stmt->fetch();
    if (!$row) return $cache[$customerId] = null;
    $row['privacyPreferences'] = belm_customer_privacy_normalize($row['privacy_preferences'] ?? null);
    return $cache[$customerId] = $row;
}

function belm_customer_has_open_support(string $customerId, ?string $machineId = null): bool {
    if ($machineId !== null && $machineId !== '') {
        $stmt = db()->prepare(
            "SELECT 1 FROM service_requests
             WHERE customer_id = ? AND machine_id = ?
               AND status NOT IN ('COMPLETED','CANCELLED')
             LIMIT 1"
        );
        $stmt->execute([$customerId, $machineId]);
    } else {
        $stmt = db()->prepare(
            "SELECT 1 FROM service_requests
             WHERE customer_id = ? AND status NOT IN ('COMPLETED','CANCELLED')
             LIMIT 1"
        );
        $stmt->execute([$customerId]);
    }
    return (bool)$stmt->fetchColumn();
}

function belm_customer_privacy_allows(string $customerId, string $key, ?string $machineId = null): bool {
    if (!array_key_exists($key, BELM_CUSTOMER_PRIVACY_DEFAULTS)) return false;
    if ($key === 'expenseReceipts' && belm_development_customer_expense_access_enabled()) return true;
    $row = belm_customer_privacy_row($customerId);
    if (!$row) return false;
    $prefs = $row['privacyPreferences'];
    if (!empty($prefs[$key])) return true;

    // When BELM is the active service provider, maintenance/service-kit data is
    // necessary to perform the contracted work. Financial receipts and the
    // Customer's own staff directory stay optional even in provider mode.
    $providerActive = empty($row['is_machinery_admin']);
    if ($providerActive && in_array($key, ['maintenanceRecords', 'storeAndParts'], true)) return true;

    // An official open support request grants temporary machine-scoped access to
    // maintenance/service-kit records required to respond to that request.
    if ($machineId && in_array($key, ['maintenanceRecords', 'storeAndParts'], true)) {
        if (belm_customer_has_open_support($customerId, $machineId)) return true;
    }
    return false;
}

function require_belm_customer_privacy(string $customerId, string $key, string $label, ?string $machineId = null): void {
    if (!belm_customer_privacy_allows($customerId, $key, $machineId)) {
        json_error("Customer privacy settings do not allow BELM to access $label. The Customer Owner/Admin can change this in Privacy & BELM Access.", 403);
    }
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
            // Re-check both assignment and Self-Service ownership on every request.
            // This makes the customer Self-Service switch effective immediately
            // without blocking BELM technicians who are temporarily assigned to
            // the same customer for an explicit support request.
            $stmt = db()->prepare(
                'SELECT u.is_customer_managed, c.is_machinery_admin
                 FROM users u
                 JOIN customers c ON c.id = u.assigned_customer_id
                 WHERE u.id = ?
                   AND u.assigned_customer_id = ?
                   AND u.deleted_at IS NULL AND u.is_active = 1
                   AND c.deleted_at IS NULL AND c.is_active = 1'
            );
            $stmt->execute([$payload['id'] ?? '', $assigned]);
            $live = $stmt->fetch();
            if (!$live) {
                json_error('Your assigned customer has changed. Please log out and log in again.', 401);
            }
            if (!empty($live['is_customer_managed']) && empty($live['is_machinery_admin'])) {
                json_error('BELM Service Provider is active for this customer. Customer Technician access is paused while BELM handles maintenance. Other customer portal roles remain active.', 403);
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

// V319: some workspaces intentionally accept more than one page permission
// (for example Engineering is reachable from either Roles administration or
// the Service Requests / Maintenance Process workspace). Keep backend access
// aligned with the sidebar's anyKeys behavior instead of rejecting a valid role.
function require_any_page_access(array $user, array $pageKeys): void {
    if (($user['roleName'] ?? '') === 'Super Admin') return;
    $allowed = is_array($user['allowedPages'] ?? null) ? $user['allowedPages'] : [];
    foreach ($pageKeys as $pageKey) {
        if (in_array((string)$pageKey, $allowed, true)) return;
    }
    json_error('Your role does not have access to this workspace.', 403);
}

function require_super_admin(array $user): void {
    if (($user['roleName'] ?? '') !== 'Super Admin') {
        json_error('Super Admin access is required.', 403);
    }
}

// V218: Cross-customer technician overrides are intentionally narrow.
// A Technician keeps one permanent/home customer, while BELM Super Admin or
// Engineer can temporarily assign a specific task/service request/job card
// for another customer without changing that home assignment.
function belm_user_has_named_role(array $user, array $roleNames): bool {
    $wanted = array_values(array_unique(array_map('strval', $roleNames)));
    if (!$wanted) return false;
    if (in_array((string)($user['roleName'] ?? ''), $wanted, true)) return true;
    $userId = trim((string)($user['id'] ?? ''));
    if ($userId === '') return false;
    $marks = implode(',', array_fill(0, count($wanted), '?'));
    $stmt = db()->prepare(
        "SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
         WHERE ur.user_id=? AND r.name IN ($marks) AND r.deleted_at IS NULL LIMIT 1"
    );
    $stmt->execute(array_merge([$userId], $wanted));
    return (bool)$stmt->fetchColumn();
}

function belm_can_override_technician_customer(array $user): bool {
    return belm_user_has_named_role($user, ['Super Admin', 'Engineer']);
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

// Return active CENTRAL BELM staff whose effective role grants at least one requested page.
// Customer-bound Technician accounts use the same users table, so they must be
// excluded here; otherwise a request from one customer could be emailed to a
// Technician working inside another customer's environment. Specific assigned
// Technicians receive work through their assigned request/task workflow instead.
function belm_staff_recipients_for_pages(array $pageKeys): array {
    $wanted = array_values(array_unique(array_filter(array_map('strval', $pageKeys))));
    if (!$wanted) return [];
    $stmt = db()->query(
        'SELECT u.id, u.name, u.email, u.role_id, u.assigned_customer_id,
                r.name AS role_name, r.allowed_pages
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.deleted_at IS NULL AND u.is_active = 1 AND r.deleted_at IS NULL
           AND u.assigned_customer_id IS NULL'
    );
    $out = [];
    foreach ($stmt->fetchAll() as $staff) {
        $email = strtolower(trim((string)($staff['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) continue;
        $pages = merged_allowed_pages_for_user(
            (string)$staff['id'],
            (string)$staff['role_name'],
            (string)($staff['allowed_pages'] ?? '[]')
        );
        $matches = $pages === null ? $wanted : array_values(array_intersect($wanted, $pages));
        if (!$matches) continue;
        $out[$email] = [
            'email' => $email,
            'name' => (string)($staff['name'] ?? ''),
            'pages' => $matches,
        ];
    }
    return array_values($out);
}

// Best-effort email alert plus notification-log audit. If no matching staff
// account exists yet, fall back to the Business Email from Settings so a
// customer request is never silently lost.
function belm_send_staff_page_alert(array $pageKeys, string $subject, string $body): array {
    if (!function_exists('send_email')) require_once __DIR__ . '/mailer.php';
    $recipients = belm_staff_recipients_for_pages($pageKeys);
    if (!$recipients) {
        try {
            $company = belm_get_company_details();
            $fallback = strtolower(trim((string)($company['companyEmail'] ?? '')));
            if (filter_var($fallback, FILTER_VALIDATE_EMAIL)) {
                $recipients[] = ['email' => $fallback, 'name' => 'BELM Business Email', 'pages' => $pageKeys];
            }
        } catch (Throwable $ignored) {}
    }
    $result = ['sent' => 0, 'failed' => 0, 'recipients' => []];
    foreach ($recipients as $recipient) {
        $email = (string)$recipient['email'];
        $status = 'SENT';
        try {
            send_email($email, $subject, $body);
            $result['sent']++;
            $result['recipients'][] = $email;
        } catch (Throwable $error) {
            $status = 'FAILED';
            $result['failed']++;
            error_log('BELM staff alert email failed for ' . $email . ': ' . $error->getMessage());
        }
        try {
            db()->prepare(
                'INSERT INTO notification_logs (id, channel, recipient, subject, body, status, created_at)
                 VALUES (?,?,?,?,?,?,NOW())'
            )->execute([uuid(), 'EMAIL', $email, $subject, $body, $status]);
        } catch (Throwable $ignored) {}
    }
    return $result;
}


// Customer-originated communication to BELM. Unlike the generic staff-page
// alert helper, this ALWAYS includes the official Business Email from System
// Settings, then also alerts any active BELM staff whose role owns the target
// pages. Recipients are deduplicated. Reply-To can be the customer's own email
// so a normal email reply goes back to the person who submitted the request.
function belm_send_customer_to_belm_alert(
    array $pageKeys,
    string $subject,
    string $body,
    ?string $customerReplyTo = null
): array {
    if (!function_exists('send_email')) require_once __DIR__ . '/mailer.php';

    $recipientsByEmail = [];
    try {
        $company = belm_get_company_details();
        $businessEmail = strtolower(trim((string)($company['companyEmail'] ?? '')));
        if (filter_var($businessEmail, FILTER_VALIDATE_EMAIL)) {
            $recipientsByEmail[$businessEmail] = [
                'email' => $businessEmail,
                'name' => 'BELM Business Email',
                'source' => 'BUSINESS_EMAIL',
            ];
        }
    } catch (Throwable $ignored) {}

    foreach (belm_staff_recipients_for_pages($pageKeys) as $recipient) {
        $email = strtolower(trim((string)($recipient['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) continue;
        if (!isset($recipientsByEmail[$email])) {
            $recipientsByEmail[$email] = [
                'email' => $email,
                'name' => (string)($recipient['name'] ?? ''),
                'source' => 'STAFF_PAGE',
            ];
        }
    }

    $result = [
        'sent' => 0,
        'failed' => 0,
        'recipients' => [],
        'businessEmailConfigured' => false,
        'businessEmailSent' => false,
    ];
    foreach (array_values($recipientsByEmail) as $recipient) {
        if (($recipient['source'] ?? '') === 'BUSINESS_EMAIL') {
            $result['businessEmailConfigured'] = true;
        }
        $email = (string)$recipient['email'];
        $status = 'SENT';
        try {
            send_email($email, $subject, $body, [], [], $customerReplyTo);
            $result['sent']++;
            $result['recipients'][] = $email;
            if (($recipient['source'] ?? '') === 'BUSINESS_EMAIL') $result['businessEmailSent'] = true;
        } catch (Throwable $error) {
            $status = 'FAILED';
            $result['failed']++;
            error_log('BELM customer-to-business alert failed for ' . $email . ': ' . $error->getMessage());
        }
        try {
            db()->prepare(
                'INSERT INTO notification_logs (id, channel, recipient, subject, body, status, created_at)
'
                . 'VALUES (?,?,?,?,?,?,NOW())'
            )->execute([uuid(), 'EMAIL', $email, $subject, $body, $status]);
        } catch (Throwable $ignored) {}
    }
    return $result;
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

    assert_not_rate_limited('delete-pin', $user['id'], 8, 15);

    $currentPin = belm_read_stored_pin('adminDeletePin', '');
    if ($currentPin === '') json_error('Delete PIN is not configured. Super Admin must set it in System Settings.', 409);
    if (!hash_equals($currentPin, $pin)) {
        record_failed_attempt('delete-pin', $user['id']);
        json_error('Incorrect delete PIN.', 403);
    }

    $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$user['id']]);
    $hash = $stmt->fetchColumn();
    if (!$hash || !password_verify($adminPassword, $hash)) {
        record_failed_attempt('delete-pin', $user['id']);
        json_error('Incorrect admin password.', 403);
    }

    clear_rate_limit('delete-pin', $user['id']);
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
function belm_ensure_invoice_proforma_schema(): void {
    static $done = false;
    if ($done) return;
    $pdo = db();
    $columnExists = $pdo->prepare(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=? AND column_name=?)"
    );
    $columns = [
        ['invoices', 'source_proforma_id', "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_proforma_id VARCHAR(36) NULL REFERENCES proforma_invoices(id) ON DELETE SET NULL"],
        ['invoices', 'discount', "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount NUMERIC(12,2) NOT NULL DEFAULT 0"],
        ['invoices', 'discount_type', "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_type VARCHAR(10) NOT NULL DEFAULT 'FIXED'"],
        ['invoices', 'vat_rate', "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 18"],
        ['invoice_items', 'part_number', "ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS part_number VARCHAR(100) NULL"],
        ['invoice_items', 'unit', "ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS unit VARCHAR(30) NOT NULL DEFAULT 'PC'"],
    ];
    foreach ($columns as [$table, $column, $ddl]) {
        $columnExists->execute([$table, $column]);
        if (!$columnExists->fetchColumn()) $pdo->exec($ddl);
    }
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_invoices_source_proforma ON invoices(source_proforma_id)');
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS proforma_spare_request_links (
            proforma_id VARCHAR(36) NOT NULL REFERENCES proforma_invoices(id) ON DELETE CASCADE,
            spare_request_id VARCHAR(36) NOT NULL REFERENCES spare_part_requests(id) ON DELETE CASCADE,
            PRIMARY KEY (proforma_id, spare_request_id)
        )'
    );
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_proforma_spare_request_link_request ON proforma_spare_request_links(spare_request_id)');
    // V346: commercial numbers use their own permanent sequences so the new
    // fixed-width formats start cleanly without renumbering or deleting any
    // historical PI/INV documents. PostgreSQL requires MINVALUE 0 when a
    // sequence starts at zero.
    $pdo->exec('CREATE SEQUENCE IF NOT EXISTS commercial_pi_number_seq_v346 MINVALUE 0 START WITH 0');
    $pdo->exec('CREATE SEQUENCE IF NOT EXISTS commercial_inv_number_seq_v346 MINVALUE 0 START WITH 0');
    $done = true;
}

function belm_next_document_number(string $prefix, string $sequenceName, int $pad = 4): string {
    try {
        $stmt = db()->query('SELECT nextval(' . db()->quote($sequenceName) . ')');
        $next = (int)$stmt->fetchColumn();
        return $prefix . '-' . str_pad((string)$next, $pad, '0', STR_PAD_LEFT);
    } catch (Throwable $error) {
        return document_number($prefix);
    }
}

/**
 * V346 commercial numbering.
 * New Proformas: PI-0000000, PI-0000001, ... (7 digits)
 * New Invoices:  INV-000000, INV-000001, ... (6 digits)
 *
 * The dedicated sequences start at zero. We still check the unique column
 * before returning a number so a restored/legacy record can never collide
 * with the new sequence.
 */
function belm_next_commercial_number(string $type): string {
    belm_ensure_invoice_proforma_schema();
    $type = strtoupper(trim($type));
    if ($type === 'PI') {
        $sequence = 'commercial_pi_number_seq_v346';
        $prefix = 'PI';
        $pad = 7;
        $table = 'proforma_invoices';
    } elseif ($type === 'INV') {
        $sequence = 'commercial_inv_number_seq_v346';
        $prefix = 'INV';
        $pad = 6;
        $table = 'invoices';
    } else {
        throw new InvalidArgumentException('Unsupported commercial document type.');
    }

    $exists = db()->prepare("SELECT 1 FROM {$table} WHERE invoice_no=? LIMIT 1");
    for ($attempt = 0; $attempt < 10000; $attempt++) {
        $stmt = db()->query('SELECT nextval(' . db()->quote($sequence) . ')');
        $next = (int)$stmt->fetchColumn();
        $candidate = $prefix . '-' . str_pad((string)$next, $pad, '0', STR_PAD_LEFT);
        $exists->execute([$candidate]);
        if (!$exists->fetchColumn()) return $candidate;
    }
    throw new RuntimeException('Could not allocate a unique ' . $type . ' number.');
}

/**
 * Convert a V346 PI number into its paired Invoice number.
 * Example: PI-0000000 -> INV-000000, PI-0000123 -> INV-000123.
 * Legacy Proformas that do not use PI-<digits> get the next six-digit INV.
 */
function belm_invoice_number_from_proforma(string $proformaNo): string {
    belm_ensure_invoice_proforma_schema();
    $proformaNo = strtoupper(trim($proformaNo));
    if (preg_match('/^PI-(\d+)$/', $proformaNo, $match)) {
        $serial = (int)$match[1];
        $candidate = 'INV-' . str_pad((string)$serial, 6, '0', STR_PAD_LEFT);
        $exists = db()->prepare('SELECT 1 FROM invoices WHERE invoice_no=? LIMIT 1');
        $exists->execute([$candidate]);
        if (!$exists->fetchColumn()) return $candidate;
    }
    return belm_next_commercial_number('INV');
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



// ---- Customer team role/permission alerts ---------------------------------
// New Role Manager accounts use explicit dashboard permissions. For older
// accounts that still have permissions=NULL, these defaults preserve sensible
// department access without treating every role as a full-access admin.
function customer_role_default_dashboard_permissions(string $role): array {
    $role = strtolower(trim($role));
    return match ($role) {
        'workshop_manager' => ['machine-expenses', 'fuel-usage', 'operator-reports', 'service-request', 'report-problem', 'check-up', 'store', 'workflow'],
        'store_keeper' => ['machine-expenses', 'store', 'workflow'],
        'accounts' => ['machine-expenses', 'fuel-usage', 'email', 'workflow'],
        'procurement' => ['machine-expenses', 'store', 'service-request', 'workflow'],
        'operator' => ['fuel-usage', 'operator-reports', 'report-problem'],
        'technician' => ['operator-reports', 'report-problem', 'check-up', 'workflow'],
        'admin', 'assistant' => ['*'],
        default => [],
    };
}

function customer_team_recipients_for_permissions(
    string $customerId,
    array $permissionKeys,
    bool $includeOwner = true
): array {
    $wanted = array_values(array_unique(array_filter(array_map('strval', $permissionKeys))));
    $byEmail = [];

    if ($includeOwner) {
        $stmt = db()->prepare('SELECT name, email FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
        $stmt->execute([$customerId]);
        $owner = $stmt->fetch();
        if ($owner) {
            $email = strtolower(trim((string)($owner['email'] ?? '')));
            if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $byEmail[$email] = ['email' => $email, 'name' => (string)($owner['name'] ?? 'Customer Admin'), 'role' => 'owner'];
            }
        }
    }

    $stmt = db()->prepare(
        'SELECT name, email, role, permissions FROM customer_users
         WHERE customer_id = ? AND is_active = 1 ORDER BY created_at ASC'
    );
    $stmt->execute([$customerId]);
    foreach ($stmt->fetchAll() as $row) {
        $email = strtolower(trim((string)($row['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) continue;
        $permissions = null;
        if ($row['permissions'] !== null && trim((string)$row['permissions']) !== '') {
            $decoded = json_decode((string)$row['permissions'], true);
            $permissions = is_array($decoded) ? array_values(array_filter($decoded, 'is_string')) : [];
        }
        // permissions=NULL is the portal's long-standing 'Access All' value.
        // New Role Manager presets are stored explicitly, so full-access users
        // should also receive all role-aware operational alerts.
        if ($permissions === null) $permissions = ['*'];
        $matches = in_array('*', $permissions, true)
            || !$wanted
            || (bool)array_intersect($wanted, $permissions);
        if (!$matches) continue;
        $byEmail[$email] = [
            'email' => $email,
            'name' => (string)($row['name'] ?? ''),
            'role' => (string)($row['role'] ?? ''),
        ];
    }


    // Customer-managed Technicians can now receive the same role-aware team
    // alerts when Administration grants the relevant dashboard permission.
    // No BELM staff Technician is included here.
    try {
        $techStmt = db()->prepare(
            "SELECT u.name, u.email, u.customer_permissions
             FROM users u JOIN roles r ON r.id=u.role_id
             WHERE u.assigned_customer_id=? AND u.is_customer_managed=1
               AND u.is_active=1 AND u.deleted_at IS NULL AND r.name='Technician'"
        );
        $techStmt->execute([$customerId]);
        foreach ($techStmt->fetchAll() as $tech) {
            $email = strtolower(trim((string)($tech['email'] ?? '')));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) continue;
            $raw = (string)($tech['customer_permissions'] ?? '');
            if ($raw === '__ALL__') {
                $permissions = ['*'];
            } else {
                $decoded = json_decode($raw !== '' ? $raw : '[]', true);
                $permissions = is_array($decoded) ? array_values(array_filter($decoded, 'is_string')) : [];
            }
            $matches = in_array('*', $permissions, true)
                || !$wanted
                || (bool)array_intersect($wanted, $permissions);
            if (!$matches) continue;
            $byEmail[$email] = [
                'email' => $email,
                'name' => (string)($tech['name'] ?? ''),
                'role' => 'technician',
            ];
        }
    } catch (Throwable $ignored) {}

    return array_values($byEmail);
}

function customer_send_team_alert(
    string $customerId,
    array $permissionKeys,
    string $subject,
    string $body,
    bool $includeOwner = true
): array {
    if (!function_exists('send_email')) require_once __DIR__ . '/mailer.php';
    $result = ['sent' => 0, 'failed' => 0, 'recipients' => []];
    foreach (customer_team_recipients_for_permissions($customerId, $permissionKeys, $includeOwner) as $recipient) {
        $email = (string)$recipient['email'];
        $status = 'SENT';
        try {
            send_email($email, $subject, $body);
            $result['sent']++;
            $result['recipients'][] = $email;
        } catch (Throwable $error) {
            $status = 'FAILED';
            $result['failed']++;
            error_log('BELM customer team alert failed for ' . $email . ': ' . $error->getMessage());
        }
        try {
            db()->prepare(
                'INSERT INTO notification_logs (id, channel, recipient, subject, body, status, created_at)
                 VALUES (?,?,?,?,?,?,NOW())'
            )->execute([uuid(), 'EMAIL', $email, $subject, $body, $status]);
        } catch (Throwable $ignored) {}
    }
    return $result;
}

// ---- WhatsApp transport + machine-owner preventive service alerts --------
// Auto WhatsApp delivery is intentionally provider-neutral. Configure:
//   BELM_WHATSAPP_API_URL   HTTPS endpoint accepting {to,message}
//   BELM_WHATSAPP_API_TOKEN optional Bearer token
// If no endpoint is configured, the portal records PENDING_PROVIDER rather
// than claiming that WhatsApp was sent. This keeps the audit trail truthful.
function belm_whatsapp_api_is_configured(): bool {
    $url = trim((string)(getenv('BELM_WHATSAPP_API_URL') ?: ''));
    return $url !== '' && filter_var($url, FILTER_VALIDATE_URL) !== false;
}

function belm_normalize_whatsapp_number(string $phone): string {
    $digits = preg_replace('/[^0-9]+/', '', trim($phone));
    if (!$digits) return '';
    // Tanzania-friendly normalization for locally stored 0XXXXXXXXX numbers.
    if (strlen($digits) === 10 && str_starts_with($digits, '0')) {
        $digits = '255' . substr($digits, 1);
    } elseif (strlen($digits) === 9 && preg_match('/^[67]/', $digits)) {
        $digits = '255' . $digits;
    }
    return $digits;
}

function belm_send_whatsapp_text(string $phone, string $message): array {
    $to = belm_normalize_whatsapp_number($phone);
    if ($to === '') return ['sent' => false, 'status' => 'NO_PHONE'];
    try {
        $toggle = db()->prepare('SELECT "value" FROM system_settings WHERE "key" = ?');
        $toggle->execute(['whatsappAlertsEnabled']);
        $raw = $toggle->fetchColumn();
        if ($raw !== false && json_decode((string)$raw, true) === false) {
            return ['sent' => false, 'status' => 'DISABLED', 'to' => $to];
        }
    } catch (Throwable $ignored) {}
    $url = trim((string)(getenv('BELM_WHATSAPP_API_URL') ?: ''));
    if (!belm_whatsapp_api_is_configured()) {
        return ['sent' => false, 'status' => 'PENDING_PROVIDER', 'to' => $to];
    }
    if (!function_exists('curl_init')) {
        return ['sent' => false, 'status' => 'CURL_UNAVAILABLE', 'to' => $to];
    }
    $payload = json_encode(['to' => $to, 'message' => $message], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $headers = ['Content-Type: application/json', 'Accept: application/json'];
    $token = trim((string)(getenv('BELM_WHATSAPP_API_TOKEN') ?: ''));
    if ($token !== '') $headers[] = 'Authorization: Bearer ' . $token;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 15,
    ]);
    $response = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    $ok = $error === '' && $httpCode >= 200 && $httpCode < 300;
    return [
        'sent' => $ok,
        'status' => $ok ? 'SENT' : 'FAILED',
        'to' => $to,
        'httpCode' => $httpCode,
        'error' => $error,
        'response' => is_string($response) ? substr($response, 0, 500) : '',
    ];
}

// V397 - Operator problem messages are operational alerts for the whole team.
// WhatsApp recipients are the active Customer owner/users plus every active
// BELM user account. Customer-managed Technicians assigned to this customer
// are included as part of the Customer team. Numbers are normalized and
// deduplicated before delivery so one person/number is never spammed twice.
function belm_operator_message_whatsapp_recipients(string $customerId): array {
    $byPhone = [];
    $add = static function (array &$target, string $phone, string $name, string $source): void {
        $normalized = belm_normalize_whatsapp_number($phone);
        if ($normalized === '') return;
        if (!isset($target[$normalized])) {
            $target[$normalized] = [
                'phone' => $normalized,
                'name' => trim($name),
                'source' => $source,
            ];
            return;
        }
        // Keep an audit-friendly source list when the same number belongs to
        // more than one synchronized account.
        $existingSources = array_filter(array_map('trim', explode(',', (string)$target[$normalized]['source'])));
        if (!in_array($source, $existingSources, true)) $existingSources[] = $source;
        $target[$normalized]['source'] = implode(',', $existingSources);
    };

    try {
        $ownerStmt = db()->prepare('SELECT name, phone FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
        $ownerStmt->execute([$customerId]);
        if ($owner = $ownerStmt->fetch()) {
            $add($byPhone, (string)($owner['phone'] ?? ''), (string)($owner['name'] ?? 'Customer'), 'CUSTOMER_OWNER');
        }
    } catch (Throwable $ignored) {}

    try {
        $customerUsers = db()->prepare(
            'SELECT name, phone FROM customer_users WHERE customer_id = ? AND is_active = 1 ORDER BY created_at ASC'
        );
        $customerUsers->execute([$customerId]);
        foreach ($customerUsers->fetchAll() as $row) {
            $add($byPhone, (string)($row['phone'] ?? ''), (string)($row['name'] ?? ''), 'CUSTOMER_USER');
        }
    } catch (Throwable $ignored) {}

    try {
        $belmUsers = db()->prepare(
            'SELECT name, phone, is_customer_managed, assigned_customer_id
             FROM users
             WHERE deleted_at IS NULL AND is_active = 1
               AND (is_customer_managed = 0 OR assigned_customer_id = ?)'
        );
        $belmUsers->execute([$customerId]);
        foreach ($belmUsers->fetchAll() as $row) {
            $source = !empty($row['is_customer_managed']) ? 'CUSTOMER_TECHNICIAN' : 'BELM_USER';
            $add($byPhone, (string)($row['phone'] ?? ''), (string)($row['name'] ?? ''), $source);
        }
    } catch (Throwable $ignored) {}

    return array_values($byPhone);
}

function belm_send_operator_message_whatsapp_group(string $customerId, string $subject, string $body): array {
    $result = [
        'sent' => 0,
        'failed' => 0,
        'pending' => 0,
        'skipped' => 0,
        'recipients' => [],
    ];
    foreach (belm_operator_message_whatsapp_recipients($customerId) as $recipient) {
        $phone = (string)($recipient['phone'] ?? '');
        $delivery = belm_send_whatsapp_text($phone, $body);
        $status = (string)($delivery['status'] ?? 'FAILED');
        if ($status === 'SENT') $result['sent']++;
        elseif ($status === 'PENDING_PROVIDER') $result['pending']++;
        elseif (in_array($status, ['DISABLED', 'NO_PHONE'], true)) $result['skipped']++;
        else $result['failed']++;
        $result['recipients'][] = [
            'phone' => (string)($delivery['to'] ?? $phone),
            'name' => (string)($recipient['name'] ?? ''),
            'source' => (string)($recipient['source'] ?? ''),
            'status' => $status,
        ];
        try {
            db()->prepare(
                'INSERT INTO notification_logs (id, channel, recipient, subject, body, status, created_at)
                 VALUES (?,?,?,?,?,?,NOW())'
            )->execute([uuid(), 'WHATSAPP', (string)($delivery['to'] ?? $phone), $subject, $body, $status]);
        } catch (Throwable $ignored) {}
    }
    return $result;
}

function belm_send_deduplicated_email_group(array $recipients, string $subject, string $body): array {
    if (!function_exists('send_email')) require_once __DIR__ . '/mailer.php';
    $sent = 0;
    $failed = 0;
    $skipped = 0;
    $emails = [];
    foreach ($recipients as $recipient) {
        $email = strtolower(trim((string)($recipient['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) continue;
        $emails[$email] = true;

        // Subject includes the customer, machine and due-hour milestone, so a
        // successful recipient is never emailed twice for the same overdue
        // service even when dashboard/checklist scans retry failed deliveries.
        $already = db()->prepare(
            "SELECT 1 FROM notification_logs
             WHERE channel = 'EMAIL' AND LOWER(recipient) = LOWER(?)
               AND subject = ? AND status = 'SENT' LIMIT 1"
        );
        $already->execute([$email, $subject]);
        if ($already->fetch()) {
            $skipped++;
            continue;
        }

        $status = 'SENT';
        try {
            send_email($email, $subject, $body);
            $sent++;
        } catch (Throwable $error) {
            $status = 'FAILED';
            $failed++;
            error_log('BELM grouped email failed for ' . $email . ': ' . $error->getMessage());
        }
        try {
            db()->prepare(
                'INSERT INTO notification_logs (id, channel, recipient, subject, body, status, created_at)
                 VALUES (?,?,?,?,?,?,NOW())'
            )->execute([uuid(), 'EMAIL', $email, $subject, $body, $status]);
        } catch (Throwable $ignored) {}
    }
    return [
        'sent' => $sent,
        'failed' => $failed,
        'skipped' => $skipped,
        'recipients' => array_keys($emails),
    ];
}

function belm_service_overdue_admin_recipients(): array {
    $recipients = belm_staff_recipients_for_pages(['customers']);
    if ($recipients) return $recipients;
    try {
        $company = belm_get_company_details();
        $fallback = strtolower(trim((string)($company['companyEmail'] ?? '')));
        if (filter_var($fallback, FILTER_VALIDATE_EMAIL)) {
            return [['email' => $fallback, 'name' => 'BELM Business Email', 'pages' => ['customers']]];
        }
    } catch (Throwable $ignored) {}
    return [];
}

function belm_notify_machine_owner_service_status(array $serviceStatus, array $machine): array {
    $remaining = (float)($serviceStatus['hoursRemaining'] ?? 0);

    // V396 communication policy: only SERVICE OVERDUE sends an automatic
    // customer email. Due-soon and all other machine/check-up alerts remain
    // visible in the portal and can be emailed manually when BELM chooses
    // "Send Email to Customer Group for Action".
    if ($remaining >= 0) return ['skipped' => 'NOT_OVERDUE'];

    $machineId = (string)($machine['id'] ?? '');
    $customerId = (string)($machine['customer_id'] ?? '');
    if ($machineId === '' || $customerId === '') return ['skipped' => 'MISSING_IDS'];

    $ownerStmt = db()->prepare('SELECT name, email, phone FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
    $ownerStmt->execute([$customerId]);
    $owner = $ownerStmt->fetch();
    if (!$owner) return ['skipped' => 'OWNER_NOT_FOUND'];

    $dueHour = (int)($serviceStatus['dueHour'] ?? 0);
    $interval = (int)($serviceStatus['intervalHours'] ?? 250);
    $kind = 'OVERDUE';
    $ownerEmail = trim((string)($owner['email'] ?? ''));
    $ownerPhone = trim((string)($owner['phone'] ?? ''));

    $existingStmt = db()->prepare(
        'SELECT * FROM machine_service_owner_notifications WHERE machine_id = ? AND due_hour = ? AND notification_kind = ? LIMIT 1'
    );
    $existingStmt->execute([$machineId, $dueHour, $kind]);
    $row = $existingStmt->fetch();
    if (!$row) {
        $id = uuid();
        db()->prepare(
            'INSERT INTO machine_service_owner_notifications
             (id, machine_id, customer_id, due_hour, service_interval_hours, notification_kind,
              owner_email, owner_phone, email_status, whatsapp_status, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,' . "'PENDING','PENDING',NOW(),NOW())"
        )->execute([$id, $machineId, $customerId, $dueHour, $interval, $kind, $ownerEmail ?: null, $ownerPhone ?: null]);
        $row = [
            'id' => $id, 'email_status' => 'PENDING', 'whatsapp_status' => 'PENDING',
            'owner_email' => $ownerEmail, 'owner_phone' => $ownerPhone,
        ];
    }

    $machineName = trim((string)($machine['brand'] ?? '') . ' ' . (string)($machine['model'] ?? ''))
        ?: ((string)($machine['machine_type'] ?? 'Machine'));
    $customerName = trim((string)($owner['name'] ?? 'Customer')) ?: 'Customer';
    $serial = (string)($machine['serial_number'] ?? ($machine['reg_number'] ?? 'Not recorded'));
    $current = (float)($serviceStatus['totalHours'] ?? 0);
    $remainingAbs = abs($remaining);
    $serviceType = $interval . '-Hour Service';
    $stateLine = $remaining < 0
        ? 'OVERDUE by ' . rtrim(rtrim(number_format($remainingAbs, 2, '.', ''), '0'), '.') . ' hrs'
        : 'OVERDUE';
    $subject = 'SERVICE OVERDUE - ' . $customerName . ' - ' . $machineName . ' - ' . $dueHour . 'HRS';
    $body = "PREVENTIVE MAINTENANCE - ACTION REQUIRED\n\n"
        . "Customer: $customerName\n"
        . "Machine: $machineName\n"
        . "Machine Type: " . (($machine['machine_type'] ?? '') ?: 'Not recorded') . "\n"
        . "Brand: " . (($machine['brand'] ?? '') ?: 'Not recorded') . "\n"
        . "Model: " . (($machine['model'] ?? '') ?: 'Not recorded') . "\n"
        . "Serial / Reg: $serial\n"
        . "Current Hours: " . rtrim(rtrim(number_format($current, 2, '.', ''), '0'), '.') . "\n"
        . "Service Type: $serviceType\n"
        . "Service Due At: $dueHour hrs\n"
        . "Status: $stateLine\n\n"
        . "Action required: arrange the overdue service and update the machine service record in BELM Portal.";

    // Automatic customer delivery goes to the account owner plus every active
    // customer portal user. Empty roles means the full synchronized group.
    $customerRecipients = belm_customer_notification_recipients($customerId, []);
    $customerDelivery = belm_send_deduplicated_email_group($customerRecipients, $subject, $body);
    $recipientCount = count($customerDelivery['recipients'] ?? []);
    $deliveredCount = (int)($customerDelivery['sent'] ?? 0) + (int)($customerDelivery['skipped'] ?? 0);
    if ($recipientCount === 0) $emailStatus = 'NO_EMAIL';
    elseif ((int)($customerDelivery['failed'] ?? 0) === 0 && $deliveredCount >= $recipientCount) $emailStatus = 'SENT';
    elseif ($deliveredCount > 0) $emailStatus = 'PARTIAL';
    else $emailStatus = 'FAILED';

    db()->prepare(
        "UPDATE machine_service_owner_notifications
         SET email_status = ?,
             email_sent_at = CASE WHEN ? IN ('SENT','PARTIAL') THEN COALESCE(email_sent_at, NOW()) ELSE email_sent_at END,
             owner_email = ?, last_attempt_at = NOW(), updated_at = NOW()
         WHERE id = ?"
    )->execute([$emailStatus, $emailStatus, $ownerEmail ?: null, $row['id']]);

    // The same overdue action is copied back to BELM Admin/staff who own the
    // Customers page. Deduplication keeps dashboard scans from spamming admins.
    $belmSubject = '[BELM COPY] ' . $subject;
    $belmBody = $body . "\n\nAutomatic customer recipients: " . ($recipientCount ?: 0) . ".";
    $belmDelivery = belm_send_deduplicated_email_group(
        belm_service_overdue_admin_recipients(),
        $belmSubject,
        $belmBody
    );

    $whatsappStatus = (string)($row['whatsapp_status'] ?? 'PENDING');
    $shouldAttemptWhatsApp = $whatsappStatus !== 'SENT';
    if ($whatsappStatus === 'PENDING_PROVIDER' && !belm_whatsapp_api_is_configured()) {
        $shouldAttemptWhatsApp = false;
    }
    if ($shouldAttemptWhatsApp) {
        $wa = belm_send_whatsapp_text($ownerPhone, $body);
        $whatsappStatus = (string)($wa['status'] ?? 'FAILED');
        db()->prepare(
            "UPDATE machine_service_owner_notifications
             SET whatsapp_status = ?, whatsapp_sent_at = CASE WHEN ? = 'SENT' THEN NOW() ELSE whatsapp_sent_at END,
                 owner_phone = ?, last_attempt_at = NOW(), updated_at = NOW() WHERE id = ?"
        )->execute([$whatsappStatus, $whatsappStatus, $ownerPhone ?: null, $row['id']]);
        try {
            db()->prepare('INSERT INTO notification_logs (id, channel, recipient, subject, body, status, created_at) VALUES (?,?,?,?,?,?,NOW())')
                ->execute([uuid(), 'WHATSAPP', belm_normalize_whatsapp_number($ownerPhone), $subject, $body, $whatsappStatus]);
        } catch (Throwable $ignored) {}
    }

    // Keep one portal record for the overdue milestone even if SMTP is down.
    try {
        $communicationExists = db()->prepare(
            "SELECT 1 FROM customer_communications
             WHERE customer_id = ? AND machine_id = ? AND related_type = 'SERVICE_MILESTONE'
               AND related_id = ? AND subject = ? LIMIT 1"
        );
        $relatedId = (string)$row['id'];
        $communicationExists->execute([$customerId, $machineId, $relatedId, $subject]);
        if (!$communicationExists->fetch()) {
            belm_log_customer_communication(
                $customerId, $machineId, 'BELM_TO_CUSTOMER', 'SYSTEM',
                $subject, $body, 'SERVICE_MILESTONE', $relatedId, 'BELM Service Overdue Alert',
                in_array($emailStatus, ['SENT', 'PARTIAL'], true) || $whatsappStatus === 'SENT' ? 'SENT' : 'PORTAL_ONLY'
            );
        }
    } catch (Throwable $ignored) {}

    return [
        'emailStatus' => $emailStatus,
        'whatsappStatus' => $whatsappStatus,
        'kind' => $kind,
        'customerEmails' => $customerDelivery['recipients'] ?? [],
        'belmEmails' => $belmDelivery['recipients'] ?? [],
    ];
}

// ---- Machine safety/service alert emails --------------------------------
// Sends a "Don't operate" (RED), "Attention needed" (YELLOW), or "Service
// reminder" (service due soon/overdue) email to both the company inbox
// and the customer's own registered email, whenever a fresh check-up
// result crosses into one of those states. Best-effort — a failed email
// must never block the checklist submission itself.
function send_machine_alert_email(
    string $overallStatus,
    ?array $serviceStatus,
    array $machine,
    string $customerEmail,
    string $customerName,
    bool $notifyBelm = true
): void {
    // V396: RED/YELLOW checklist conditions and DUE-SOON service states do not
    // auto-email. They remain visible in the machine/checklist UI. BELM can
    // choose the customer-group email option from Communication when action is
    // required. Only SERVICE OVERDUE is delivered automatically.
    try {
        if ($serviceStatus && (float)($serviceStatus['hoursRemaining'] ?? 0) < 0) {
            belm_notify_machine_owner_service_status($serviceStatus, $machine);
        }
    } catch (Throwable $error) {
        error_log('BELM overdue service notification failed: ' . $error->getMessage());
    }
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
// ---- Brute-force protection --------------------------------------------
// Generic, table-backed rate limiter shared by staff login, customer
// login, and the Edit/Delete PIN checks. Counts FAILED attempts only
// (successful ones don't count against the limit), keyed by a scope
// (e.g. 'login', 'edit-pin') + identifier (email or user id) so one
// person's lockout never affects anyone else.
function assert_not_rate_limited(string $scope, string $identifier, int $maxAttempts = 8, int $windowMinutes = 15): void {
    $identifier = mb_strtolower(trim($identifier));
    if ($identifier === '') return;
    $stmt = db()->prepare(
        "SELECT COUNT(*) FROM security_rate_limits
         WHERE scope = ? AND identifier = ? AND created_at > NOW() - (? || ' minutes')::interval"
    );
    $stmt->execute([$scope, $identifier, $windowMinutes]);
    if ((int)$stmt->fetchColumn() >= $maxAttempts) {
        json_error("Too many incorrect attempts. Please wait $windowMinutes minutes and try again.", 429);
    }
}

function record_failed_attempt(string $scope, string $identifier): void {
    $identifier = mb_strtolower(trim($identifier));
    if ($identifier === '') return;
    db()->prepare('INSERT INTO security_rate_limits (id, scope, identifier, created_at) VALUES (?,?,?,NOW())')
        ->execute([uuid(), $scope, $identifier]);
}

function clear_rate_limit(string $scope, string $identifier): void {
    $identifier = mb_strtolower(trim($identifier));
    if ($identifier === '') return;
    db()->prepare('DELETE FROM security_rate_limits WHERE scope = ? AND identifier = ?')
        ->execute([$scope, $identifier]);
}

// V349: password resets and credential repairs must immediately release any
// stale unified-login lockout for that identity. Otherwise a user can reset
// the password successfully and still be told the new password does not work
// until the previous 15-minute failed-attempt window expires.
function clear_unified_login_lockout(?string $email = null, ?string $portalLink = null): void {
    foreach ([$email, $portalLink] as $identifier) {
        $identifier = mb_strtolower(trim((string)$identifier));
        if ($identifier !== '') clear_rate_limit('unified-login', $identifier);
    }
}

// ---- General-purpose audit trail -----------------------------------------
// Records ONE staff/admin action for accountability — who did what, on
// which record, and when. Every significant create/edit/delete across the
// admin side calls this so "who did this?" can always be answered, not
// just for service requests (which already has its own richer history).
function log_activity(array $user, string $action, ?string $entity = null, ?string $entityId = null, array $metadata = []): void {
    try {
        db()->prepare(
            'INSERT INTO activity_logs (id, user_id, action, entity, entity_id, metadata, created_at)
             VALUES (?,?,?,?,?,?,NOW())'
        )->execute([
            uuid(),
            $user['id'],
            $action,
            $entity,
            $entityId,
            $metadata ? json_encode($metadata) : null,
        ]);
    } catch (Throwable $error) { /* the audit log must never break the actual action */ }
}

// Silent inventory match — tries to identify which BELM Spare Parts
// Inventory item (if any) a customer's freely-typed reference/description
// corresponds to. Never shown to the customer; purely for Admin/Engineer
// visibility when preparing a Proforma. Exact part-number/reference match
// first, then a loose name match as a fallback.
function match_spare_part_by_text(?string $reference, ?string $description): ?string {
    $reference = trim((string)$reference);
    $description = trim((string)$description);
    if ($reference !== '') {
        $stmt = db()->prepare(
            'SELECT id FROM spare_parts
             WHERE deleted_at IS NULL
               AND (UPPER(part_number) = UPPER(?) OR UPPER(reference_number) = UPPER(?))
             LIMIT 1'
        );
        $stmt->execute([$reference, $reference]);
        $matchId = $stmt->fetchColumn();
        if ($matchId) return $matchId;
    }
    if ($description !== '') {
        $stmt = db()->prepare(
            "SELECT id FROM spare_parts
             WHERE deleted_at IS NULL AND name ILIKE ?
             ORDER BY LENGTH(name) ASC LIMIT 1"
        );
        $stmt->execute(['%' . $description . '%']);
        $matchId = $stmt->fetchColumn();
        if ($matchId) return $matchId;
    }
    return null;
}

// Validates a base64 data-URL receipt upload (JPG/PNG/WebP image or PDF)
// and returns [base64Data, mimeType, safeFileName] — shared by both the
// customer's own Procurement uploads and BELM's own Company
// Expenses uploads, so both sides store/validate receipts identically.
function validate_receipt_upload(string $receiptPhoto, string $receiptName): array {
    if (!preg_match('#^data:(image/(?:jpeg|png|webp)|application/pdf);base64,([A-Za-z0-9+/=\r\n]+)$#', $receiptPhoto, $matches)) {
        json_error('Receipt must be a JPG, PNG, WebP image, or a PDF.');
    }
    $declaredType = $matches[1];
    $decodedReceipt = base64_decode($matches[2], true);
    if ($decodedReceipt === false) json_error('Receipt could not be read.');

    if ($declaredType === 'application/pdf') {
        if (strlen($decodedReceipt) > 4 * 1024 * 1024) {
            json_error('Receipt PDF must be 4 MB or smaller.');
        }
        if (substr($decodedReceipt, 0, 4) !== '%PDF') {
            json_error('Receipt is not a valid PDF file.');
        }
        $cleanName = preg_replace('/[^A-Za-z0-9._-]+/', '-', $receiptName ?: 'receipt');
        if (!str_ends_with(strtolower($cleanName), '.pdf')) $cleanName .= '.pdf';
        return [
            base64_encode($decodedReceipt),
            'application/pdf',
            $cleanName,
        ];
    }

    if (strlen($decodedReceipt) > 2 * 1024 * 1024) {
        json_error('Receipt photo must be 2 MB or smaller after compression.');
    }
    $imageInfo = @getimagesizefromstring($decodedReceipt);
    if ($imageInfo === false || !in_array($imageInfo['mime'] ?? '', ['image/jpeg', 'image/png', 'image/webp'], true)) {
        json_error('Receipt photo is not a valid image.');
    }
    return [
        base64_encode($decodedReceipt),
        $imageInfo['mime'],
        preg_replace('/[^A-Za-z0-9._-]+/', '-', $receiptName ?: 'receipt-photo'),
    ];
}

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

function require_edit_confirmation(array $user, array $body): void {
    $pin = trim((string)($body['editPin'] ?? ''));
    if ($pin === '') json_error('Enter the edit PIN to confirm.');

    assert_not_rate_limited('edit-pin', $user['id'], 8, 15);

    $currentPin = belm_read_stored_pin('adminEditPin', '');
    if ($currentPin === '') json_error('Edit PIN is not configured. Super Admin must set it in System Settings.', 409);
    if (!hash_equals($currentPin, $pin)) {
        record_failed_attempt('edit-pin', $user['id']);
        json_error('Incorrect edit PIN.', 403);
    }
    clear_rate_limit('edit-pin', $user['id']);
}

// ---- Customer portal auth ---------------------------------------------------
function require_customer_auth(): array {
    $payload = current_token_payload();
    if (!$payload) json_error('Not authenticated', 401);

    // V207: a customer-managed Technician may also be granted customer-dashboard
    // permissions by that customer's Administration. The same Technician login
    // can therefore open /tech for field work and /portal/dashboard for any
    // explicitly granted company functions. BELM internal/admin permissions are
    // never inherited here.
    if (($payload['type'] ?? '') === 'staff'
        && ($payload['roleName'] ?? '') === 'Technician'
        && !empty($payload['isCustomerManaged'])
        && !empty($payload['assignedCustomerId'])) {
        $stmt = db()->prepare(
            "SELECT u.id AS user_id, u.name AS user_name, u.email AS user_email,
                    u.customer_permissions, u.is_active,
                    c.id AS customer_id, c.email AS customer_email,
                    c.is_active AS customer_active, c.is_machinery_admin
             FROM users u
             JOIN customers c ON c.id = u.assigned_customer_id
             JOIN roles r ON r.id = u.role_id
             WHERE u.id = ? AND u.assigned_customer_id = ?
               AND u.is_customer_managed = 1 AND r.name = 'Technician'
               AND u.deleted_at IS NULL AND c.deleted_at IS NULL"
        );
        $stmt->execute([$payload['id'] ?? '', $payload['assignedCustomerId'] ?? '']);
        $live = $stmt->fetch();
        if (!$live || empty($live['is_active']) || empty($live['customer_active'])) {
            json_error('This Technician or customer account is no longer active.', 401);
        }
        if (empty($live['is_machinery_admin'])) {
            json_error('BELM Service Provider is active for this customer. Customer Technician access is paused while BELM handles maintenance. Other customer portal roles remain active.', 403);
        }
        $rawTechnicianPermissions = (string)($live['customer_permissions'] ?? '');
        if ($rawTechnicianPermissions === '__ALL__') {
            $permissions = null;
        } else {
            $decoded = json_decode($rawTechnicianPermissions !== '' ? $rawTechnicianPermissions : '[]', true);
            $permissions = is_array($decoded) ? array_values(array_filter($decoded, 'is_string')) : [];
        }
        // Re-shape the staff token into the same customer context used by the
        // customer portal APIs. `id` intentionally becomes the customer id;
        // `actorId` keeps the Technician user id for audit attribution.
        $payload['type'] = 'customer';
        $payload['id'] = (string)$live['customer_id'];
        $payload['actorType'] = 'technician';
        $payload['actorId'] = (string)$live['user_id'];
        $payload['actorName'] = (string)$live['user_name'];
        $payload['actorEmail'] = (string)$live['user_email'];
        $payload['customerRole'] = 'technician';
        $payload['permissions'] = $permissions;
        return $payload;
    }

    if (($payload['type'] ?? '') !== 'customer') json_error('Not authenticated', 401);

    $actorType = $payload['actorType'] ?? null;
    if (!in_array($actorType, ['owner', 'assistant'], true)) {
        json_error('Your session has expired after a security update. Please log in again.', 401);
    }

    $stmt = db()->prepare('SELECT id, email FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
    $stmt->execute([$payload['id'] ?? '']);
    $ownerRow = $stmt->fetch();
    if (!$ownerRow) json_error('Customer account is not available.', 401);
    if ($actorType === 'owner') $payload['actorEmail'] = $ownerRow['email'] ?? null;

    if ($actorType === 'assistant') {
        $stmt = db()->prepare(
            'SELECT id, name, email, role, permissions FROM customer_users
             WHERE id = ? AND customer_id = ? AND is_active = 1'
        );
        $stmt->execute([$payload['actorId'] ?? '', $payload['id'] ?? '']);
        $assistant = $stmt->fetch();
        if (!$assistant) json_error('Assistant account is no longer active.', 401);
        $payload['actorName'] = $assistant['name'];
        $payload['actorEmail'] = $assistant['email'] ?? null;
        $payload['customerRole'] = $assistant['role'];
        $payload['permissions'] = $assistant['permissions'] !== null
            ? (json_decode((string)$assistant['permissions'], true) ?: [])
            : null;

        // Operator portal users are intentionally machine-card-only. Even a
        // legacy Operator account that previously had NULL (= full access)
        // is restricted here at request time so account-level tools such as
        // Store, Management Email and Role Manager can never be reached by
        // typing a URL manually. Role Manager may still choose which of the
        // machine-card actions below the Operator can use.
        if (strtolower(trim((string)$assistant['role'])) === 'operator') {
            $operatorCardPermissions = [
                'machine-expenses', 'fuel-usage', 'operator-reports',
                'service-request', 'report-problem', 'check-up', 'workflow',
            ];
            if ($payload['permissions'] === null) {
                $payload['permissions'] = $operatorCardPermissions;
            } else {
                $payload['permissions'] = array_values(array_intersect(
                    array_map('strval', (array)$payload['permissions']),
                    $operatorCardPermissions
                ));
            }
        }
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
    $hasAssignUsersPermission = $permissions === null || (is_array($permissions) && in_array('assign-users', $permissions, true));
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

// V192 — one synchronized communication layer for BELM <-> Customer events.
function belm_log_customer_communication(
    string $customerId,
    ?string $machineId,
    string $direction,
    string $channel,
    string $subject,
    string $message,
    ?string $relatedType = null,
    ?string $relatedId = null,
    ?string $createdByName = null,
    string $status = 'SENT'
): string {
    $id = uuid();
    try {
        db()->prepare(
            'INSERT INTO customer_communications
             (id, customer_id, machine_id, related_type, related_id, direction, channel,
              subject, message, status, created_by_name, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())'
        )->execute([
            $id,
            $customerId,
            $machineId ?: null,
            $relatedType ?: null,
            $relatedId ?: null,
            $direction,
            $channel,
            $subject,
            $message,
            $status,
            $createdByName ?: null,
        ]);
    } catch (Throwable $error) {
        // Communication audit must never block the operational transaction.
        error_log('BELM communication log failed: ' . $error->getMessage());
    }
    return $id;
}

function belm_customer_notification_recipients(string $customerId, array $roles = []): array {
    $wantedRoles = array_values(array_unique(array_filter(array_map(
        static fn($role): string => strtolower(trim((string)$role)),
        $roles
    ))));
    $recipients = [];

    $ownerStmt = db()->prepare('SELECT name, email FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
    $ownerStmt->execute([$customerId]);
    $owner = $ownerStmt->fetch();
    if ($owner) {
        $email = strtolower(trim((string)($owner['email'] ?? '')));
        if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $recipients[$email] = ['email' => $email, 'name' => (string)($owner['name'] ?? 'Customer'), 'role' => 'owner'];
        }
    }

    $sql = 'SELECT name, email, role FROM customer_users WHERE customer_id = ? AND is_active = 1';
    $params = [$customerId];
    if ($wantedRoles) {
        $placeholders = implode(',', array_fill(0, count($wantedRoles), '?'));
        $sql .= " AND LOWER(role) IN ($placeholders)";
        $params = array_merge($params, $wantedRoles);
    }
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    foreach ($stmt->fetchAll() as $row) {
        $email = strtolower(trim((string)($row['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) continue;
        $recipients[$email] = [
            'email' => $email,
            'name' => (string)($row['name'] ?? ''),
            'role' => strtolower((string)($row['role'] ?? 'assistant')),
        ];
    }
    return array_values($recipients);
}

function belm_send_customer_alert(
    string $customerId,
    ?string $machineId,
    array $roles,
    string $subject,
    string $body,
    ?string $relatedType = null,
    ?string $relatedId = null,
    ?string $createdByName = 'BELM',
    ?string $portalBody = null
): array {
    if (!function_exists('send_email')) require_once __DIR__ . '/mailer.php';
    $recipients = belm_customer_notification_recipients($customerId, $roles);
    $sent = 0;
    $failed = 0;
    $recipientEmails = [];
    foreach ($recipients as $recipient) {
        $email = (string)$recipient['email'];
        $delivery = 'SENT';
        try {
            send_email($email, $subject, $body);
            $sent++;
            $recipientEmails[] = $email;
        } catch (Throwable $error) {
            $delivery = 'FAILED';
            $failed++;
            error_log('BELM customer alert failed for ' . $email . ': ' . $error->getMessage());
        }
        try {
            db()->prepare(
                'INSERT INTO notification_logs (id, channel, recipient, subject, body, status, created_at)
                 VALUES (?,?,?,?,?,?,NOW())'
            )->execute([uuid(), 'EMAIL', $email, $subject, $body, $delivery]);
        } catch (Throwable $ignored) {}
    }

    $auditStatus = $failed === 0 && $sent > 0 ? 'SENT' : ($sent > 0 ? 'PARTIAL' : 'PORTAL_ONLY');
    belm_log_customer_communication(
        $customerId,
        $machineId,
        'BELM_TO_CUSTOMER',
        'EMAIL',
        $subject,
        $portalBody ?? $body,
        $relatedType,
        $relatedId,
        $createdByName,
        $auditStatus
    );
    return ['sent' => $sent, 'failed' => $failed, 'recipients' => $recipientEmails];
}

// V202 - create one live breakdown-process record from an Operator Problem Report.
// Kept in helpers so reports created from the customer portal and from the
// operator shift screen enter the same workflow automatically.
function belm_ensure_breakdown_case_from_operator_report(string $reportId, ?string $actorName = null, bool $strict = false): ?string {
    try {
        $stmt = db()->prepare(
            'SELECT o.id,o.customer_id,o.machine_id,o.message,o.operator_name,m.brand,m.model,m.machine_type
             FROM operator_reports o JOIN machines m ON m.id=o.machine_id WHERE o.id=?'
        );
        $stmt->execute([$reportId]);
        $row = $stmt->fetch();
        if (!$row) return null;
        $find = db()->prepare("SELECT id FROM breakdown_cases WHERE source_type='OPERATOR_REPORT' AND source_id=?");
        $find->execute([$reportId]);
        $existing = $find->fetchColumn();
        if ($existing) return (string)$existing;
        $id = uuid();
        $label = trim(($row['brand'] ?? '') . ' ' . ($row['model'] ?? '')) ?: ($row['machine_type'] ?? 'Machine');
        $creator = trim((string)($actorName ?: $row['operator_name'] ?: 'Operator'));
        db()->prepare(
            "INSERT INTO breakdown_cases
             (id,customer_id,machine_id,source_type,source_id,title,description,status,current_stage,current_department,stage_started_at,opened_at,updated_at,created_by_name)
             VALUES (?,?,?,?,?,?,?,'OPEN','WORKSHOP_REVIEW','Workshop',NOW(),NOW(),NOW(),?)"
        )->execute([$id,$row['customer_id'],$row['machine_id'],'OPERATOR_REPORT',$reportId,'Breakdown - '.$label,$row['message'],$creator]);
        db()->prepare(
            'INSERT INTO breakdown_case_events
             (id,case_id,stage,department,action,note,actor_type,actor_name,created_at)
             VALUES (?,?,?,?,?,?,?,?,NOW())'
        )->execute([uuid(),$id,'WORKSHOP_REVIEW','Workshop','Breakdown reported',$row['message'],'customer',$creator]);
        return $id;
    } catch (Throwable $error) {
        // Older deployments can briefly run before schema migration; never
        // block the original problem report because the workflow table is new.
        error_log('Breakdown case auto-create failed: ' . $error->getMessage());
        if ($strict) throw $error;
        return null;
    }
}


// V220 - official BELM Support Requests are part of the same operational
// breakdown queue. A request linked to a machine gets exactly one case;
// UNIQUE(source_type, source_id) prevents duplicate cases during refresh.
function belm_ensure_breakdown_case_from_service_request(string $requestId, ?string $actorName = null, bool $strict = false): ?string {
    try {
        $stmt = db()->prepare(
            'SELECT sr.id,sr.customer_id,sr.machine_id,sr.description,sr.service_type,sr.priority,sr.status,sr.created_at,
                    m.brand,m.model,m.machine_type,c.name AS customer_name
             FROM service_requests sr
             JOIN customers c ON c.id=sr.customer_id
             LEFT JOIN machines m ON m.id=sr.machine_id
             WHERE sr.id=?'
        );
        $stmt->execute([$requestId]);
        $row = $stmt->fetch();
        if (!$row || empty($row['machine_id']) || in_array((string)$row['status'], ['PENDING_CUSTOMER'], true)) return null;

        $find = db()->prepare("SELECT id FROM breakdown_cases WHERE source_type='SERVICE_REQUEST' AND source_id=?");
        $find->execute([$requestId]);
        $existing = $find->fetchColumn();
        if ($existing) return (string)$existing;

        // Do not create historical closed rows just because an old request
        // exists; only active official requests become a live breakdown case.
        if (in_array((string)$row['status'], ['COMPLETED','CANCELLED'], true)) return null;

        $id = uuid();
        $label = trim(($row['brand'] ?? '') . ' ' . ($row['model'] ?? '')) ?: ($row['machine_type'] ?? 'Machine');
        $creator = trim((string)($actorName ?: $row['customer_name'] ?: 'Customer'));
        $serviceType = trim((string)($row['service_type'] ?? ''));
        $title = ($serviceType !== '' ? $serviceType : 'BELM Support Request') . ' - ' . $label;
        $openedAt = $row['created_at'] ?: date('c');
        db()->prepare(
            "INSERT INTO breakdown_cases
             (id,customer_id,machine_id,source_type,source_id,title,description,status,current_stage,current_department,stage_started_at,opened_at,updated_at,created_by_name)
             VALUES (?,?,?,?,?,?,?,'OPEN','WORKSHOP_REVIEW','Workshop',?,?,NOW(),?)"
        )->execute([$id,$row['customer_id'],$row['machine_id'],'SERVICE_REQUEST',$requestId,$title,$row['description'],$openedAt,$openedAt,$creator]);
        db()->prepare(
            'INSERT INTO breakdown_case_events
             (id,case_id,stage,department,action,note,actor_type,actor_name,created_at)
             VALUES (?,?,?,?,?,?,?,?,?)'
        )->execute([uuid(),$id,'WORKSHOP_REVIEW','Workshop','Official BELM Support Request synced',$row['description'],'customer',$creator,$openedAt]);
        return $id;
    } catch (Throwable $error) {
        error_log('Service Request breakdown sync failed: ' . $error->getMessage());
        if ($strict) throw $error;
        return null;
    }
}

// V301 - an official machine Service Request IS the customer-issued Job Card.
// It is created once, with the customer/requesting user recorded as Issued By.
// BELM later assigns a Technician to this same Job Card instead of generating
// a duplicate card in Workshop. Safe to call repeatedly.
function belm_ensure_service_request_job_card(string $requestId, ?string $actorName = null, bool $strict = false): ?string {
    try {
        $stmt = db()->prepare(
            "SELECT sr.id,sr.customer_id,sr.machine_id,sr.service_type,sr.description,sr.created_at,
                    bc.id AS case_id,bc.created_by_name,c.name AS customer_name,c.address AS customer_address
             FROM service_requests sr
             JOIN customers c ON c.id=sr.customer_id
             JOIN breakdown_cases bc ON bc.source_type='SERVICE_REQUEST' AND bc.source_id=sr.id
             WHERE sr.id=? AND sr.machine_id IS NOT NULL"
        );
        $stmt->execute([$requestId]);
        $row = $stmt->fetch();
        if (!$row || empty($row['case_id'])) return null;

        $find = db()->prepare('SELECT id FROM digital_job_cards WHERE case_id=? ORDER BY created_at ASC LIMIT 1');
        $find->execute([(string)$row['case_id']]);
        $existing = $find->fetchColumn();
        $issuer = trim((string)($actorName ?: $row['created_by_name'] ?: $row['customer_name'] ?: 'Customer'));
        if ($existing) {
            // V331: the Service Request is the customer-issued Job Card. Keep
            // its machine-work instructions synchronized until the Technician
            // has actually started work. Once IN_PROGRESS, preserve the field
            // report exactly as the Technician received it.
            $requestTitle = trim((string)($row['service_type'] ?: 'BELM Service Request'));
            $requestInstructions = trim((string)($row['description'] ?? ''));
            db()->prepare(
                "UPDATE digital_job_cards
                 SET issued_by_name=COALESCE(NULLIF(issued_by_name,''),?),
                     issued_by_type=COALESCE(NULLIF(issued_by_type,''),'CUSTOMER'),
                     issued_at=COALESCE(issued_at,created_at),
                     title=CASE WHEN status IN ('OPEN','RECEIVED','ASSIGNED') THEN ? ELSE title END,
                     fault_description=CASE WHEN status IN ('OPEN','RECEIVED','ASSIGNED') THEN ? ELSE fault_description END,
                     job_location=COALESCE(NULLIF(TRIM(job_location),''),NULLIF(TRIM(?),'')),
                     updated_at=NOW()
                 WHERE id=?"
            )->execute([$issuer,$requestTitle,$requestInstructions,(string)($row['customer_address']??''),(string)$existing]);
            return (string)$existing;
        }

        $num='JC-'.date('ym').'-'.str_pad((string)db()->query("SELECT nextval('breakdown_job_card_seq')")->fetchColumn(),4,'0',STR_PAD_LEFT);
        $jobId=uuid();
        $title=trim((string)($row['service_type'] ?: 'BELM Service Request'));
        db()->prepare(
            "INSERT INTO digital_job_cards
             (id,case_id,customer_id,machine_id,job_card_no,title,fault_description,status,job_location,generated_by_name,
              issued_by_name,issued_by_type,issued_at,created_at,updated_at)
             VALUES (?,?,?,?,?,?,?,'RECEIVED',?,?,?,'CUSTOMER',?,NOW(),NOW())"
        )->execute([
            $jobId,(string)$row['case_id'],(string)$row['customer_id'],(string)$row['machine_id'],$num,
            $title,(string)$row['description'],trim((string)($row['customer_address']??''))?:null,$issuer,$issuer,$row['created_at'] ?: date('c')
        ]);
        db()->prepare(
            'INSERT INTO breakdown_case_events(id,case_id,stage,department,action,note,actor_type,actor_name,created_at)
             VALUES(?,?,?,?,?,?,?,?,NOW())'
        )->execute([uuid(),(string)$row['case_id'],'WORKSHOP_REVIEW','Workshop','Customer-issued Job Card '.$num,'Issued by '.$issuer,'customer',$issuer]);
        return $jobId;
    } catch (Throwable $error) {
        error_log('Service Request Job Card auto-create failed: ' . $error->getMessage());
        if ($strict) throw $error;
        return null;
    }
}

// Keep the source request and Breakdown Process aligned without overriding
// a more advanced Digital Job Card workflow. Assignment advances to an explicit
// Job Card Assigned stage; In Progress can advance it to Repair; final request
// states close the linked case. This routine is safe to call repeatedly.
function belm_sync_breakdown_case_from_service_request(string $requestId, ?string $actorName = null, bool $strict = false): ?string {
    $caseId = belm_ensure_breakdown_case_from_service_request($requestId, $actorName, $strict);
    $jobId = $caseId ? belm_ensure_service_request_job_card($requestId, $actorName, $strict) : null;
    try {
        $stmt = db()->prepare(
            "SELECT sr.status,sr.assigned_to_id,u.name AS assigned_to_name,bc.id AS case_id,bc.status AS case_status,bc.current_stage,bc.current_department,
                    EXISTS (SELECT 1 FROM digital_job_cards j WHERE j.case_id=bc.id) AS has_job_card,
                    (SELECT j.status FROM digital_job_cards j WHERE j.case_id=bc.id ORDER BY j.created_at ASC LIMIT 1) AS job_status,
                    (SELECT j.technician_id FROM digital_job_cards j WHERE j.case_id=bc.id ORDER BY j.created_at ASC LIMIT 1) AS job_technician_id,
                    (SELECT j.technician_name FROM digital_job_cards j WHERE j.case_id=bc.id ORDER BY j.created_at ASC LIMIT 1) AS job_technician_name
             FROM service_requests sr
             LEFT JOIN users u ON u.id=sr.assigned_to_id
             LEFT JOIN breakdown_cases bc ON bc.source_type='SERVICE_REQUEST' AND bc.source_id=sr.id
             WHERE sr.id=?"
        );
        $stmt->execute([$requestId]);
        $row = $stmt->fetch();
        if (!$row || empty($row['case_id'])) return $caseId;
        $caseId = (string)$row['case_id'];
        $status = strtoupper((string)$row['status']);
        $actor = trim((string)($actorName ?: 'System Sync'));
        $stage = (string)$row['current_stage'];
        $caseStatus = (string)$row['case_status'];
        $jobStatus = strtoupper((string)($row['job_status'] ?? ''));
        $jobTechnicianId = trim((string)($row['job_technician_id'] ?? ''));
        $jobTechnicianName = trim((string)($row['job_technician_name'] ?? ''));
        $sourceStatusBefore = $status;
        $sourceAssigneeBefore = trim((string)($row['assigned_to_id'] ?? ''));

        // V319: synchronization is monotonic. Once the Digital Job Card has
        // actually advanced, an older/stale Service Request must never drag the
        // maintenance case backwards to Assignment/Diagnosis. Repair the source
        // request forward from the operational Job Card first.
        if (!in_array($status, ['COMPLETED','CANCELLED'], true) && $jobTechnicianId !== '') {
            if (in_array($jobStatus, ['IN_PROGRESS','WAITING_FOR_PARTS','PENDING_APPROVAL','COMPLETED'], true) && in_array($status, ['OPEN','ASSIGNED'], true)) {
                db()->prepare(
                    "UPDATE service_requests SET assigned_to_id=?,status='IN_PROGRESS',started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE id=?"
                )->execute([$jobTechnicianId,$requestId]);
                $status = 'IN_PROGRESS';
                $row['assigned_to_id'] = $jobTechnicianId;
                $row['assigned_to_name'] = $jobTechnicianName ?: ($row['assigned_to_name'] ?? 'Technician');
            } elseif ($jobStatus === 'ASSIGNED' && $status === 'OPEN') {
                db()->prepare(
                    "UPDATE service_requests SET assigned_to_id=?,status='ASSIGNED',updated_at=NOW() WHERE id=?"
                )->execute([$jobTechnicianId,$requestId]);
                $status = 'ASSIGNED';
                $row['assigned_to_id'] = $jobTechnicianId;
                $row['assigned_to_name'] = $jobTechnicianName ?: ($row['assigned_to_name'] ?? 'Technician');
            } elseif (in_array($jobStatus, ['ASSIGNED','IN_PROGRESS','WAITING_FOR_PARTS','PENDING_APPROVAL','COMPLETED'], true)
                && (string)($row['assigned_to_id'] ?? '') !== $jobTechnicianId) {
                db()->prepare('UPDATE service_requests SET assigned_to_id=?,updated_at=NOW() WHERE id=?')
                    ->execute([$jobTechnicianId,$requestId]);
                $row['assigned_to_id'] = $jobTechnicianId;
                $row['assigned_to_name'] = $jobTechnicianName ?: ($row['assigned_to_name'] ?? 'Technician');
            }
        }

        // Repair legacy source-state contradictions before using the request
        // to drive the visible process. ASSIGNED always needs a Technician; an
        // OPEN request that already has one is effectively ASSIGNED.
        if ($status === 'OPEN' && !empty($row['assigned_to_id'])) {
            db()->prepare("UPDATE service_requests SET status='ASSIGNED',updated_at=NOW() WHERE id=?")
                ->execute([$requestId]);
            $status = 'ASSIGNED';
        } elseif ($status === 'ASSIGNED' && empty($row['assigned_to_id']) && $jobTechnicianId === '') {
            db()->prepare("UPDATE service_requests SET status='OPEN',updated_at=NOW() WHERE id=?")
                ->execute([$requestId]);
            $status = 'OPEN';
        }

        if ($sourceStatusBefore !== $status) {
            db()->prepare('INSERT INTO service_request_history(id,request_id,event_type,from_value,to_value,actor_id,actor_name,note,created_at) VALUES(?,?,?,?,?,?,?,?,NOW())')
                ->execute([uuid(),$requestId,'STATUS',$sourceStatusBefore,$status,null,$actor,'Recovered from Digital Job Card during synchronization']);
        }
        $sourceAssigneeAfter = trim((string)($row['assigned_to_id'] ?? ''));
        if ($sourceAssigneeBefore !== $sourceAssigneeAfter && $sourceAssigneeAfter !== '') {
            db()->prepare('INSERT INTO service_request_history(id,request_id,event_type,from_value,to_value,actor_id,actor_name,note,created_at) VALUES(?,?,?,?,?,?,?,?,NOW())')
                ->execute([uuid(),$requestId,'ASSIGNMENT',$sourceAssigneeBefore,$jobTechnicianName ?: $sourceAssigneeAfter,null,$actor,'Recovered from Digital Job Card during synchronization']);
        }

        // Keep the customer-issued Job Card and BELM Service Request assignment
        // synchronized. This makes one operational record from request to repair.
        if ($jobId && !empty($row['assigned_to_id'])) {
            // Keep the Job Card operational status aligned with the source
            // request. Starting a Service Request must not leave its Job Card
            // visually stuck at ASSIGNED while the process is already REPAIR.
            db()->prepare(
                "UPDATE digital_job_cards
                 SET technician_id=?,technician_name=?,
                     status=CASE
                         WHEN ?='IN_PROGRESS' AND status IN ('OPEN','RECEIVED','ASSIGNED') THEN 'IN_PROGRESS'
                         WHEN ?='ASSIGNED' AND status IN ('OPEN','RECEIVED') THEN 'ASSIGNED'
                         ELSE status
                     END,
                     started_at=CASE WHEN ?='IN_PROGRESS' THEN COALESCE(started_at,NOW()) ELSE started_at END,
                     updated_at=NOW()
                 WHERE id=? AND status NOT IN ('COMPLETED','CANCELLED')"
            )->execute([
                (string)$row['assigned_to_id'],(string)($row['assigned_to_name'] ?: 'Technician'),
                $status,$status,$status,$jobId
            ]);
        } elseif ($jobId && empty($row['assigned_to_id'])) {
            db()->prepare(
                "UPDATE digital_job_cards SET technician_id=NULL,technician_name=NULL,status='RECEIVED',updated_at=NOW() WHERE id=? AND status IN ('OPEN','RECEIVED','ASSIGNED')"
            )->execute([$jobId]);
        }

        $newStage = null; $department = null; $action = null; $blocker = null; $close = false;
        if ($jobStatus === 'PENDING_APPROVAL' && $caseStatus !== 'COMPLETED'
            && in_array($stage,['WORKSHOP_REVIEW','TECHNICIAN_ASSIGNMENT','JOB_CARD_ASSIGNED','DIAGNOSIS','REPAIR','TESTING'],true)) {
            $newStage='PENDING_APPROVAL'; $department='Administration / Engineering'; $action='Technician completed work - waiting Job Card approval';
        } elseif ($jobStatus === 'COMPLETED' && $caseStatus !== 'COMPLETED'
            && in_array($stage,['WORKSHOP_REVIEW','TECHNICIAN_ASSIGNMENT','JOB_CARD_ASSIGNED','DIAGNOSIS','REPAIR','TESTING','PENDING_APPROVAL'],true)) {
            // Legacy/recovered completed Job Cards may still need the case closure step.
            $newStage='COMPLETED'; $department='Completed'; $action='Approved Job Card synchronized - case closed'; $close=true;
        } elseif ($status === 'OPEN' && $caseStatus !== 'COMPLETED' && empty($row['assigned_to_id'])
            && in_array($stage,['WORKSHOP_REVIEW','TECHNICIAN_ASSIGNMENT','JOB_CARD_ASSIGNED'],true)) {
            $newStage='TECHNICIAN_ASSIGNMENT'; $department='Workshop / Dispatch';
            $blocker='Awaiting Technician Assignment'; $action='Service Request waiting Technician assignment';
        } elseif ($status === 'ASSIGNED' && $caseStatus !== 'COMPLETED' && !empty($row['assigned_to_id']) && in_array($stage,['WORKSHOP_REVIEW','TECHNICIAN_ASSIGNMENT'],true)) {
            $newStage='JOB_CARD_ASSIGNED'; $department='Technician'; $action='Service Request assigned - Job Card waiting Technician start';
        } elseif ($status === 'IN_PROGRESS' && $caseStatus !== 'COMPLETED' && (!empty($row['assigned_to_id']) || $jobTechnicianId !== '') && in_array($stage,['WORKSHOP_REVIEW','TECHNICIAN_ASSIGNMENT','JOB_CARD_ASSIGNED','DIAGNOSIS'],true)) {
            $newStage='REPAIR'; $department='Technician'; $action='Service Request in progress';
        } elseif ($status === 'ON_HOLD' && $caseStatus !== 'COMPLETED') {
            $blocker='Service Request is ON HOLD'; $action='Service Request placed on hold';
        } elseif (in_array($status,['COMPLETED','CANCELLED'],true) && $caseStatus !== 'COMPLETED') {
            $newStage='COMPLETED'; $department='Completed'; $close=true;
            $blocker=$status==='CANCELLED' ? 'Official BELM Support Request cancelled.' : null;
            $action=$status==='CANCELLED' ? 'Service Request cancelled - case closed' : 'Service Request completed - case closed';
        }

        if ($newStage !== null) {
            db()->prepare(
                'UPDATE breakdown_cases SET current_stage=?,current_department=?,blocker_reason=?,stage_started_at=NOW(),status=?,updated_at=NOW(),closed_at=CASE WHEN ? THEN COALESCE(closed_at,NOW()) ELSE closed_at END WHERE id=?'
            )->execute([$newStage,$department,$blocker,$close?'COMPLETED':'OPEN',$close?1:0,$caseId]);
        } elseif ($blocker !== null) {
            db()->prepare('UPDATE breakdown_cases SET blocker_reason=?,updated_at=NOW() WHERE id=?')->execute([$blocker,$caseId]);
        }
        // A cancelled official request must not remain as an active Technician Job Card.
        // Keep completed technical reports intact, but close any unfinished linked Job Card.
        if ($jobId && $status === 'CANCELLED') {
            db()->prepare(
                "UPDATE digital_job_cards
                 SET status=CASE WHEN status='COMPLETED' THEN status ELSE 'CANCELLED' END,
                     technician_id=CASE WHEN status='COMPLETED' THEN technician_id ELSE NULL END,
                     technician_name=CASE WHEN status='COMPLETED' THEN technician_name ELSE NULL END,
                     updated_at=NOW()
                 WHERE id=?"
            )->execute([$jobId]);
        }

        if ($action !== null) {
            $eventStage = $newStage ?: $stage;
            $eventDepartment = $department ?: (string)$row['current_department'];
            $dup = db()->prepare('SELECT 1 FROM breakdown_case_events WHERE case_id=? AND action=? ORDER BY created_at DESC LIMIT 1');
            $dup->execute([$caseId,$action]);
            if (!$dup->fetchColumn()) {
                db()->prepare(
                    'INSERT INTO breakdown_case_events(id,case_id,stage,department,action,note,actor_type,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,NOW())'
                )->execute([uuid(),$caseId,$eventStage,$eventDepartment,$action,$blocker,'system',$actor]);
            }
        }
        return $caseId;
    } catch (Throwable $error) {
        error_log('Service Request case state sync failed: ' . $error->getMessage());
        if ($strict) throw $error;
        return $caseId;
    }
}

// Backfill/synchronize current operational sources. This is intentionally
// idempotent so every Breakdown Process load can repair an interrupted sync
// (for example, an older deployment created the request before V220).
function belm_sync_breakdown_sources(?string $customerId = null): array {
    $createdBefore = 0;
    $createdAfter = 0;
    $syncedRequests = 0;
    $syncedReports = 0;
    $failedSources = 0;
    $inconsistencies = 0;
    $errorMessage = null;
    try {
        $countSql = 'SELECT COUNT(*) FROM breakdown_cases';
        if ($customerId !== null && $customerId !== '') {
            $c = db()->prepare($countSql . ' WHERE customer_id=?');
            $c->execute([$customerId]);
            $createdBefore=(int)$c->fetchColumn();
        } else {
            $createdBefore=(int)db()->query($countSql)->fetchColumn();
        }

        $sql = "SELECT o.id,o.status FROM operator_reports o
                WHERE (o.status='OPEN' OR EXISTS (
                    SELECT 1 FROM breakdown_cases bc
                    WHERE bc.source_type='OPERATOR_REPORT' AND bc.source_id=o.id AND bc.status<>'COMPLETED'
                ))";
        $params=[];
        if ($customerId !== null && $customerId !== '') {
            $sql.=' AND o.customer_id=?';
            $params[]=$customerId;
        }
        $q=db()->prepare($sql);
        $q->execute($params);
        foreach ($q->fetchAll() as $r) {
            try {
                $caseId=belm_ensure_breakdown_case_from_operator_report((string)$r['id'],'System Sync',true);
                if (!$caseId) {
                    $failedSources++;
                    error_log('Operator Report sync did not produce a breakdown case: '.(string)$r['id']);
                    continue;
                }
                $syncedReports++;
                if (strtoupper((string)$r['status'])!=='OPEN') {
                    $close=db()->prepare("UPDATE breakdown_cases
                        SET status='COMPLETED',current_stage='COMPLETED',current_department='Completed',blocker_reason=NULL,
                            closed_at=COALESCE(closed_at,NOW()),updated_at=NOW()
                        WHERE id=? AND status<>'COMPLETED'");
                    $close->execute([$caseId]);
                    if ($close->rowCount() > 0) {
                        db()->prepare(
                            'INSERT INTO breakdown_case_events(id,case_id,stage,department,action,note,actor_type,actor_name,created_at)
                             VALUES(?,?,?,?,?,?,?,?,NOW())'
                        )->execute([uuid(),$caseId,'COMPLETED','Completed','Operator report resolved - case synchronized',null,'system','System Sync']);
                    }
                }
            } catch (Throwable $sourceError) {
                $failedSources++;
                error_log('Operator Report source sync failed for '.(string)$r['id'].': '.$sourceError->getMessage());
            }
        }

        $sql = "SELECT sr.id FROM service_requests sr
                WHERE sr.machine_id IS NOT NULL AND sr.status<>'PENDING_CUSTOMER'
                  AND (sr.status NOT IN ('COMPLETED','CANCELLED') OR EXISTS (
                    SELECT 1 FROM breakdown_cases bc
                    WHERE bc.source_type='SERVICE_REQUEST' AND bc.source_id=sr.id AND bc.status<>'COMPLETED'
                  ))";
        $params=[];
        if ($customerId !== null && $customerId !== '') {
            $sql.=' AND sr.customer_id=?';
            $params[]=$customerId;
        }
        $q=db()->prepare($sql);
        $q->execute($params);
        foreach ($q->fetchAll() as $r) {
            try {
                if (belm_sync_breakdown_case_from_service_request((string)$r['id'],'System Sync',true)) {
                    $syncedRequests++;
                } else {
                    $failedSources++;
                    error_log('Service Request sync did not produce a breakdown case: '.(string)$r['id']);
                }
            } catch (Throwable $sourceError) {
                $failedSources++;
                error_log('Service Request source sync failed for '.(string)$r['id'].': '.$sourceError->getMessage());
            }
        }

        // V319: verify the key cross-table invariants after reconciliation.
        // These checks make Sync / Refresh honest: a partial repair is reported
        // as a warning instead of displaying a green-looking "Synced" message.
        $healthSql = "SELECT
                COUNT(*) FILTER (WHERE sr.status IN ('OPEN','ASSIGNED','IN_PROGRESS','ON_HOLD')
                    AND (bc.id IS NULL OR j.id IS NULL)) AS missing_links,
                COUNT(*) FILTER (WHERE sr.status IN ('ASSIGNED','IN_PROGRESS') AND sr.assigned_to_id IS NOT NULL
                    AND (j.technician_id IS DISTINCT FROM sr.assigned_to_id)) AS assignment_mismatches,
                COUNT(*) FILTER (WHERE sr.status='IN_PROGRESS'
                    AND UPPER(COALESCE(j.status,'')) NOT IN ('IN_PROGRESS','COMPLETED')) AS progress_mismatches,
                COUNT(*) FILTER (WHERE sr.status IN ('COMPLETED','CANCELLED') AND bc.id IS NOT NULL
                    AND UPPER(COALESCE(bc.status,''))<>'COMPLETED') AS closure_mismatches,
                COUNT(*) FILTER (WHERE sr.status='COMPLETED' AND j.id IS NOT NULL
                    AND UPPER(COALESCE(j.status,''))<>'COMPLETED') AS completed_job_mismatches
            FROM service_requests sr
            LEFT JOIN LATERAL (
                SELECT b.id,b.status FROM breakdown_cases b
                WHERE b.source_type='SERVICE_REQUEST' AND b.source_id=sr.id
                ORDER BY b.opened_at ASC LIMIT 1
            ) bc ON TRUE
            LEFT JOIN LATERAL (
                SELECT dj.id,dj.status,dj.technician_id FROM digital_job_cards dj
                WHERE dj.case_id=bc.id ORDER BY dj.created_at ASC LIMIT 1
            ) j ON TRUE
            WHERE sr.machine_id IS NOT NULL AND sr.status<>'PENDING_CUSTOMER'";
        $healthParams=[];
        if ($customerId !== null && $customerId !== '') {
            $healthSql.=' AND sr.customer_id=?';
            $healthParams[]=$customerId;
        }
        $healthStmt=db()->prepare($healthSql);
        $healthStmt->execute($healthParams);
        $health=$healthStmt->fetch() ?: [];
        $inconsistencies=(int)($health['missing_links'] ?? 0)
            +(int)($health['assignment_mismatches'] ?? 0)
            +(int)($health['progress_mismatches'] ?? 0)
            +(int)($health['closure_mismatches'] ?? 0)
            +(int)($health['completed_job_mismatches'] ?? 0);

        if ($customerId !== null && $customerId !== '') {
            $c = db()->prepare($countSql . ' WHERE customer_id=?');
            $c->execute([$customerId]);
            $createdAfter=(int)$c->fetchColumn();
        } else {
            $createdAfter=(int)db()->query($countSql)->fetchColumn();
        }
    } catch (Throwable $error) {
        $failedSources++;
        $errorMessage = 'Synchronization query failed before all sources could be checked.';
        error_log('Breakdown source backfill failed: ' . $error->getMessage());
    }

    if ($errorMessage === null && ($failedSources > 0 || $inconsistencies > 0)) {
        $errorMessage = 'Synchronization completed with unresolved source consistency issues.';
    }
    return [
        'created'=>max(0,$createdAfter-$createdBefore),
        'serviceRequests'=>$syncedRequests,
        'operatorReports'=>$syncedReports,
        'failedSources'=>$failedSources,
        'inconsistencies'=>$inconsistencies,
        'error'=>$errorMessage,
    ];
}

// V306: derive one authoritative Job Card billing status from the currently
// active billing documents. Invoice state always wins over Proforma state;
// when neither exists, the signed Job Card determines readiness.
function belm_recompute_job_billing_status(string $jobId): string {
    $jobId = trim($jobId);
    if ($jobId === '') return '';

    $invoice = db()->prepare(
        "SELECT status FROM invoices
         WHERE source_job_card_id=? AND deleted_at IS NULL AND status<>'CANCELLED'
         ORDER BY created_at DESC LIMIT 1"
    );
    $invoice->execute([$jobId]);
    $invoiceStatus = $invoice->fetchColumn();
    if ($invoiceStatus !== false) {
        $status = strtoupper((string)$invoiceStatus) === 'PAID' ? 'PAID' : 'INVOICE_OUTSTANDING';
        db()->prepare('UPDATE digital_job_cards SET billing_status=?,updated_at=NOW() WHERE id=?')
            ->execute([$status, $jobId]);
        return $status;
    }

    $proforma = db()->prepare(
        'SELECT delivery_status FROM proforma_invoices
         WHERE source_job_card_id=? AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 1'
    );
    $proforma->execute([$jobId]);
    $delivery = $proforma->fetchColumn();
    if ($delivery !== false) {
        $deliveryStatus = strtoupper((string)$delivery);
        $status = in_array($deliveryStatus, ['SENT','RESPONDED'], true) ? 'PROFORMA_SENT' : 'PROFORMA_READY';
        db()->prepare('UPDATE digital_job_cards SET billing_status=?,updated_at=NOW() WHERE id=?')
            ->execute([$status, $jobId]);
        return $status;
    }

    $job = db()->prepare('SELECT signed_copy_data,technician_id,status FROM digital_job_cards WHERE id=?');
    $job->execute([$jobId]);
    $jobRow = $job->fetch();
    $signed = $jobRow['signed_copy_data'] ?? null;
    $assigned = !empty($jobRow['technician_id']) || in_array(strtoupper((string)($jobRow['status'] ?? '')), ['ASSIGNED','IN_PROGRESS','WAITING_PARTS','TESTING','COMPLETED'], true);
    $status = $signed ? 'READY_FOR_PROCUREMENT' : ($assigned ? 'PROFORMA_PENDING' : 'NOT_READY');
    db()->prepare('UPDATE digital_job_cards SET billing_status=?,updated_at=NOW() WHERE id=?')
        ->execute([$status, $jobId]);
    return $status;
}
