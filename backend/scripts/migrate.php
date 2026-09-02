<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

const BELM_RELEASE = 'coordinator-communication-db-safety-v12';
const BELM_DATA_SAFETY_EXIT = 78;

function belm_env_true(string $name): bool {
    return in_array(strtolower(trim((string)(getenv($name) ?: ''))), ['1', 'true', 'yes', 'on'], true);
}

function belm_table_exists(PDO $pdo, string $table): bool {
    $stmt = $pdo->prepare('SELECT to_regclass(?) IS NOT NULL');
    $stmt->execute(['public.' . $table]);
    return (bool)$stmt->fetchColumn();
}

function belm_column_exists(PDO $pdo, string $table, string $column): bool {
    $stmt = $pdo->prepare(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=? AND column_name=?)"
    );
    $stmt->execute([$table, $column]);
    return (bool)$stmt->fetchColumn();
}

function belm_safe_identifier(string $name): string {
    if (!preg_match('/^[a-z_][a-z0-9_]*$/', $name)) {
        throw new RuntimeException('Unsafe database identifier: ' . $name);
    }
    return '"' . $name . '"';
}

function belm_table_count(PDO $pdo, string $table): int {
    return (int)$pdo->query('SELECT COUNT(*) FROM ' . belm_safe_identifier($table))->fetchColumn();
}

function belm_uuid(): string {
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    $hex = bin2hex($data);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}

$schemaPath = __DIR__ . '/../schema.sql';
$schema = file_get_contents($schemaPath);
if ($schema === false) {
    fwrite(STDERR, "Could not read schema.sql\n");
    exit(1);
}
$schemaHash = hash('sha256', $schema);

$protectedTables = [
    'roles', 'users', 'customers', 'customer_users', 'customer_branding', 'machines',
    'checklist_templates', 'checklist_reports', 'service_requests', 'service_request_history', 'service_notes',
    'spare_parts', 'spare_part_requests', 'suppliers',
    'bank_accounts', 'bank_withdrawals', 'company_expenses',
    'proforma_invoices', 'proforma_invoice_items', 'invoices', 'invoice_items', 'payments', 'receipts',
    'usage_logs', 'customer_store_items', 'customer_store_movements', 'customer_procurement_requests', 'customer_department_settings', 'customer_sales_documents',
    'breakdown_cases', 'breakdown_case_events', 'breakdown_spare_requests', 'digital_job_cards',
    'customer_communications', 'notification_logs', 'system_settings', 'machine_service_owner_notifications',
    'customer_tool_issues', 'belm_workshop_tool_issues', 'delivery_notes', 'delivery_note_items', 'tasks', 'activity_logs', 'trash_entries',
];

