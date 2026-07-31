<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/helpers.php';

// POST /api/reset-database — Super Admin only, requires the delete PIN.
// {category: "all"} recreates the complete database.
// Other category values permanently clear only the selected area.

$user = require_auth();
require_super_admin($user);

$body = body();
$pin = trim((string)($body['pin'] ?? ''));
if ($pin === '') {
    json_error('Enter the delete PIN to confirm.');
}

$pinStatement = db()->query(
    "SELECT \"value\"::text FROM system_settings WHERE \"key\" = 'adminDeletePin' LIMIT 1"
);
$pinRaw = $pinStatement->fetchColumn();
$currentPin = is_string($pinRaw) ? json_decode($pinRaw, true) : '1234';
if (!is_string($currentPin) || $currentPin === '') {
    $currentPin = '1234';
}
if (!hash_equals($currentPin, $pin)) {
    json_error('Incorrect delete PIN.', 403);
}

$categories = [
    'customers' => 'Customers & Machines',
    'checklists' => 'Checklist Templates & Reports',
    'spare-parts' => 'Spare Parts & Requests',
    'suppliers' => 'Suppliers',
    'billing' => 'Billing & Finance',
    'service-requests' => 'Service Requests',
    'bank' => 'Bank Manager',
    'tasks' => 'Tasks',
    'activity' => 'Activity Log, Trash & Announcements',
    'usage-logs' => 'Machine Expenses / Petty Cash logs',
];

$category = trim((string)($body['category'] ?? 'all'));
$customerId = trim((string)($body['customerId'] ?? ''));

/** Execute one SQL statement with optional positional parameters. */
function belm_reset_exec(PDO $pdo, string $sql, array $params = []): void
{
    $statement = $pdo->prepare($sql);
    $statement->execute($params);
}

/**
 * Permanently remove one customer and every record that cannot remain without
 * that customer or one of their machines. Staff accounts and unrelated data
 * are preserved.
 */
function belm_hard_delete_customer(PDO $pdo, string $customerId): void
{
    $customerMachineSubquery = 'SELECT id FROM machines WHERE customer_id = ?';
    $customerRequestSubquery = 'SELECT id FROM service_requests WHERE customer_id = ?';
    $customerInvoiceSubquery = 'SELECT id FROM invoices WHERE customer_id = ?';
    $customerProformaSubquery = 'SELECT id FROM proforma_invoices WHERE customer_id = ?';
    $customerReportSubquery =
        'SELECT cr.id FROM checklist_reports cr '
        . 'JOIN machines m ON m.id = cr.machine_id WHERE m.customer_id = ?';

    belm_reset_exec(
        $pdo,
        "DELETE FROM trash_entries WHERE "
        . "(entity_type = 'customer' AND entity_id = ?) "
        . "OR (entity_type = 'machine' AND entity_id IN (" . $customerMachineSubquery . ")) "
        . "OR (entity_type = 'invoice' AND entity_id IN (" . $customerInvoiceSubquery . ")) "
        . "OR (entity_type = 'proformaInvoice' AND entity_id IN (" . $customerProformaSubquery . "))",
        [$customerId, $customerId, $customerId, $customerId]
    );

    belm_reset_exec(
        $pdo,
        'DELETE FROM checklist_answers WHERE report_id IN (' . $customerReportSubquery . ')',
        [$customerId]
    );
    belm_reset_exec(
        $pdo,
        'DELETE FROM checklist_reports WHERE machine_id IN (' . $customerMachineSubquery . ')',
        [$customerId]
    );

    belm_reset_exec(
        $pdo,
        'DELETE FROM service_notes WHERE request_id IN (' . $customerRequestSubquery . ')',
        [$customerId]
    );
    belm_reset_exec(
        $pdo,
        'DELETE FROM service_request_parts WHERE request_id IN (' . $customerRequestSubquery . ')',
        [$customerId]
    );
    belm_reset_exec(
        $pdo,
        'DELETE FROM spare_part_requests '
        . 'WHERE request_id IN (' . $customerRequestSubquery . ') '
        . 'OR machine_id IN (' . $customerMachineSubquery . ')',
        [$customerId, $customerId]
    );
    belm_reset_exec($pdo, 'DELETE FROM service_requests WHERE customer_id = ?', [$customerId]);

    belm_reset_exec(
        $pdo,
        'DELETE FROM invoice_items WHERE invoice_id IN (' . $customerInvoiceSubquery . ')',
        [$customerId]
    );
    belm_reset_exec(
        $pdo,
        'DELETE FROM payments WHERE invoice_id IN (' . $customerInvoiceSubquery . ')',
        [$customerId]
    );
    belm_reset_exec($pdo, 'DELETE FROM invoices WHERE customer_id = ?', [$customerId]);

    belm_reset_exec(
        $pdo,
        'DELETE FROM proforma_invoice_items WHERE proforma_id IN (' . $customerProformaSubquery . ')',
        [$customerId]
    );
    belm_reset_exec($pdo, 'DELETE FROM proforma_invoices WHERE customer_id = ?', [$customerId]);

    belm_reset_exec($pdo, 'DELETE FROM usage_logs WHERE customer_id = ?', [$customerId]);
    belm_reset_exec($pdo, 'DELETE FROM tasks WHERE customer_id = ?', [$customerId]);

    belm_reset_exec(
        $pdo,
        'DELETE FROM customer_applications '
        . 'WHERE customer_id = ? OR machine_id IN (' . $customerMachineSubquery . ')',
        [$customerId, $customerId]
    );
    belm_reset_exec($pdo, 'DELETE FROM customer_users WHERE customer_id = ?', [$customerId]);

    belm_reset_exec($pdo, 'UPDATE users SET assigned_customer_id = NULL WHERE assigned_customer_id = ?', [$customerId]);
    belm_reset_exec(
        $pdo,
        'UPDATE user_applications SET assigned_customer_id = NULL WHERE assigned_customer_id = ?',
        [$customerId]
    );

    belm_reset_exec($pdo, 'DELETE FROM machines WHERE customer_id = ?', [$customerId]);
    belm_reset_exec($pdo, 'DELETE FROM customers WHERE id = ?', [$customerId]);
}

