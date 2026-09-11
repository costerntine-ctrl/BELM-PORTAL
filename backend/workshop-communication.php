<?php
require_once __DIR__ . '/config/helpers.php';

$user = require_auth();
if (!belm_user_has_named_role($user, ['Super Admin', 'Engineer', 'Workshop Manager'])) {
    require_any_page_access($user, ['job-cards', 'service-requests']);
}

$pdo = db();
$items = [];
$counts = ['jobCards'=>0,'operatorReports'=>0,'spareRequests'=>0,'emails'=>0];

function wc_add(array &$items, array $row): void {
    $items[] = $row;
}

// 1) Job Cards received by Workshop / Technical Department.
try {
    $sql = <<<'SQL'
SELECT j.id, j.job_card_no, j.title, j.fault_description, j.status, j.priority,
       j.created_at, j.updated_at,
       c.name AS customer_name,
       m.brand, m.model, m.machine_type, m.fleet_number,
       COALESCE(NULLIF(TRIM(j.technician_name),''), u.name, 'Unassigned') AS technician_name
FROM digital_job_cards j
JOIN customers c ON c.id=j.customer_id
JOIN machines m ON m.id=j.machine_id
LEFT JOIN users u ON u.id=j.technician_id
WHERE c.deleted_at IS NULL AND m.deleted_at IS NULL
ORDER BY COALESCE(j.updated_at,j.created_at) DESC
LIMIT 80
SQL;
    $rows = $pdo->query($sql)->fetchAll() ?: [];
    foreach ($rows as $row) {
        $machine = trim(implode(' ', array_filter([trim((string)($row['brand'] ?? '')), trim((string)($row['model'] ?? ''))])));
        if ($machine === '') $machine = trim((string)($row['machine_type'] ?? 'Machine')) ?: 'Machine';
        if (!empty($row['fleet_number'])) $machine .= ' · Fleet ' . $row['fleet_number'];
        wc_add($items, [
            'type'=>'job_card',
            'title'=>'Job Card ' . ((string)($row['job_card_no'] ?? '') ?: 'received'),
            'message'=>trim((string)($row['title'] ?? '')) ?: trim((string)($row['fault_description'] ?? '')) ?: 'Workshop Job Card received.',
            'customer'=>(string)($row['customer_name'] ?? ''),
            'machine'=>$machine,
            'reference'=>(string)($row['job_card_no'] ?? ''),
            'sender'=>(string)($row['technician_name'] ?? ''),
            'status'=>strtoupper((string)($row['status'] ?? 'OPEN')),
            'createdAt'=>$row['updated_at'] ?: $row['created_at'],
            'actionUrl'=>'/belm-workshop/#job-cards',
        ]);
    }
    $counts['jobCards'] = count($rows);
} catch (Throwable $ignored) {}

// 2) Operator reports about machine condition / problems.
try {
    $sql = <<<'SQL'
SELECT r.id, r.operator_name, r.operator_contact, r.message, r.status, r.report_type, r.created_at,
       c.name AS customer_name,
       m.brand, m.model, m.machine_type, m.fleet_number
FROM operator_reports r
JOIN customers c ON c.id=r.customer_id
JOIN machines m ON m.id=r.machine_id
WHERE c.deleted_at IS NULL AND m.deleted_at IS NULL
ORDER BY r.created_at DESC
LIMIT 80
SQL;
    $rows = $pdo->query($sql)->fetchAll() ?: [];
    foreach ($rows as $row) {
        $machine = trim(implode(' ', array_filter([trim((string)($row['brand'] ?? '')), trim((string)($row['model'] ?? ''))])));
        if ($machine === '') $machine = trim((string)($row['machine_type'] ?? 'Machine')) ?: 'Machine';
        if (!empty($row['fleet_number'])) $machine .= ' · Fleet ' . $row['fleet_number'];
        wc_add($items, [
            'type'=>'operator_report',
            'title'=>'Operator machine report',
            'message'=>(string)($row['message'] ?? ''),
            'customer'=>(string)($row['customer_name'] ?? ''),
            'machine'=>$machine,
            'reference'=>(string)($row['report_type'] ?? 'REPORT'),
            'sender'=>(string)($row['operator_name'] ?? 'Operator'),
            'status'=>strtoupper((string)($row['status'] ?? 'RECEIVED')),
            'createdAt'=>$row['created_at'] ?? null,
            'actionUrl'=>'/reports-manager/?view=operator&module=workshop',
        ]);
    }
    $counts['operatorReports'] = count($rows);
} catch (Throwable $ignored) {}