try {
    $pdo = db();
    $isProduction = strtolower((string)(getenv('APP_ENV') ?: '')) === 'production';

    // V350 fail-closed database target guard. A code update must never silently
    // bootstrap a brand-new/empty production database because DATABASE_URL was
    // changed, detached or recreated. First-ever production setup is explicit.
    if ($isProduction && trim((string)(getenv('DATABASE_URL') ?: '')) === '') {
        fwrite(STDERR, "DATA_SAFETY_BLOCK: DATABASE_URL is required in production.\n");
        exit(BELM_DATA_SAFETY_EXIT);
    }

    $existingCoreTables = 0;
    foreach (['users', 'customers', 'machines', 'service_requests', 'digital_job_cards', 'company_expenses', 'bank_accounts', 'proforma_invoices', 'invoices'] as $table) {
        if (belm_table_exists($pdo, $table)) $existingCoreTables++;
    }
    $freshDatabase = $existingCoreTables === 0;
    if ($isProduction && $freshDatabase && !belm_env_true('ALLOW_FRESH_DATABASE_BOOTSTRAP')) {
        fwrite(STDERR, "DATA_SAFETY_BLOCK: production database has no BELM core tables. Refusing to create a blank portal during an ordinary deploy. Set ALLOW_FRESH_DATABASE_BOOTSTRAP=true only for an intentional first installation.\n");
        exit(BELM_DATA_SAFETY_EXIT);
    }

    $pdo->beginTransaction();
    // Only one release may evolve the shared schema at a time.
    $pdo->query("SELECT pg_advisory_xact_lock(hashtext('belm-portal-schema-migration'))");

    // Migration/audit metadata is additive and contains no business data.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS belm_installation_meta (\n" .
        "  singleton SMALLINT PRIMARY KEY CHECK (singleton = 1),\n" .
        "  installation_id VARCHAR(36) NOT NULL UNIQUE,\n" .
        "  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\n" .
        ")"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS belm_schema_migrations (\n" .
        "  id VARCHAR(36) PRIMARY KEY,\n" .
        "  release VARCHAR(100) NOT NULL,\n" .
        "  schema_sha256 VARCHAR(64) NOT NULL UNIQUE,\n" .
        "  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\n" .
        ")"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS belm_deployment_audits (\n" .
        "  id VARCHAR(36) PRIMARY KEY,\n" .
        "  release VARCHAR(100) NOT NULL,\n" .
        "  schema_sha256 VARCHAR(64) NOT NULL,\n" .
        "  installation_id VARCHAR(36) NOT NULL,\n" .
        "  pre_counts JSONB NOT NULL DEFAULT '{}'::jsonb,\n" .
        "  post_counts JSONB NOT NULL DEFAULT '{}'::jsonb,\n" .
        "  schema_applied SMALLINT NOT NULL DEFAULT 0,\n" .
        "  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\n" .
        ")"
    );

    // V6 data-safe coordinator release: deployment migrations are additive-only.
    // No bank reset, no business-row cleanup and no feature-state backfill is performed here.
    // Strong no-touch guard for BELM Spare Stock. Record counts/IDs are already
    // protected below; this hash additionally protects stock quantities and
    // inventory prices from accidental mutation during schema evolution.
    $spareStockHashBefore = '';
    if (belm_table_exists($pdo, 'spare_parts')) {
        $spareRows = $pdo->query('SELECT id, stock_qty, reorder_threshold, purchase_price, selling_price, deleted_at FROM spare_parts ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
        $spareStockHashBefore = hash('sha256', json_encode($spareRows, JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION));
    }

    $installationId = (string)$pdo->query('SELECT installation_id FROM belm_installation_meta WHERE singleton=1')->fetchColumn();
    if ($installationId === '') {
        $installationId = belm_uuid();
        $stmt = $pdo->prepare('INSERT INTO belm_installation_meta(singleton,installation_id) VALUES(1,?) ON CONFLICT (singleton) DO NOTHING');
        $stmt->execute([$installationId]);
        $installationId = (string)$pdo->query('SELECT installation_id FROM belm_installation_meta WHERE singleton=1')->fetchColumn();
    }

    // Optional strongest guard: once EXPECTED_BELM_INSTALLATION_ID is set in
    // Render, an accidental DATABASE_URL switch to another existing DB fails.
    $expectedInstallationId = trim((string)(getenv('EXPECTED_BELM_INSTALLATION_ID') ?: ''));
    if ($expectedInstallationId !== '' && !hash_equals($expectedInstallationId, $installationId)) {
        throw new RuntimeException('DATA_SAFETY_BLOCK: connected PostgreSQL installation identity does not match EXPECTED_BELM_INSTALLATION_ID.');
    }

    // Snapshot every pre-existing business ID before schema evolution. A deploy
    // is rolled back if even one of these IDs disappears while migrate.php runs.
    $pdo->exec('CREATE TEMP TABLE belm_predeploy_ids(table_name TEXT NOT NULL,row_id TEXT NOT NULL) ON COMMIT DROP');
    $preCounts = [];
    foreach ($protectedTables as $table) {
        if (!belm_table_exists($pdo, $table)) continue;
        $preCounts[$table] = belm_table_count($pdo, $table);
        if (belm_column_exists($pdo, $table, 'id')) {
            $quoted = belm_safe_identifier($table);
            $pdo->exec("INSERT INTO belm_predeploy_ids(table_name,row_id) SELECT " . $pdo->quote($table) . ", id::text FROM {$quoted}");
        }
    }

    // Fail closed if a future schema.sql accidentally contains destructive business-data SQL.
    // DDL below is limited to CREATE / ALTER ADD / CREATE INDEX / INSERT-if-missing.
    if (preg_match('/\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i', $schema)) {
        throw new RuntimeException('DATA_SAFETY_BLOCK: destructive SQL detected in schema.sql.');
    }

    // Apply the cumulative schema only when its content changes. schema.sql is
    // intentionally DDL + insert-if-missing only; it contains no deployment-time
    // UPDATE/DELETE/TRUNCATE/DROP TABLE business-data operations in V350+.
    $schemaStmt = $pdo->prepare('SELECT 1 FROM belm_schema_migrations WHERE schema_sha256=? LIMIT 1');
    $schemaStmt->execute([$schemaHash]);
    $schemaApplied = false;
    if (!$schemaStmt->fetchColumn()) {
        $pdo->exec($schema);
        $insertMigration = $pdo->prepare('INSERT INTO belm_schema_migrations(id,release,schema_sha256) VALUES(?,?,?)');
        $insertMigration->execute([belm_uuid(), BELM_RELEASE, $schemaHash]);
        $schemaApplied = true;
    }

    // Business rows are never reset by deployment in V6.

    // Verify Spare Stock values did not change during schema evolution.
    if ($spareStockHashBefore !== '' && belm_table_exists($pdo, 'spare_parts')) {
        $spareRowsAfter = $pdo->query('SELECT id, stock_qty, reorder_threshold, purchase_price, selling_price, deleted_at FROM spare_parts ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
        $spareStockHashAfter = hash('sha256', json_encode($spareRowsAfter, JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION));
        if (!hash_equals($spareStockHashBefore, $spareStockHashAfter)) {
            throw new RuntimeException('DATA_SAFETY_BLOCK: Spare Stock changed during deployment schema evolution. Entire transaction rolled back.');
        }
    }

    // Fresh-seed password bootstrap only. Existing passwords are never rotated
    // by deployment. The exact locked seed hash is the only row eligible here.
    $seedAdminId = '00000000-0000-4000-8000-000000000003';
    $lockedSeedHash = '$2y$12$mLP95q9gTllhw8LFyLjavuv/f8/qY8kfEGmAy.l9dKCNs084SvFNS';
    $legacyKnownHash = '$2y$10$uXo8bDdT3YV7BlM7V4oOR.ybSIUrBtG0x/bwydGsmf98C0IBBWtme';
    if (belm_table_exists($pdo, 'users')) {
        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$seedAdminId]);
        $currentHash = (string)($stmt->fetchColumn() ?: '');
        if ($currentHash === $lockedSeedHash) {
            $initialPassword = (string)(getenv('INITIAL_ADMIN_PASSWORD') ?: '');
            if (strlen($initialPassword) < 12) {
                throw new RuntimeException('INITIAL_ADMIN_PASSWORD must be set to at least 12 characters before the first/default-password deploy.');
            }
            $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?')
                ->execute([password_hash($initialPassword, PASSWORD_BCRYPT, ['cost' => 12]), $seedAdminId, $lockedSeedHash]);
            fwrite(STDOUT, "Fresh Super Admin password initialized from INITIAL_ADMIN_PASSWORD.\n");
        } elseif ($currentHash === $legacyKnownHash) {
            fwrite(STDERR, "V350: existing legacy Super Admin password preserved; auth.php may re-hash it after the next successful login using the same plaintext password.\n");
        }
    }

    // Missing action PINs may be inserted on a fresh/partial installation when
    // an explicit deploy secret exists. Existing PIN values are never changed.
    if (belm_table_exists($pdo, 'system_settings')) {
        $initialActionPin = trim((string)(getenv('INITIAL_ADMIN_ACTION_PIN') ?: ''));
        if (preg_match('/^\d{4}$/', $initialActionPin)) {
            $insertPin = $pdo->prepare(
                'INSERT INTO system_settings(id,"key","value",updated_at) VALUES(?,?,?::jsonb,NOW()) ON CONFLICT ("key") DO NOTHING'
            );
            foreach (['adminEditPin', 'adminDeletePin'] as $key) {
                $insertPin->execute([belm_uuid(), $key, json_encode($initialActionPin)]);
            }
        }
    }

    // Verify migration itself did not delete any pre-existing ID and did not
    // reduce protected table counts. Any violation aborts/rolls back the deploy.
    $postCounts = [];
    foreach ($preCounts as $table => $beforeCount) {
        if (!belm_table_exists($pdo, $table)) {
            throw new RuntimeException("DATA_SAFETY_BLOCK: protected table {$table} disappeared during deployment.");
        }
        $afterCount = belm_table_count($pdo, $table);
        $postCounts[$table] = $afterCount;
        if ($afterCount < $beforeCount) {
            throw new RuntimeException("DATA_SAFETY_BLOCK: protected table {$table} lost rows during deployment ({$beforeCount} -> {$afterCount}).");
        }
        if (belm_column_exists($pdo, $table, 'id')) {
            $quoted = belm_safe_identifier($table);
            $missingStmt = $pdo->prepare(
                "SELECT COUNT(*) FROM belm_predeploy_ids s WHERE s.table_name=? AND NOT EXISTS (SELECT 1 FROM {$quoted} t WHERE t.id::text=s.row_id)"
            );
            $missingStmt->execute([$table]);
            $missing = (int)$missingStmt->fetchColumn();
            if ($missing > 0) {
                throw new RuntimeException("DATA_SAFETY_BLOCK: {$missing} pre-existing {$table} record(s) disappeared during deployment.");
            }
        }
    }

    $auditStmt = $pdo->prepare(
        'INSERT INTO belm_deployment_audits(id,release,schema_sha256,installation_id,pre_counts,post_counts,schema_applied) VALUES(?,?,?,?,?::jsonb,?::jsonb,?)'
    );
    $auditStmt->execute([
        belm_uuid(), BELM_RELEASE, $schemaHash, $installationId,
        json_encode($preCounts, JSON_UNESCAPED_SLASHES),
        json_encode($postCounts, JSON_UNESCAPED_SLASHES),
        $schemaApplied ? 1 : 0,
    ]);

    $pdo->commit();
    fwrite(STDOUT, 'BELM Coordinator Communication DB V12 safe background database check completed. Installation ' . $installationId . '; protected records preserved; schema ' . ($schemaApplied ? 'applied' : 'already current') . ".\n");
} catch (Throwable $error) {
    try {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    } catch (Throwable $ignored) {
    }
    $message = $error->getMessage();
    fwrite(STDERR, "BELM database migration failed: {$message}\n");
    if (str_contains($message, 'DATA_SAFETY_BLOCK:')) exit(BELM_DATA_SAFETY_EXIT);
    exit(1);
}
