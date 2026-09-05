<?php
// Dependency-free JWT/session support for hosts without Composer.
// Browser sessions use an HttpOnly cookie. A short-lived bearer token is still
// returned during the migration window so existing BELM screens keep working.

const BELM_ACCESS_TOKEN_TTL = 15 * 60;
const BELM_SESSION_COOKIE_TTL = 8 * 60 * 60;
const BELM_DOWNLOAD_TOKEN_TTL = 2 * 60;
const BELM_SESSION_COOKIE = 'belm_session';

function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64url_decode(string $data): string {
    $decoded = base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4), true);
    return $decoded === false ? '' : $decoded;
}

function jwt_encode(array $payload, int $expiresInSeconds = BELM_ACCESS_TOKEN_TTL): string {
    $header = ['typ' => 'JWT', 'alg' => 'HS256'];
    $now = time();
    $payload['iat'] = $now;
    $payload['exp'] = $now + max(1, $expiresInSeconds);
    $segments = [
        base64url_encode((string)json_encode($header, JSON_UNESCAPED_SLASHES)),
        base64url_encode((string)json_encode($payload, JSON_UNESCAPED_SLASHES)),
    ];
    $signingInput = implode('.', $segments);
    $segments[] = base64url_encode(hash_hmac('sha256', $signingInput, JWT_SECRET, true));
    return implode('.', $segments);
}

// Returns the decoded payload array, or null if malformed, invalid, or expired.
function jwt_decode(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$headerB64, $payloadB64, $sigB64] = $parts;

    $header = json_decode(base64url_decode($headerB64), true);
    if (!is_array($header) || ($header['alg'] ?? '') !== 'HS256' || ($header['typ'] ?? '') !== 'JWT') return null;

    $expectedSig = base64url_encode(hash_hmac('sha256', "$headerB64.$payloadB64", JWT_SECRET, true));
    if (!hash_equals($expectedSig, $sigB64)) return null;

    $payload = json_decode(base64url_decode($payloadB64), true);
    if (!is_array($payload) || !isset($payload['exp']) || (int)$payload['exp'] < time()) return null;
    if (isset($payload['iat']) && (int)$payload['iat'] > time() + 60) return null;
    return $payload;
}

function auth_session_payload(array $payload): array {
    if (function_exists('auth_session_version_for_payload')) {
        $payload['sv'] = auth_session_version_for_payload($payload);
    }
    unset($payload['purpose'], $payload['path'], $payload['auth']);
    return $payload;
}

