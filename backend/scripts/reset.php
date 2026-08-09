<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/helpers.php';

// POST /api/reset-database — Super Admin only, requires the delete PIN.
// {category: "all"} wipes every table and reseeds a completely fresh
// database. Every other category is fully independent of the others —
// clearing "machines" never touches customers, clearing "customers" never
// touches unrelated machines/users, clearing "users" never touches
// customers/machines, etc. Meant for use while still testing/building
// the portal.

$user = require_auth();
require_super_admin($user);

$body = body();
$reason = require_delete_confirmation($user, $body);

$categories = [
    'customers' => ['label' => 'Customers (single customer — their own machines/data go with them)', 'tables' => []],
    'machines' => ['label' => 'Machines (fully deleted — customers stay untouched)', 'tables' => []],
    'machine-log' => ['label' => 'Machine Log (1 machine) — hours, checklist logs & expenses', 'tables' => []],
    'users' => ['label' => 'Users & Technicians (system logins — customers/machines untouched)', 'tables' => []],
    'checklists' => ['label' => 'Checklist Templates & Reports', 'tables' => []],
    'spare-parts' => ['label' => 'Spare Parts & Requests', 'tables' => ['spare_parts', 'spare_part_requests']],
    'suppliers' => ['label' => 'Suppliers', 'tables' => ['suppliers']],
    'billing' => ['label' => 'Billing & Finance', 'tables' => ['invoice_items', 'payments', 'invoices', 'proforma_invoice_items', 'proforma_invoices', 'company_expenses']],
    'service-requests' => ['label' => 'Service Requests', 'tables' => []],
    'bank' => ['label' => 'Bank Manager', 'tables' => []],
    'tasks' => ['label' => 'Tasks', 'tables' => ['tasks']],
    'activity' => ['label' => 'Activity Log, Trash & Announcements', 'tables' => ['activity_logs', 'trash_entries', 'admin_announcements']],
    'machine-expenses' => ['label' => 'Machine Expenses logs', 'tables' => []],
    'petty-cash' => ['label' => 'Petty Cash deposits (top-ups) — keeps spending history', 'tables' => ['petty_cash_topups']],
];

$category = trim((string)($body['category'] ?? 'all'));
$customerId = trim((string)($body['customerId'] ?? ''));
$machineId = trim((string)($body['machineId'] ?? ''));
$userId = trim((string)($body['userId'] ?? ''));
$machineScope = trim((string)($body['machineScope'] ?? 'single')); // 'single' | 'all'
$userScope = trim((string)($body['userScope'] ?? 'single'));       // 'single' | 'all'

function belm_in_clause(array $ids): string {
    return implode(',', array_fill(0, count($ids), '?'));
}

// ---------------------------------------------------------------------
// MACHINES — independent of customers. Removes the machine record(s) and
// everything that only makes sense in the context of a machine (checklist
// history, usage/expense logs, petty cash top-ups, operator roster/reports).
// References from other independent areas (invoices, service requests,
// spare part requests, customer applications) are detached, not deleted,
// so billing/service-request history for the customer stays intact.
// ---------------------------------------------------------------------
function belm_hard_delete_machines(PDO $pdo, array $machineIds): void {
    if (!$machineIds) return;
    $in = belm_in_clause($machineIds);

    $pdo->prepare("DELETE FROM checklist_answers WHERE report_id IN (SELECT id FROM checklist_reports WHERE machine_id IN ($in))")->execute($machineIds);
    $pdo->prepare("DELETE FROM checklist_reports WHERE machine_id IN ($in)")->execute($machineIds);
    $pdo->prepare("DELETE FROM usage_logs WHERE machine_id IN ($in)")->execute($machineIds);
    $pdo->prepare("DELETE FROM petty_cash_topups WHERE machine_id IN ($in)")->execute($machineIds);
    $pdo->prepare("DELETE FROM machine_operators WHERE machine_id IN ($in)")->execute($machineIds);
    $pdo->prepare("DELETE FROM operator_reports WHERE machine_id IN ($in)")->execute($machineIds);
    $pdo->prepare("DELETE FROM spare_part_requests WHERE machine_id IN ($in)")->execute($machineIds);
    $pdo->prepare("UPDATE service_requests SET machine_id = NULL WHERE machine_id IN ($in)")->execute($machineIds);
    $pdo->prepare("UPDATE invoices SET machine_id = NULL WHERE machine_id IN ($in)")->execute($machineIds);
    $pdo->prepare("UPDATE customer_applications SET machine_id = NULL WHERE machine_id IN ($in)")->execute($machineIds);
    $pdo->prepare("DELETE FROM machines WHERE id IN ($in)")->execute($machineIds);
}

