<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($action === 'all-overview') {
    require_page_access($user, 'overview');
} else {
    require_page_access($user, 'reports');
}

function report_date(string $value, string $fallback): string {
    $value = trim($value);
    if ($value === '') return $fallback;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    if (!$date || $date->format('Y-m-d') !== $value) {
        json_error('Enter a valid report date.', 422);
    }
    return $value;
}

function report_bounds(): array {
    $today = new DateTimeImmutable('today');
    $period = strtolower(trim((string)($_GET['period'] ?? 'month')));

    if (!empty($_GET['dateFrom']) || !empty($_GET['dateTo'])) {
        $from = report_date((string)($_GET['dateFrom'] ?? ''), $today->modify('first day of this month')->format('Y-m-d'));
        $to = report_date((string)($_GET['dateTo'] ?? ''), $today->format('Y-m-d'));
        if ($from > $to) json_error('Report start date cannot be after the end date.', 422);
        $start = new DateTimeImmutable($from);
        $end = new DateTimeImmutable($to);
        $days = (int)$start->diff($end)->format('%a') + 1;
        $previousTo = $start->modify('-1 day');
        $previousFrom = $previousTo->modify('-' . max(0, $days - 1) . ' days');
        return [
            'period' => 'custom',
            'from' => $from,
            'to' => $to,
            'previousFrom' => $previousFrom->format('Y-m-d'),
            'previousTo' => $previousTo->format('Y-m-d'),
            'label' => "$from to $to",
        ];
    }

    if ($period === 'today') {
        $from = $today;
        $to = $today;
        $previousFrom = $today->modify('-1 day');
        $previousTo = $previousFrom;
    } elseif ($period === 'week') {
        $from = $today->modify('monday this week');
        $to = $today;
        $previousFrom = $from->modify('-7 days');
        $previousTo = $from->modify('-1 day');
    } elseif ($period === 'year') {
        $from = $today->modify('first day of January');
        $to = $today;
        $previousFrom = $from->modify('-1 year');
        $previousTo = $today->modify('-1 year');
    } else {
        $period = 'month';
        $from = $today->modify('first day of this month');
        $to = $today;
        $previousFrom = $from->modify('-1 month');
        $previousTo = $today->modify('-1 month');
    }

    return [
        'period' => $period,
        'from' => $from->format('Y-m-d'),
        'to' => $to->format('Y-m-d'),
        'previousFrom' => $previousFrom->format('Y-m-d'),
        'previousTo' => $previousTo->format('Y-m-d'),
        'label' => ucfirst($period),
    ];
}

function scalar_query(string $sql, array $params = []): float {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return (float)$stmt->fetchColumn();
}

function financial_slice(string $from, string $to): array {
    $timestampFilter = ' >= CAST(? AS DATE) AND %s < (CAST(? AS DATE) + INTERVAL \'1 day\')';

    $sales = scalar_query(
        'SELECT COALESCE(SUM(total),0) FROM invoices
         WHERE deleted_at IS NULL
           AND created_at' . sprintf($timestampFilter, 'created_at'),
        [$from, $to]
    );
    $revenue = scalar_query(
        'SELECT COALESCE(SUM(p.amount),0)
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         WHERE i.deleted_at IS NULL
           AND p.paid_at' . sprintf($timestampFilter, 'p.paid_at'),
        [$from, $to]
    );
    $expenses = scalar_query(
        'SELECT COALESCE(SUM(amount),0)
         FROM company_expenses
         WHERE deleted_at IS NULL
           AND date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)',
        [$from, $to]
    );
    $outstanding = scalar_query(
        "SELECT COALESCE(SUM(GREATEST(i.total - COALESCE(p.paid, 0), 0)), 0)
         FROM invoices i
         LEFT JOIN (
           SELECT invoice_id, SUM(amount) AS paid
           FROM payments GROUP BY invoice_id
         ) p ON p.invoice_id = i.id
         WHERE i.deleted_at IS NULL
           AND i.status IN ('UNPAID','PARTIALLY_PAID','OVERDUE')"
    );

    return [
        'sales' => $sales,
        'revenue' => $revenue,
        'expenses' => $expenses,
        'profitLoss' => $revenue - $expenses,
        'outstanding' => $outstanding,
    ];
}

