<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/checklist_reports_helpers.php';
require_once __DIR__ . '/service_due_helper.php';
require_once __DIR__ . '/table_pdf_helper.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

const SAFETY_RANK = ['NONE' => -1, 'GREEN' => 0, 'YELLOW' => 1, 'RED' => 2];
const CHECKLIST_REPORT_TIMEZONE = 'Africa/Dar_es_Salaam';


function checklist_staff_report_range(string $from = '', string $to = ''): array {
    $from = trim($from); $to = trim($to);
    if ($from === '' && $to === '') return [null, null, 'All time'];
    if ($from === '') $from = $to;
    if ($to === '') $to = $from;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) {
        json_error('Report dates must use YYYY-MM-DD.', 400);
    }
    $tz = new DateTimeZone(CHECKLIST_REPORT_TIMEZONE);
    try {
        $start = (new DateTimeImmutable($from . ' 00:00:00', $tz));
        $endDay = (new DateTimeImmutable($to . ' 00:00:00', $tz));
    } catch (Throwable $error) {
        json_error('Report date is invalid.', 400);
    }
    if ($endDay < $start) json_error('Report end date cannot be before start date.', 400);
    $endExclusive = $endDay->modify('+1 day');
    return [$start->format(DateTimeInterface::ATOM), $endExclusive->format(DateTimeInterface::ATOM), $from === $to ? $from : ($from . ' to ' . $to)];
}

function technician_general_report_context(array $user): array {
    if (($user['roleName'] ?? '') !== 'Technician') {
        json_error('Technician login required.', 403);
    }
    $technicianId = trim((string)($user['id'] ?? ''));
    $customerId = trim((string)($user['assignedCustomerId'] ?? ''));
    if ($technicianId === '' || $customerId === '') {
        json_error('This Technician is not assigned to a customer.', 403);
    }
    $stmt = db()->prepare('SELECT id,name FROM customers WHERE id=? AND deleted_at IS NULL AND is_active=1 LIMIT 1');
    $stmt->execute([$customerId]);
    $customer = $stmt->fetch();
    if (!$customer) json_error('Assigned customer is not available.', 404);
    return [
        'technicianId' => $technicianId,
        'technicianName' => trim((string)($user['name'] ?? 'Technician')) ?: 'Technician',
        'customerId' => $customerId,
        'customerName' => (string)$customer['name'],
    ];
}