// ---------------------------------------------------------------------
// MACHINE LOG — clears history for one machine but keeps the machine
// record itself (and the customer) untouched.
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// CUSTOMERS — always exactly one customer at a time (no "wipe every
// customer" shortcut, since that would inherently drag every machine
// with it). Deletes that customer and everything that only exists in
// their context. Users/technicians are never touched.
// ---------------------------------------------------------------------
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

    if ($machines) {
        $in = belm_in_clause($machines);
        $pdo->prepare("DELETE FROM checklist_answers WHERE report_id IN (SELECT id FROM checklist_reports WHERE machine_id IN ($in))")->execute($machines);
        $pdo->prepare("DELETE FROM checklist_reports WHERE machine_id IN ($in)")->execute($machines);
        $pdo->prepare("DELETE FROM petty_cash_topups WHERE machine_id IN ($in)")->execute($machines);
        $pdo->prepare("DELETE FROM machine_operators WHERE machine_id IN ($in)")->execute($machines);
        $pdo->prepare("DELETE FROM operator_reports WHERE machine_id IN ($in)")->execute($machines);
    }

    if ($requests) {
        $in = belm_in_clause($requests);
        $pdo->prepare("DELETE FROM service_notes WHERE request_id IN ($in)")->execute($requests);
        $pdo->prepare("DELETE FROM service_request_parts WHERE request_id IN ($in)")->execute($requests);
    }

    if ($machines || $requests) {
        $conditions = [];
        $params = [];
        if ($machines) { $conditions[] = 'machine_id IN (' . belm_in_clause($machines) . ')'; $params = array_merge($params, $machines); }
        if ($requests) { $conditions[] = 'request_id IN (' . belm_in_clause($requests) . ')'; $params = array_merge($params, $requests); }
        $pdo->prepare('DELETE FROM spare_part_requests WHERE ' . implode(' OR ', $conditions))->execute($params);
    }

    $pdo->prepare('DELETE FROM service_requests WHERE customer_id = ?')->execute([$customerId]);

    if ($invoices) {
        $in = belm_in_clause($invoices);
        $pdo->prepare("DELETE FROM invoice_items WHERE invoice_id IN ($in)")->execute($invoices);
        $pdo->prepare("DELETE FROM payments WHERE invoice_id IN ($in)")->execute($invoices);
    }
    $pdo->prepare('DELETE FROM invoices WHERE customer_id = ?')->execute([$customerId]);

    $pdo->prepare('DELETE FROM proforma_invoices WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM usage_logs WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM tasks WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customer_applications WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customer_users WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customer_saved_emails WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customer_activity_logs WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM machines WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('UPDATE users SET assigned_customer_id = NULL WHERE assigned_customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customers WHERE id = ?')->execute([$customerId]);
}

