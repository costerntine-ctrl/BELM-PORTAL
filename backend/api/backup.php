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
    'customer_applications', 'user_applications', 'checklist_templates',
    'checklist_template_parts', 'checklist_reports', 'checklist_answers',
    'service_requests', 'service_request_parts', 'spare_parts',
    'spare_part_requests', 'suppliers', 'invoices', 'invoice_payments',
    'company_expenses', 'proforma_invoices', 'usage_logs', 'customer_store_items', 'customer_store_movements',
    'machine_service_parts', 'service_due_alerts', 'service_due_alert_items', 'tasks',
    'bank_accounts', 'bank_withdrawals', 'admin_announcements', 'customer_communications',
    'breakdown_cases', 'breakdown_case_events', 'breakdown_spare_requests', 'digital_job_cards',
    'system_settings', 'user_preferences', 'activity_logs', 'trash_entries',
];

$backup = [
    'exportedAt' => date('c'),
    'schemaVersion' => '23-technician-job-card-workspace',
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