function grouped_counts(string $sql, array $params = []): array {
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[(string)$row['name']] = (int)$row['total'];
    }
    return $out;
}

if ($action === 'summary' && $method === 'GET') {
    $customers = (int)db()->query('SELECT COUNT(*) FROM customers WHERE deleted_at IS NULL')->fetchColumn();
    $machines = (int)db()->query('SELECT COUNT(*) FROM machines WHERE deleted_at IS NULL')->fetchColumn();
    $openRequests = (int)db()->query("SELECT COUNT(*) FROM service_requests WHERE status IN ('OPEN','ASSIGNED','IN_PROGRESS')")->fetchColumn();
    $parts = db()->query('SELECT stock_qty, reorder_threshold FROM spare_parts WHERE deleted_at IS NULL')->fetchAll();
    $lowStockParts = count(array_filter($parts, static fn(array $part): bool =>
        (int)$part['stock_qty'] <= (int)$part['reorder_threshold']
    ));
    $unpaidInvoices = (int)db()->query("SELECT COUNT(*) FROM invoices WHERE deleted_at IS NULL AND status IN ('UNPAID','PARTIALLY_PAID','OVERDUE')")->fetchColumn();
    json_out(compact('customers', 'machines', 'openRequests', 'lowStockParts', 'unpaidInvoices'));
}

if ($action === 'company-financials' && $method === 'GET') {
    $bounds = report_bounds();
    json_out([
        ...financial_slice($bounds['from'], $bounds['to']),
        'period' => $bounds,
    ]);
}

