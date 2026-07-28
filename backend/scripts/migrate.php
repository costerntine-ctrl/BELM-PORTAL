<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

$schemaPath = __DIR__ . '/../schema.sql';
$schema = file_get_contents($schemaPath);
if ($schema === false) {
    fwrite(STDERR, "Could not read schema.sql\n");
    exit(1);
}

try {
    db()->exec($schema);
    fwrite(STDOUT, "BELM database migration completed.\n");
} catch (Throwable $error) {
    fwrite(STDERR, "BELM database migration failed: {$error->getMessage()}\n");
    exit(1);
}
