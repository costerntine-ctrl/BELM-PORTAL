<?php
declare(strict_types=1);

define('JWT_SECRET', 'test-secret-that-is-long-enough-for-ci-only');
require_once __DIR__ . '/../backend/config/jwt.php';

function expect_true(bool $condition, string $message): void {
    if (!$condition) {
        fwrite(STDERR, "FAIL: $message\n");
        exit(1);
    }
}

$auth = ['type' => 'staff', 'id' => 'user-1', 'roleName' => 'Super Admin', 'sv' => 1];
$sessionToken = jwt_encode($auth, 60);

$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['REQUEST_URI'] = '/api/reports/123/download';
$_SERVER['HTTP_AUTHORIZATION'] = '';
$_COOKIE = [];
$_GET = ['token' => $sessionToken];
expect_true(current_token_payload() === null, 'ordinary JWTs must be ignored in query strings');

$downloadToken = issue_download_token($auth, '/api/reports/123/download');
$_GET = ['download_token' => $downloadToken];
$downloadPayload = current_token_payload();
expect_true(($downloadPayload['id'] ?? null) === 'user-1', 'scoped download token should authenticate its exact path');

$_SERVER['REQUEST_URI'] = '/api/reports/456/download';
expect_true(current_token_payload() === null, 'download token must not work for another resource path');

$_GET = [];
$_SERVER['REQUEST_URI'] = '/api/reports/123/download';
$_COOKIE = [BELM_SESSION_COOKIE => $sessionToken];
expect_true((current_token_payload()['id'] ?? null) === 'user-1', 'HttpOnly cookie token should authenticate API requests');

$_COOKIE = [BELM_SESSION_COOKIE => $sessionToken . 'tampered'];
expect_true(current_token_payload() === null, 'tampered session token must fail');

$shortToken = issue_auth_session($auth, 30 * 24 * 3600);
$shortPayload = jwt_decode($shortToken);
expect_true(
    isset($shortPayload['iat'], $shortPayload['exp'])
    && $shortPayload['exp'] - $shortPayload['iat'] <= BELM_ACCESS_TOKEN_TTL,
    'compatibility bearer token must be capped at 15 minutes'
);

fwrite(STDOUT, "Authentication security checks passed.\n");
