<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
require_page_access($user, 'overview');
$pdo = db();

$rows = $pdo->query(
    "SELECT m.id,m.customer_id,m.machine_type,m.brand,m.model,m.fleet_number,m.serial_number,m.reg_number,
            m.last_service_hours,m.service_schedule_baseline_hours,c.name AS customer_name,
            s.id AS service_alert_id,s.due_hour,s.service_interval_hours,s.current_hours,s.status AS service_status,s.created_at AS service_alert_created_at
     FROM machines m
     JOIN customers c ON c.id=m.customer_id
     LEFT JOIN LATERAL (
       SELECT id,due_hour,service_interval_hours,current_hours,status,created_at
       FROM service_due_alerts
       WHERE machine_id=m.id
       ORDER BY due_hour DESC,created_at DESC
       LIMIT 1
     ) s ON TRUE
     WHERE m.deleted_at IS NULL
       AND c.deleted_at IS NULL
       AND c.is_active=1
     ORDER BY c.name,m.brand,m.model,m.fleet_number"
)->fetchAll();

function machine_message_label(array $row): string {
    $name = trim((string)($row['brand'] ?? '') . ' ' . (string)($row['model'] ?? ''));
    if ($name === '') $name = trim((string)($row['machine_type'] ?? ''));
    return $name !== '' ? $name : 'Machine';
}

function machine_reference(array $row): string {
    $fleet = trim((string)($row['fleet_number'] ?? ''));
    if ($fleet !== '') return 'Fleet ' . $fleet;
    $reg = trim((string)($row['reg_number'] ?? ''));
    if ($reg !== '') return 'Reg ' . $reg;
    $serial = trim((string)($row['serial_number'] ?? ''));
    if ($serial !== '') return 'Serial ' . $serial;
    return 'Registered machine';
}

function clean_hours($value): string {
    if ($value === null || $value === '') return '0';
    return rtrim(rtrim(number_format((float)$value, 1, '.', ''), '0'), '.');
}

$messages = [];
$serviceReminderCount = 0;

foreach ($rows as $row) {
    $machineName = machine_message_label($row);
    $customerName = trim((string)($row['customer_name'] ?? 'Customer')) ?: 'Customer';
    $reference = machine_reference($row);
    $machineId = (string)$row['id'];

    // Every registered machine contributes at least one message so the rotating
    // feed eventually shows the whole fleet, not only problem machines.
    $lastServiceHours = (float)($row['last_service_hours'] ?? 0);
    $generalText = $lastServiceHours > 0
        ? 'Service tracking active. Last recorded service: ' . clean_hours($lastServiceHours) . ' hrs.'
        : 'Machine monitoring active. Waiting for the first recorded service history.';

    $messages[] = [
        'type' => 'MACHINE_UPDATE',
        'priority' => 1,
        'machineId' => $machineId,
        'machine' => $machineName,
        'customer' => $customerName,
        'reference' => $reference,
        'title' => $machineName,
        'message' => $generalText,
        'route' => '/customers-manager/?view=all-machines&machine=' . rawurlencode($machineId),
    ];

    if (!empty($row['service_alert_id'])) {
        $dueHour = (float)($row['due_hour'] ?? 0);
        $currentHours = (float)($row['current_hours'] ?? 0);
        $interval = (int)($row['service_interval_hours'] ?? 250);
        $remaining = $dueHour - $currentHours;

        if ($remaining < 0) {
            $serviceText = 'SERVICE OVERDUE by ' . clean_hours(abs($remaining)) . ' hrs. Current: ' . clean_hours($currentHours) . ' hrs · Due: ' . clean_hours($dueHour) . ' hrs.';
            $priority = 4;
            $severity = 'OVERDUE';
        } elseif ($remaining <= 10) {
            $serviceText = 'SERVICE DUE NOW. Only ' . clean_hours($remaining) . ' hrs remaining to the ' . $interval . '-Hour Service.';
            $priority = 3;
            $severity = 'DUE';
        } else {
            $serviceText = 'Service reminder: ' . clean_hours($remaining) . ' hrs remaining to the ' . $interval . '-Hour Service · Due at ' . clean_hours($dueHour) . ' hrs.';
            $priority = 2;
            $severity = 'REMINDER';
        }

        $messages[] = [
            'type' => 'SERVICE_REMINDER',
            'severity' => $severity,
            'priority' => $priority,
            'machineId' => $machineId,
            'machine' => $machineName,
            'customer' => $customerName,
            'reference' => $reference,
            'title' => 'Service Reminder · ' . $machineName,
            'message' => $serviceText,
            'currentHours' => $currentHours,
            'dueHour' => $dueHour,
            'serviceIntervalHours' => $interval,
            'route' => '/concept-dashboards/11-workshop-manager/service-maintenance.html?machine=' . rawurlencode($machineId),
        ];
        $serviceReminderCount++;
    }
}

json_out([
    'ok' => true,
    'machineCount' => count($rows),
    'serviceReminderCount' => $serviceReminderCount,
    'messageCount' => count($messages),
    'messages' => $messages,
    'syncedAt' => gmdate('c'),
]);