function request_is_https(): bool {
    if (strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https') return true;
    return !empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off';
}

// Sets the durable browser session and returns only a short-lived compatibility
// bearer token. Existing clients can migrate incrementally without retaining a
// 30-day credential in localStorage.
function issue_auth_session(array $payload, int $ignoredLegacyTtl = BELM_SESSION_COOKIE_TTL): string {
    $payload = auth_session_payload($payload);
    $cookieToken = jwt_encode($payload, BELM_SESSION_COOKIE_TTL);
    setcookie(BELM_SESSION_COOKIE, $cookieToken, [
        'expires' => time() + BELM_SESSION_COOKIE_TTL,
        'path' => '/api',
        'secure' => request_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    return jwt_encode($payload, BELM_ACCESS_TOKEN_TTL);
}

function clear_auth_session_cookie(): void {
    setcookie(BELM_SESSION_COOKIE, '', [
        'expires' => time() - 3600,
        'path' => '/api',
        'secure' => request_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function auth_payload_session_is_current(array $payload): bool {
    if (function_exists('auth_session_is_current')) {
        return auth_session_is_current($payload);
    }
    return true;
}

function cookie_request_origin_is_allowed(): bool {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) return true;

    $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    $fetchSite = strtolower(trim((string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '')));
    if ($origin === '') return !in_array($fetchSite, ['cross-site'], true);

    $allowed = array_filter(array_map('trim', explode(',', (string)(getenv('ALLOWED_ORIGINS') ?: ''))));
    if (!empty($_SERVER['HTTP_HOST'])) {
        $scheme = request_is_https() ? 'https' : 'http';
        $allowed[] = $scheme . '://' . $_SERVER['HTTP_HOST'];
    }
    return in_array(rtrim($origin, '/'), array_map(static fn($v) => rtrim($v, '/'), array_unique($allowed)), true);
}

function current_request_path(): string {
    $path = parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
    return is_string($path) ? $path : '';
}

function download_auth_claims(array $payload): array {
    $keys = [
        'type', 'id', 'roleId', 'roleName', 'allowedPages', 'assignedCustomerId',
        'assignedCustomerPortalLink', 'isCustomerManaged', 'actorType', 'actorId',
        'customerRole', 'permissions', 'customerId', 'machineId', 'sv',
    ];
    return array_intersect_key($payload, array_flip($keys));
}

function normalized_download_query(string $query): string {
    $params = [];
    parse_str($query, $params);
    unset($params['token'], $params['download_token']);
    ksort($params);
    return http_build_query($params, '', '&', PHP_QUERY_RFC3986);
}

function issue_download_token(array $payload, string $target, int $ttl = BELM_DOWNLOAD_TOKEN_TTL): string {
    $path = (string)(parse_url($target, PHP_URL_PATH) ?: '');
    if (!str_starts_with($path, '/api/')) throw new InvalidArgumentException('Download path must be an API path.');
    return jwt_encode([
        'purpose' => 'download',
        'path' => $path,
        'query' => normalized_download_query((string)(parse_url($target, PHP_URL_QUERY) ?: '')),
        'method' => 'GET',
        'auth' => download_auth_claims($payload),
        'nonce' => base64url_encode(random_bytes(12)),
    ], min(max(1, $ttl), BELM_DOWNLOAD_TOKEN_TTL));
}

function validated_download_payload(array $payload): ?array {
    if (($payload['purpose'] ?? '') !== 'download') return null;
    if (($payload['method'] ?? '') !== 'GET' || strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') return null;
    if (!hash_equals((string)($payload['path'] ?? ''), current_request_path())) return null;
    $requestQuery = normalized_download_query((string)($_SERVER['QUERY_STRING'] ?? ''));
    if (!hash_equals((string)($payload['query'] ?? ''), $requestQuery)) return null;
    $auth = $payload['auth'] ?? null;
    return is_array($auth) && auth_payload_session_is_current($auth) ? $auth : null;
}

// Accepts a compatibility bearer token or the HttpOnly browser-session cookie.
// Query-string authentication is restricted to purpose-bound download_token
// credentials; ordinary session JWTs in ?token= are deliberately ignored.
function current_token_payload(): ?array {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    if (isset($_SERVER['HTTP_AUTHORIZATION']) && !isset($headers['Authorization'])) {
        $headers['Authorization'] = $_SERVER['HTTP_AUTHORIZATION'];
    }
    $authHeader = (string)($headers['Authorization'] ?? $headers['authorization'] ?? '');
    if (str_starts_with($authHeader, 'Bearer ')) {
        $payload = jwt_decode(substr($authHeader, 7));
        if ($payload) {
            $validated = isset($payload['purpose']) ? validated_download_payload($payload) : $payload;
            if ($validated && auth_payload_session_is_current($validated)) return $validated;
        }
    }

    $cookieToken = trim((string)($_COOKIE[BELM_SESSION_COOKIE] ?? ''));
    if ($cookieToken !== '' && cookie_request_origin_is_allowed()) {
        $payload = jwt_decode($cookieToken);
        if ($payload && !isset($payload['purpose']) && auth_payload_session_is_current($payload)) return $payload;
    }

    $downloadToken = trim((string)($_GET['download_token'] ?? ''));
    if ($downloadToken !== '') {
        $payload = jwt_decode($downloadToken);
        if ($payload) return validated_download_payload($payload);
    }
    return null;
}