if ($action === 'all-overview' && $method === 'GET') {
    $bounds = report_bounds();
    $finance = financial_slice($bounds['from'], $bounds['to']);

    $pendingApplications = (int)db()->query(
        "SELECT
          (SELECT COUNT(*) FROM customer_applications WHERE status = 'PENDING')
          + (SELECT COUNT(*) FROM user_applications WHERE status = 'PENDING')"
    )->fetchColumn();
    $inventorySummary = db()->query(
        "SELECT
           COUNT(*) AS total_part_types,
           COALESCE(SUM(stock_qty), 0) AS total_stock_qty,
           COUNT(*) FILTER (WHERE stock_qty <= reorder_threshold) AS low_stock_parts,
           COUNT(*) FILTER (WHERE stock_qty = 0) AS out_of_stock_parts,
           COALESCE(SUM(stock_qty * purchase_price), 0) AS purchase_stock_value,
           COALESCE(SUM(stock_qty * selling_price), 0) AS selling_stock_value,
           COALESCE(SUM(stock_qty * (selling_price - purchase_price)), 0) AS potential_margin
         FROM spare_parts
         WHERE deleted_at IS NULL"
    )->fetch() ?: [];
    $inventoryRows = db()->query(
        "SELECT id, part_number, name, category, stock_qty, reorder_threshold,
                purchase_price, selling_price,
                (stock_qty * purchase_price) AS purchase_stock_value,
                CASE
                  WHEN stock_qty = 0 THEN 'OUT_OF_STOCK'
                  WHEN stock_qty <= reorder_threshold THEN 'LOW_STOCK'
                  ELSE 'IN_STOCK'
                END AS stock_status
         FROM spare_parts
         WHERE deleted_at IS NULL
         ORDER BY
           CASE
             WHEN stock_qty = 0 THEN 0
             WHEN stock_qty <= reorder_threshold THEN 1
             ELSE 2
           END,
           name ASC"
    )->fetchAll();
    foreach ($inventoryRows as &$inventoryPart) {
        $inventoryPart['partNumber'] = $inventoryPart['part_number'];
        $inventoryPart['stockQty'] = (int)$inventoryPart['stock_qty'];
        $inventoryPart['reorderThreshold'] = (int)$inventoryPart['reorder_threshold'];
        $inventoryPart['purchasePrice'] = (float)$inventoryPart['purchase_price'];
        $inventoryPart['sellingPrice'] = (float)$inventoryPart['selling_price'];
        $inventoryPart['purchaseStockValue'] = (float)$inventoryPart['purchase_stock_value'];
        $inventoryPart['stockStatus'] = $inventoryPart['stock_status'];
        unset(
            $inventoryPart['part_number'],
            $inventoryPart['stock_qty'],
            $inventoryPart['reorder_threshold'],
            $inventoryPart['purchase_price'],
            $inventoryPart['selling_price'],
            $inventoryPart['purchase_stock_value'],
            $inventoryPart['stock_status']
        );
    }
    unset($inventoryPart);

    $roles = db()->query(
        "SELECT r.id, r.name,
                COUNT(u.id) FILTER (WHERE u.deleted_at IS NULL) AS staff_total,
                COUNT(u.id) FILTER (WHERE u.deleted_at IS NULL AND u.is_active = 1) AS active_total,
                COUNT(u.id) FILTER (WHERE u.deleted_at IS NULL AND u.is_active = 0) AS inactive_total
         FROM roles r
         LEFT JOIN users u ON u.role_id = r.id
         WHERE r.deleted_at IS NULL
         GROUP BY r.id, r.name
         ORDER BY r.name"
    )->fetchAll();

    $roleTasks = db()->query(
        "SELECT r.id,
                COUNT(t.id) FILTER (WHERE t.status = 'PENDING') AS pending_tasks,
                COUNT(t.id) FILTER (WHERE t.status = 'DONE') AS completed_tasks
         FROM roles r
         LEFT JOIN users u ON u.role_id = r.id AND u.deleted_at IS NULL
         LEFT JOIN tasks t ON t.assigned_to_id = u.id
         WHERE r.deleted_at IS NULL
         GROUP BY r.id"
    )->fetchAll();
    $roleTaskMap = [];
    foreach ($roleTasks as $row) $roleTaskMap[$row['id']] = $row;
    foreach ($roles as &$role) {
        $tasks = $roleTaskMap[$role['id']] ?? [];
        $role['pending_tasks'] = (int)($tasks['pending_tasks'] ?? 0);
        $role['completed_tasks'] = (int)($tasks['completed_tasks'] ?? 0);
        $role['staffTotal'] = (int)$role['staff_total'];
        $role['activeTotal'] = (int)$role['active_total'];
        $role['inactiveTotal'] = (int)$role['inactive_total'];
        $role['pendingTasks'] = $role['pending_tasks'];
        $role['completedTasks'] = $role['completed_tasks'];
    }
    unset($role);

    $recentActivities = db()->query(
        "SELECT a.id, a.action, a.entity, a.created_at, u.name AS user_name, r.name AS role_name
         FROM activity_logs a
         JOIN users u ON u.id = a.user_id
         JOIN roles r ON r.id = u.role_id
         ORDER BY a.created_at DESC
         LIMIT 12"
    )->fetchAll();
    foreach ($recentActivities as &$activity) {
        $activity['createdAt'] = $activity['created_at'];
        $activity['userName'] = $activity['user_name'];
        $activity['roleName'] = $activity['role_name'];
        unset($activity['created_at'], $activity['user_name'], $activity['role_name']);
    }
    unset($activity);

    json_out([
        'period' => $bounds,
        'totals' => [
            'customers' => (int)db()->query('SELECT COUNT(*) FROM customers WHERE deleted_at IS NULL')->fetchColumn(),
            'machines' => (int)db()->query('SELECT COUNT(*) FROM machines WHERE deleted_at IS NULL')->fetchColumn(),
            'employees' => (int)db()->query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL')->fetchColumn(),
            'activeEmployees' => (int)db()->query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND is_active = 1')->fetchColumn(),
            'pendingApplications' => $pendingApplications,
            'openRequests' => (int)db()->query("SELECT COUNT(*) FROM service_requests WHERE status IN ('OPEN','ASSIGNED','IN_PROGRESS','ON_HOLD')")->fetchColumn(),
            'pendingTasks' => (int)db()->query("SELECT COUNT(*) FROM tasks WHERE status = 'PENDING'")->fetchColumn(),
            'completedTasks' => (int)db()->query("SELECT COUNT(*) FROM tasks WHERE status = 'DONE'")->fetchColumn(),
            'lowStockParts' => (int)($inventorySummary['low_stock_parts'] ?? 0),
        ],
        'finance' => $finance,
        'inventory' => [
            'summary' => [
                'totalPartTypes' => (int)($inventorySummary['total_part_types'] ?? 0),
                'totalStockQty' => (int)($inventorySummary['total_stock_qty'] ?? 0),
                'lowStockParts' => (int)($inventorySummary['low_stock_parts'] ?? 0),
                'outOfStockParts' => (int)($inventorySummary['out_of_stock_parts'] ?? 0),
                'purchaseStockValue' => (float)($inventorySummary['purchase_stock_value'] ?? 0),
                'sellingStockValue' => (float)($inventorySummary['selling_stock_value'] ?? 0),
                'potentialMargin' => (float)($inventorySummary['potential_margin'] ?? 0),
            ],
            'items' => $inventoryRows,
        ],
        'serviceStatus' => grouped_counts(
            'SELECT status AS name, COUNT(*) AS total FROM service_requests GROUP BY status ORDER BY status'
        ),
        'machineStatus' => grouped_counts(
            "SELECT COALESCE(status, 'UNKNOWN') AS name, COUNT(*) AS total
             FROM machines WHERE deleted_at IS NULL GROUP BY COALESCE(status, 'UNKNOWN')"
        ),
        'attendanceToday' => grouped_counts(
            'SELECT status AS name, COUNT(*) AS total
             FROM attendance_records WHERE work_date = CURRENT_DATE GROUP BY status'
        ),
        'roles' => $roles,
        'recentActivities' => $recentActivities,
    ]);
}