// ---------------------------------------------------------------------
// USERS & TECHNICIANS — independent of customers/machines. Super Admin
// accounts and the person currently performing the reset are always
// protected, so this can never lock the admin out of the portal.
// ---------------------------------------------------------------------
function belm_delete_users(PDO $pdo, array $userIds): void {
    if (!$userIds) return;
    $in = belm_in_clause($userIds);

    $pdo->prepare("DELETE FROM tasks WHERE assigned_to_id IN ($in)")->execute($userIds);
    $pdo->prepare("DELETE FROM attendance_records WHERE user_id IN ($in)")->execute($userIds);
    $pdo->prepare("DELETE FROM activity_logs WHERE user_id IN ($in)")->execute($userIds);
    $pdo->prepare("UPDATE attendance_records SET recorded_by = NULL WHERE recorded_by IN ($in)")->execute($userIds);
    $pdo->prepare("UPDATE service_requests SET assigned_to_id = NULL WHERE assigned_to_id IN ($in)")->execute($userIds);
    $pdo->prepare("UPDATE service_requests SET completed_by_id = NULL WHERE completed_by_id IN ($in)")->execute($userIds);
    $pdo->prepare("UPDATE service_requests SET cancelled_by_id = NULL WHERE cancelled_by_id IN ($in)")->execute($userIds);
    $pdo->prepare("UPDATE spare_part_requests SET requested_by_id = NULL WHERE requested_by_id IN ($in)")->execute($userIds);
    $pdo->prepare("UPDATE admin_announcements SET created_by = NULL WHERE created_by IN ($in)")->execute($userIds);
    $pdo->prepare("UPDATE operator_reports SET resolved_by_id = NULL WHERE resolved_by_id IN ($in)")->execute($userIds);
    $pdo->prepare("UPDATE petty_cash_topups SET added_by = NULL WHERE added_by IN ($in)")->execute($userIds);
    $pdo->prepare("UPDATE customer_applications SET reviewed_by = NULL WHERE reviewed_by IN ($in)")->execute($userIds);
    $pdo->prepare("UPDATE user_applications SET reviewed_by = NULL WHERE reviewed_by IN ($in)")->execute($userIds);
    $pdo->prepare("UPDATE user_applications SET user_id = NULL WHERE user_id IN ($in)")->execute($userIds);
    $pdo->prepare("DELETE FROM users WHERE id IN ($in)")->execute($userIds);
}

// ---------------------------------------------------------------------
// CHECKLIST TEMPLATES & REPORTS — self-contained. Detaches (does not
// delete) any Service Request that merely referenced a template, so the
// Service Requests category is never touched by this one.
// ---------------------------------------------------------------------
function belm_clear_checklists(PDO $pdo): void {
    $pdo->exec('UPDATE service_requests SET template_id = NULL WHERE template_id IS NOT NULL');
    $pdo->exec('DELETE FROM checklist_answers');
    $pdo->exec('DELETE FROM checklist_reports');
    $pdo->exec('DELETE FROM checklist_template_parts');
    $pdo->exec('DELETE FROM checklist_template_items');
    $pdo->exec('DELETE FROM checklist_templates');
}

// ---------------------------------------------------------------------
// SERVICE REQUESTS — self-contained. Detaches any Spare Part Request
// that merely referenced a service request, so Spare Parts is untouched.
// ---------------------------------------------------------------------
function belm_clear_service_requests(PDO $pdo): void {
    $pdo->exec('UPDATE spare_part_requests SET request_id = NULL WHERE request_id IS NOT NULL');
    $pdo->exec('DELETE FROM service_notes');
    $pdo->exec('DELETE FROM service_request_parts');
    $pdo->exec('DELETE FROM service_requests');
}

