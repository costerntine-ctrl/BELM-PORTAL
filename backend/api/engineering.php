<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/checklist_reports_helpers.php';

// GET /api/engineering?action=dashboard
// One combined response for the Engineering page: recent machine
// activity, open operator messages, machine status/condition summary,
// service reminders (due soon / overdue), and pending spare-part
// requests — everything an Engineer needs to scan at a glance, as cards.
$user = require_auth();
require_page_access($user, 'roles');
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'GET' && $action === 'dashboard') {
    // Recent activity tied to a specific machine (checklist submissions,
    // status/operational changes) — most recent first.
    $activity = db()->query(
        "SELECT cr.id, cr.created_at, cr.filled_by, cr.overall_status,
                m.brand, m.model, c.name AS customer_name
         FROM checklist_reports cr
         JOIN machines m ON m.id = cr.machine_id
         JOIN customers c ON c.id = m.customer_id
         ORDER BY cr.created_at DESC
         LIMIT 10"
    )->fetchAll();
    $activityCards = array_map(function ($row) {
        return [
            'machine' => trim(($row['brand'] ?? '') . ' ' . ($row['model'] ?? '')) ?: 'Machine',
            'customer' => $row['customer_name'],
            'filledBy' => $row['filled_by'],
            'status' => $row['overall_status'],
            'createdAt' => $row['created_at'],
        ];
    }, $activity);

    // Open operator messages (machine operators reporting an issue).
    $operatorMessages = db()->query(
        "SELECT o.id, o.message, o.operator_name, o.created_at,
                m.brand, m.model, c.name AS customer_name
         FROM operator_reports o
         JOIN machines m ON m.id = o.machine_id
         JOIN customers c ON c.id = o.customer_id
         WHERE o.status = 'OPEN'
         ORDER BY o.created_at DESC
         LIMIT 10"
    )->fetchAll();
    $operatorCards = array_map(function ($row) {
        return [
            'id' => $row['id'],
            'machine' => trim(($row['brand'] ?? '') . ' ' . ($row['model'] ?? '')) ?: 'Machine',
            'customer' => $row['customer_name'],
            'operatorName' => $row['operator_name'],
            'message' => $row['message'],
            'createdAt' => $row['created_at'],
        ];
    }, $operatorMessages);

    // Machine status/condition summary — counts by color.
    $statusCounts = db()->query(
        "SELECT COALESCE(status, 'NOT_CHECKED') AS status, COUNT(*) AS total
         FROM machines
         WHERE deleted_at IS NULL
         GROUP BY status"
    )->fetchAll();
    $statusSummary = ['GREEN' => 0, 'YELLOW' => 0, 'RED' => 0, 'NOT_CHECKED' => 0];
    foreach ($statusCounts as $row) {
        $key = strtoupper((string)$row['status']);
        if (isset($statusSummary[$key])) $statusSummary[$key] = (int)$row['total'];
    }

    // Service reminders — machines whose next service is due soon or
    // overdue, using the same interval-hours logic as the machine cards.
    $machines = db()->query(
        "SELECT m.id, m.brand, m.model, m.machine_type, c.name AS customer_name
         FROM machines m
         JOIN customers c ON c.id = m.customer_id
         WHERE m.deleted_at IS NULL"
    )->fetchAll();
    $reminders = [];
    foreach ($machines as $machine) {
        $status = compute_service_status_helper($machine['id']);
        if (!$status || !in_array($status['level'], ['YELLOW', 'RED'], true)) continue;
        $reminders[] = [
            'machineId' => $machine['id'],
            'machine' => trim(($machine['brand'] ?? '') . ' ' . ($machine['model'] ?? '')) ?: 'Machine',
            'customer' => $machine['customer_name'],
            'level' => $status['level'],
            'hoursRemaining' => round($status['hoursRemaining']),
            'intervalHours' => $status['intervalHours'],
        ];
    }
    usort($reminders, fn($a, $b) => $a['level'] === $b['level'] ? 0 : ($a['level'] === 'RED' ? -1 : 1));
    $reminders = array_slice($reminders, 0, 10);

    // Pending spare-part requests.
    $spareRequests = db()->query(
        "SELECT spr.id, spr.description, spr.quantity, spr.requested_by_name,
                spr.machine_type, spr.created_at, sp.name AS spare_part_name,
                m.brand, m.model, c.name AS customer_name
         FROM spare_part_requests spr
         LEFT JOIN spare_parts sp ON sp.id = spr.spare_part_id
         LEFT JOIN machines m ON m.id = spr.machine_id
         LEFT JOIN customers c ON c.id = m.customer_id
         WHERE spr.status = 'PENDING'
         ORDER BY spr.created_at DESC
         LIMIT 10"
    )->fetchAll();
    $spareCards = array_map(function ($row) {
        return [
            'id' => $row['id'],
            'name' => $row['spare_part_name'] ?: $row['description'] ?: 'Spare part',
            'quantity' => (int)$row['quantity'],
            'requestedBy' => $row['requested_by_name'],
            'machine' => trim(($row['brand'] ?? '') . ' ' . ($row['model'] ?? '')) ?: ($row['machine_type'] ?: null),
            'customer' => $row['customer_name'],
            'createdAt' => $row['created_at'],
        ];
    }, $spareRequests);

    json_out([
        'activity' => $activityCards,
        'operatorMessages' => $operatorCards,
        'machineStatus' => $statusSummary,
        'serviceReminders' => $reminders,
        'spareRequests' => $spareCards,
    ]);
}

json_error('Unknown request', 404);