if ($action === 'analytics' && $method === 'GET') {
    $bounds = report_bounds();
    $current = financial_slice($bounds['from'], $bounds['to']);
    $previous = financial_slice($bounds['previousFrom'], $bounds['previousTo']);

    $trendRows = [];
    $trendQueries = [
        'sales' => "SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
                           COALESCE(SUM(total),0) AS total
                    FROM invoices
                    WHERE deleted_at IS NULL
                      AND created_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
                    GROUP BY DATE_TRUNC('month', created_at)",
        'revenue' => "SELECT TO_CHAR(DATE_TRUNC('month', paid_at), 'YYYY-MM') AS month,
                             COALESCE(SUM(amount),0) AS total
                      FROM payments
                      WHERE paid_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
                      GROUP BY DATE_TRUNC('month', paid_at)",
        'expenses' => "SELECT TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS month,
                              COALESCE(SUM(amount),0) AS total
                       FROM company_expenses
                       WHERE deleted_at IS NULL
                         AND date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
                       GROUP BY DATE_TRUNC('month', date)",
    ];
    foreach ($trendQueries as $key => $sql) {
        foreach (db()->query($sql)->fetchAll() as $row) {
            $month = $row['month'];
            if (!isset($trendRows[$month])) {
                $trendRows[$month] = ['month' => $month, 'sales' => 0, 'revenue' => 0, 'expenses' => 0];
            }
            $trendRows[$month][$key] = (float)$row['total'];
        }
    }
    ksort($trendRows);
    foreach ($trendRows as &$row) $row['profitLoss'] = $row['revenue'] - $row['expenses'];
    unset($row);

    $roleActivity = db()->prepare(
        "SELECT r.name,
                COUNT(DISTINCT u.id) FILTER (WHERE u.deleted_at IS NULL AND u.is_active = 1) AS active_users,
                COUNT(DISTINCT a.id) AS activities,
                COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'PENDING') AS pending_tasks,
                COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'DONE') AS completed_tasks
         FROM roles r
         LEFT JOIN users u ON u.role_id = r.id
         LEFT JOIN activity_logs a ON a.user_id = u.id
              AND a.created_at >= CAST(? AS DATE)
              AND a.created_at < (CAST(? AS DATE) + INTERVAL '1 day')
         LEFT JOIN tasks t ON t.assigned_to_id = u.id
         WHERE r.deleted_at IS NULL
         GROUP BY r.id, r.name
         ORDER BY r.name"
    );
    $roleActivity->execute([$bounds['from'], $bounds['to']]);

    json_out([
        'period' => $bounds,
        'current' => $current,
        'previous' => $previous,
        'trend' => array_values($trendRows),
        'attendance' => grouped_counts(
            'SELECT status AS name, COUNT(*) AS total
             FROM attendance_records
             WHERE work_date BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)
             GROUP BY status',
            [$bounds['from'], $bounds['to']]
        ),
        'tasks' => grouped_counts(
            'SELECT status AS name, COUNT(*) AS total
             FROM tasks
             WHERE created_at >= CAST(? AS DATE)
               AND created_at < (CAST(? AS DATE) + INTERVAL \'1 day\')
             GROUP BY status',
            [$bounds['from'], $bounds['to']]
        ),
        'serviceRequests' => grouped_counts(
            'SELECT status AS name, COUNT(*) AS total
             FROM service_requests
             WHERE created_at >= CAST(? AS DATE)
               AND created_at < (CAST(? AS DATE) + INTERVAL \'1 day\')
             GROUP BY status',
            [$bounds['from'], $bounds['to']]
        ),
        'roleActivity' => $roleActivity->fetchAll(),
    ]);
}

