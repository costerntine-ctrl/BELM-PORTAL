<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
require_page_access($user, 'reports');
$action = $_GET['action'] ?? '';

if ($action === 'summary') {
    $customers = (int)db()->query('SELECT COUNT(*) FROM customers WHERE deleted_at IS NULL')->fetchColumn();
    $machines = (int)db()->query('SELECT COUNT(*) FROM machines WHERE deleted_at IS NULL')->fetchColumn();
    $openRequests = (int)db()->query("SELECT COUNT(*) FROM service_requests WHERE status IN ('OPEN','ASSIGNED','IN_PROGRESS')")->fetchColumn();
    $parts = db()->query('SELECT stock_qty, reorder_threshold FROM spare_parts WHERE deleted_at IS NULL')->fetchAll();
    $lowStockParts = count(array_filter($parts, fn($p) => $p['stock_qty'] <= $p['reorder_threshold']));
    $unpaidInvoices = (int)db()->query("SELECT COUNT(*) FROM invoices WHERE deleted_at IS NULL AND status IN ('UNPAID','PARTIALLY_PAID','OVERDUE')")->fetchColumn();
    json_out(compact('customers', 'machines', 'openRequests', 'lowStockParts', 'unpaidInvoices'));
}

if ($action === 'company-financials') {
    $period = $_GET['period'] ?? 'all';
    $since = null;
    if ($period === 'year') $since = date('Y-01-01');
    if ($period === 'month') $since = date('Y-m-01');

    $paymentSql = 'SELECT COALESCE(SUM(p.amount),0)
                   FROM payments p
                   JOIN invoices i ON i.id = p.invoice_id
                   WHERE i.deleted_at IS NULL';
    $paymentParams = [];
    if ($since) {
        $paymentSql .= ' AND p.paid_at >= ?';
        $paymentParams[] = $since;
    }
    $stmt = db()->prepare($paymentSql);
    $stmt->execute($paymentParams);
    $revenue = (float)$stmt->fetchColumn();

    $outstanding = (float)db()->query(
        "SELECT COALESCE(SUM(GREATEST(i.total - COALESCE(p.paid, 0), 0)), 0)
         FROM invoices i
         LEFT JOIN (
           SELECT invoice_id, SUM(amount) AS paid
           FROM payments GROUP BY invoice_id
         ) p ON p.invoice_id = i.id
         WHERE i.deleted_at IS NULL
           AND i.status IN ('UNPAID','PARTIALLY_PAID','OVERDUE')"
    )->fetchColumn();

    $expenseSql = 'SELECT COALESCE(SUM(amount),0)
                   FROM company_expenses WHERE deleted_at IS NULL';
    $expenseParams = [];
    if ($since) {
        $expenseSql .= ' AND date >= ?';
        $expenseParams[] = $since;
    }
    $stmt = db()->prepare($expenseSql);
    $stmt->execute($expenseParams);
    $totalCompanyExpenses = (float)$stmt->fetchColumn();

    json_out(['revenue' => $revenue, 'outstanding' => $outstanding, 'totalCompanyExpenses' => $totalCompanyExpenses, 'profitLoss' => $revenue - $totalCompanyExpenses]);
}

if ($action === 'technician-activity') {
    $techs = db()->query("SELECT u.* FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='Technician' AND u.deleted_at IS NULL")->fetchAll();
    $startOfToday = date('Y-m-d 00:00:00');
    $result = [];
    foreach ($techs as $t) {
        $stmt = db()->prepare('SELECT cr.*, c.name AS customer_name, m.model FROM checklist_reports cr
                                JOIN machines m ON m.id = cr.machine_id JOIN customers c ON c.id = m.customer_id
                                WHERE cr.filled_by = ? ORDER BY cr.created_at DESC LIMIT 1');
        $stmt->execute([$t['name']]);
        $last = $stmt->fetch();
        $result[] = [
            'id' => $t['id'], 'name' => $t['name'],
            'lastSite' => $last ? "{$last['customer_name']} — {$last['model']}" : null,
            'lastDate' => $last['created_at'] ?? null,
            'presentToday' => $last ? ($last['created_at'] >= $startOfToday) : false,
        ];
    }
    json_out($result);
}

json_error('Unknown request', 404);
