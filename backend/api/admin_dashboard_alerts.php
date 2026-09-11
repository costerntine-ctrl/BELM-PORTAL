<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/service_due_helper.php';

$user = require_auth();
require_page_access($user, 'overview');
$pdo = db();

function admin_alert_table_exists(PDO $pdo, string $table): bool {
    $stmt = $pdo->prepare('SELECT to_regclass(?) IS NOT NULL');
    $stmt->execute(['public.' . $table]);
    return (bool)$stmt->fetchColumn();
}

// Machine service alerts come from the same live machine/service-hour logic used
// by the workshop. Fall back to the stored service_kit flag only if one machine
// cannot be calculated during a rolling deployment.
$machineRows = $pdo->query(
    "SELECT id, service_kit
     FROM machines
     WHERE deleted_at IS NULL"
)->fetchAll();
$machinesDue = 0;
foreach ($machineRows as $machine) {
    $due = false;
    try {
        $service = compute_service_status_helper((string)$machine['id']);
        $level = strtoupper(trim((string)($service['level'] ?? '')));
        $statusText = strtoupper(trim((string)($service['statusText'] ?? '')));
        $due = in_array($level, ['DUE','OVERDUE','REQUIRED','RED','YELLOW'], true)
            || preg_match('/\b(DUE|OVERDUE|REQUIRED)\b/', $statusText) === 1;
    } catch (Throwable $ignored) {
        $stored = strtoupper(trim((string)($machine['service_kit'] ?? '')));
        $due = preg_match('/DUE|OVERDUE|REQUIRED/', $stored) === 1;
    }
    if ($due) $machinesDue++;
}

// Store alert uses each item's configured reorder threshold. Legacy rows that
// have no useful threshold keep BELM's existing <=5 fallback.
$lowStock = (int)$pdo->query(
    "SELECT COUNT(*)
     FROM spare_parts
     WHERE deleted_at IS NULL
       AND stock_qty <= CASE WHEN COALESCE(reorder_threshold,0) > 0 THEN reorder_threshold ELSE 5 END"
)->fetchColumn();

// Fuel is a shared Operator + Procurement signal. Operator fuel entries are
// written to usage_logs; Procurement fuel records are written to
// belm_procurement_consumables. A machine remains 'Fuel Refill Due' while its
// newest Operator fuel entry is newer than the newest Procurement fuel record
// for that same machine (or Procurement has not recorded one yet).
$fuelRefillDue = 0;
$operatorFuelToday = 0;
$procurementFuelToday = 0;
if (admin_alert_table_exists($pdo, 'usage_logs')) {
    $operatorFuelToday = (int)$pdo->query(
        "SELECT COUNT(*) FROM usage_logs
         WHERE UPPER(COALESCE(category,''))='FUEL' AND date=CURRENT_DATE"
    )->fetchColumn();
}
if (admin_alert_table_exists($pdo, 'belm_procurement_consumables')) {
    $procurementFuelToday = (int)$pdo->query(
        "SELECT COUNT(*) FROM belm_procurement_consumables
         WHERE UPPER(COALESCE(category,''))='FUEL' AND usage_date=CURRENT_DATE"
    )->fetchColumn();
}
if (admin_alert_table_exists($pdo, 'usage_logs') && admin_alert_table_exists($pdo, 'belm_procurement_consumables')) {
    $fuelRefillDue = (int)$pdo->query(
        "WITH operator_fuel AS (
            SELECT machine_id, MAX(date) AS latest_operator_date
            FROM usage_logs
            WHERE UPPER(COALESCE(category,''))='FUEL' AND machine_id IS NOT NULL
            GROUP BY machine_id
         ), procurement_fuel AS (
            SELECT machine_id, MAX(usage_date) AS latest_procurement_date
            FROM belm_procurement_consumables
            WHERE UPPER(COALESCE(category,''))='FUEL' AND machine_id IS NOT NULL
            GROUP BY machine_id
         )
         SELECT COUNT(*)
         FROM operator_fuel o
         LEFT JOIN procurement_fuel p ON p.machine_id=o.machine_id
         JOIN machines m ON m.id=o.machine_id AND m.deleted_at IS NULL
         WHERE p.latest_procurement_date IS NULL
            OR o.latest_operator_date > p.latest_procurement_date"
    )->fetchColumn();
} elseif (admin_alert_table_exists($pdo, 'usage_logs')) {
    $fuelRefillDue = (int)$pdo->query(
        "SELECT COUNT(DISTINCT u.machine_id)
         FROM usage_logs u
         JOIN machines m ON m.id=u.machine_id AND m.deleted_at IS NULL
         WHERE UPPER(COALESCE(u.category,''))='FUEL'"
    )->fetchColumn();
}

// 'Expired Documents' on the Main Dashboard means expired BELM Proformas.
// Quote Validity is stored as readable text such as 'Valid for 7 days'; use
// its first day number against the Proforma date. Generated invoices are not
// counted because that Proforma has already completed its commercial purpose.
$expiredProformas = 0;
if (admin_alert_table_exists($pdo, 'proforma_invoices')) {
    try {
        $expiredProformas = (int)$pdo->query(
            "SELECT COUNT(*)
             FROM proforma_invoices p
             LEFT JOIN invoices i
               ON i.source_proforma_id=p.id
              AND i.deleted_at IS NULL
              AND COALESCE(i.status,'')<>'CANCELLED'
             WHERE p.deleted_at IS NULL
               AND i.id IS NULL
               AND COALESCE(p.quote_validity,'') ~ '[0-9]+'
               AND p.date + (substring(p.quote_validity from '([0-9]+)')::int * INTERVAL '1 day') < CURRENT_DATE"
        )->fetchColumn();
    } catch (Throwable $ignored) {
        // Do not break the entire dashboard if a rolling schema update has not
        // yet added one of the billing linkage columns.
        $expiredProformas = 0;
    }
}

json_out([
    'ok' => true,
    'syncedAt' => gmdate('c'),
    'machinesDueForService' => $machinesDue,
    'lowStockItems' => $lowStock,
    'fuelRefillDue' => $fuelRefillDue,
    'expiredProformas' => $expiredProformas,
    'sources' => [
        'machinesDueForService' => 'Machines + Service Tracking',
        'lowStockItems' => 'Spare Parts Inventory',
        'fuelRefillDue' => 'Operator Fuel Usage + Procurement Fuel',
        'expiredProformas' => 'Proforma Quote Validity',
    ],
    'fuelSync' => [
        'operatorEntriesToday' => $operatorFuelToday,
        'procurementEntriesToday' => $procurementFuelToday,
    ],
]);