if ($action === 'attendance' && $method === 'GET') {
    $date = report_date((string)($_GET['date'] ?? ''), date('Y-m-d'));
    $stmt = db()->prepare(
        "SELECT u.id AS user_id, u.name, u.email, r.name AS role_name,
                ar.id AS attendance_id,
                COALESCE(ar.status, 'NOT_RECORDED') AS status,
                ar.work_date, ar.check_in, ar.check_out, ar.notes
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN attendance_records ar
           ON ar.user_id = u.id AND ar.work_date = CAST(? AS DATE)
         WHERE u.deleted_at IS NULL AND u.is_active = 1
         ORDER BY r.name, u.name"
    );
    $stmt->execute([$date]);
    json_out(['date' => $date, 'employees' => $stmt->fetchAll()]);
}

if ($action === 'attendance' && $method === 'POST') {
    $body = body();
    $userId = trim((string)($body['userId'] ?? ''));
    $workDate = report_date((string)($body['workDate'] ?? ''), date('Y-m-d'));
    $status = strtoupper(trim((string)($body['status'] ?? 'PRESENT')));
    $statuses = ['PRESENT', 'LATE', 'ABSENT', 'LEAVE', 'REMOTE'];
    if (!in_array($status, $statuses, true)) json_error('Select a valid attendance status.', 422);

    $stmt = db()->prepare(
        'SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
    );
    $stmt->execute([$userId]);
    if (!$stmt->fetch()) json_error('Select an active employee.', 422);

    $timeValue = static function ($value) use ($workDate): ?string {
        $value = trim((string)$value);
        if ($value === '') return null;
        if (!preg_match('/^\d{2}:\d{2}$/', $value)) json_error('Attendance time must use HH:MM.', 422);
        return "$workDate $value:00";
    };
    $checkIn = $timeValue($body['checkIn'] ?? '');
    $checkOut = $timeValue($body['checkOut'] ?? '');
    $notes = trim((string)($body['notes'] ?? ''));

    db()->prepare(
        'INSERT INTO attendance_records
         (id, user_id, work_date, status, check_in, check_out, notes, recorded_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())
         ON CONFLICT (user_id, work_date) DO UPDATE SET
           status = EXCLUDED.status,
           check_in = EXCLUDED.check_in,
           check_out = EXCLUDED.check_out,
           notes = EXCLUDED.notes,
           recorded_by = EXCLUDED.recorded_by,
           updated_at = NOW()'
    )->execute([
        uuid(),
        $userId,
        $workDate,
        $status,
        $checkIn,
        $checkOut,
        $notes !== '' ? $notes : null,
        $user['id'],
    ]);
    json_out(['ok' => true, 'message' => 'Attendance saved successfully.']);
}

if ($action === 'technician-activity' && $method === 'GET') {
    $technicians = db()->query(
        "SELECT u.* FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE r.name = 'Technician' AND u.deleted_at IS NULL"
    )->fetchAll();
    $startOfToday = date('Y-m-d 00:00:00');
    $result = [];
    foreach ($technicians as $technician) {
        $stmt = db()->prepare(
            'SELECT cr.*, c.name AS customer_name, m.model
             FROM checklist_reports cr
             JOIN machines m ON m.id = cr.machine_id
             JOIN customers c ON c.id = m.customer_id
             WHERE cr.filled_by = ?
             ORDER BY cr.created_at DESC LIMIT 1'
        );
        $stmt->execute([$technician['name']]);
        $last = $stmt->fetch();
        $result[] = [
            'id' => $technician['id'],
            'name' => $technician['name'],
            'lastSite' => $last ? "{$last['customer_name']} — {$last['model']}" : null,
            'lastDate' => $last['created_at'] ?? null,
            'presentToday' => $last ? ($last['created_at'] >= $startOfToday) : false,
        ];
    }
    json_out($result);
}

json_error('Unknown request', 404);
