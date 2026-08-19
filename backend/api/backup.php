<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/helpers.php';

// GET /api/backup — Super Admin only.
// V350 exports EVERY public table instead of a hand-maintained list, so newly
// added tables cannot silently be omitted from the safety copy.
$user = require_auth();
require_super_admin($user);

$pdo = db();
$tables = $pdo->query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
)->fetchAll(PDO::FETCH_COLUMN);

$backup = [
    'exportedAt' => date('c'),
    'schemaVersion' => '351-free-reedit-dev-customer-expenses',
    'formatVersion' => 2,
    'database' => 'PostgreSQL',
    'tables' => [],
    'rowCounts' => [],
];

foreach ($tables as $table) {
    if (!preg_match('/^[a-z_][a-z0-9_]*$/', (string)$table)) continue;
    $quoted = '"' . $table . '"';
    $stmt = $pdo->query('SELECT * FROM ' . $quoted);
    $rows = $stmt->fetchAll();
    $backup['tables'][$table] = $rows;
    $backup['rowCounts'][$table] = count($rows);
}

try {
    $installationId = $pdo->query('SELECT installation_id FROM belm_installation_meta WHERE singleton=1')->fetchColumn();
    if ($installationId) $backup['installationId'] = (string)$installationId;
} catch (Throwable $ignored) {
}

$filename = 'belm-portal-full-backup-' . date('Y-m-d-His') . '.json';
header('Content-Type: application/json');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Cache-Control: no-store');
echo json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