// 3) Spare requests raised from Workshop / Technicians.
try {
    $sql = <<<'SQL'
SELECT spr.id, spr.reference_number, spr.description, spr.machine_type, spr.quantity, spr.status,
       spr.requested_by_name, spr.created_at,
       sp.part_number, sp.name AS part_name,
       c.name AS customer_name,
       m.brand, m.model, m.fleet_number
FROM spare_part_requests spr
LEFT JOIN spare_parts sp ON sp.id=spr.spare_part_id
LEFT JOIN machines m ON m.id=spr.machine_id
LEFT JOIN customers c ON c.id=m.customer_id
WHERE spr.machine_id IS NOT NULL
ORDER BY spr.created_at DESC
LIMIT 80
SQL;
    $rows = $pdo->query($sql)->fetchAll() ?: [];
    foreach ($rows as $row) {
        $machine = trim(implode(' ', array_filter([trim((string)($row['brand'] ?? '')), trim((string)($row['model'] ?? ''))])));
        if ($machine === '') $machine = trim((string)($row['machine_type'] ?? 'Machine')) ?: 'Machine';
        if (!empty($row['fleet_number'])) $machine .= ' · Fleet ' . $row['fleet_number'];
        $part = trim((string)($row['part_number'] ?? ''));
        $name = trim((string)($row['part_name'] ?? ''));
        $desc = trim((string)($row['description'] ?? ''));
        $message = trim(implode(' — ', array_filter([$part, $name, $desc])));
        wc_add($items, [
            'type'=>'spare_request',
            'title'=>'Spare request',
            'message'=>$message !== '' ? $message : 'Spare part requested.',
            'customer'=>(string)($row['customer_name'] ?? ''),
            'machine'=>$machine,
            'reference'=>(string)($row['reference_number'] ?? $row['id'] ?? ''),
            'sender'=>(string)($row['requested_by_name'] ?? 'Workshop'),
            'status'=>strtoupper((string)($row['status'] ?? 'PENDING')),
            'createdAt'=>$row['created_at'] ?? null,
            'actionUrl'=>'/spare-parts-manager/?view=requests&module=workshop',
        ]);
    }
    $counts['spareRequests'] = count($rows);
} catch (Throwable $ignored) {}

// 4) Email communication already logged by the portal.
// This is a portal communication log, not a direct mailbox/IMAP reader.
try {
    $sql = <<<'SQL'
SELECT cc.id, cc.direction, cc.channel, cc.subject, cc.message, cc.status,
       cc.created_by_name, cc.created_at, cc.related_type, cc.related_id,
       c.name AS customer_name,
       m.brand, m.model, m.machine_type, m.fleet_number
FROM customer_communications cc
JOIN customers c ON c.id=cc.customer_id
LEFT JOIN machines m ON m.id=cc.machine_id
WHERE UPPER(COALESCE(cc.channel,''))='EMAIL'
  AND c.deleted_at IS NULL
ORDER BY cc.created_at DESC
LIMIT 80
SQL;
    $rows = $pdo->query($sql)->fetchAll() ?: [];
    foreach ($rows as $row) {
        $machine = trim(implode(' ', array_filter([trim((string)($row['brand'] ?? '')), trim((string)($row['model'] ?? ''))])));
        if ($machine === '') $machine = trim((string)($row['machine_type'] ?? ''));
        if ($machine !== '' && !empty($row['fleet_number'])) $machine .= ' · Fleet ' . $row['fleet_number'];
        wc_add($items, [
            'type'=>'email',
            'title'=>(string)($row['subject'] ?? 'Email'),
            'message'=>(string)($row['message'] ?? ''),
            'customer'=>(string)($row['customer_name'] ?? ''),
            'machine'=>$machine,
            'reference'=>(string)($row['related_type'] ?? ''),
            'sender'=>(string)($row['created_by_name'] ?? ($row['direction'] ?? 'Email')),
            'status'=>strtoupper((string)($row['status'] ?? 'SENT')),
            'createdAt'=>$row['created_at'] ?? null,
            'actionUrl'=>'/customers-manager/?module=workshop',
        ]);
    }
    $counts['emails'] = count($rows);
} catch (Throwable $ignored) {}

usort($items, static function(array $a, array $b): int {
    $at = strtotime((string)($a['createdAt'] ?? '')) ?: 0;
    $bt = strtotime((string)($b['createdAt'] ?? '')) ?: 0;
    return $bt <=> $at;
});

json_out([
    'ok'=>true,
    'generatedAt'=>date(DATE_ATOM),
    'counts'=>$counts,
    'items'=>array_slice($items,0,160),
    'emailSource'=>'customer_communications',
    'emailMailboxConnected'=>false,
]);
