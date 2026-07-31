<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

const BELM_TRANSIENT_MIGRATION_EXIT = 75;

function migration_sqlstate(Throwable $error): ?string
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

function migration_is_transient(Throwable $error): bool
{
    $state = migration_sqlstate($error);
    $message = strtolower($error->getMessage());

    if (
        str_contains($message, 'password authentication failed')
        || str_contains($message, 'no pg_hba.conf entry')
        || str_contains($message, 'could not find driver')
        || str_contains($message, 'database_url is invalid')
        || (str_contains($message, 'database') && str_contains($message, 'does not exist'))
    ) {
        return false;
    }

    return ($state !== null && str_starts_with($state, '08'))
        || in_array($state, ['57P01', '57P02', '57P03', '53300'], true)
        || str_contains($message, 'connection refused')
        || str_contains($message, 'could not translate host name')
        || str_contains($message, 'server closed the connection')
        || str_contains($message, 'the database system is starting up');
}

$schemaPath = __DIR__ . '/../schema.sql';
$schema = file_get_contents($schemaPath);
if ($schema === false || trim($schema) === '') {
    fwrite(STDERR, "BELM migration error: could not read schema.sql\n");
    exit(1);
}

$pdo = null;
try {
    $pdo = db();
    $pdo->beginTransaction();

    // Prevent two Render instances from applying the schema simultaneously.
    $pdo->query("SELECT pg_advisory_xact_lock(hashtext('belm_portal_schema_migration'))");
    $pdo->exec($schema);

    $pdo->commit();

    $versionRaw = $pdo->query(
        "SELECT \"value\"::text
         FROM system_settings
         WHERE \"key\" = 'schemaVersion'
         LIMIT 1"
    )->fetchColumn();
    $version = is_string($versionRaw) ? trim($versionRaw, "\"") : 'unknown';

    fwrite(STDOUT, 'BELM database migration completed. schemaVersion=' . ($version ?: 'unknown') . "\n");
    exit(0);
} catch (Throwable $error) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $state = migration_sqlstate($error) ?: 'none';
    $message = preg_replace('/[\r\n]+/', ' ', $error->getMessage());
    fwrite(STDERR, sprintf(
        "BELM database migration failed. class=%s sqlstate=%s message=%s at=%s:%d\n",
        get_class($error),
        $state,
        $message,
        $error->getFile(),
        $error->getLine()
    ));

    exit(migration_is_transient($error) ? BELM_TRANSIENT_MIGRATION_EXIT : 1);
}
