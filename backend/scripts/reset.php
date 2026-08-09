<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/helpers.php';

// POST /api/reset-database — Super Admin only, requires the delete PIN.
// {category: "all"} wipes every table and reseeds a completely fresh
// database. {category: "customers"} (etc.) only clears that one area,
// leaving everything else (including the admin account) untouched.
// Meant for use while still testing/building the portal.

$user = require_auth();
require_super_admin($user);

$body = body();
$reason = require_delete_confirmation($user, $body);

$categories = [
    'customers' => ['label' => 'Customers & Machines', 'tables' => ['customers', 'customer_users', 'machines', 'customer_applications']],
    'checklists' => ['label' => 'Checklist Templates & Reports', 'tables' => ['checklist_templates', 'checklist_template_parts', 'checklist_reports', 'checklist_answers']],
    'spare-parts' => ['label' => 'Spare Parts & Requests', 'tables' => ['spare_parts', 'spare_part_requests']],
    'suppliers' => ['label' => 'Suppliers', 'tables' => ['suppliers']],
    'billing' => ['label' => 'Billing & Finance', 'tables' => ['invoices', 'invoice_payments', 'proforma_invoices', 'company_expenses']],
    'service-requests' => ['label' => 'Service Requests', 'tables' => ['service_requests', 'service_request_parts']],
    'bank' => ['label' => 'Bank Manager', 'tables' => ['bank_accounts', 'bank_withdrawals']],
    'tasks' => ['label' => 'Tasks', 'tables' => ['tasks']],
    'activity' => ['label' => 'Activity Log, Trash & Announcements', 'tables' => ['activity_logs', 'trash_entries', 'admin_announcements']],
    'machine-expenses' => ['label' => 'Machine Expenses logs', 'tables' => []],
    'machine-log' => ['label' => 'Machine Log (1 machine) — hours, checklist logs & expenses', 'tables' => []],
    'petty-cash' => ['label' => 'Petty Cash deposits (top-ups) — keeps spending history', 'tables' => ['petty_cash_topups']],
];

$category = trim((string)($body['category'] ?? 'all'));
$customerId = trim((string)($body['customerId'] ?? ''));
$machineId = trim((string)($body['machineId'] ?? ''));

function belm_clear_machine_log(PDO $pdo, string $machineId): void {
    $pdo->prepare(
        'DELETE FROM checklist_answers WHERE report_id IN (
            SELECT id FROM checklist_reports WHERE machine_id = ?
         )'
    )->execute([$machineId]);
    $pdo->prepare('DELETE FROM checklist_reports WHERE machine_id = ?')->execute([$machineId]);
    $pdo->prepare('DELETE FROM usage_logs WHERE machine_id = ?')->execute([$machineId]);
    $pdo->prepare(
        'UPDATE machines SET last_service_hours = 0, service_history = NULL, last_checked_at = NULL, updated_at = NOW() WHERE id = ?'
    )->execute([$machineId]);
}

function belm_hard_delete_customer(PDO $pdo, string $customerId): void {
    $machineIds = $pdo->prepare('SELECT id FROM machines WHERE customer_id = ?');
    $machineIds->execute([$customerId]);
    $machines = $machineIds->fetchAll(PDO::FETCH_COLUMN);

    $requestIds = $pdo->prepare('SELECT id FROM service_requests WHERE customer_id = ?');
    $requestIds->execute([$customerId]);
    $requests = $requestIds->fetchAll(PDO::FETCH_COLUMN);

    $invoiceIds = $pdo->prepare('SELECT id FROM invoices WHERE customer_id = ?');
    $invoiceIds->execute([$customerId]);
    $invoices = $invoiceIds->fetchAll(PDO::FETCH_COLUMN);

    $inClause = static fn(array $ids): string => implode(',', array_fill(0, count($ids), '?'));

    if ($machines) {
        $pdo->prepare(
            'DELETE FROM checklist_answers WHERE report_id IN (
                SELECT id FROM checklist_reports WHERE machine_id IN (' . $inClause($machines) . ')
             )'
        )->execute($machines);
        $pdo->prepare('DELETE FROM checklist_reports WHERE machine_id IN (' . $inClause($machines) . ')')
            ->execute($machines);
    }

    if ($requests) {
        $pdo->prepare('DELETE FROM service_notes WHERE request_id IN (' . $inClause($requests) . ')')->execute($requests);
        $pdo->prepare('DELETE FROM service_request_parts WHERE request_id IN (' . $inClause($requests) . ')')->execute($requests);
    }

    if ($machines || $requests) {
        $conditions = [];
        $params = [];
        if ($machines) { $conditions[] = 'machine_id IN (' . $inClause($machines) . ')'; $params = array_merge($params, $machines); }
        if ($requests) { $conditions[] = 'request_id IN (' . $inClause($requests) . ')'; $params = array_merge($params, $requests); }
        $pdo->prepare('DELETE FROM spare_part_requests WHERE ' . implode(' OR ', $conditions))->execute($params);
    }

    $pdo->prepare('DELETE FROM service_requests WHERE customer_id = ?')->execute([$customerId]);

    if ($invoices) {
        $pdo->prepare('DELETE FROM invoice_items WHERE invoice_id IN (' . $inClause($invoices) . ')')->execute($invoices);
        $pdo->prepare('DELETE FROM payments WHERE invoice_id IN (' . $inClause($invoices) . ')')->execute($invoices);
    }
    $pdo->prepare('DELETE FROM invoices WHERE customer_id = ?')->execute([$customerId]);

    $pdo->prepare('DELETE FROM proforma_invoices WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM usage_logs WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM tasks WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customer_applications WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customer_users WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM machines WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('UPDATE users SET assigned_customer_id = NULL WHERE assigned_customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customers WHERE id = ?')->execute([$customerId]);
}