/** Clear all customers while retaining staff, roles and unrelated records. */
function belm_clear_all_customers(PDO $pdo): void
{
    belm_reset_exec($pdo, 'DELETE FROM checklist_answers');
    belm_reset_exec($pdo, 'DELETE FROM checklist_reports');

    belm_reset_exec($pdo, 'DELETE FROM service_notes');
    belm_reset_exec($pdo, 'DELETE FROM service_request_parts');
    belm_reset_exec($pdo, 'DELETE FROM spare_part_requests WHERE request_id IS NOT NULL OR machine_id IS NOT NULL');
    belm_reset_exec($pdo, 'DELETE FROM service_requests');

    belm_reset_exec($pdo, 'DELETE FROM invoice_items');
    belm_reset_exec($pdo, 'DELETE FROM payments');
    belm_reset_exec($pdo, 'DELETE FROM invoices');

    belm_reset_exec($pdo, 'DELETE FROM proforma_invoice_items');
    belm_reset_exec($pdo, 'DELETE FROM proforma_invoices');

    belm_reset_exec($pdo, 'DELETE FROM usage_logs');
    belm_reset_exec($pdo, 'DELETE FROM tasks WHERE customer_id IS NOT NULL');
    belm_reset_exec($pdo, 'DELETE FROM customer_applications');
    belm_reset_exec($pdo, 'DELETE FROM customer_users');
    belm_reset_exec($pdo, "DELETE FROM trash_entries WHERE entity_type IN ('customer', 'machine', 'invoice', 'proformaInvoice')");

    belm_reset_exec($pdo, 'UPDATE users SET assigned_customer_id = NULL WHERE assigned_customer_id IS NOT NULL');
    belm_reset_exec($pdo, 'UPDATE user_applications SET assigned_customer_id = NULL WHERE assigned_customer_id IS NOT NULL');

    belm_reset_exec($pdo, 'DELETE FROM machines');
    belm_reset_exec($pdo, 'DELETE FROM customers');
}