function technician_general_report_payload(array $user): array {
    $ctx = technician_general_report_context($user);
    [$fromTs, $toTs, $periodLabel] = checklist_staff_report_range(
        (string)($_GET['from'] ?? ''),
        (string)($_GET['to'] ?? '')
    );

    $machineStmt = db()->prepare(
        'SELECT id,brand,model,machine_type,serial_number,reg_number,fleet_number,status,last_checked_at,
                service_history,last_service_hours,service_interval_hours
         FROM machines
         WHERE customer_id=? AND deleted_at IS NULL
         ORDER BY COALESCE(fleet_number,\'\'), COALESCE(brand,\'\'), model'
    );
    $machineStmt->execute([$ctx['customerId']]);
    $machines = $machineStmt->fetchAll();
    $machineMap = [];
    foreach ($machines as $machine) {
        $label = trim((string)($machine['brand'] ?? '') . ' ' . (string)($machine['model'] ?? ''));
        if ($label === '') $label = (string)($machine['machine_type'] ?? 'Machine');
        $machineMap[(string)$machine['id']] = [
            'id' => (string)$machine['id'],
            'label' => $label,
            'fleetNumber' => (string)($machine['fleet_number'] ?? ''),
            'serialNumber' => (string)($machine['serial_number'] ?? ''),
            'regNumber' => (string)($machine['reg_number'] ?? ''),
        ];
    }

    $dateSql = '';
    $dateParams = [];
    if ($fromTs !== null) { $dateSql .= ' AND %s >= ?'; $dateParams[] = $fromTs; }
    if ($toTs !== null) { $dateSql .= ' AND %s < ?'; $dateParams[] = $toTs; }
    $applyRange = static function(string $column) use ($fromTs, $toTs): string {
        $clause = '';
        if ($fromTs !== null) $clause .= " AND {$column} >= ?";
        if ($toTs !== null) $clause .= " AND {$column} < ?";
        return $clause;
    };
    $rangeParams = static function(array $base) use ($fromTs, $toTs): array {
        if ($fromTs !== null) $base[] = $fromTs;
        if ($toTs !== null) $base[] = $toTs;
        return $base;
    };

    $checkSql = 'SELECT cr.id,cr.machine_id,cr.filled_by,cr.overall_status,cr.hour_meter_reading,cr.created_at,
                        ct.name AS template_name,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number,m.reg_number
                 FROM checklist_reports cr
                 JOIN machines m ON m.id=cr.machine_id
                 LEFT JOIN checklist_templates ct ON ct.id=cr.template_id
                 WHERE m.customer_id=? AND m.deleted_at IS NULL' . $applyRange('cr.created_at') .
                ' ORDER BY cr.created_at DESC LIMIT 1000';
    $stmt = db()->prepare($checkSql);
    $stmt->execute($rangeParams([$ctx['customerId']]));
    $checklists = [];
    foreach ($stmt->fetchAll() as $row) {
        $label = trim((string)($row['brand'] ?? '') . ' ' . (string)($row['model'] ?? '')) ?: (string)($row['machine_type'] ?? 'Machine');
        $checklists[] = [
            'id' => (string)$row['id'],
            'machineId' => (string)$row['machine_id'],
            'machine' => $label,
            'fleetNumber' => (string)($row['fleet_number'] ?? ''),
            'serialNumber' => (string)($row['serial_number'] ?? ''),
            'regNumber' => (string)($row['reg_number'] ?? ''),
            'templateName' => (string)($row['template_name'] ?: 'Checklist Report'),
            'filledBy' => (string)($row['filled_by'] ?: 'Not recorded'),
            'status' => strtoupper((string)($row['overall_status'] ?: 'GREEN')),
            'hourMeterReading' => $row['hour_meter_reading'] !== null ? (float)$row['hour_meter_reading'] : null,
            'createdAt' => (string)$row['created_at'],
        ];
    }

    $operatorSql = 'SELECT r.id,r.machine_id,r.operator_name,r.operator_contact,r.message,r.status,r.created_at,r.resolved_at,
                           m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number,m.reg_number
                    FROM operator_reports r
                    JOIN machines m ON m.id=r.machine_id
                    WHERE m.customer_id=? AND m.deleted_at IS NULL' . $applyRange('r.created_at') .
                   ' ORDER BY r.created_at DESC LIMIT 1000';
    $stmt = db()->prepare($operatorSql);
    $stmt->execute($rangeParams([$ctx['customerId']]));
    $operators = [];
    foreach ($stmt->fetchAll() as $row) {
        $label = trim((string)($row['brand'] ?? '') . ' ' . (string)($row['model'] ?? '')) ?: (string)($row['machine_type'] ?? 'Machine');
        $operators[] = [
            'id' => (string)$row['id'],
            'machineId' => (string)$row['machine_id'],
            'machine' => $label,
            'fleetNumber' => (string)($row['fleet_number'] ?? ''),
            'operatorName' => (string)($row['operator_name'] ?: 'Operator'),
            'operatorContact' => (string)($row['operator_contact'] ?: ''),
            'message' => (string)($row['message'] ?: ''),
            'status' => strtoupper((string)($row['status'] ?: 'OPEN')),
            'createdAt' => (string)$row['created_at'],
            'resolvedAt' => $row['resolved_at'] ? (string)$row['resolved_at'] : null,
        ];
    }

    $jobSql = 'SELECT j.id,j.machine_id,j.job_card_no,j.title,j.fault_description,j.status,j.priority,j.technician_name,
                      j.diagnosis,j.work_done,j.test_result,j.completion_note,j.repeat_issue,j.started_at,j.completed_at,j.created_at,
                      m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number,m.reg_number
               FROM digital_job_cards j
               JOIN machines m ON m.id=j.machine_id
               WHERE j.customer_id=? AND j.technician_id=?' . $applyRange('j.created_at') .
              ' ORDER BY j.created_at DESC LIMIT 1000';
    $stmt = db()->prepare($jobSql);
    $stmt->execute($rangeParams([$ctx['customerId'], $ctx['technicianId']]));
    $jobCards = [];
    foreach ($stmt->fetchAll() as $row) {
        $label = trim((string)($row['brand'] ?? '') . ' ' . (string)($row['model'] ?? '')) ?: (string)($row['machine_type'] ?? 'Machine');
        $jobCards[] = [
            'id' => (string)$row['id'],
            'machineId' => (string)$row['machine_id'],
            'machine' => $label,
            'fleetNumber' => (string)($row['fleet_number'] ?? ''),
            'jobCardNo' => (string)($row['job_card_no'] ?: 'Job Card'),
            'title' => (string)($row['title'] ?: 'Maintenance'),
            'faultDescription' => (string)($row['fault_description'] ?: ''),
            'status' => strtoupper((string)($row['status'] ?: 'OPEN')),
            'priority' => strtoupper((string)($row['priority'] ?: 'NORMAL')),
            'technicianName' => (string)($row['technician_name'] ?: $ctx['technicianName']),
            'diagnosis' => (string)($row['diagnosis'] ?: ''),
            'workDone' => (string)($row['work_done'] ?: ''),
            'testResult' => (string)($row['test_result'] ?: ''),
            'completionNote' => (string)($row['completion_note'] ?: ''),
            'repeatIssue' => !empty($row['repeat_issue']),
            'startedAt' => $row['started_at'] ? (string)$row['started_at'] : null,
            'completedAt' => $row['completed_at'] ? (string)$row['completed_at'] : null,
            'createdAt' => (string)$row['created_at'],
        ];
    }

    $maintenance = [];
    $maintenanceSummary = [];
    $fromDt = $fromTs !== null ? new DateTimeImmutable($fromTs) : null;
    $toDt = $toTs !== null ? new DateTimeImmutable($toTs) : null;
    foreach ($machines as $machine) {
        $machineId = (string)$machine['id'];
        $meta = $machineMap[$machineId];
        try {
            $service = compute_service_status_helper($machineId);
        } catch (Throwable $ignored) {
            $service = [];
        }
        $maintenanceSummary[] = [
            'machineId' => $machineId,
            'machine' => $meta['label'],
            'fleetNumber' => $meta['fleetNumber'],
            'serviceType' => (string)($service['serviceType'] ?? (($machine['service_interval_hours'] ?? 250) . '-Hour Service')),
            'level' => strtoupper((string)($service['level'] ?? 'UNKNOWN')),
            'totalHours' => isset($service['totalHours']) ? (float)$service['totalHours'] : null,
            'lastServiceHours' => isset($service['lastServiceHours']) ? (float)$service['lastServiceHours'] : (float)($machine['last_service_hours'] ?? 0),
            'dueHour' => isset($service['dueHour']) ? (float)$service['dueHour'] : null,
            'hoursRemaining' => isset($service['hoursRemaining']) ? (float)$service['hoursRemaining'] : null,
            'statusText' => (string)($service['statusText'] ?? 'Not calculated'),
        ];
        $history = $machine['service_history'] ? json_decode((string)$machine['service_history'], true) : [];
        if (!is_array($history)) $history = [];
        foreach ($history as $entry) {
            if (!is_array($entry)) continue;
            $date = trim((string)($entry['date'] ?? ''));
            if ($date !== '') {
                try {
                    $eventDate = new DateTimeImmutable($date);
                    if ($fromDt && $eventDate < $fromDt) continue;
                    if ($toDt && $eventDate >= $toDt) continue;
                } catch (Throwable $ignored) {}
            }
            $requirements = $entry['requirementsDone'] ?? [];
            if (is_array($requirements)) $requirements = implode(', ', array_map('strval', $requirements));
            $maintenanceRecordId = trim((string)($entry['reportId'] ?? ''));
            if ($maintenanceRecordId === '') {
                $maintenanceRecordId = 'MNT-' . substr(sha1($machineId . '|' . $date . '|' . (string)($entry['serviceType'] ?? '') . '|' . (string)($entry['hourMeterReading'] ?? $entry['hoursAtService'] ?? '')), 0, 16);
            }
            $maintenance[] = [
                'id' => $maintenanceRecordId,
                'machineId' => $machineId,
                'machine' => $meta['label'],
                'fleetNumber' => $meta['fleetNumber'],
                'date' => $date,
                'serviceType' => (string)($entry['serviceType'] ?? 'Service / Maintenance'),
                'hourMeterReading' => isset($entry['hourMeterReading']) ? (float)$entry['hourMeterReading'] : (isset($entry['hoursAtService']) ? (float)$entry['hoursAtService'] : null),
                'recordedBy' => (string)($entry['recordedBy'] ?? $ctx['technicianName']),
                'requirementsDone' => trim((string)$requirements),
                'reportId' => trim((string)($entry['reportId'] ?? '')),
            ];
        }
    }
    usort($maintenance, static function(array $a, array $b): int {
        return strcmp((string)($b['date'] ?? ''), (string)($a['date'] ?? ''));
    });

    $fuelSql = "SELECT u.id,u.machine_id,u.date,u.description,u.quantity,u.unit_price,u.cost,u.logged_by,u.created_at,
                       m.brand,m.model,m.machine_type,m.fleet_number
                FROM usage_logs u
                JOIN machines m ON m.id=u.machine_id
                WHERE u.customer_id=? AND u.category='FUEL' AND m.deleted_at IS NULL" . $applyRange('u.created_at') .
               ' ORDER BY u.date DESC,u.created_at DESC LIMIT 1000';
    $stmt = db()->prepare($fuelSql);
    $stmt->execute($rangeParams([$ctx['customerId']]));
    $fuelReports = [];
    foreach ($stmt->fetchAll() as $row) {
        $label = trim((string)($row['brand'] ?? '') . ' ' . (string)($row['model'] ?? '')) ?: (string)($row['machine_type'] ?? 'Machine');
        $fuelReports[] = [
            'id' => (string)$row['id'], 'machineId' => (string)$row['machine_id'],
            'machine' => $label, 'fleetNumber' => (string)($row['fleet_number'] ?? ''),
            'date' => (string)($row['date'] ?? ''), 'description' => (string)($row['description'] ?: 'Fuel'),
            'litres' => (float)($row['quantity'] ?? 0), 'unitPrice' => (float)($row['unit_price'] ?? 0),
            'cost' => (float)($row['cost'] ?? 0), 'loggedBy' => (string)($row['logged_by'] ?: 'Not recorded'),
            'createdAt' => (string)$row['created_at'],
        ];
    }

    $requestedMachineId = trim((string)($_GET['machineId'] ?? ''));
    if ($requestedMachineId !== '') {
        if (!isset($machineMap[$requestedMachineId])) json_error('Machine is not assigned to this Technician.', 404);
        $onlyMachine = static fn(array $row): bool => (string)($row['machineId'] ?? '') === $requestedMachineId;
        $machines = array_values(array_filter($machines, static fn(array $row): bool => (string)$row['id'] === $requestedMachineId));
        $machineMap = [$requestedMachineId => $machineMap[$requestedMachineId]];
        $checklists = array_values(array_filter($checklists, $onlyMachine));
        $operators = array_values(array_filter($operators, $onlyMachine));
        $maintenance = array_values(array_filter($maintenance, $onlyMachine));
        $maintenanceSummary = array_values(array_filter($maintenanceSummary, $onlyMachine));
        $jobCards = array_values(array_filter($jobCards, $onlyMachine));
        $fuelReports = array_values(array_filter($fuelReports, $onlyMachine));
    }

    $requestedReportId = trim((string)($_GET['reportId'] ?? ''));
    $requestedCategory = strtolower(trim((string)($_GET['category'] ?? '')));
    if ($requestedReportId !== '') {
        $byId = static fn(array $row): bool => (string)($row['id'] ?? $row['reportId'] ?? '') === $requestedReportId;
        if ($requestedCategory === 'checklists') $checklists = array_values(array_filter($checklists, $byId));
        elseif ($requestedCategory === 'operator') $operators = array_values(array_filter($operators, $byId));
        elseif ($requestedCategory === 'fuel') $fuelReports = array_values(array_filter($fuelReports, $byId));
        elseif ($requestedCategory === 'job-cards') $jobCards = array_values(array_filter($jobCards, $byId));
        elseif ($requestedCategory === 'maintenance') $maintenance = array_values(array_filter($maintenance, $byId));
    }

    return [
        'technician' => ['id' => $ctx['technicianId'], 'name' => $ctx['technicianName']],
        'customer' => ['id' => $ctx['customerId'], 'name' => $ctx['customerName']],
        'period' => ['label' => $periodLabel, 'from' => $_GET['from'] ?? '', 'to' => $_GET['to'] ?? ''],
        'machineCount' => count($machines),
        'machines' => array_values($machineMap),
        'checklists' => $checklists,
        'operatorReports' => $operators,
        'fuelReports' => $fuelReports,
        'maintenanceReports' => $maintenance,
        'maintenanceSummary' => $maintenanceSummary,
        'jobCards' => $jobCards,
        'counts' => [
            'checklists' => count($checklists),
            'operatorReports' => count($operators),
            'fuelReports' => count($fuelReports),
            'maintenanceReports' => count($maintenance),
            'jobCards' => count($jobCards),
        ],
    ];
}

function checklist_report_expiry(string $createdAt): DateTimeImmutable {
    try {
        $created = new DateTimeImmutable($createdAt);
    } catch (Throwable $error) {
        json_error('The checklist report date is invalid.', 500);
    }
    $localCreated = $created->setTimezone(new DateTimeZone(CHECKLIST_REPORT_TIMEZONE));
    return $localCreated->modify('tomorrow')->setTime(0, 0, 0);
}

function checklist_report_is_expired(string $createdAt): bool {
    $now = new DateTimeImmutable('now', new DateTimeZone(CHECKLIST_REPORT_TIMEZONE));
    return $now >= checklist_report_expiry($createdAt);
}

function checklist_report_number(array $report): string {
    $rawId = (string)($report['id'] ?? '');
    $compactId = strtoupper((string)preg_replace('/[^A-Za-z0-9]/', '', $rawId));
    $suffix = substr($compactId, 0, 8);
    $dateKey = '00000000';
    try {
        $created = new DateTimeImmutable((string)($report['created_at'] ?? 'now'));
        $dateKey = $created
            ->setTimezone(new DateTimeZone(CHECKLIST_REPORT_TIMEZONE))
            ->format('Ymd');
    } catch (Throwable $error) {
        // The report UUID still keeps the generated checklist number stable.
    }
    return 'CHK-' . $dateKey . '-' . ($suffix !== '' ? $suffix : 'AUTO');
}

function validated_checklist_photo_url(string $photoUrl): string {
    $photoUrl = trim($photoUrl);
    if ($photoUrl === '') return '';

    if (str_starts_with($photoUrl, 'data:image/')) {
        if (strlen($photoUrl) > 700000) {
            json_error('Checklist photo is too large. Upload the compressed low-MB photo again.');
        }
        if (!preg_match(
            '/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+\/=]+)$/',
            $photoUrl,
            $matches
        )) {
            json_error('Checklist photo format is invalid. Use JPG, PNG or WEBP.');
        }
        $decoded = base64_decode($matches[2], true);
        if ($decoded === false || strlen($decoded) > 500 * 1024) {
            json_error('Checklist photo must be 500 KB or less after compression.');
        }
        return $photoUrl;
    }

    if (str_starts_with($photoUrl, '/')) return $photoUrl;
    if (filter_var($photoUrl, FILTER_VALIDATE_URL)) {
        $scheme = strtolower((string)parse_url($photoUrl, PHP_URL_SCHEME));
        if (in_array($scheme, ['http', 'https'], true)) return $photoUrl;
    }
    json_error('Checklist photo reference is invalid.');
}

function require_report_machine_access(array $user, string $machineId, ?string $templateId = null): array {
    $sql = 'SELECT m.id, m.customer_id, m.machine_type, m.model, m.serial_number,
                   m.reg_number, m.brand, m.deleted_at, c.name AS customer_name,
                   c.deleted_at AS customer_deleted_at, c.is_active, c.is_machinery_admin';
    $params = [];
    if ($templateId !== null) {
        $sql .= ', t.id AS template_id, t.machine_type AS template_machine_type,
                  t.deleted_at AS template_deleted_at, t.is_active AS template_is_active';
    }
    $sql .= ' FROM machines m
              JOIN customers c ON c.id = m.customer_id';
    if ($templateId !== null) {
        $sql .= ' LEFT JOIN checklist_templates t ON t.id = ?';
        $params[] = $templateId;
    }
    $sql .= ' WHERE m.id = ?';
    $params[] = $machineId;

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $machine = $stmt->fetch();
    if (!$machine || $machine['deleted_at'] || $machine['customer_deleted_at'] || !$machine['is_active']) {
        json_error('Machine not found or customer is inactive.', 404);
    }

    if (($user['roleName'] ?? '') === 'Technician') {
        $assigned = $user['assignedCustomerId'] ?? null;
        if (!$assigned || $machine['customer_id'] !== $assigned) {
            json_error('You are not assigned to this machine.', 403);
        }
    } else {
        require_page_access($user, 'customers');
    }

    // V288: a Customer's own Technician is internal to that Customer and is
    // not restricted by BELM-sharing preferences. BELM staff must respect the
    // Customer's maintenance-record privacy switch unless BELM is the active
    // provider or this machine has an open official support request.
    $isCustomerManagedTechnician = (($user['roleName'] ?? '') === 'Technician' && !empty($user['isCustomerManaged']));
    if (!$isCustomerManagedTechnician) {
        require_belm_customer_privacy(
            (string)$machine['customer_id'],
            'maintenanceRecords',
            'internal checklist/check-up and maintenance records',
            $machineId
        );
    }

    if ($templateId !== null) {
        if (!$machine['template_id'] || $machine['template_deleted_at'] || !$machine['template_is_active']) {
            json_error('Checklist template not found or inactive.', 404);
        }
        if (strcasecmp($machine['machine_type'], $machine['template_machine_type']) !== 0) {
            json_error('This checklist is not assigned to the selected machine type.', 403);
        }
    }
    return $machine;
}

function checklist_report_answer_view(array $answer): array {
    $answer['reportId'] = $answer['report_id'] ?? null;
    $answer['templateItemId'] = $answer['template_item_id'] ?? null;
    $answer['photoUrl'] = $answer['photo_url'] ?? null;
    $answer['safetyLevel'] = $answer['safety_level'] ?? 'GREEN';
    $answer['inputType'] = $answer['input_type'] ?? 'TEXT';
    $answer['options'] = isset($answer['options']) && $answer['options'] !== null
        ? (json_decode((string)$answer['options'], true) ?: [])
        : [];
    $answer['isRequired'] = isset($answer['is_required']) ? (bool)$answer['is_required'] : false;
    return $answer;
}

function checklist_report_api_view(array $report, array $machine, array $user): array {
    $createdAt = (string)($report['created_at'] ?? '');
    $expiry = checklist_report_expiry($createdAt);
    $isExpired = checklist_report_is_expired($createdAt);
    $isOriginalTechnician =
        ($user['roleName'] ?? '') === 'Technician'
        && trim((string)($user['name'] ?? '')) !== ''
        && strcasecmp(trim((string)$report['filled_by']), trim((string)$user['name'])) === 0;

    $report['machineId'] = $report['machine_id'] ?? $machine['id'];
    $report['templateId'] = $report['template_id'] ?? null;
    $report['filledBy'] = $report['filled_by'] ?? '';
    $report['hourMeterReading'] = isset($report['hour_meter_reading'])
        ? (float)$report['hour_meter_reading']
        : 0;
    $report['overallStatus'] = $report['overall_status'] ?? 'GREEN';
    $report['displayPhotoUrl'] = $report['display_photo_url'] ?? null;
    $report['createdAt'] = $report['created_at'] ?? null;
    $report['checklistNo'] = checklist_report_number($report);
    $report['updatedAt'] = $report['updated_at'] ?? null;
    $report['expiresAt'] = $expiry->format(DateTimeInterface::ATOM);
    $report['isExpired'] = $isExpired;
    $isBreakdownReport = ($report['overall_status'] ?? 'GREEN') === 'RED';
    $report['canEdit'] = $isOriginalTechnician && (!$isExpired || $isBreakdownReport);
    $report['templateName'] = $report['template_name'] ?? '';
    $report['customerName'] = $machine['customer_name'] ?? '';
    $report['machine'] = [
        'id' => $machine['id'],
        'model' => $machine['model'] ?? '',
        'machineType' => $machine['machine_type'] ?? '',
        'serialNumber' => $machine['serial_number'] ?? '',
        'regNumber' => $machine['reg_number'] ?? '',
        'brand' => $machine['brand'] ?? '',
    ];
    return $report;
}

function validate_checklist_report_answers(string $templateId, array $submittedAnswers): array {
    $itemStmt = db()->prepare(
        'SELECT id, label, input_type, safety_level, options, option_safety, is_required
         FROM checklist_template_items WHERE template_id = ? ORDER BY "order" ASC'
    );
    $itemStmt->execute([$templateId]);
    $templateItems = $itemStmt->fetchAll();
    $submittedById = [];
    foreach ($submittedAnswers as $answer) {
        $answerId = (string)($answer['templateItemId'] ?? '');
        if ($answerId !== '') $submittedById[$answerId] = $answer;
    }

    $worst = 'GREEN';
    $answers = [];
    foreach ($templateItems as $item) {
        $answer = $submittedById[$item['id']] ?? null;
        $value = $answer !== null ? trim((string)($answer['value'] ?? '')) : '';
        if (in_array(strtolower($value), ['undefined', 'null'], true)) $value = '';
        $photoUrl = $answer !== null
            ? validated_checklist_photo_url((string)($answer['photoUrl'] ?? ''))
            : '';
        if ((bool)$item['is_required'] && $value === '' && $photoUrl === '') {
            json_error("Complete the required checklist item: {$item['label']}.");
        }
        if ($answer === null || ($value === '' && $photoUrl === '')) continue;

        $allowedOptions = $item['options']
            ? (json_decode((string)$item['options'], true) ?: [])
            : [];
        if ($item['input_type'] === 'YES_NO' && !$allowedOptions) {
            $allowedOptions = ['Yes', 'No'];
        }
        if (
            in_array($item['input_type'], ['DROPDOWN', 'YES_NO'], true)
            && $allowedOptions
        ) {
            // Match case-insensitively and ignore surrounding whitespace so a
            // template's option casing (e.g. "yes" vs "Yes") never silently
            // blocks a technician from saving an otherwise valid selection.
            // If matched, normalize $value to the option's canonical form.
            $matchedOption = null;
            foreach ($allowedOptions as $option) {
                if (strcasecmp(trim((string)$option), $value) === 0) {
                    $matchedOption = (string)$option;
                    break;
                }
            }
            if ($matchedOption === null) {
                json_error("Select a valid result for checklist item: {$item['label']}.");
            }
            $value = $matchedOption;
        }

        $level = strtoupper((string)($item['safety_level'] ?: 'GREEN'));
        if (in_array($item['input_type'], ['DROPDOWN', 'YES_NO'], true) && $item['option_safety']) {
            $optionSafety = json_decode($item['option_safety'], true) ?: [];
            $level = strtoupper((string)($optionSafety[$value] ?? $level));
        }
        if (!array_key_exists($level, SAFETY_RANK)) $level = 'GREEN';
        if (SAFETY_RANK[$level] > SAFETY_RANK[$worst]) $worst = $level;
        $answers[] = [
            'templateItemId' => $item['id'],
            'label' => $item['label'],
            'value' => $value,
            'photoUrl' => $photoUrl !== '' ? $photoUrl : null,
            'safetyLevel' => $level,
            'note' => $answer !== null ? trim((string)($answer['note'] ?? '')) : '',
        ];
    }

    return ['answers' => $answers, 'overallStatus' => $worst];
}

// POST ?action=submit  { machineId, templateId, hourMeterReading, answers[] }
// Inspector identity is always taken from the authenticated login; client-supplied names are ignored.
if ($method === 'POST' && $action === 'submit') {
    $b = body();
    if (empty($b['machineId']) || empty($b['templateId'])) {
        json_error('Machine and checklist template are required.');
    }
    $machine = require_report_machine_access($user, $b['machineId'], $b['templateId']);
    if (!isset($b['hourMeterReading']) || $b['hourMeterReading'] === '') {
        json_error("Enter the machine's current hour meter reading before submitting.");
    }
    if (!is_numeric($b['hourMeterReading']) || (float)$b['hourMeterReading'] < 0) {
        json_error('Hour meter reading must be a valid positive number.');
    }
    // Display Photo is a required built-in field on every check-up — same
    // standing as Hour Meter — because it's the photo of the machine's
    // own display/dashboard screen (fuel level, fault codes, etc.), which
    // must be captured fresh every time, not just occasionally.
    if (empty($b['displayPhotoUrl']) || trim((string)($b['displayPhotoUrl'] ?? '')) === '') {
        json_error('Take a photo of the machine display (fuel level, codes) before submitting.');
    }
    $newHourMeterReading = (float)$b['hourMeterReading'];

    // Hour meters only move forward. The same reading as last time is fine
    // (machine wasn't used that day), but a lower reading than the last
    // recorded one is always invalid.
    $lastReadingStmt = db()->prepare(
        'SELECT hour_meter_reading FROM checklist_reports
         WHERE machine_id = ? ORDER BY created_at DESC LIMIT 1'
    );
    $lastReadingStmt->execute([$b['machineId']]);
    $lastReading = $lastReadingStmt->fetchColumn();
    if ($lastReading !== false && $newHourMeterReading < (float)$lastReading) {
        json_error(
            'Hour meter reading (' . rtrim(rtrim(number_format($newHourMeterReading, 2), '0'), '.') .
            ') cannot be lower than the last recorded reading (' .
            rtrim(rtrim(number_format((float)$lastReading, 2), '0'), '.') .
            '). If the machine was not used, enter the same reading as last time.'
        );
    }

    $isServiceDay = !empty($b['isServiceDay']);
    $serviceDate = trim((string)($b['serviceDate'] ?? ''));
    $serviceType = trim((string)($b['serviceType'] ?? ''));
    $serviceIntervals = [
        '250_HOUR' => ['label' => '250-Hour Service', 'interval' => 250],
        '500_HOUR' => ['label' => '500-Hour Service', 'interval' => 500],
        '1000_HOUR' => ['label' => '1000-Hour Service', 'interval' => 1000],
        '2000_HOUR' => ['label' => '2000-Hour Service', 'interval' => 2000],
    ];
    if ($isServiceDay) {
        if ($serviceDate === '') json_error('Select the service date.');
        $parsedServiceDate = DateTime::createFromFormat('!Y-m-d', $serviceDate);
        if (!$parsedServiceDate || $parsedServiceDate->format('Y-m-d') !== $serviceDate) {
            json_error('Enter a valid service date.');
        }
        $todayLocal = new DateTimeImmutable('now', new DateTimeZone('Africa/Dar_es_Salaam'));
        if ($parsedServiceDate->format('Y-m-d') > $todayLocal->format('Y-m-d')) {
            json_error('Service date cannot be in the future.');
        }
        if (!isset($serviceIntervals[$serviceType])) json_error('Select a valid service type.');
    }

    $validated = validate_checklist_report_answers(
        $b['templateId'],
        is_array($b['answers'] ?? null) ? $b['answers'] : []
    );
    $answers = $validated['answers'];
    $worst = $validated['overallStatus'];

    $displayPhotoUrl = trim((string)($b['displayPhotoUrl'] ?? ''));

    $reportId = uuid();
    $filledBy = trim((string)($user['name'] ?? ''));
    if ($filledBy === '') {
        json_error('Your login does not have a technician/inspector name. Ask BELM Admin to update the user profile.');
    }
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO checklist_reports (id, machine_id, template_id, filled_by, hour_meter_reading, overall_status, display_photo_url, created_at) VALUES (?,?,?,?,?,?,?,NOW())')
            ->execute([$reportId, $b['machineId'], $b['templateId'], $filledBy, (float)$b['hourMeterReading'], $worst, $displayPhotoUrl !== '' ? $displayPhotoUrl : null]);

        $answerStmt = $pdo->prepare(
            'INSERT INTO checklist_answers
             (id, report_id, template_item_id, label, value, photo_url, safety_level, note)
             VALUES (?,?,?,?,?,?,?,?)'
        );
        foreach ($answers as $answer) {
            $answerStmt->execute([
                uuid(),
                $reportId,
                $answer['templateItemId'],
                $answer['label'],
                $answer['value'],
                $answer['photoUrl'],
                $answer['safetyLevel'],
                $answer['note'] !== '' ? $answer['note'] : null,
            ]);
        }

        // First checklist on an already-used machine establishes a neutral
        // 250-hour schedule baseline without pretending a historical service
        // was completed. Example: first reading 810 hrs => baseline 750 =>
        // next planned milestone 1000 hrs; if 1000 is then missed it remains
        // overdue until a real service is recorded.
        $baselineHours = max(0, floor(max(0, $newHourMeterReading - 0.000001) / 250) * 250);
        $pdo->prepare(
            'UPDATE machines
             SET status=?, last_checked_at=NOW(),
                 service_schedule_baseline_hours = CASE
                   WHEN service_schedule_baseline_hours IS NULL AND COALESCE(last_service_hours, 0) = 0 THEN ?
                   ELSE service_schedule_baseline_hours
                 END
             WHERE id=?'
        )->execute([$worst, $baselineHours, $b['machineId']]);

        if ($isServiceDay) {
            $historyStmt = $pdo->prepare('SELECT service_history, service_interval_hours FROM machines WHERE id = ?');
            $historyStmt->execute([$b['machineId']]);
            $machineRow = $historyStmt->fetch();
            $history = $machineRow && $machineRow['service_history']
                ? json_decode($machineRow['service_history'], true)
                : [];
            if (!is_array($history)) $history = [];
            $history[] = [
                'date' => $serviceDate,
                'serviceType' => $serviceIntervals[$serviceType]['label'],
                'hourMeterReading' => (float)$b['hourMeterReading'],
                'reportId' => $reportId,
                'recordedBy' => $filledBy,
            ];
            $newInterval = $serviceIntervals[$serviceType]['interval'] ?? $machineRow['service_interval_hours'];
            $pdo->prepare(
                'UPDATE machines
                 SET last_service_hours = ?, service_interval_hours = ?, service_history = ?, updated_at = NOW()
                 WHERE id = ?'
            )->execute([
                (float)$b['hourMeterReading'],
                $newInterval,
                json_encode($history),
                $b['machineId'],
            ]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    if ($isServiceDay) {
        db()->prepare(
            'INSERT INTO activity_logs (id, user_id, action, entity, entity_id, metadata, created_at)
             VALUES (?,?,?,?,?,?,NOW())'
        )->execute([
            uuid(),
            $user['id'],
            'service-completed',
            'machine',
            $b['machineId'],
            json_encode(['serviceType' => $serviceIntervals[$serviceType]['label'], 'serviceDate' => $serviceDate]),
        ]);
        // Close any 250/500/1000/2000-hour preparation alert already covered
        // by this completed service. Its Draft PI remains in Billing history.
        belm_complete_due_service_alerts($b['machineId'], (float)$b['hourMeterReading']);
    }

    // Hour-meter submission is the authoritative trigger for preventive
    // maintenance. At <=60 hours to the next milestone, BELM Service Provider
    // customers get one deduplicated alert, inventory snapshot and Draft PI.
    try {
        belm_prepare_service_due_alert($b['machineId'], (float)$b['hourMeterReading'], true);
    } catch (Throwable $error) {
        error_log('BELM preventive service preparation failed: ' . $error->getMessage());
    }

    $reportStmt = db()->prepare(
        'SELECT cr.*, ct.name AS template_name
         FROM checklist_reports cr
         LEFT JOIN checklist_templates ct ON ct.id = cr.template_id
         WHERE cr.id = ?'
    );
    $reportStmt->execute([$reportId]);
    $savedReport = $reportStmt->fetch();
    if (!$savedReport) {
        json_error('Checklist was saved, but the Checked Report could not be loaded.', 500);
    }

    // V424: a RED / Don't Operate checklist is itself a breakdown source.
    // Create/link the Breakdown Case and reserve its Job Card number immediately.
    $autoBreakdownCaseId = null;
    $autoJobCard = null;
    if (strtoupper((string)$worst) === 'RED') {
        try {
            $autoBreakdownCaseId = belm_ensure_breakdown_case_from_checklist_report($reportId, $filledBy, true);
            if ($autoBreakdownCaseId) {
                $autoJobCard = belm_ensure_job_card_for_breakdown_case($autoBreakdownCaseId, $filledBy, true);
            }
        } catch (Throwable $error) {
            error_log('Checklist saved but breakdown auto-detection failed: ' . $error->getMessage());
        }
    }

    // V324: every Technician check-up has two synchronized destinations:
    // 1) the Customer portal/team, and 2) BELM when the Technician is BELM-owned.
    // The database report remains the source of truth even if email delivery fails.
    $customerAlertResult = ['sent' => 0, 'failed' => 0, 'recipients' => []];
    $belmAlertResult = ['sent' => 0, 'failed' => 0, 'recipients' => []];
    $portalCommunicationId = null;
    $isBelmTechnician = (($user['roleName'] ?? '') === 'Technician' && empty($user['isCustomerManaged']));
    $machineName = trim(($machine['brand'] ?? '') . ' ' . ($machine['model'] ?? '')) ?: ($machine['machine_type'] ?? 'Machine');
    $serial = $machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded');
    $statusLabel = strtoupper((string)$worst);
    $subject = "CHECK UP REPORT - $machineName - $statusLabel";
    $bodyText = "TECHNICIAN CHECK UP SUBMITTED\n\n"
        . "Customer: " . ($machine['customer_name'] ?? 'Customer') . "\n"
        . "Machine: $machineName\n"
        . "Serial / Reg: $serial\n"
        . "Filled by: $filledBy\n"
        . "Hour meter: " . $b['hourMeterReading'] . "\n"
        . "Overall status: $statusLabel\n"
        . ($isServiceDay ? "Service recorded: " . ($serviceIntervals[$serviceType]['label'] ?? $serviceType) . " on $serviceDate\n" : '')
        . "\nOpen the Customer Portal > Check Up to view the full report/PDF.";

    try {
        $customerAlertResult = customer_send_team_alert(
            (string)$machine['customer_id'],
            ['check-up'],
            $subject,
            $bodyText,
            true
        );
    } catch (Throwable $error) { /* report remains saved even if email fails */ }

    if ($isBelmTechnician) {
        // Persistent portal audit: Customer can see the Technician update on
        // the machine timeline, and BELM can see the same communication record.
        $portalCommunicationId = belm_log_customer_communication(
            (string)$machine['customer_id'],
            (string)$b['machineId'],
            'BELM_TO_CUSTOMER',
            'PORTAL',
            $subject,
            $bodyText,
            'CHECKLIST_REPORT',
            $reportId,
            $filledBy,
            'SENT'
        );
        try {
            $belmAlertResult = belm_send_customer_to_belm_alert(
                ['job-cards','service-requests'],
                'BELM TECHNICIAN ' . $subject,
                $bodyText
            );
        } catch (Throwable $error) { /* workflow/database sync is still authoritative */ }
    }

    // Machine alert policy: RED/YELLOW and service-due-soon remain portal-only.
    // Only SERVICE OVERDUE can trigger automatic customer-group email + BELM copy.
    try {
        $customerEmailStmt = db()->prepare('SELECT email FROM customers WHERE id = ?');
        $customerEmailStmt->execute([$machine['customer_id']]);
        $customerEmail = trim((string)($customerEmailStmt->fetchColumn() ?: ''));
        $notifyBelm = !$isBelmTechnician
            && (empty($machine['is_machinery_admin']) || empty($user['isCustomerManaged']));
        send_machine_alert_email(
            $worst,
            compute_service_status_helper($b['machineId']),
            $machine,
            $customerEmail,
            $machine['customer_name'] ?? 'Customer',
            $notifyBelm
        );
    } catch (Throwable $error) { /* alerts are best-effort */ }
    $answerStmt = db()->prepare(
        'SELECT ca.id, ? AS report_id, cti.id AS template_item_id,
                cti.label, COALESCE(ca.value, \'\') AS value,
                ca.photo_url,
                COALESCE(ca.safety_level, cti.safety_level, \'GREEN\') AS safety_level,
                cti.input_type, cti.options, cti.is_required
         FROM checklist_template_items cti
         LEFT JOIN checklist_answers ca
           ON ca.template_item_id = cti.id AND ca.report_id = ?
         WHERE cti.template_id = ?
         ORDER BY cti."order" ASC'
    );
    $answerStmt->execute([$reportId, $reportId, $b['templateId']]);
    $savedReport = checklist_report_api_view($savedReport, $machine, $user);
    $savedReport['answers'] = array_map(
        'checklist_report_answer_view',
        $answerStmt->fetchAll()
    );
    if ($autoBreakdownCaseId) {
        $savedReport['breakdownCaseId'] = $autoBreakdownCaseId;
        $savedReport['jobCardNo'] = $autoJobCard['jobCardNo'] ?? null;
        $savedReport['breakdownAutoDetected'] = true;
    }
    $savedReport['delivery'] = [
        'customer' => [
            'portalRecorded' => true,
            'emailsSent' => (int)($customerAlertResult['sent'] ?? 0),
            'emailFailures' => (int)($customerAlertResult['failed'] ?? 0),
        ],
        'belm' => [
            'required' => $isBelmTechnician,
            'workflowSynced' => true,
            'portalCommunicationId' => $portalCommunicationId,
            'emailsSent' => (int)($belmAlertResult['sent'] ?? 0),
            'emailFailures' => (int)($belmAlertResult['failed'] ?? 0),
        ],
    ];
    json_out($savedReport, 201);
}

// V418 - Technician General Report Center. One Technician can review the
// reporting record for every machine under the customer currently assigned to
// that Technician. Job Card rows remain limited to Job Cards actually assigned
// to the logged-in Technician.
if ($method === 'GET' && $action === 'technician-general-report') {
    json_out(technician_general_report_payload($user));
}

if ($method === 'GET' && $action === 'technician-general-report-csv') {
    $data = technician_general_report_payload($user);
    $category = strtolower(trim((string)($_GET['category'] ?? '')));
    $allowed = ['checklists','operator','fuel','job-cards','maintenance'];
    if (!in_array($category, $allowed, true)) json_error('Choose a valid report category.', 422);
    $safeTech = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)$data['technician']['name']) ?: 'Technician';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="BELM-' . $safeTech . '-' . $category . '.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['BELM TECHNICIAN MACHINE REPORT', strtoupper($category)]);
    fputcsv($out, ['Technician', $data['technician']['name']]);
    fputcsv($out, ['Customer', $data['customer']['name']]);
    fputcsv($out, ['Period', $data['period']['label']]);
    fputcsv($out, []);
    if ($category === 'checklists') {
        fputcsv($out, ['Date','Machine','Fleet No.','Checklist','Technician','Status','Hour Meter']);
        foreach ($data['checklists'] as $r) fputcsv($out, [$r['createdAt'],$r['machine'],$r['fleetNumber'],$r['templateName'],$r['filledBy'],$r['status'],$r['hourMeterReading']]);
    } elseif ($category === 'operator') {
        fputcsv($out, ['Date','Machine','Fleet No.','Operator','Status','Report']);
        foreach ($data['operatorReports'] as $r) fputcsv($out, [$r['createdAt'],$r['machine'],$r['fleetNumber'],$r['operatorName'],$r['status'],$r['message']]);
    } elseif ($category === 'fuel') {
        fputcsv($out, ['Date','Machine','Fleet No.','Litres','Price/Litre TZS','Total TZS','Recorded By']);
        foreach ($data['fuelReports'] as $r) fputcsv($out, [$r['date'],$r['machine'],$r['fleetNumber'],$r['litres'],$r['unitPrice'],$r['cost'],$r['loggedBy']]);
    } elseif ($category === 'job-cards') {
        fputcsv($out, ['Date','Job Card','Machine','Fleet No.','Title','Status','Completed']);
        foreach ($data['jobCards'] as $r) fputcsv($out, [$r['createdAt'],$r['jobCardNo'],$r['machine'],$r['fleetNumber'],$r['title'],$r['status'],$r['completedAt']]);
    } else {
        fputcsv($out, ['Date','Machine','Fleet No.','Service','Hour Meter','Recorded By','Work / Requirements']);
        foreach ($data['maintenanceReports'] as $r) fputcsv($out, [$r['date'],$r['machine'],$r['fleetNumber'],$r['serviceType'],$r['hourMeterReading'],$r['recordedBy'],$r['requirementsDone']]);
    }
    fclose($out);
    exit;
}

if ($method === 'GET' && $action === 'technician-general-report-pdf') {
    $data = technician_general_report_payload($user);
    $category = strtolower(trim((string)($_GET['category'] ?? '')));
    $header = [
        'Technician: ' . (string)$data['technician']['name'],
        'Customer: ' . (string)$data['customer']['name'],
        'Period: ' . (string)$data['period']['label'],
        'Machines in scope: ' . (string)$data['machineCount'],
    ];
    $safeTech = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)$data['technician']['name']) ?: 'Technician';
    $rows = [];
    if ($category === 'checklists') {
        $title = 'TECHNICIAN GENERAL REPORT - CHECKLIST REPORTS';
        $header[] = 'Machine | Checklist | Filled By | Status | Hour Meter | Date';
        foreach ($data['checklists'] as $row) {
            $rows[] = [
                trim((string)$row['machine'] . ((string)$row['fleetNumber'] !== '' ? ' / ' . (string)$row['fleetNumber'] : '')),
                (string)$row['templateName'], (string)$row['filledBy'], (string)$row['status'],
                $row['hourMeterReading'] === null ? '-' : (string)$row['hourMeterReading'],
                display_date_billing((string)$row['createdAt']),
            ];
        }
        $filename = 'BELM-' . $safeTech . '-Checklist-Reports.pdf';
    } elseif ($category === 'operator') {
        $title = 'TECHNICIAN GENERAL REPORT - OPERATOR REPORTS';
        $header[] = 'Machine | Operator | Status | Date | Reported Issue';
        foreach ($data['operatorReports'] as $row) {
            $rows[] = [
                trim((string)$row['machine'] . ((string)$row['fleetNumber'] !== '' ? ' / ' . (string)$row['fleetNumber'] : '')),
                (string)$row['operatorName'], (string)$row['status'], display_date_billing((string)$row['createdAt']),
                (string)$row['message'],
            ];
        }
        $filename = 'BELM-' . $safeTech . '-Operator-Reports.pdf';
    } elseif ($category === 'fuel') {
        $title = 'TECHNICIAN MACHINE REPORT - FUEL REPORT';
        $header[] = 'Date | Machine | Litres | Price/Litre TZS | Total TZS | Recorded By';
        foreach ($data['fuelReports'] as $row) {
            $rows[] = [
                $row['date'] !== '' ? display_date_billing((string)$row['date']) : '-',
                trim((string)$row['machine'] . ((string)$row['fleetNumber'] !== '' ? ' / ' . (string)$row['fleetNumber'] : '')),
                (string)$row['litres'], number_format((float)$row['unitPrice'], 2),
                number_format((float)$row['cost'], 2), (string)$row['loggedBy'],
            ];
        }
        $filename = 'BELM-' . $safeTech . '-Fuel-Report.pdf';
    } elseif ($category === 'maintenance') {
        $title = 'TECHNICIAN GENERAL REPORT - MAINTENANCE REPORTS';
        $header[] = 'CURRENT SERVICE STATUS';
        $header[] = 'Machine | Service | Level | Current Hrs | Next Service | Hrs Left';
        foreach ($data['maintenanceSummary'] as $row) {
            $rows[] = [
                trim((string)$row['machine'] . ((string)$row['fleetNumber'] !== '' ? ' / ' . (string)$row['fleetNumber'] : '')),
                (string)$row['serviceType'], (string)$row['level'],
                $row['totalHours'] === null ? '-' : (string)$row['totalHours'],
                $row['dueHour'] === null ? '-' : (string)$row['dueHour'],
                $row['hoursRemaining'] === null ? '-' : (string)$row['hoursRemaining'],
            ];
        }
        $rows[] = [''];
        $rows[] = ['MAINTENANCE / SERVICE HISTORY'];
        $rows[] = ['Machine','Service','Hour Meter','Recorded By','Date','Work / Requirements'];
        foreach ($data['maintenanceReports'] as $row) {
            $rows[] = [
                trim((string)$row['machine'] . ((string)$row['fleetNumber'] !== '' ? ' / ' . (string)$row['fleetNumber'] : '')),
                (string)$row['serviceType'], $row['hourMeterReading'] === null ? '-' : (string)$row['hourMeterReading'],
                (string)$row['recordedBy'], $row['date'] !== '' ? display_date_billing((string)$row['date']) : '-',
                (string)($row['requirementsDone'] ?: '-'),
            ];
        }
        $filename = 'BELM-' . $safeTech . '-Maintenance-Reports.pdf';
    } elseif ($category === 'job-cards') {
        $title = 'TECHNICIAN GENERAL REPORT - JOB CARD REPORTS';
        $header[] = 'Only Job Cards assigned to this Technician are included.';
        $header[] = 'Job Card | Machine | Title / Fault | Status | Repeat | Created | Completed';
        foreach ($data['jobCards'] as $row) {
            $rows[] = [
                (string)$row['jobCardNo'],
                trim((string)$row['machine'] . ((string)$row['fleetNumber'] !== '' ? ' / ' . (string)$row['fleetNumber'] : '')),
                trim((string)$row['title'] . ((string)$row['faultDescription'] !== '' ? ' - ' . (string)$row['faultDescription'] : '')),
                (string)$row['status'], !empty($row['repeatIssue']) ? 'YES' : 'NO',
                display_date_billing((string)$row['createdAt']),
                !empty($row['completedAt']) ? display_date_billing((string)$row['completedAt']) : '-',
            ];
        }
        $filename = 'BELM-' . $safeTech . '-Job-Card-Reports.pdf';
    } else {
        json_error('Choose checklists, operator, fuel, job-cards, or maintenance.', 422);
    }
    if (!$rows) $rows[] = ['No records found for the selected period.'];
    output_table_pdf($filename, $title, $header, $rows);
}

// GET ?action=for-machine&machineId=... [&from=YYYY-MM-DD&to=YYYY-MM-DD]
if ($method === 'GET' && $action === 'for-machine') {
    $machineId = trim((string)($_GET['machineId'] ?? ''));
    $machine = require_report_machine_access($user, $machineId);
    [$fromTs, $toTs] = checklist_staff_report_range((string)($_GET['from'] ?? ''), (string)($_GET['to'] ?? ''));
    $sql = 'SELECT cr.*, ct.name AS template_name
            FROM checklist_reports cr
            LEFT JOIN checklist_templates ct ON ct.id = cr.template_id
            WHERE cr.machine_id = ?';
    $params = [$machineId];
    if ($fromTs !== null) { $sql .= ' AND cr.created_at >= ?'; $params[] = $fromTs; }
    if ($toTs !== null) { $sql .= ' AND cr.created_at < ?'; $params[] = $toTs; }
    $sql .= ' ORDER BY cr.created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $reports = $stmt->fetchAll();
    foreach ($reports as &$r) {
        $stmt2 = db()->prepare(
            'SELECT ca.id, ? AS report_id, cti.id AS template_item_id,
                    cti.label, COALESCE(ca.value, \'\') AS value,
                    ca.photo_url,
                    COALESCE(ca.safety_level, cti.safety_level, \'GREEN\') AS safety_level,
                    cti.input_type, cti.options, cti.is_required
             FROM checklist_template_items cti
             LEFT JOIN checklist_answers ca
               ON ca.template_item_id = cti.id AND ca.report_id = ?
             WHERE cti.template_id = ?
             ORDER BY cti."order" ASC'
        );
        $stmt2->execute([$r['id'], $r['id'], $r['template_id']]);
        $r = checklist_report_api_view($r, $machine, $user);
        $r['answers'] = array_map('checklist_report_answer_view', $stmt2->fetchAll());
    }
    unset($r);
    json_out($reports);
}

// GET ?action=machine-history-pdf&machineId=... — period summary for Checklist / Daily Report Center
if ($method === 'GET' && $action === 'machine-history-pdf') {
    $machineId = trim((string)($_GET['machineId'] ?? ''));
    if ($machineId === '') json_error('Machine ID is required.', 400);
    $machine = require_report_machine_access($user, $machineId);
    [$fromTs, $toTs, $periodLabel] = checklist_staff_report_range((string)($_GET['from'] ?? ''), (string)($_GET['to'] ?? ''));
    $sql = 'SELECT cr.filled_by, cr.overall_status, cr.hour_meter_reading, cr.created_at, ct.name AS template_name
            FROM checklist_reports cr
            LEFT JOIN checklist_templates ct ON ct.id = cr.template_id
            WHERE cr.machine_id = ?';
    $params = [$machineId];
    if ($fromTs !== null) { $sql .= ' AND cr.created_at >= ?'; $params[] = $fromTs; }
    if ($toTs !== null) { $sql .= ' AND cr.created_at < ?'; $params[] = $toTs; }
    $sql .= ' ORDER BY cr.created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $reports = $stmt->fetchAll();
    $rows = array_map(static fn(array $r): array => [
        display_date_billing($r['created_at']),
        (string)($r['template_name'] ?: 'Checklist Report'),
        (string)($r['filled_by'] ?: 'Not recorded'),
        (string)($r['overall_status'] ?: 'GREEN'),
        'Hrs: ' . (string)($r['hour_meter_reading'] ?? '—'),
    ], $reports);
    $machineLabel = trim((string)($machine['brand'] ?? '') . ' ' . (string)($machine['model'] ?? '')) ?: 'Machine';
    $safeMachine = preg_replace('/[^A-Za-z0-9_-]+/', '-', $machineLabel);
    output_table_pdf(
        'BELM-daily-report-' . $safeMachine . '.pdf',
        'CHECKLIST / DAILY REPORT',
        [
            'Customer: ' . (string)($machine['customer_name'] ?? 'Customer'),
            'Machine: ' . $machineLabel,
            'Serial / Registration: ' . (string)($machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded')),
            'Period: ' . $periodLabel,
            'Date  |  Checklist  |  Technician  |  Status  |  Hour meter',
        ],
        $rows
    );
}

// GET ?action=pdf&id=... — download a single checklist report as PDF
if ($method === 'GET' && $action === 'pdf') {
    $reportId = trim((string)($_GET['id'] ?? ''));
    if ($reportId === '') json_error('Checklist report ID is required.');

    $stmt = db()->prepare(
        'SELECT cr.*, ct.name AS template_name
         FROM checklist_reports cr
         LEFT JOIN checklist_templates ct ON ct.id = cr.template_id
         WHERE cr.id = ?'
    );
    $stmt->execute([$reportId]);
    $report = $stmt->fetch();
    if (!$report) json_error('Checklist report not found.', 404);

    $machine = require_report_machine_access($user, $report['machine_id']);

    $answerStmt = db()->prepare(
        'SELECT ca.id, ? AS report_id, cti.id AS template_item_id,
                cti.label, COALESCE(ca.value, \'\') AS value,
                ca.photo_url,
                COALESCE(ca.safety_level, cti.safety_level, \'GREEN\') AS safety_level,
                cti.input_type, cti.options, cti.is_required
         FROM checklist_template_items cti
         LEFT JOIN checklist_answers ca
           ON ca.template_item_id = cti.id AND ca.report_id = ?
         WHERE cti.template_id = ?
         ORDER BY cti."order" ASC'
    );
    $answerStmt->execute([$report['id'], $report['id'], $report['template_id']]);
    $view = checklist_report_api_view($report, $machine, $user);
    $answers = array_map('checklist_report_answer_view', $answerStmt->fetchAll());

    $lines = [
        strtoupper($machine['customer_name'] ?? 'BELM CUSTOMER') . ' - CHECKLIST REPORT',
        'Service provided by: BELM General Tech Service Limited',
        'Template: ' . ($view['templateName'] ?: 'Checklist'),
        'Checklist No: ' . ($view['checklistNo'] ?? checklist_report_number($report)),
        'Machine: ' . trim(($machine['brand'] ?? '') . ' ' . ($machine['model'] ?? '')),
        'Serial / Registration: ' . ($machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded')),
        'Filled by: ' . ($view['filledBy'] ?: '—'),
        'Date: ' . date('d/m/Y H:i', strtotime((string)$view['createdAt'])),
        'Hour meter: ' . $view['hourMeterReading'],
        'Overall status: ' . $view['overallStatus'],
    ];
    $photos = [];
    // The built-in Display Photo (same standing as Hour Meter) goes first —
    // both in the text summary and as the very first photo page, so it's
    // the first thing seen after the header, ahead of individual item photos.
    $displayPhoto = checklist_report_decode_photo($view['displayPhotoUrl'] ?? null);
    if ($displayPhoto) {
        $lines[] = 'Display photo: (see photo page below)';
        $photos[] = ['label' => 'Display Photo', 'photo' => $displayPhoto];
    }
    $lines[] = str_repeat('-', 78);
    $itemNumber = 0;
    foreach ($answers as $answer) {
        $itemNumber++;
        $displayValue = $answer['value'];
        $isImageValue = $displayValue !== '' && str_starts_with((string)$displayValue, 'data:image/');
        $photo = checklist_report_decode_photo($answer['photoUrl'] ?: ($isImageValue ? $displayValue : null));
        if ($photo) $photos[] = ['label' => $answer['label'], 'photo' => $photo];
        $levelSuffix = strtoupper((string)$answer['safetyLevel']) === 'NONE' ? '' : ' [' . $answer['safetyLevel'] . ']';
        $noteSuffix = trim((string)($answer['note'] ?? '')) !== '' ? ' -- Issue: ' . trim((string)$answer['note']) : '';
        $lines[] = sprintf(
            '%d. %s: %s%s%s%s',
            $itemNumber,
            $answer['label'],
            $isImageValue ? '(Photo)' : ($displayValue !== '' ? $displayValue : '—'),
            $levelSuffix,
            $noteSuffix,
            $photo ? ' (see photo page below)' : ''
        );
    }
    $lines[] = str_repeat('-', 78);

    $safeMachine = preg_replace('/[^A-Za-z0-9_-]+/', '-', trim(($machine['brand'] ?? '') . '-' . ($machine['model'] ?? '')));
    output_checklist_report_pdf('checklist-report-' . $safeMachine . '.pdf', $lines, $photos);
}


if ($method === 'PUT' && $action === 'update') {
    if (($user['roleName'] ?? '') !== 'Technician') {
        json_error('Only a BELM Technician can edit a saved checklist.', 403);
    }
    $reportId = trim((string)($_GET['id'] ?? ''));
    if ($reportId === '') json_error('Checklist report is required.');

    $stmt = db()->prepare(
        'SELECT id, machine_id, template_id, filled_by, created_at, overall_status
         FROM checklist_reports WHERE id = ?'
    );
    $stmt->execute([$reportId]);
    $report = $stmt->fetch();
    if (!$report) json_error('Checklist report not found.', 404);

    require_report_machine_access($user, $report['machine_id'], $report['template_id']);
    if (strcasecmp(trim((string)$report['filled_by']), trim((string)($user['name'] ?? ''))) !== 0) {
        json_error('Only the Technician who saved this checklist can edit it.', 403);
    }
    $expiry = checklist_report_expiry((string)$report['created_at']);
    $isBreakdown = ($report['overall_status'] ?? 'GREEN') === 'RED';
    if (!$isBreakdown && checklist_report_is_expired((string)$report['created_at'])) {
        json_error(
            'This checklist expired at 00:00 Tanzania time and can no longer be edited.',
            409
        );
    }

    $b = body();
    if (!isset($b['hourMeterReading']) || $b['hourMeterReading'] === '') {
        json_error("Enter the machine's current hour meter reading before saving.");
    }
    if (!is_numeric($b['hourMeterReading']) || (float)$b['hourMeterReading'] < 0) {
        json_error('Hour meter reading must be a valid positive number.');
    }
    $updatedHourMeterReading = (float)$b['hourMeterReading'];

    $priorReadingStmt = db()->prepare(
        'SELECT hour_meter_reading FROM checklist_reports
         WHERE machine_id = ? AND id <> ?
         ORDER BY created_at DESC LIMIT 1'
    );
    $priorReadingStmt->execute([$report['machine_id'], $reportId]);
    $priorReading = $priorReadingStmt->fetchColumn();
    if ($priorReading !== false && $updatedHourMeterReading < (float)$priorReading) {
        json_error(
            'Hour meter reading (' . rtrim(rtrim(number_format($updatedHourMeterReading, 2), '0'), '.') .
            ') cannot be lower than the previous recorded reading (' .
            rtrim(rtrim(number_format((float)$priorReading, 2), '0'), '.') .
            '). If the machine was not used, enter the same reading as last time.'
        );
    }
    $validated = validate_checklist_report_answers(
        $report['template_id'],
        is_array($b['answers'] ?? null) ? $b['answers'] : []
    );
    $answers = $validated['answers'];
    $worst = $validated['overallStatus'];

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'UPDATE checklist_reports
             SET hour_meter_reading = ?, overall_status = ?, updated_at = NOW()
             WHERE id = ?'
        )->execute([(float)$b['hourMeterReading'], $worst, $reportId]);
        $pdo->prepare('DELETE FROM checklist_answers WHERE report_id = ?')
            ->execute([$reportId]);

        $answerStmt = $pdo->prepare(
            'INSERT INTO checklist_answers
             (id, report_id, template_item_id, label, value, photo_url, safety_level, note)
             VALUES (?,?,?,?,?,?,?,?)'
        );
        foreach ($answers as $answer) {
            $answerStmt->execute([
                uuid(),
                $reportId,
                $answer['templateItemId'],
                $answer['label'],
                $answer['value'],
                $answer['photoUrl'],
                $answer['safetyLevel'],
                $answer['note'] !== '' ? $answer['note'] : null,
            ]);
        }

        $latestStatus = $pdo->prepare(
            'SELECT overall_status, created_at
             FROM checklist_reports
             WHERE machine_id = ?
             ORDER BY created_at DESC
             LIMIT 1'
        );
        $latestStatus->execute([$report['machine_id']]);
        $latestReport = $latestStatus->fetch();
        $pdo->prepare('UPDATE machines SET status = ?, last_checked_at = ? WHERE id = ?')
            ->execute([
                $latestReport['overall_status'] ?? $worst,
                $latestReport['created_at'] ?? $report['created_at'],
                $report['machine_id'],
            ]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    // Re-evaluate the communication policy after a same-day correction.
    // Only SERVICE OVERDUE can trigger automatic email.
    try {
        $machineStmt = db()->prepare(
            'SELECT m.id, m.machine_type, m.brand, m.model, m.serial_number, m.reg_number, m.customer_id,
                    c.name AS customer_name, c.email AS customer_email
             FROM machines m JOIN customers c ON c.id = m.customer_id
             WHERE m.id = ?'
        );
        $machineStmt->execute([$report['machine_id']]);
        $machineRow = $machineStmt->fetch();
        if ($machineRow) {
            send_machine_alert_email(
                $worst,
                compute_service_status_helper($report['machine_id']),
                $machineRow,
                trim((string)($machineRow['customer_email'] ?? '')),
                $machineRow['customer_name'] ?? 'Customer'
            );
        }
    } catch (Throwable $error) { /* alerts are best-effort */ }

    json_out([
        'id' => $reportId,
        'overallStatus' => $worst,
        'expiresAt' => $expiry->format(DateTimeInterface::ATOM),
        'canEdit' => true,
        'updatedAt' => (new DateTimeImmutable('now'))->format(DateTimeInterface::ATOM),
    ]);
}

// GET ?action=service-status&machineId=...
if ($method === 'GET' && $action === 'service-status') {
    require_report_machine_access($user, $_GET['machineId']);
    json_out(compute_service_status_helper($_GET['machineId']));
}

// GET ?action=operator-reports&machineId=... — machine-specific Operator Report history.
// V416: honours the same Date / Month / Year range used by the Machine Report Center.
if ($method === 'GET' && $action === 'operator-reports') {
    $machineId = trim((string)($_GET['machineId'] ?? ''));
    if ($machineId === '') json_error('Machine ID is required.', 400);
    require_report_machine_access($user, $machineId);
    [$fromTs, $toTs] = checklist_staff_report_range((string)($_GET['from'] ?? ''), (string)($_GET['to'] ?? ''));
    $sql = 'SELECT id, operator_name, operator_contact, message, status, notify_belm, created_at, resolved_at
            FROM operator_reports WHERE machine_id = ?';
    $params = [$machineId];
    if ($fromTs !== null) { $sql .= ' AND created_at >= ?'; $params[] = $fromTs; }
    if ($toTs !== null) { $sql .= ' AND created_at < ?'; $params[] = $toTs; }
    $sql .= ' ORDER BY created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        $row['operatorName'] = $row['operator_name'];
        $row['operatorContact'] = $row['operator_contact'];
        $row['notifyBelm'] = !empty($row['notify_belm']);
        $row['createdAt'] = $row['created_at'];
        $row['resolvedAt'] = $row['resolved_at'];
        unset($row['operator_name'], $row['operator_contact'], $row['notify_belm']);
    }
    unset($row);
    json_out($rows);
}

// GET ?action=operator-reports-pdf&machineId=... — period Operator Report history for one machine only.
if ($method === 'GET' && $action === 'operator-reports-pdf') {
    $machineId = trim((string)($_GET['machineId'] ?? ''));
    if ($machineId === '') json_error('Machine ID is required.', 400);
    $machine = require_report_machine_access($user, $machineId);
    [$fromTs, $toTs, $periodLabel] = checklist_staff_report_range((string)($_GET['from'] ?? ''), (string)($_GET['to'] ?? ''));
    $sql = 'SELECT operator_name, operator_contact, message, status, created_at, resolved_at
            FROM operator_reports WHERE machine_id = ?';
    $params = [$machineId];
    if ($fromTs !== null) { $sql .= ' AND created_at >= ?'; $params[] = $fromTs; }
    if ($toTs !== null) { $sql .= ' AND created_at < ?'; $params[] = $toTs; }
    $sql .= ' ORDER BY created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $rows = array_map(static fn(array $r): array => [
        display_date_billing($r['created_at']),
        (string)($r['operator_name'] ?: 'Operator'),
        (string)($r['operator_contact'] ?: '-'),
        (string)($r['status'] ?: 'OPEN'),
        (string)($r['message'] ?: '-'),
    ], $stmt->fetchAll());
    $machineLabel = trim((string)($machine['brand'] ?? '') . ' ' . (string)($machine['model'] ?? '')) ?: 'Machine';
    $safeMachine = preg_replace('/[^A-Za-z0-9_-]+/', '-', $machineLabel);
    output_table_pdf(
        'BELM-operator-report-' . $safeMachine . '.pdf',
        'OPERATOR REPORT HISTORY',
        [
            'Customer: ' . (string)($machine['customer_name'] ?? 'Customer'),
            'Machine: ' . $machineLabel,
            'Serial / Registration: ' . (string)($machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded')),
            'Period: ' . $periodLabel,
            'Date  |  Operator  |  Contact  |  Status  |  Message',
        ],
        $rows
    );
}

// PUT ?action=resolve-operator-report&machineId=...  { reportId }
// Lets the assigned Technician close a problem reported by the customer's
// own Operator. This is essential for Customer Self-Service mode: internal
// problems can be handled end-to-end by the customer's own maintenance team
// without BELM needing to touch the report.
if ($method === 'PUT' && $action === 'resolve-operator-report') {
    $machineId = trim((string)($_GET['machineId'] ?? ''));
    if ($machineId === '') json_error('machineId is required.');
    $machine = require_report_machine_access($user, $machineId);
    $b = body();
    $reportId = trim((string)($b['reportId'] ?? ''));
    if ($reportId === '') json_error('reportId is required.');

    $stmt = db()->prepare(
        'SELECT id, status, operator_name, message FROM operator_reports WHERE id = ? AND machine_id = ?'
    );
    $stmt->execute([$reportId, $machineId]);
    $report = $stmt->fetch();
    if (!$report) json_error('Operator report not found for this machine.', 404);
    if (($report['status'] ?? '') === 'RESOLVED') {
        json_out(['ok' => true, 'alreadyResolved' => true]);
    }

    db()->prepare(
        "UPDATE operator_reports SET status='RESOLVED', resolved_at=NOW(), resolved_by_id=? WHERE id=?"
    )->execute([$user['id'], $reportId]);

    try {
        $machineName = trim(($machine['brand'] ?? '') . ' ' . ($machine['model'] ?? '')) ?: ($machine['machine_type'] ?? 'Machine');
        $resolvedBy = trim((string)($user['name'] ?? 'Technician'));
        customer_send_team_alert(
            (string)$machine['customer_id'],
            ['operator-reports', 'report-problem'],
            'MACHINE PROBLEM RESOLVED - ' . $machineName,
            "MACHINE PROBLEM RESOLVED\n\n"
            . 'Customer: ' . ($machine['customer_name'] ?? 'Customer') . "\n"
            . "Machine: $machineName\n"
            . 'Reported by: ' . ($report['operator_name'] ?: 'Operator') . "\n"
            . 'Problem: ' . ($report['message'] ?? '') . "\n"
            . "Resolved by: $resolvedBy\n\n"
            . 'Open the Customer Portal > Operator Reports to review the history.',
            true
        );
    } catch (Throwable $ignored) {}

    // V220: keep the live Breakdown Process aligned when a Technician
    // resolves the underlying Operator Problem Report.
    belm_sync_breakdown_sources((string)$machine['customer_id']);
    json_out(['ok' => true, 'resolvedBy' => $user['name'] ?? 'Technician']);
}

// POST ?action=log-service&machineId=...  { requirementsDone[] }
if ($method === 'POST' && $action === 'log-service') {
    $machineId = $_GET['machineId'];
    require_report_machine_access($user, $machineId);
    $b = body();
    $status = compute_service_status_helper($machineId);

    $stmt = db()->prepare('SELECT service_history FROM machines WHERE id = ?');
    $stmt->execute([$machineId]);
    $row = $stmt->fetch();
    $history = $row['service_history'] ? json_decode($row['service_history'], true) : [];
    $history[] = ['date' => date('c'), 'hoursAtService' => $status['totalHours'], 'requirementsDone' => $b['requirementsDone'] ?? []];

    db()->prepare('UPDATE machines SET last_service_hours=?, service_history=? WHERE id=?')
        ->execute([$status['totalHours'], json_encode($history), $machineId]);
    belm_complete_due_service_alerts($machineId, (float)$status['totalHours']);

    json_out(['ok' => true]);
}

json_error('Unknown request', 404);
