<?php
// Render supplies DATABASE_URL automatically from render.yaml. Local
// development can instead use DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASS.
$jwtSecret = getenv('JWT_SECRET') ?: '';
if ($jwtSecret === '') {
    if ((getenv('APP_ENV') ?: '') === 'production') {
        throw new RuntimeException('JWT_SECRET is required in production.');
    }
    $jwtSecret = 'local-development-only-change-me';
}
define('JWT_SECRET', $jwtSecret);

function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $databaseUrl = getenv('DATABASE_URL') ?: '';
    if ($databaseUrl !== '') {
        $parts = parse_url($databaseUrl);
        if ($parts === false || !isset($parts['host'], $parts['path'], $parts['user'])) {
            throw new RuntimeException('DATABASE_URL is invalid.');
        }

        $query = [];
        parse_str($parts['query'] ?? '', $query);
        $sslMode = $query['sslmode'] ?? (getenv('DB_SSLMODE') ?: 'prefer');
        $allowedSslModes = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'];
        if (!in_array($sslMode, $allowedSslModes, true)) $sslMode = 'prefer';

        $dsn = sprintf(
            'pgsql:host=%s;port=%d;dbname=%s;sslmode=%s',
            $parts['host'],
            $parts['port'] ?? 5432,
            ltrim($parts['path'], '/'),
            $sslMode
        );
        $username = rawurldecode($parts['user']);
        $password = rawurldecode($parts['pass'] ?? '');
    } else {
        $dsn = sprintf(
            'pgsql:host=%s;port=%d;dbname=%s;sslmode=%s',
            getenv('DB_HOST') ?: '127.0.0.1',
            (int)(getenv('DB_PORT') ?: 5432),
            getenv('DB_NAME') ?: 'belm_portal',
            getenv('DB_SSLMODE') ?: 'prefer'
        );
        $username = getenv('DB_USER') ?: 'postgres';
        $password = getenv('DB_PASS') ?: '';
    }

    $pdo = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}