/** Clear the selected category without relying on TRUNCATE ... CASCADE. */
function belm_clear_category(PDO $pdo, string $category): void
{
    switch ($category) {
        case 'customers':
            belm_clear_all_customers($pdo);
            return;

        case 'checklists':
            belm_reset_exec($pdo, 'UPDATE service_requests SET template_id = NULL WHERE template_id IS NOT NULL');
            belm_reset_exec($pdo, 'DELETE FROM checklist_answers');
            belm_reset_exec($pdo, 'DELETE FROM checklist_reports');
            belm_reset_exec($pdo, 'DELETE FROM checklist_template_items');
            belm_reset_exec($pdo, 'DELETE FROM checklist_template_parts');
            belm_reset_exec($pdo, 'DELETE FROM checklist_templates');
            belm_reset_exec($pdo, "DELETE FROM trash_entries WHERE entity_type = 'template'");
            return;

        case 'spare-parts':
            belm_reset_exec($pdo, 'DELETE FROM spare_part_requests');
            belm_reset_exec($pdo, 'DELETE FROM spare_parts');
            belm_reset_exec($pdo, "DELETE FROM trash_entries WHERE entity_type = 'sparePart'");
            return;

        case 'suppliers':
            belm_reset_exec($pdo, 'DELETE FROM suppliers');
            belm_reset_exec($pdo, "DELETE FROM trash_entries WHERE entity_type = 'supplier'");
            return;

        case 'billing':
            belm_reset_exec($pdo, 'DELETE FROM invoice_items');
            belm_reset_exec($pdo, 'DELETE FROM payments');
            belm_reset_exec($pdo, 'DELETE FROM invoices');
            belm_reset_exec($pdo, 'DELETE FROM proforma_invoice_items');
            belm_reset_exec($pdo, 'DELETE FROM proforma_invoices');
            belm_reset_exec($pdo, 'DELETE FROM company_expenses');
            belm_reset_exec(
                $pdo,
                "DELETE FROM trash_entries WHERE entity_type IN ('invoice', 'proformaInvoice', 'companyExpense')"
            );
            return;

        case 'service-requests':
            belm_reset_exec($pdo, 'DELETE FROM service_notes');
            belm_reset_exec($pdo, 'DELETE FROM service_request_parts');
            belm_reset_exec($pdo, 'DELETE FROM spare_part_requests WHERE request_id IS NOT NULL');
            belm_reset_exec($pdo, 'DELETE FROM service_requests');
            return;

        case 'bank':
            belm_reset_exec($pdo, 'UPDATE payments SET bank_account_id = NULL WHERE bank_account_id IS NOT NULL');
            belm_reset_exec($pdo, 'UPDATE company_expenses SET bank_account_id = NULL WHERE bank_account_id IS NOT NULL');
            belm_reset_exec($pdo, 'DELETE FROM bank_withdrawals');
            belm_reset_exec($pdo, 'DELETE FROM bank_accounts');
            return;

        case 'tasks':
            belm_reset_exec($pdo, 'DELETE FROM tasks');
            return;

        case 'activity':
            belm_reset_exec($pdo, 'DELETE FROM activity_logs');
            belm_reset_exec($pdo, 'DELETE FROM trash_entries');
            belm_reset_exec($pdo, 'DELETE FROM admin_announcements');
            return;

        case 'usage-logs':
            belm_reset_exec($pdo, 'DELETE FROM usage_logs');
            return;
    }

    throw new InvalidArgumentException('Unknown reset category.');
}

try {
    $pdo = db();

    if ($category === 'all') {
        $pdo->beginTransaction();
        try {
            $pdo->query("SELECT pg_advisory_xact_lock(hashtext('belm_portal_full_reset'))");

            $tables = $pdo->query(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
            )->fetchAll(PDO::FETCH_COLUMN);

            if ($tables) {
                $quotedTables = array_map(
                    static fn(string $table): string => '"' . str_replace('"', '""', $table) . '"',
                    $tables
                );
                $pdo->exec('DROP TABLE IF EXISTS ' . implode(', ', $quotedTables) . ' CASCADE');
            }

            $schema = file_get_contents(__DIR__ . '/../schema.sql');
            if ($schema === false || trim($schema) === '') {
                throw new RuntimeException('Could not read schema.sql.');
            }
            $pdo->exec($schema);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }

        json_out([
            'ok' => true,
            'message' => 'Database wiped and reseeded. Admin login: admin@belmgeneraltech.co.tz / ChangeMe123! — change the password immediately.',
        ]);
    }

    if (!array_key_exists($category, $categories)) {
        json_error('Unknown reset category.', 400);
    }

    if ($category === 'customers' && $customerId !== '') {
        $nameStatement = $pdo->prepare('SELECT name FROM customers WHERE id = ?');
        $nameStatement->execute([$customerId]);
        $customerName = $nameStatement->fetchColumn();
        if (!is_string($customerName)) {
            json_error('Customer not found.', 404);
        }

        $pdo->beginTransaction();
        try {
            belm_hard_delete_customer($pdo, $customerId);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }

        json_out([
            'ok' => true,
            'message' => 'Customer "' . $customerName . '" and all linked machines, invoices, reports and service records were permanently deleted. Everything else is unchanged.',
        ]);
    }

    $pdo->beginTransaction();
    try {
        belm_clear_category($pdo, $category);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }

    json_out([
        'ok' => true,
        'message' => $categories[$category] . ' cleared successfully. Unrelated portal data and the Administrator account were preserved.',
    ]);
} catch (Throwable $error) {
    $classification = belm_classify_exception($error);
    error_log(sprintf(
        'BELM reset error requestId=%s category=%s class=%s sqlstate=%s message=%s at=%s:%d',
        belm_request_id(),
        $category,
        get_class($error),
        $classification['sqlState'] ?: 'none',
        preg_replace('/[\r\n]+/', ' ', $error->getMessage()),
        $error->getFile(),
        $error->getLine()
    ));

    json_out([
        'error' => $classification['message'] . ' Request ID: ' . belm_request_id(),
        'code' => $classification['code'],
        'requestId' => belm_request_id(),
    ], (int)$classification['status']);
}
