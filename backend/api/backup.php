<?php
require_once __DIR__ . '/../config/helpers.php';

// GET /api/backup — Super Admin only. Downloads a full JSON snapshot of
// every important table, so the data is safe even without paid Render
// database backups. Restore is manual (send the file back to Claude/a
// developer to re-import if ever needed) — this is an export, not a
// one-click restore tool.

$user = require_auth();
require_super_admin($user);

$tables = [
    'roles', 'users', 'customers', 'customer_users', 'machines',
    'activity_logs', 'customer_applications', 'user_applications',
    'checklist_templates', 'checklist_template_items',
    'checklist_template_parts', 'checklist_reports', 'checklist_answers',
    'service_requests', 'service_request_parts', 'service_notes',
    'spare_parts', 'spare_part_requests', 'suppliers',
    'bank_accounts', 'invoices', 'invoice_items', 'payments',
    'notification_logs', 'system_settings', 'usage_logs',
    'admin_announcements', 'company_expenses', 'bank_withdrawals',
    'proforma_invoices', 'proforma_invoice_items', 'trash_entries',
    'tasks', 'attendance_records',
];

$backup = [
    'exportedAt' => date('c'),
    'schemaVersion' => '19-database-recovery',
    'tables' => [],
];

foreach ($tables as $table) {
    try {
        $stmt = db()->query('SELECT * FROM "' . $table . '"');
        $backup['tables'][$table] = $stmt->fetchAll();
    } catch (Throwable $ignored) {
        // Table may not exist in older schema versions — skip it quietly.
        $backup['tables'][$table] = [];
    }
}

$filename = 'belm-portal-backup-' . date('Y-m-d-His') . '.json';
header('Content-Type: application/json');
header('Content-Disposition: attachment; filename="' . $filename . '"');
echo json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
