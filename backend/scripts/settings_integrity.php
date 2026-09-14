<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

const BELM_SETTINGS_INTEGRITY_EXIT = 78;

function table_exists(PDO $pdo, string $table): bool {
    $stmt = $pdo->prepare('SELECT to_regclass(?) IS NOT NULL');
    $stmt->execute(['public.' . $table]);
    return (bool)$stmt->fetchColumn();
}

function duplicate_count(PDO $pdo, string $sql): int {
    $stmt = $pdo->query($sql);
    return (int)($stmt ? $stmt->fetchColumn() : 0);
}

try {
    $pdo = db();
    $pdo->beginTransaction();
    $pdo->query("SELECT pg_advisory_xact_lock(hashtext('belm-settings-integrity-v1'))");

    // Canonical one-row-per-company notification preferences. This table is
    // configuration only; creating it never changes customer business data.
    $pdo->exec("CREATE TABLE IF NOT EXISTS customer_notification_settings (
      customer_id VARCHAR(64) PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
      critical_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      service_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      breakdown_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      procurement_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      whatsapp_number VARCHAR(80),
      whatsapp_group_name VARCHAR(160),
      email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      email_from_name VARCHAR(160),
      reply_to_email VARCHAR(255),
      management_group_emails TEXT,
      updated_by VARCHAR(160),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");

    // Fail closed if legacy duplicate settings exist. Never auto-delete rows or
    // guess which record is correct: an administrator must reconcile that case.
    $checks = [
        'customer_department_settings' => "SELECT COUNT(*) FROM (SELECT customer_id,department_key FROM customer_department_settings GROUP BY customer_id,department_key HAVING COUNT(*)>1) d",
        'customer_notification_settings' => "SELECT COUNT(*) FROM (SELECT customer_id FROM customer_notification_settings GROUP BY customer_id HAVING COUNT(*)>1) d",
        'system_settings' => "SELECT COUNT(*) FROM (SELECT \"key\" FROM system_settings GROUP BY \"key\" HAVING COUNT(*)>1) d",
        'user_preferences' => "SELECT COUNT(*) FROM (SELECT account_type,account_id FROM user_preferences GROUP BY account_type,account_id HAVING COUNT(*)>1) d",
        'machine_service_owner_notifications' => "SELECT COUNT(*) FROM (SELECT machine_id,due_hour,notification_kind FROM machine_service_owner_notifications GROUP BY machine_id,due_hour,notification_kind HAVING COUNT(*)>1) d",
    ];
    foreach ($checks as $table => $sql) {
        if (!table_exists($pdo, $table)) continue;
        $duplicates = duplicate_count($pdo, $sql);
        if ($duplicates > 0) {
            throw new RuntimeException("DATA_SAFETY_BLOCK: {$table} has {$duplicates} duplicate setting key group(s). No automatic deletion was performed.");
        }
    }

    // Additive uniqueness guards. Existing production already has most of
    // these; IF NOT EXISTS makes the check safe on old or newly restored DBs.
    if (table_exists($pdo, 'customer_department_settings')) {
        $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_department_settings_scope ON customer_department_settings(customer_id,department_key)');
    }
    $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_notification_settings_scope ON customer_notification_settings(customer_id)');
    if (table_exists($pdo, 'system_settings')) {
        $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_system_settings_key ON system_settings("key")');
    }
    if (table_exists($pdo, 'user_preferences')) {
        $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_user_preferences_identity ON user_preferences(account_type,account_id)');
    }
    if (table_exists($pdo, 'machine_service_owner_notifications')) {
        $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_machine_service_owner_notification ON machine_service_owner_notifications(machine_id,due_hour,notification_kind)');
    }

    $pdo->commit();
    fwrite(STDOUT, "BELM settings integrity OK: canonical settings keys are unique; no duplicate settings were deleted.\n");
} catch (Throwable $error) {
    try {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    } catch (Throwable $ignored) {}
    fwrite(STDERR, 'BELM settings integrity failed: ' . $error->getMessage() . "\n");
    exit(BELM_SETTINGS_INTEGRITY_EXIT);
}
