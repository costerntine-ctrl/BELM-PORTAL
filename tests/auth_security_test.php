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
$_SERVER['QUERY_STRING'] = '';
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

$queryToken = issue_download_token($auth, '/api/reports/123/download?format=pdf&scope=mine');
$_SERVER['REQUEST_URI'] = '/api/reports/123/download?scope=mine&format=pdf';
$_SERVER['QUERY_STRING'] = 'scope=mine&format=pdf&download_token=' . rawurlencode($queryToken);
$_GET = ['download_token' => $queryToken, 'scope' => 'mine', 'format' => 'pdf'];
expect_true(current_token_payload() !== null, 'download token should accept the same normalized query');

$_SERVER['QUERY_STRING'] = 'scope=all&format=pdf&download_token=' . rawurlencode($queryToken);
$_GET['scope'] = 'all';
expect_true(current_token_payload() === null, 'download token must reject changed query scope');

$_GET = [];
$_SERVER['QUERY_STRING'] = '';
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
