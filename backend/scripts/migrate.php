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

    // V302 deploy safety: never leave a fresh/legacy database on a password
    // embedded in the source tree. Existing Admin passwords are preserved.
    $seedAdminId = '00000000-0000-4000-8000-000000000003';
    $lockedSeedHash = '$2y$12$mLP95q9gTllhw8LFyLjavuv/f8/qY8kfEGmAy.l9dKCNs084SvFNS';
    $legacyKnownHash = '$2y$10$uXo8bDdT3YV7BlM7V4oOR.ybSIUrBtG0x/bwydGsmf98C0IBBWtme';
    $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$seedAdminId]);
    $currentHash = (string)($stmt->fetchColumn() ?: '');
    if ($currentHash === $lockedSeedHash || $currentHash === $legacyKnownHash) {
        $initialPassword = (string)(getenv('INITIAL_ADMIN_PASSWORD') ?: '');
        if (strlen($initialPassword) < 12) {
            throw new RuntimeException('INITIAL_ADMIN_PASSWORD must be set to at least 12 characters before the first/default-password deploy.');
        }
        db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($initialPassword, PASSWORD_DEFAULT), $seedAdminId]);
        fwrite(STDOUT, "Initial Super Admin password secured from INITIAL_ADMIN_PASSWORD.\n");
    }

    fwrite(STDOUT, "BELM database migration completed.\n");
} catch (Throwable $error) {
    fwrite(STDERR, "BELM database migration failed: {$error->getMessage()}\n");
    exit(1);
}
