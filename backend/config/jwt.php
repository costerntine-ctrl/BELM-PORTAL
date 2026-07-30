<?php
// Minimal, dependency-free JWT (HS256) — no composer install needed, which
// matters since some basic cPanel hosting doesn't give SSH/composer access.

function base64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
function base64url_decode(string $data): string {
    return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
}

function jwt_encode(array $payload, int $expiresInSeconds = 7 * 24 * 3600): string {
    $header = ['typ' => 'JWT', 'alg' => 'HS256'];
    $payload['iat'] = time();
    $payload['exp'] = time() + $expiresInSeconds;
    $segments = [
        base64url_encode(json_encode($header)),
        base64url_encode(json_encode($payload)),
    ];
    $signingInput = implode('.', $segments);
    $signature = hash_hmac('sha256', $signingInput, JWT_SECRET, true);
    $segments[] = base64url_encode($signature);
    return implode('.', $segments);
}

// Returns the decoded payload array, or null if invalid/expired.
function jwt_decode(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$headerB64, $payloadB64, $sigB64] = $parts;

    $expectedSig = base64url_encode(hash_hmac('sha256', "$headerB64.$payloadB64", JWT_SECRET, true));
    if (!hash_equals($expectedSig, $sigB64)) return null;

    $payload = json_decode(base64url_decode($payloadB64), true);
    if (!$payload || ($payload['exp'] ?? 0) < time()) return null;

    return $payload;
}

// Reads "Authorization: Bearer <token>" and returns the decoded payload,
// or null if missing/invalid.
function current_token_payload(): ?array {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    if ($auth === '') {
        // Some Apache/PHP setups (mod_cgi, some reverse proxies) don't expose
        // the Authorization header via getallheaders(). Fall back to the
        // $_SERVER keys those setups use instead, so a valid token is never
        // mistaken for a missing one right after a real login.
        $auth = $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? '';
    }
    if (!str_starts_with($auth, 'Bearer ')) return null;
    return jwt_decode(substr($auth, 7));
}
