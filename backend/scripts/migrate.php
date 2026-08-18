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

    // V308: repair legacy/manual cases that were incorrectly handed to the
    // Technician department while every active Job Card was still unassigned.
    // Keep stage_started_at unchanged so the real assignment waiting time stays visible.
    $assignmentRepair = db()->exec(
        "UPDATE breakdown_cases bc
         SET current_stage='TECHNICIAN_ASSIGNMENT',
             current_department='Workshop / Dispatch',
             blocker_reason='Awaiting Technician Assignment',
             updated_at=NOW()
         WHERE bc.status <> 'COMPLETED'
           AND bc.current_stage IN ('WORKSHOP_REVIEW','DIAGNOSIS','REPAIR')
           AND EXISTS (
               SELECT 1 FROM digital_job_cards j
               WHERE j.case_id=bc.id AND j.status NOT IN ('COMPLETED','CANCELLED')
           )
           AND NOT EXISTS (
               SELECT 1 FROM digital_job_cards j
               WHERE j.case_id=bc.id AND j.status NOT IN ('COMPLETED','CANCELLED') AND j.technician_id IS NOT NULL
           )"
    );
    if ($assignmentRepair > 0) {
        fwrite(STDOUT, "V308 repaired {$assignmentRepair} unassigned Job Card workflow case(s).\n");
    }

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

    // V306: old builds exposed predictable Edit/Delete PIN fallbacks (2026/1234).
    // Preserve custom PINs, but require a deploy-time secret to replace any
    // missing or known legacy value. This fails closed rather than deploying
    // with a public action PIN.
    $initialActionPin = trim((string)(getenv('INITIAL_ADMIN_ACTION_PIN') ?: ''));
    $pinRows = [];
    $pinStmt = db()->prepare("SELECT \"key\",\"value\" FROM system_settings WHERE \"key\" IN ('adminEditPin','adminDeletePin')");
    $pinStmt->execute();
    foreach ($pinStmt->fetchAll() as $row) {
        $decoded = json_decode((string)$row['value'], true);
        $pinRows[(string)$row['key']] = trim((string)($decoded ?? trim((string)$row['value'], "\" \t\n\r\0\x0B")));
    }
    $needsPinBootstrap = !isset($pinRows['adminEditPin']) || !isset($pinRows['adminDeletePin'])
        || in_array($pinRows['adminEditPin'] ?? '', ['', '2026'], true)
        || in_array($pinRows['adminDeletePin'] ?? '', ['', '1234'], true);
    if ($needsPinBootstrap) {
        if (!preg_match('/^\d{4}$/', $initialActionPin)) {
            throw new RuntimeException('INITIAL_ADMIN_ACTION_PIN must be set to exactly 4 digits to replace missing/legacy Edit/Delete PINs.');
        }
        $upsertPin = db()->prepare(
            'INSERT INTO system_settings(id,"key","value",updated_at) VALUES(?,?,?::jsonb,NOW()) '
            . 'ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value",updated_at=NOW()'
        );
        foreach (['adminEditPin' => '2026', 'adminDeletePin' => '1234'] as $key => $legacy) {
            $current = $pinRows[$key] ?? '';
            if ($current === '' || $current === $legacy) {
                $upsertPin->execute([bin2hex(random_bytes(16)), $key, json_encode($initialActionPin)]);
            }
        }
        fwrite(STDOUT, "Admin action PINs secured from INITIAL_ADMIN_ACTION_PIN.\n");
    }

    fwrite(STDOUT, "BELM database migration completed.\n");
} catch (Throwable $error) {
    fwrite(STDERR, "BELM database migration failed: {$error->getMessage()}\n");
    exit(1);
}
