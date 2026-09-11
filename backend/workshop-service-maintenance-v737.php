<?php
require_once __DIR__ . '/config/helpers.php';

$section = strtolower(trim((string)($_GET['section'] ?? 'reports')));
$reportType = strtolower(trim((string)($_GET['reportType'] ?? 'maintenance')));

// Preserve the existing Service & Maintenance implementation for Petty Cash,
// Breakdown Report and Lube Use Report. V737 only upgrades Maintenance Report.
if ($section !== 'reports' || $reportType !== 'maintenance') {
    require __DIR__ . '/api/workshop_service_maintenance.php';
    exit;
}

require_once __DIR__ . '/api/table_pdf_helper.php';

$user = require_auth();
if (!belm_user_has_named_role($user, ['Super Admin', 'Engineer', 'Workshop Manager'])) {
    require_any_page_access($user, ['customers', 'reports', 'service-requests']);
}

$pdo = db();
$action = strtolower(trim((string)($_GET['action'] ?? '')));

function wsm737_table_exists(PDO $pdo, string $table): bool {
    $stmt = $pdo->prepare('SELECT to_regclass(?) IS NOT NULL');
    $stmt->execute(['public.' . $table]);
    return (bool)$stmt->fetchColumn();
}

function wsm737_valid_date(string $value, string $label): ?string {
    $value = trim($value);
    if ($value === '') return null;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) json_error($label . ' must use YYYY-MM-DD.', 422);
    $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    if (!$dt || $dt->format('Y-m-d') !== $value) json_error($label . ' is invalid.', 422);
    return $value;
}