// ---------------------------------------------------------------------
// BANK MANAGER — self-contained. Detaches any Payment or Company Expense
// that merely referenced a bank account, so Billing & Finance is untouched.
// ---------------------------------------------------------------------
function belm_clear_bank(PDO $pdo): void {
    $pdo->exec('UPDATE payments SET bank_account_id = NULL WHERE bank_account_id IS NOT NULL');
    $pdo->exec('UPDATE company_expenses SET bank_account_id = NULL WHERE bank_account_id IS NOT NULL');
    $pdo->exec('DELETE FROM bank_withdrawals');
    $pdo->exec('DELETE FROM bank_accounts');
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

    // -------------------- CUSTOMERS (always one specific customer) --------------------
    if ($category === 'customers') {
        if ($customerId === '') json_error('Select a customer to delete.', 400);

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
            'message' => "Customer \"$customerName\" and everything tied to them (their own machines, invoices, checklist reports, service requests) has been permanently deleted. All other customers, machines and users are untouched.",
        ]);
    }

    // -------------------- MACHINES (single machine or all machines) --------------------
    if ($category === 'machines') {
        if ($machineScope === 'all') {
            $idStmt = $pdo->query('SELECT id FROM machines');
            $ids = $idStmt->fetchAll(PDO::FETCH_COLUMN);

            $pdo->beginTransaction();
            try {
                belm_hard_delete_machines($pdo, $ids);
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }

            json_out([
                'ok' => true,
                'message' => count($ids) . ' machine(s) permanently deleted with their checklist/usage history. Customers and users are untouched.',
            ]);
        }

        if ($machineId === '') json_error('Select a machine to delete, or choose "All machines".', 400);

        $machineStmt = $pdo->prepare('SELECT model, fleet_number, reg_number FROM machines WHERE id = ?');
        $machineStmt->execute([$machineId]);
        $machine = $machineStmt->fetch();
        if (!$machine) json_error('Machine not found.', 404);

        $machineLabel = $machine['model'] . ($machine['fleet_number'] ? " (#{$machine['fleet_number']})" : ($machine['reg_number'] ? " ({$machine['reg_number']})" : ''));

        $pdo->beginTransaction();
        try {
            belm_hard_delete_machines($pdo, [$machineId]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }

        json_out([
            'ok' => true,
            'message' => "Machine \"$machineLabel\" and its checklist/usage history has been permanently deleted. The customer and all other machines/users are untouched.",
        ]);
    }

    // -------------------- MACHINE LOG (keeps the machine, clears its history) --------------------
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

    // -------------------- USERS & TECHNICIANS (single user or all, admins always protected) --------------------
    if ($category === 'users') {
        $superAdminRoleId = $pdo->query("SELECT id FROM roles WHERE name = 'Super Admin'")->fetchColumn();

        if ($userScope === 'all') {
            $stmt = $pdo->prepare('SELECT id FROM users WHERE id != ? AND (role_id IS NULL OR role_id != ?)');
            $stmt->execute([$user['id'], $superAdminRoleId ?: '']);
            $ids = $stmt->fetchAll(PDO::FETCH_COLUMN);

            $pdo->beginTransaction();
            try {
                belm_delete_users($pdo, $ids);
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }

            json_out([
                'ok' => true,
                'message' => count($ids) . ' user account(s) deleted. Super Admin accounts and your own login are always protected. Customers/machines are untouched.',
            ]);
        }

        if ($userId === '') json_error('Select a user to delete, or choose "All users".', 400);
        if ($userId === $user['id']) json_error('You cannot delete your own account this way.', 400);

        $targetStmt = $pdo->prepare('SELECT name, role_id FROM users WHERE id = ?');
        $targetStmt->execute([$userId]);
        $target = $targetStmt->fetch();
        if (!$target) json_error('User not found.', 404);
        if ($superAdminRoleId && $target['role_id'] === $superAdminRoleId) {
            json_error('Super Admin accounts are protected and cannot be deleted here.', 400);
        }

        $pdo->beginTransaction();
        try {
            belm_delete_users($pdo, [$userId]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }

        json_out([
            'ok' => true,
            'message' => "User \"{$target['name']}\" has been permanently deleted. Customers, machines and other users are untouched.",
        ]);
    }

    $existingTables = $pdo->query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    )->fetchAll(PDO::FETCH_COLUMN);

    // -------------------- CHECKLISTS (self-contained, detaches service requests) --------------------
    if ($category === 'checklists') {
        $pdo->beginTransaction();
        try {
            belm_clear_checklists($pdo);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        json_out([
            'ok' => true,
            'message' => 'Checklist templates & reports cleared successfully. Service requests, customers, machines and users are untouched.',
        ]);
    }

    // -------------------- SERVICE REQUESTS (self-contained, detaches spare part requests) --------------------
    if ($category === 'service-requests') {
        $pdo->beginTransaction();
        try {
            belm_clear_service_requests($pdo);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        json_out([
            'ok' => true,
            'message' => 'Service requests cleared successfully. Spare parts, customers, machines and users are untouched.',
        ]);
    }

    // -------------------- BANK MANAGER (self-contained, detaches payments/expenses) --------------------
    if ($category === 'bank') {
        $pdo->beginTransaction();
        try {
            belm_clear_bank($pdo);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        json_out([
            'ok' => true,
            'message' => 'Bank Manager cleared successfully. Billing & Finance and everything else is untouched.',
        ]);
    }

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
        'message' => $categories[$category]['label'] . ' cleared successfully. Everything else (customers, machines, users, data in other areas) is untouched.',
    ]);
} catch (Throwable $error) {
    json_error('Reset failed: ' . $error->getMessage(), 500);
}