try {
    $pdo = db();

    if ($category === 'all') {
        $tables = $pdo->query(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        )->fetchAll(PDO::FETCH_COLUMN);

        if ($tables) {
            $quoted = array_map(static fn(string $t): string => '"' . $t . '"', $tables);
            $pdo->exec('DROP TABLE IF EXISTS ' . implode(', ', $quoted) . ' CASCADE');
        }

        $sequences = $pdo->query(
            "SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'"
        )->fetchAll(PDO::FETCH_COLUMN);
        foreach ($sequences as $sequence) {
            $pdo->exec('DROP SEQUENCE IF EXISTS "' . $sequence . '" CASCADE');
        }

        $schema = file_get_contents(__DIR__ . '/../schema.sql');
        if ($schema === false) {
            throw new RuntimeException('Could not read schema.sql');
        }
        $pdo->exec($schema);

        json_out([
            'ok' => true,
            'message' => 'Database wiped and reseeded. Admin login: admin@belmgeneraltech.co.tz / ChangeMe123! — change the password immediately.',
        ]);
    }

    if (!isset($categories[$category])) {
        json_error('Unknown reset category.', 400);
    }

    if ($category === 'customers' && $customerId !== '') {
        $nameStmt = $pdo->prepare('SELECT name FROM customers WHERE id = ?');
        $nameStmt->execute([$customerId]);
        $customerName = $nameStmt->fetchColumn();
        if ($customerName === false) json_error('Customer not found.', 404);

        $pdo->beginTransaction();
        try {
            belm_hard_delete_customer($pdo, $customerId);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }

        json_out([
            'ok' => true,
            'message' => "Customer \"$customerName\" and everything tied to them (machines, invoices, checklist reports, service requests) has been permanently deleted. Everything else is untouched.",
        ]);
    }

    if ($category === 'machine-log') {
        if ($machineId === '') json_error('Select a machine to clear its log.', 400);

        $machineStmt = $pdo->prepare('SELECT model, fleet_number, reg_number FROM machines WHERE id = ? AND deleted_at IS NULL');
        $machineStmt->execute([$machineId]);
        $machine = $machineStmt->fetch();
        if (!$machine) json_error('Machine not found.', 404);

        $machineLabel = $machine['model'] . ($machine['fleet_number'] ? " (#{$machine['fleet_number']})" : ($machine['reg_number'] ? " ({$machine['reg_number']})" : ''));

        $pdo->beginTransaction();
        try {
            belm_clear_machine_log($pdo, $machineId);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }

        json_out([
            'ok' => true,
            'message' => "Log cleared for \"$machineLabel\" — hour meter readings, checklist reports and expense entries removed. The machine record and customer are untouched.",
        ]);
    }

    $existingTables = $pdo->query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    )->fetchAll(PDO::FETCH_COLUMN);

    if ($category === 'machine-expenses') {
        $pdo->exec("DELETE FROM usage_logs WHERE category = 'SPARE_PART'");
    }
    // Note: 'petty-cash' category intentionally does NOT touch usage_logs here —
    // only the petty_cash_topups table (deposits) is truncated below, so all
    // spending/expense history is preserved for reporting.

    $tablesToClear = array_values(array_intersect($categories[$category]['tables'], $existingTables));
    if ($tablesToClear) {
        $quoted = array_map(static fn(string $t): string => '"' . $t . '"', $tablesToClear);
        $pdo->exec('TRUNCATE TABLE ' . implode(', ', $quoted) . ' CASCADE');
    }

    json_out([
        'ok' => true,
        'message' => $categories[$category]['label'] . ' cleared successfully. Everything else (customers/data in other areas, your admin account) is untouched.',
    ]);
} catch (Throwable $error) {
    json_error('Reset failed: ' . $error->getMessage(), 500);
}


