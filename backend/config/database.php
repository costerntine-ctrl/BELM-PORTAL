<?php
declare(strict_types=1);

// Render supplies DATABASE_URL automatically from render.yaml. Local
// development can instead use DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASS.
$jwtSecret = trim((string)(getenv('JWT_SECRET') ?: ''));
if ($jwtSecret === '') {
    if ((getenv('APP_ENV') ?: '') === 'production') {
        throw new RuntimeException('JWT_SECRET is required in production.');
    }
    $jwtSecret = 'local-development-only-change-me';
}
define('JWT_SECRET', $jwtSecret);

/**
 * Return non-secret database configuration facts for the health endpoint.
 */
function database_environment_summary(): array
{
    $drivers = PDO::getAvailableDrivers();

    return [
        'databaseUrlConfigured' => trim((string)(getenv('DATABASE_URL') ?: '')) !== '',
        'pgsqlDriverAvailable' => in_array('pgsql', $drivers, true),
        'pdoDrivers' => array_values($drivers),
    ];
}

/**
 * Create one shared PostgreSQL PDO connection.
 */
function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    if (!in_array('pgsql', PDO::getAvailableDrivers(), true)) {
        throw new RuntimeException(
            'PDO PostgreSQL driver is unavailable. Install/enable pdo_pgsql.'
        );
    }

    $databaseUrl = trim((string)(getenv('DATABASE_URL') ?: ''));
    if ($databaseUrl !== '') {
        $parts = parse_url($databaseUrl);
        if ($parts === false) {
            throw new RuntimeException(
                'DATABASE_URL is invalid. Expected a postgresql:// connection URL.'
            );
        }
        $scheme = strtolower((string)($parts['scheme'] ?? ''));
        if (
            !in_array($scheme, ['postgres', 'postgresql'], true)
            || empty($parts['host'])
            || empty($parts['path'])
            || !array_key_exists('user', $parts)
        ) {
            throw new RuntimeException(
                'DATABASE_URL is invalid. Expected a postgresql:// connection URL.'
            );
        }

        $query = [];
        parse_str((string)($parts['query'] ?? ''), $query);
        $sslMode = strtolower((string)($query['sslmode'] ?? (getenv('DB_SSLMODE') ?: 'prefer')));
        $allowedSslModes = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'];
        if (!in_array($sslMode, $allowedSslModes, true)) {
            $sslMode = 'prefer';
        }

        $databaseName = rawurldecode(ltrim((string)$parts['path'], '/'));
        if ($databaseName === '') {
            throw new RuntimeException('DATABASE_URL does not contain a database name.');
        }

        $dsn = sprintf(
            'pgsql:host=%s;port=%d;dbname=%s;sslmode=%s;connect_timeout=10',
            (string)$parts['host'],
            (int)($parts['port'] ?? 5432),
            $databaseName,
            $sslMode
        );
        $username = rawurldecode((string)($parts['user'] ?? ''));
        $password = rawurldecode((string)($parts['pass'] ?? ''));
    } else {
        $sslMode = strtolower((string)(getenv('DB_SSLMODE') ?: 'prefer'));
        $allowedSslModes = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'];
        if (!in_array($sslMode, $allowedSslModes, true)) {
            $sslMode = 'prefer';
        }

        $dsn = sprintf(
            'pgsql:host=%s;port=%d;dbname=%s;sslmode=%s;connect_timeout=10',
            getenv('DB_HOST') ?: '127.0.0.1',
            (int)(getenv('DB_PORT') ?: 5432),
            getenv('DB_NAME') ?: 'belm_portal',
            $sslMode
        );
        $username = (string)(getenv('DB_USER') ?: 'postgres');
        $password = (string)(getenv('DB_PASS') ?: '');
    }

    $pdo = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}