function wsm737_customer_directory(PDO $pdo): array {
    $contractCustomers = [];
    if (wsm737_table_exists($pdo, 'customer_contracts')) {
        $rows = $pdo->query("SELECT DISTINCT customer_id FROM customer_contracts
                             WHERE status='ACTIVE' AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE")
                    ->fetchAll(PDO::FETCH_COLUMN);
        foreach ($rows as $id) $contractCustomers[(string)$id] = true;
    }
    $rows = $pdo->query('SELECT id,name,is_active FROM customers WHERE deleted_at IS NULL ORDER BY name ASC')->fetchAll();
    return array_map(static function(array $row) use ($contractCustomers): array {
        $id = (string)$row['id'];
        return [
            'id'=>$id,
            'name'=>(string)$row['name'],
            'isActive'=>!empty($row['is_active']),
            'customerType'=>isset($contractCustomers[$id]) ? 'PERMANENT' : 'NON_PERMANENT',
        ];
    }, $rows);
}

function wsm737_customer_map(array $customers): array {
    $out = [];
    foreach ($customers as $customer) $out[(string)$customer['id']] = $customer;
    return $out;
}

function wsm737_selected_customer_ids(array $customers): array {
    $customerId = trim((string)($_GET['customerId'] ?? ''));
    $customerType = strtoupper(trim((string)($_GET['customerType'] ?? 'ALL')));
    if (!in_array($customerType, ['ALL','PERMANENT','NON_PERMANENT'], true)) $customerType = 'ALL';
    $ids = [];
    foreach ($customers as $customer) {
        if ($customerId !== '' && (string)$customer['id'] !== $customerId) continue;
        if ($customerType !== 'ALL' && (string)$customer['customerType'] !== $customerType) continue;
        $ids[] = (string)$customer['id'];
    }
    return $ids;
}

function wsm737_in_clause(array $ids, array &$params, string $column): string {
    if (!$ids) return ' AND 1=0';
    $marks = implode(',', array_fill(0, count($ids), '?'));
    foreach ($ids as $id) $params[] = $id;
    return " AND {$column} IN ({$marks})";
}

function wsm737_machine_label(array $row): string {
    $label = trim((string)($row['brand'] ?? '') . ' ' . (string)($row['model'] ?? ''));
    return $label !== '' ? $label : (string)($row['machine_type'] ?? 'Machine');
}

function wsm737_date_in_range(?string $value, ?string $from, ?string $to): bool {
    if (!$value) return $from === null && $to === null;
    $date = substr((string)$value, 0, 10);
    if ($from !== null && $date < $from) return false;
    if ($to !== null && $date > $to) return false;
    return true;
}

function wsm737_csv_cell($value): string {
    $text = (string)($value ?? '');
    return '"' . str_replace('"', '""', $text) . '"';
}

function wsm737_report_payload(PDO $pdo): array {
    $from = wsm737_valid_date((string)($_GET['from'] ?? ''), 'From date');
    $to = wsm737_valid_date((string)($_GET['to'] ?? ''), 'To date');
    if ($from !== null && $to !== null && $from > $to) json_error('From date cannot be after To date.', 422);

    $customers = wsm737_customer_directory($pdo);
    $customerMap = wsm737_customer_map($customers);
    $customerIds = wsm737_selected_customer_ids($customers);
    $rows = [];

    // Existing machine service history remains part of Maintenance Report.
    $params = [];
    $sql = "SELECT m.id,m.customer_id,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number,m.reg_number,m.service_history
            FROM machines m JOIN customers c ON c.id=m.customer_id
            WHERE m.deleted_at IS NULL AND c.deleted_at IS NULL";
    $sql .= wsm737_in_clause($customerIds, $params, 'm.customer_id');
    $sql .= ' ORDER BY c.name,m.model,m.fleet_number';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    foreach ($stmt->fetchAll() as $machine) {
        $history = !empty($machine['service_history']) ? json_decode((string)$machine['service_history'], true) : [];
        if (!is_array($history)) $history = [];
        foreach ($history as $entry) {
            if (!is_array($entry)) continue;
            $date = trim((string)($entry['date'] ?? ''));
            if (!wsm737_date_in_range($date, $from, $to)) continue;
            $requirements = $entry['requirementsDone'] ?? [];
            if (is_array($requirements)) $requirements = implode(', ', array_map('strval', $requirements));
            $customer = $customerMap[(string)$machine['customer_id']] ?? ['name'=>'Unknown','customerType'=>'NON_PERMANENT'];
            $rows[] = [
                'id'=>trim((string)($entry['reportId'] ?? '')) ?: 'MNT-' . substr(sha1((string)$machine['id'].'|'.$date.'|'.(string)($entry['serviceType'] ?? '')),0,14),
                'date'=>$date,
                'customerId'=>(string)$machine['customer_id'],
                'customer'=>(string)$customer['name'],
                'customerType'=>(string)$customer['customerType'],
                'machineId'=>(string)$machine['id'],
                'machine'=>wsm737_machine_label($machine),
                'fleetNumber'=>(string)($machine['fleet_number'] ?? ''),
                'serialNumber'=>(string)($machine['serial_number'] ?? ''),
                'serviceType'=>(string)($entry['serviceType'] ?? 'Service / Maintenance'),
                'hourMeter'=>isset($entry['hourMeterReading']) ? (float)$entry['hourMeterReading'] : (isset($entry['hoursAtService']) ? (float)$entry['hoursAtService'] : null),
                'recordedBy'=>(string)($entry['recordedBy'] ?? 'Not recorded'),
                'details'=>trim((string)$requirements),
                'status'=>'COMPLETED',
                'source'=>'SERVICE_HISTORY',
            ];
        }
    }

    // V737: A completed Job Card becomes a Maintenance Report record only when
    // a linked spare actually reached PARTS_READY/fulfilled. No duplicate copy
    // is written into machines.service_history: Maintenance Report reads the
    // Digital Job Card and its spare records directly as the source of truth.
    if (wsm737_table_exists($pdo, 'digital_job_cards') && wsm737_table_exists($pdo, 'breakdown_spare_requests')) {
        $jobParams = [];
        $jobSql = "SELECT j.id,j.job_card_no,j.customer_id,j.machine_id,j.title,j.fault_description,
                          j.diagnosis,j.work_done,j.test_result,j.completion_note,j.technician_name,
                          j.reviewed_by_name,j.completed_at,j.updated_at,
                          c.name AS customer_name,
                          m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number,m.reg_number,
                          string_agg(
                            sr.spare_name ||
                            CASE WHEN NULLIF(TRIM(COALESCE(sr.part_number,'')),'') IS NOT NULL THEN ' [' || sr.part_number || ']' ELSE '' END ||
                            ' x' || trim(to_char(COALESCE(sr.quantity,1),'FM999999990.##')) ||
                            CASE WHEN NULLIF(TRIM(COALESCE(sr.unit,'')),'') IS NOT NULL THEN ' ' || sr.unit ELSE '' END,
                            ', ' ORDER BY sr.requested_at
                          ) AS used_spares
                   FROM digital_job_cards j
                   JOIN customers c ON c.id=j.customer_id
                   JOIN machines m ON m.id=j.machine_id
                   JOIN breakdown_spare_requests sr ON sr.job_card_id=j.id
                   WHERE c.deleted_at IS NULL AND m.deleted_at IS NULL
                     AND UPPER(COALESCE(j.status,''))='COMPLETED'
                     AND UPPER(COALESCE(sr.status,''))='PARTS_READY'
                     AND sr.fulfilled_at IS NOT NULL";
        $jobSql .= wsm737_in_clause($customerIds, $jobParams, 'j.customer_id');
        if ($from !== null) { $jobSql .= ' AND COALESCE(j.completed_at,j.updated_at)::date >= ?'; $jobParams[] = $from; }
        if ($to !== null) { $jobSql .= ' AND COALESCE(j.completed_at,j.updated_at)::date <= ?'; $jobParams[] = $to; }
        $jobSql .= " GROUP BY j.id,j.job_card_no,j.customer_id,j.machine_id,j.title,j.fault_description,
                            j.diagnosis,j.work_done,j.test_result,j.completion_note,j.technician_name,
                            j.reviewed_by_name,j.completed_at,j.updated_at,c.name,
                            m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number,m.reg_number
                     ORDER BY COALESCE(j.completed_at,j.updated_at) DESC";
        $jobStmt = $pdo->prepare($jobSql);
        $jobStmt->execute($jobParams);

        foreach ($jobStmt->fetchAll() as $job) {
            $customer = $customerMap[(string)$job['customer_id']] ?? ['name'=>$job['customer_name'],'customerType'=>'NON_PERMANENT'];
            $usedSpares = trim((string)($job['used_spares'] ?? ''));
            if ($usedSpares === '') continue;
            $detailParts = ['Job Card: ' . (string)$job['job_card_no']];
            $fault = trim((string)($job['fault_description'] ?: $job['title']));
            if ($fault !== '') $detailParts[] = 'Fault: ' . $fault;
            $diagnosis = trim((string)($job['diagnosis'] ?? ''));
            if ($diagnosis !== '') $detailParts[] = 'Diagnosis: ' . $diagnosis;
            $work = trim((string)($job['work_done'] ?? ''));
            if ($work !== '') $detailParts[] = 'Work done: ' . $work;
            $test = trim((string)($job['test_result'] ?? ''));
            if ($test !== '') $detailParts[] = 'Test: ' . $test;
            $detailParts[] = 'Spares used: ' . $usedSpares;
            $reviewedBy = trim((string)($job['reviewed_by_name'] ?? ''));
            if ($reviewedBy !== '') $detailParts[] = 'Approved by: ' . $reviewedBy;

            $rows[] = [
                'id'=>'JC-MNT-' . (string)$job['id'],
                'date'=>substr((string)($job['completed_at'] ?: $job['updated_at']),0,10),
                'customerId'=>(string)$job['customer_id'],
                'customer'=>(string)$customer['name'],
                'customerType'=>(string)$customer['customerType'],
                'machineId'=>(string)$job['machine_id'],
                'machine'=>wsm737_machine_label($job),
                'fleetNumber'=>(string)($job['fleet_number'] ?? ''),
                'serialNumber'=>(string)($job['serial_number'] ?? ''),
                'serviceType'=>'Job Card Maintenance',
                'jobCardNo'=>(string)$job['job_card_no'],
                'hourMeter'=>null,
                'recordedBy'=>trim((string)($job['technician_name'] ?? '')) ?: 'Technician',
                'details'=>implode(' · ', $detailParts),
                'sparesUsed'=>$usedSpares,
                'diagnosis'=>$diagnosis,
                'workDone'=>$work,
                'testResult'=>$test,
                'status'=>'COMPLETED',
                'source'=>'JOB_CARD_WITH_SPARES',
            ];
        }
    }

    usort($rows, static fn(array $a,array $b): int => strcmp((string)$b['date'], (string)$a['date']));

    $customerId = trim((string)($_GET['customerId'] ?? ''));
    $customerType = strtoupper(trim((string)($_GET['customerType'] ?? 'ALL')));
    if (!in_array($customerType,['ALL','PERMANENT','NON_PERMANENT'],true)) $customerType='ALL';

    return [
        'ok'=>true,
        'reportType'=>'maintenance',
        'from'=>$from,
        'to'=>$to,
        'customerId'=>$customerId,
        'customerType'=>$customerType,
        'customers'=>$customers,
        'rows'=>$rows,
        'total'=>count($rows),
        'generatedAt'=>gmdate('c'),
    ];
}

function wsm737_output_export(array $data, string $format): void {
    $customerLabel = 'All customers';
    if ($data['customerId'] !== '') {
        foreach ($data['customers'] as $c) {
            if ((string)$c['id'] === $data['customerId']) { $customerLabel = (string)$c['name']; break; }
        }
    }
    if ($data['customerType'] !== 'ALL') $customerLabel .= ' · ' . str_replace('_',' ', $data['customerType']);
    $period = ($data['from'] ?: 'Beginning') . ' to ' . ($data['to'] ?: 'Today');

    if ($format === 'csv') {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="BELM-maintenance-report.csv"');
        echo implode(',', array_map('wsm737_csv_cell', ['Date','Customer','Customer Type','Machine','Fleet No.','Job Card No.','Type','Details','Spares Used','Status','Recorded By'])) . "\r\n";
        foreach ($data['rows'] as $row) {
            echo implode(',', array_map('wsm737_csv_cell', [
                $row['date'] ?? '', $row['customer'] ?? '', $row['customerType'] ?? '', $row['machine'] ?? '',
                $row['fleetNumber'] ?? '', $row['jobCardNo'] ?? '', $row['serviceType'] ?? '', $row['details'] ?? '',
                $row['sparesUsed'] ?? '', $row['status'] ?? '', $row['recordedBy'] ?? ''
            ])) . "\r\n";
        }
        exit;
    }

    $pdfRows = [['DATE','CUSTOMER','MACHINE','TYPE / DETAILS','STATUS']];
    foreach ($data['rows'] as $row) {
        $typeDetails = trim((string)($row['serviceType'] ?? '') . ' · ' . (string)($row['details'] ?? ''));
        $pdfRows[] = [
            (string)($row['date'] ?? '—'),
            (string)($row['customer'] ?? '—') . ' [' . (string)($row['customerType'] ?? '') . ']',
            trim((string)($row['machine'] ?? '—') . ' ' . ((string)($row['fleetNumber'] ?? '') !== '' ? '#'.(string)$row['fleetNumber'] : '')),
            $typeDetails,
            (string)($row['status'] ?? '—'),
        ];
    }
    output_table_pdf(
        'BELM-maintenance-report.pdf',
        'Maintenance Report',
        ['Customer: '.$customerLabel,'Period: '.$period,'Records: '.count($data['rows']),'Includes completed Job Cards where fulfilled spare parts were used','Generated: '.date('d/m/Y H:i')],
        $pdfRows
    );
}

$data = wsm737_report_payload($pdo);
if ($action === 'export') {
    $format = strtolower(trim((string)($_GET['format'] ?? 'pdf')));
    wsm737_output_export($data, $format === 'csv' ? 'csv' : 'pdf');
}
json_out($data);
