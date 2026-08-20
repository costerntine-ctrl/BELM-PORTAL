<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/table_pdf_helper.php';

$user = require_auth();
// The shared Technician role is used by both BELM field technicians and
// customer-owned technicians. In Customer Self-Service mode, technicians work
// only inside the customer's machine/checklist/operator workflow; BELM's
// central Job Cards workspace remains private. The customer explicitly
// opens a BELM support request from the Customer Portal when help is needed.
if (($user['roleName'] ?? '') === 'Technician' && !empty($user['assignedCustomerId'])) {
    $modeStmt = db()->prepare(
        'SELECT c.is_machinery_admin, u.is_customer_managed
         FROM users u JOIN customers c ON c.id = u.assigned_customer_id
         WHERE u.id = ? AND c.id = ? AND u.deleted_at IS NULL AND c.deleted_at IS NULL'
    );
    $modeStmt->execute([(string)$user['id'], (string)$user['assignedCustomerId']]);
    $modeRow = $modeStmt->fetch();
    if ($modeRow && !empty($modeRow['is_machinery_admin']) && !empty($modeRow['is_customer_managed'])) {
        json_error('BELM Job Cards workspace is not available to Customer Self-Service technicians.', 403);
    }
}
require_any_page_access($user, ['job-cards','service-requests']);
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = $_GET['id'] ?? null;
$allowedStatuses = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];

// Records one entry in a Job Card's audit trail — every status
// change and every (re)assignment, who did it, and when. This is what
// "Opened -> Assigned -> In Progress -> Completed/Cancelled by ..." on
// the History panel is built from.
function log_service_request_history(
    string $requestId, string $eventType, ?string $fromValue, ?string $toValue,
    array $user, ?string $note = null
): void {
    db()->prepare(
        'INSERT INTO service_request_history
         (id, request_id, event_type, from_value, to_value, actor_id, actor_name, note, created_at)
         VALUES (?,?,?,?,?,?,?,?,NOW())'
    )->execute([uuid(), $requestId, $eventType, $fromValue, $toValue, $user['id'], $user['name'], $note]);
}


function notify_service_request_customer(string $requestId, string $subject, string $message, array $user): void {
    try {
        $stmt = db()->prepare(
            'SELECT sr.customer_id, sr.machine_id, sr.description, c.name AS customer_name, m.brand, m.model
             FROM service_requests sr
             JOIN customers c ON c.id = sr.customer_id
             JOIN machines m ON m.id = sr.machine_id
             WHERE sr.id = ?'
        );
        $stmt->execute([$requestId]);
        $row = $stmt->fetch();
        if (!$row) return;
        $machine = trim(($row['brand'] ?? '') . ' ' . ($row['model'] ?? '')) ?: 'Machine';
        belm_send_customer_alert(
            (string)$row['customer_id'], (string)$row['machine_id'], ['admin'],
            $subject,
            $message . "\nMachine: $machine\nRequest: " . ($row['description'] ?? '') . "\n\nOpen the BELM Customer Portal for the latest history.",
            'SERVICE_REQUEST', $requestId, (string)($user['name'] ?? 'BELM')
        );
    } catch (Throwable $error) {
        error_log('Job Card customer notification failed: ' . $error->getMessage());
    }
}

function fetch_request_parts(string $requestId): array {
    $stmt = db()->prepare(
        'SELECT srp.id, srp.spare_name, srp.part_number, srp.quantity,
                sp.name AS matched_name, sp.part_number AS matched_part_number,
                sp.stock_qty AS matched_stock_qty
         FROM service_request_parts srp
         LEFT JOIN spare_parts sp ON sp.id = srp.matched_spare_part_id AND sp.deleted_at IS NULL
         WHERE srp.request_id = ?
         ORDER BY srp.created_at ASC'
    );
    $stmt->execute([$requestId]);
    $parts = $stmt->fetchAll();
    foreach ($parts as &$part) {
        $part['spareName'] = $part['spare_name'];
        $part['partNumber'] = $part['part_number'];
        // Silent inventory match — helps whoever prepares the Proforma
        // instantly see which stock item this corresponds to, without the
        // customer ever having seen BELM's inventory themselves.
        $part['inventoryMatch'] = $part['matched_name']
            ? ['name' => $part['matched_name'], 'partNumber' => $part['matched_part_number'], 'stockQty' => (int)$part['matched_stock_qty']]
            : null;
        unset($part['spare_name'], $part['part_number'], $part['matched_name'], $part['matched_part_number'], $part['matched_stock_qty']);
    }
    unset($part);
    return $parts;
}

// ---- Operator problem reports (visible to BELM Technician/Admin staff) ----
if ($method === 'GET' && $action === 'operator-reports') {
    $statusFilter = trim((string)($_GET['status'] ?? ''));
    $sql = "SELECT opr.*, c.name AS customer_name, m.model AS machine_model, m.machine_type
            FROM operator_reports opr
            JOIN customers c ON c.id = opr.customer_id
            JOIN machines m ON m.id = opr.machine_id
            WHERE opr.notify_belm = 1";
    $params = [];
    if ($statusFilter !== '') {
        $sql .= ' AND opr.status = ?';
        $params[] = strtoupper($statusFilter);
    }
    $sql .= ' ORDER BY opr.created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $reports = $stmt->fetchAll();
    foreach ($reports as &$r) {
        $r['customer'] = ['name' => $r['customer_name']];
        $r['machine'] = ['model' => $r['machine_model'], 'machineType' => $r['machine_type']];
        $r['operatorName'] = $r['operator_name'];
        $r['operatorContact'] = $r['operator_contact'];
        $r['createdAt'] = $r['created_at'];
        $r['resolvedAt'] = $r['resolved_at'];
        unset($r['customer_name'], $r['machine_model'], $r['machine_type'], $r['operator_name'], $r['operator_contact']);
    }
    unset($r);
    json_out($reports);
}

if ($method === 'PUT' && $action === 'operator-reports') {
    $reportId = trim((string)($_GET['id'] ?? ''));
    if ($reportId === '') json_error('Report ID is required.');
    $reportStmt = db()->prepare('SELECT customer_id, machine_id, message FROM operator_reports WHERE id = ? AND notify_belm = 1');
    $reportStmt->execute([$reportId]);
    $report = $reportStmt->fetch();
    if (!$report) json_error('Report not found.', 404);
    $stmt = db()->prepare("UPDATE operator_reports SET status='RESOLVED', resolved_at=NOW(), resolved_by_id=? WHERE id=?");
    $stmt->execute([$user['id'], $reportId]);
    belm_send_customer_alert(
        (string)$report['customer_id'], (string)$report['machine_id'], ['admin'],
        'Machine Problem Resolved',
        'BELM resolved the reported problem: ' . $report['message'],
        'OPERATOR_REPORT', $reportId, (string)($user['name'] ?? 'BELM')
    );
    // V220: resolving the source report also closes its Breakdown Process case.
    belm_sync_breakdown_sources((string)$report['customer_id']);
    json_out(['ok' => true]);
}

if ($method === 'GET' && $action === 'daily-report') {
    // V335: the status tabs are all-time working counts, while Daily Report is
    // scoped to the local calendar date on which COMPLETED/CANCELLED happened.
    // TIMESTAMPTZ::date depends on the PostgreSQL session timezone, so use the
    // portal's Tanzania timezone explicitly. Legacy final rows may predate the
    // completed_at/cancelled_at columns; recover their final action timestamp
    // from History, then updated_at/created_at as a last-resort audit fallback.
    $reportTimezone = 'Africa/Dar_es_Salaam';
    $todayLocal = (new DateTimeImmutable('now', new DateTimeZone($reportTimezone)))->format('Y-m-d');
    $date = trim((string)($_GET['date'] ?? $todayLocal));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) json_error('Enter a valid date (YYYY-MM-DD).');

    $stmt = db()->prepare(
        "WITH final_requests AS (
            SELECT sr.*, c.name AS customer_name, m.model AS machine_model, m.machine_type,
                   cu.name AS completed_by_name, xu.name AS cancelled_by_name,
                   CASE WHEN sr.status='COMPLETED'
                        THEN COALESCE(sr.completed_at, fh.created_at, sr.updated_at, sr.created_at)
                        ELSE COALESCE(sr.cancelled_at, fh.created_at, sr.updated_at, sr.created_at)
                   END AS action_at,
                   CASE WHEN sr.status='COMPLETED'
                        THEN COALESCE(cu.name, fh.actor_name)
                        ELSE COALESCE(xu.name, fh.actor_name)
                   END AS handled_by_name
            FROM service_requests sr
            LEFT JOIN customers c ON c.id = sr.customer_id
            LEFT JOIN machines m ON m.id = sr.machine_id
            LEFT JOIN users cu ON cu.id = sr.completed_by_id
            LEFT JOIN users xu ON xu.id = sr.cancelled_by_id
            LEFT JOIN LATERAL (
                SELECT h.created_at, h.actor_name
                FROM service_request_history h
                WHERE h.request_id = sr.id
                  AND h.event_type = 'STATUS'
                  AND UPPER(COALESCE(h.to_value,'')) = sr.status
                ORDER BY h.created_at DESC
                LIMIT 1
            ) fh ON TRUE
            WHERE sr.status IN ('COMPLETED','CANCELLED')
        )
        SELECT * FROM final_requests
        WHERE (action_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date = ?
        ORDER BY action_at DESC"
    );
    $stmt->execute([$date]);
    $requests = $stmt->fetchAll();

    $selectedCompleted = 0;
    $selectedCancelled = 0;
    foreach ($requests as &$r) {
        $isCompleted = strtoupper((string)$r['status']) === 'COMPLETED';
        if ($isCompleted) $selectedCompleted++; else $selectedCancelled++;
        $r['customer'] = $r['customer_id'] ? ['id' => $r['customer_id'], 'name' => $r['customer_name']] : null;
        $r['machine'] = $r['machine_id'] ? ['model' => $r['machine_model'], 'machineType' => $r['machine_type']] : null;
        $handledByName = trim((string)($r['handled_by_name'] ?? ''));
        $r['handledBy'] = $handledByName !== '' ? ['name' => $handledByName] : null;
        $r['completedBy'] = $isCompleted && $handledByName !== '' ? ['name' => $handledByName] : null;
        $r['cancelledBy'] = !$isCompleted && $handledByName !== '' ? ['name' => $handledByName] : null;
        $r['actionAt'] = $r['action_at'];
        $r['completedAt'] = $r['completed_at'];
        $r['cancelledAt'] = $r['cancelled_at'];
        unset($r['customer_name'], $r['machine_model'], $r['machine_type'], $r['completed_by_name'], $r['cancelled_by_name'], $r['action_at'], $r['handled_by_name']);
    }
    unset($r);

    // V358: Daily Report must also show the technical Job Card report that the
    // assigned Technician actually saved. The Job Card reaches COMPLETED
    // only after Workshop testing, so using only final Job Card actions
    // hid a Technician report that may have been submitted hours/days earlier.
    // We expose the latest technical snapshot for Job Cards whose report was
    // updated on the selected Tanzania calendar date. No Job Card history/data is
    // rewritten here; this is a read-only reporting view.
    $jobReportStmt = db()->prepare(
        "SELECT j.id,j.job_card_no,j.title,j.status,j.technician_name,j.diagnosis,j.work_done,
                j.test_result,j.completion_note,j.repeat_issue,j.started_at,j.completed_at,j.updated_at,
                c.name AS customer_name,m.brand AS machine_brand,m.model AS machine_model,m.machine_type,
                bc.source_type,bc.source_id,
                COALESCE(j.completed_at,j.updated_at,j.started_at,j.created_at) AS report_at
         FROM digital_job_cards j
         JOIN breakdown_cases bc ON bc.id=j.case_id
         LEFT JOIN customers c ON c.id=j.customer_id
         LEFT JOIN machines m ON m.id=j.machine_id
         WHERE NULLIF(TRIM(COALESCE(j.diagnosis,'')),'') IS NOT NULL
           AND NULLIF(TRIM(COALESCE(j.work_done,'')),'') IS NOT NULL
           AND (COALESCE(j.completed_at,j.updated_at,j.started_at,j.created_at) AT TIME ZONE 'Africa/Dar_es_Salaam')::date = ?
         ORDER BY report_at DESC,j.job_card_no DESC"
    );
    $jobReportStmt->execute([$date]);
    $jobReports = $jobReportStmt->fetchAll();
    foreach ($jobReports as &$jr) {
        $machineLabel = trim((string)($jr['machine_brand'] ?? '') . ' ' . (string)($jr['machine_model'] ?? ''));
        $jr['jobCardNo'] = $jr['job_card_no'];
        $jr['technicianName'] = $jr['technician_name'];
        $jr['customer'] = ['name' => (string)($jr['customer_name'] ?? '')];
        $jr['machine'] = [
            'brand' => (string)($jr['machine_brand'] ?? ''),
            'model' => (string)($jr['machine_model'] ?? ''),
            'machineType' => (string)($jr['machine_type'] ?? ''),
            'label' => $machineLabel !== '' ? $machineLabel : (string)($jr['machine_model'] ?? 'Machine'),
        ];
        $jr['diagnosis'] = (string)($jr['diagnosis'] ?? '');
        $jr['workDone'] = (string)($jr['work_done'] ?? '');
        $jr['testResult'] = (string)($jr['test_result'] ?? '');
        $jr['completionNote'] = (string)($jr['completion_note'] ?? '');
        $jr['repeatIssue'] = !empty($jr['repeat_issue']);
        $jr['reportAt'] = $jr['report_at'];
        $jr['completedAt'] = $jr['completed_at'];
        $jr['startedAt'] = $jr['started_at'];
        $jr['sourceType'] = $jr['source_type'];
        $jr['sourceId'] = $jr['source_id'];
        unset($jr['job_card_no'],$jr['technician_name'],$jr['customer_name'],$jr['machine_brand'],$jr['machine_model'],$jr['machine_type'],$jr['work_done'],$jr['test_result'],$jr['completion_note'],$jr['repeat_issue'],$jr['report_at'],$jr['completed_at'],$jr['started_at'],$jr['source_type'],$jr['source_id']);
    }
    unset($jr);

    $totalsStmt = db()->query(
        "SELECT
            COUNT(*) FILTER (WHERE status='COMPLETED' AND hidden_at IS NULL) AS visible_completed,
            COUNT(*) FILTER (WHERE status='CANCELLED' AND hidden_at IS NULL) AS visible_cancelled,
            COUNT(*) FILTER (WHERE status='COMPLETED') AS all_completed,
            COUNT(*) FILTER (WHERE status='CANCELLED') AS all_cancelled
         FROM service_requests"
    );
    $totals = $totalsStmt->fetch() ?: [];

    json_out([
        'date' => $date,
        'timezone' => $reportTimezone,
        'summary' => [
            'jobReports' => count($jobReports),
            'completed' => $selectedCompleted,
            'cancelled' => $selectedCancelled,
            'visibleCompleted' => (int)($totals['visible_completed'] ?? 0),
            'visibleCancelled' => (int)($totals['visible_cancelled'] ?? 0),
            'allCompleted' => (int)($totals['all_completed'] ?? 0),
            'allCancelled' => (int)($totals['all_cancelled'] ?? 0),
        ],
        'jobReports' => $jobReports,
        'requests' => $requests,
    ]);
}

if ($method === 'GET' && $action === 'assignees') {
    $stmt = db()->query(
        "SELECT u.id, u.name, u.email, u.assigned_customer_id, c.name AS assigned_customer_name
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN customers c ON c.id = u.assigned_customer_id
         WHERE u.deleted_at IS NULL AND u.is_active = 1
           AND (r.name='Technician' OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles rr ON rr.id=ur.role_id WHERE ur.user_id=u.id AND rr.name='Technician' AND rr.deleted_at IS NULL))
           AND u.is_customer_managed = 0
         ORDER BY u.name ASC"
    );
    $technicians = $stmt->fetchAll();
    foreach ($technicians as &$technician) {
        $technician['assignedCustomerId'] = $technician['assigned_customer_id'];
        $technician['assignedCustomerName'] = $technician['assigned_customer_name'];
        unset($technician['assigned_customer_id'], $technician['assigned_customer_name']);
    }
    unset($technician);
    json_out($technicians);
}

// ---- Full audit trail for one request: Opened -> Assigned -> In Progress
// -> Completed/Cancelled by ..., merged with any notes on the same timeline.
if ($method === 'GET' && $action === 'history') {
    $requestId = trim((string)($_GET['requestId'] ?? ''));
    if ($requestId === '') json_error('requestId is required.');
    $stmt = db()->prepare('SELECT 1 FROM service_requests WHERE id = ?');
    $stmt->execute([$requestId]);
    if (!$stmt->fetch()) json_error('Job Card not found.', 404);

    $stmt = db()->prepare(
        "SELECT 'STATUS' AS kind, event_type, from_value, to_value, actor_name, note, created_at
         FROM service_request_history WHERE request_id = ?
         UNION ALL
         SELECT 'NOTE' AS kind, NULL, NULL, NULL, author, note, created_at
         FROM service_notes WHERE request_id = ?
         ORDER BY created_at ASC"
    );
    $stmt->execute([$requestId, $requestId]);
    $rows = $stmt->fetchAll();
    $timeline = array_map(function ($row) {
        return [
            'kind' => $row['kind'],
            'eventType' => $row['event_type'],
            'from' => $row['from_value'],
            'to' => $row['to_value'],
            'actorName' => $row['actor_name'],
            'note' => $row['note'],
            'createdAt' => $row['created_at'],
        ];
    }, $rows);
    json_out($timeline);
}

// V332 - downloadable Job Card History report. The PDF is generated
// from the same audit trail shown in the History dialog, so the screen and
// downloaded record cannot drift apart. Notes are merged into the same timeline.
if ($method === 'GET' && $action === 'history-pdf') {
    $requestId = trim((string)($_GET['requestId'] ?? ''));
    if ($requestId === '') json_error('requestId is required.');

    $stmt = db()->prepare(
        "SELECT sr.id,sr.status,sr.priority,sr.service_type,sr.description,sr.created_at,sr.updated_at,
                sr.completed_at,sr.cancelled_at,sr.hidden_at,
                c.name AS customer_name,m.brand AS machine_brand,m.model AS machine_model,
                m.serial_number,m.reg_number,u.name AS technician_name,
                jc.job_card_no,jc.status AS job_card_status
         FROM service_requests sr
         LEFT JOIN customers c ON c.id=sr.customer_id
         LEFT JOIN machines m ON m.id=sr.machine_id
         LEFT JOIN users u ON u.id=sr.assigned_to_id
         LEFT JOIN LATERAL (
             SELECT j.job_card_no,j.status
             FROM breakdown_cases bc
             JOIN digital_job_cards j ON j.case_id=bc.id
             WHERE bc.source_type='SERVICE_REQUEST' AND bc.source_id=sr.id
             ORDER BY j.created_at ASC LIMIT 1
         ) jc ON TRUE
         WHERE sr.id=?"
    );
    $stmt->execute([$requestId]);
    $request = $stmt->fetch();
    if (!$request) json_error('Job Card not found.', 404);

    $historyStmt = db()->prepare(
        "SELECT 'STATUS' AS kind, event_type, from_value, to_value, actor_name, note, created_at
         FROM service_request_history WHERE request_id = ?
         UNION ALL
         SELECT 'NOTE' AS kind, NULL, NULL, NULL, author, note, created_at
         FROM service_notes WHERE request_id = ?
         ORDER BY created_at ASC"
    );
    $historyStmt->execute([$requestId, $requestId]);
    $history = $historyStmt->fetchAll();

    $pdfText = static function ($value): string {
        $text = preg_replace('/\s+/u', ' ', trim((string)$value)) ?? trim((string)$value);
        if ($text === '') return '-';
        if (function_exists('iconv')) {
            $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
            if ($ascii !== false && $ascii !== '') $text = $ascii;
        }
        return str_replace(['|', "\r", "\n"], ['/', ' ', ' '], $text);
    };
    $dateTime = static function ($value): string {
        if (!$value) return '-';
        $ts = strtotime((string)$value);
        return $ts !== false ? date('d/m/Y H:i', $ts) : (string)$value;
    };

    $eventLabels = [
        'OPENED' => 'Opened',
        'STATUS' => 'Status changed',
        'ASSIGNMENT' => 'Assignment changed',
        'HIDDEN' => 'Visibility changed',
        'JOB_CARD_ACTIVATED' => 'Job Card activated',
    ];
    $rows = [];
    foreach ($history as $entry) {
        $kind = strtoupper((string)($entry['kind'] ?? 'STATUS'));
        if ($kind === 'NOTE') {
            $rows[] = [
                $dateTime($entry['created_at'] ?? null),
                'NOTE',
                $pdfText($entry['actor_name'] ?? 'BELM'),
                $pdfText($entry['note'] ?? ''),
            ];
            continue;
        }
        $eventType = strtoupper((string)($entry['event_type'] ?? 'STATUS'));
        $label = $eventLabels[$eventType] ?? str_replace('_', ' ', $eventType);
        $detail = '';
        if ($eventType === 'ASSIGNMENT') {
            $detail = !empty($entry['to_value'])
                ? 'Assigned to ' . (string)$entry['to_value']
                : 'Unassigned';
        } elseif ($eventType === 'OPENED') {
            $detail = 'Request opened';
        } elseif ($eventType === 'HIDDEN') {
            $detail = (string)($entry['note'] ?? 'Visibility updated');
        } elseif ($eventType === 'JOB_CARD_ACTIVATED') {
            $detail = (string)($entry['note'] ?? 'Job Card activated');
        } else {
            $detail = 'From ' . ((string)($entry['from_value'] ?? '') ?: '-')
                . ' to ' . ((string)($entry['to_value'] ?? '') ?: '-');
        }
        if ($eventType !== 'HIDDEN' && $eventType !== 'JOB_CARD_ACTIVATED' && !empty($entry['note'])) {
            $detail .= ' - ' . (string)$entry['note'];
        }
        $rows[] = [
            $dateTime($entry['created_at'] ?? null),
            $pdfText($label),
            $pdfText($entry['actor_name'] ?? 'BELM'),
            $pdfText($detail),
        ];
    }

    $machine = trim((string)($request['machine_brand'] ?? '') . ' ' . (string)($request['machine_model'] ?? '')) ?: 'General request';
    $jobCard = trim((string)($request['job_card_no'] ?? ''));
    $safeCompany = preg_replace('/[^A-Za-z0-9_-]+/', '-', $pdfText($request['customer_name'] ?? 'Customer')) ?: 'Customer';
    $safeId = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)$requestId) ?: 'request';
    output_table_pdf(
        'BELM-Service-Request-History-' . $safeCompany . '-' . $safeId . '.pdf',
        'JOB CARD HISTORY REPORT',
        [
            'Generated: ' . date('d/m/Y H:i'),
            'Company: ' . $pdfText($request['customer_name'] ?? 'Unknown customer'),
            'Machine: ' . $pdfText($machine),
            'Serial / Registration: ' . $pdfText($request['serial_number'] ?: ($request['reg_number'] ?: 'Not recorded')),
            'Job type: ' . $pdfText($request['service_type'] ?? 'Job Card'),
            'Priority: ' . $pdfText($request['priority'] ?? 'NORMAL'),
            'Current status: ' . $pdfText(str_replace('_', ' ', (string)($request['status'] ?? 'OPEN'))),
            'Assigned Technician: ' . $pdfText($request['technician_name'] ?? 'Unassigned'),
            'Job Card: ' . ($jobCard !== '' ? $pdfText($jobCard . ' / ' . ($request['job_card_status'] ?? 'RECEIVED')) : 'Not linked'),
            'Opened: ' . $dateTime($request['created_at'] ?? null),
            'Instructions: ' . $pdfText($request['description'] ?? ''),
            'Date / Time  |  Event  |  By  |  Details',
        ],
        $rows
    );
}

// ---- Customer inbox: Job Cards + operator reports for ONE customer -
if ($method === 'GET' && $action === 'customer-inbox') {
    $customerId = trim((string)($_GET['customerId'] ?? ''));
    if ($customerId === '') json_error('customerId is required.');

    $srStmt = db()->prepare(
        "SELECT sr.id, sr.status, sr.description, sr.service_type, sr.created_at,
                m.model AS machine_model
         FROM service_requests sr
         LEFT JOIN machines m ON m.id = sr.machine_id
         WHERE sr.customer_id = ? AND sr.status NOT IN ('COMPLETED','CANCELLED')
         ORDER BY sr.created_at DESC LIMIT 15"
    );
    $srStmt->execute([$customerId]);
    $serviceRequests = array_map(function ($row) {
        return [
            'type' => 'service-request',
            'id' => $row['id'],
            'title' => 'Job Card' . ($row['machine_model'] ? " — {$row['machine_model']}" : ''),
            'detail' => $row['description'] ?: ($row['service_type'] ?: ''),
            'status' => $row['status'],
            'createdAt' => $row['created_at'],
        ];
    }, $srStmt->fetchAll());

    $opStmt = db()->prepare(
        "SELECT opr.id, opr.status, opr.message, opr.operator_name, opr.created_at,
                m.model AS machine_model
         FROM operator_reports opr
         LEFT JOIN machines m ON m.id = opr.machine_id
         WHERE opr.customer_id = ? AND opr.status = 'OPEN' AND opr.notify_belm = 1
         ORDER BY opr.created_at DESC LIMIT 15"
    );
    $opStmt->execute([$customerId]);
    $operatorReports = array_map(function ($row) {
        return [
            'type' => 'operator-report',
            'id' => $row['id'],
            'title' => 'Operator Report' . ($row['machine_model'] ? " — {$row['machine_model']}" : ''),
            'detail' => "{$row['operator_name']}: {$row['message']}",
            'status' => $row['status'],
            'createdAt' => $row['created_at'],
        ];
    }, $opStmt->fetchAll());

    $combined = array_merge($serviceRequests, $operatorReports);
    usort($combined, fn($a, $b) => strcmp($b['createdAt'], $a['createdAt']));
    json_out($combined);
}

if ($method === 'GET' && !$action) {
    $status = $_GET['status'] ?? null;
    $onlyHidden = !empty($_GET['hidden']);
    $sql = 'SELECT sr.*, c.name AS customer_name, c.phone AS customer_phone, m.model AS machine_model,
                   m.machine_type, u.name AS assigned_to_name, u.assigned_customer_id AS assigned_home_customer_id,
                   hc.name AS assigned_home_customer_name,
                   cu.name AS completed_by_name, xu.name AS cancelled_by_name,
                   jc.id AS linked_job_card_id, jc.job_card_no AS linked_job_card_no,
                   jc.status AS linked_job_card_status, jc.received_at AS linked_job_card_received_at
            FROM service_requests sr
            LEFT JOIN customers c ON c.id = sr.customer_id
            LEFT JOIN machines m ON m.id = sr.machine_id
            LEFT JOIN users u ON u.id = sr.assigned_to_id
            LEFT JOIN customers hc ON hc.id = u.assigned_customer_id
            LEFT JOIN users cu ON cu.id = sr.completed_by_id
            LEFT JOIN users xu ON xu.id = sr.cancelled_by_id
            LEFT JOIN LATERAL (
                SELECT j.id,j.job_card_no,j.status,COALESCE(j.issued_at,j.created_at) AS received_at
                FROM breakdown_cases bc
                JOIN digital_job_cards j ON j.case_id=bc.id
                WHERE bc.source_type=\'SERVICE_REQUEST\' AND bc.source_id=sr.id
                ORDER BY j.created_at ASC LIMIT 1
            ) jc ON TRUE';
    if ($onlyHidden) {
        $stmt = db()->query("$sql WHERE sr.hidden_at IS NOT NULL ORDER BY sr.hidden_at DESC");
    } elseif ($status) {
        $stmt = db()->prepare("$sql WHERE sr.status = ? AND sr.hidden_at IS NULL ORDER BY sr.created_at DESC");
        $stmt->execute([$status]);
    } else {
        $stmt = db()->query("$sql WHERE sr.status <> 'PENDING_CUSTOMER' AND sr.hidden_at IS NULL ORDER BY sr.created_at DESC");
    }
    $requests = $stmt->fetchAll();
    foreach ($requests as &$r) {
        $r['customer'] = $r['customer_id']
            ? ['id' => $r['customer_id'], 'name' => $r['customer_name'], 'phone' => $r['customer_phone']]
            : null;
        $r['machine'] = $r['machine_id']
            ? [
                'id' => $r['machine_id'],
                'model' => $r['machine_model'],
                'machineType' => $r['machine_type'],
            ]
            : null;
        $r['assignedTo'] = $r['assigned_to_id']
            ? [
                'id' => $r['assigned_to_id'],
                'name' => $r['assigned_to_name'],
                'homeCustomerId' => $r['assigned_home_customer_id'] ?? null,
                'homeCustomerName' => $r['assigned_home_customer_name'] ?? null,
                'temporaryOverride' => !empty($r['customer_id']) && !empty($r['assigned_home_customer_id'])
                    && (string)$r['customer_id'] !== (string)$r['assigned_home_customer_id'],
              ]
            : null;
        $r['completedBy'] = $r['completed_by_id']
            ? ['id' => $r['completed_by_id'], 'name' => $r['completed_by_name']]
            : null;
        $r['completedAt'] = $r['completed_at'];
        $r['cancelledBy'] = $r['cancelled_by_id']
            ? ['id' => $r['cancelled_by_id'], 'name' => $r['cancelled_by_name']]
            : null;
        $r['cancelledAt'] = $r['cancelled_at'];
        $r['serviceType'] = $r['service_type'];
        $r['templateId'] = $r['template_id'];
        $r['createdAt'] = $r['created_at'];
        $r['updatedAt'] = $r['updated_at'];
        $r['hiddenAt'] = $r['hidden_at'];
        $r['serviceParts'] = fetch_request_parts($r['id']);
        $r['jobCard'] = !empty($r['linked_job_card_id']) ? [
            'id' => $r['linked_job_card_id'],
            'jobCardNo' => $r['linked_job_card_no'],
            'status' => $r['linked_job_card_status'],
            'receivedAt' => $r['linked_job_card_received_at'],
            'receivedByBelm' => true,
        ] : null;
        unset(
            $r['customer_name'],
            $r['customer_phone'],
            $r['machine_model'],
            $r['machine_type'],
            $r['assigned_to_name'],
            $r['assigned_home_customer_id'],
            $r['assigned_home_customer_name'],
            $r['completed_by_name'],
            $r['cancelled_by_name'],
            $r['linked_job_card_id'],
            $r['linked_job_card_no'],
            $r['linked_job_card_status'],
            $r['linked_job_card_received_at']
        );
        $stmt2 = db()->prepare('SELECT * FROM service_notes WHERE request_id = ? ORDER BY created_at ASC');
        $stmt2->execute([$r['id']]);
        $r['notes'] = $stmt2->fetchAll();
        foreach ($r['notes'] as &$note) {
            $note['createdAt'] = $note['created_at'];
        }
        unset($note);
    }
    json_out($requests);
}

if ($method === 'PUT' && $action === 'status') {
    $b = body();
    $status = strtoupper(trim((string)($b['status'] ?? '')));
    if (!in_array($status, $allowedStatuses, true)) json_error('Invalid Job Card status.');

    $stmt = db()->prepare('SELECT status,machine_id,assigned_to_id FROM service_requests WHERE id = ?');
    $stmt->execute([$id]);
    $existing = $stmt->fetch();
    if (!$existing) json_error('Job Card not found.', 404);
    $previousStatus = $existing['status'];
    if (in_array($previousStatus, ['COMPLETED','CANCELLED'], true) && $status !== $previousStatus) {
        json_error('A completed/cancelled Job Card cannot be reopened from this status control.', 409);
    }
    if ($status === 'OPEN' && !empty($existing['assigned_to_id'])) {
        json_error('Unassign the Technician first before returning this Job Card to OPEN.', 409);
    }
    if (in_array($status, ['ASSIGNED','IN_PROGRESS'], true) && empty($existing['assigned_to_id'])) {
        json_error('Assign a Technician before setting this Job Card to ' . str_replace('_', ' ', $status) . '.', 409);
    }
    if (!empty($existing['machine_id']) && in_array($status, ['OPEN','ASSIGNED','IN_PROGRESS'], true)) {
        $jobStateStmt = db()->prepare(
            "SELECT j.status,j.technician_id FROM digital_job_cards j
             JOIN breakdown_cases bc ON bc.id=j.case_id
             WHERE bc.source_type='SERVICE_REQUEST' AND bc.source_id=?
             ORDER BY j.created_at ASC LIMIT 1"
        );
        $jobStateStmt->execute([$id]);
        $jobState = $jobStateStmt->fetch();
        if ($jobState) {
            $jobStatus = strtoupper((string)($jobState['status'] ?? ''));
            if ($previousStatus !== $status && $status === 'OPEN' && !in_array($jobStatus, ['OPEN','RECEIVED'], true)) {
                json_error('The linked Job Card has already been assigned/started. Keep the Job Card in progress and manage the work from Job Card Dispatch.', 409);
            }
            if ($previousStatus !== $status && $status === 'ASSIGNED' && !in_array($jobStatus, ['OPEN','RECEIVED','ASSIGNED'], true)) {
                json_error('The linked Job Card has already started. Manage Technician handover from Job Card Dispatch.', 409);
            }
            if ($status === 'IN_PROGRESS' && empty($jobState['technician_id'])) {
                json_error('Assign the linked Job Card to a Technician before starting work.', 409);
            }
        }
    }
    if ($status === 'COMPLETED' && !empty($existing['machine_id'])) {
        // Official machine Job Cards are one operational record with
        // their Job Card. Ensure legacy requests receive a Job Card too, then
        // refuse completion until the technician has completed that card.
        belm_sync_breakdown_case_from_service_request((string)$id, (string)($user['name'] ?? 'BELM'));
        $jobCheck = db()->prepare(
            "SELECT j.status FROM digital_job_cards j
             JOIN breakdown_cases bc ON bc.id=j.case_id
             WHERE bc.source_type='SERVICE_REQUEST' AND bc.source_id=?
             ORDER BY j.created_at ASC LIMIT 1"
        );
        $jobCheck->execute([$id]);
        $jobStatus = strtoupper((string)($jobCheck->fetchColumn() ?: ''));
        if ($jobStatus !== 'COMPLETED') {
            json_error('The Technician Job Card must be approved and Completed before closing this Job Card.', 409);
        }
        // V307: Technician completion only advances the operational case to
        // TESTING. The Job Card must not be closed manually until the
        // Workshop has actually accepted the test and closed the synced case.
        $caseCheck = db()->prepare(
            "SELECT status,current_stage FROM breakdown_cases
             WHERE source_type='SERVICE_REQUEST' AND source_id=? LIMIT 1"
        );
        $caseCheck->execute([$id]);
        $caseState = $caseCheck->fetch();
        if (!$caseState
            || strtoupper((string)$caseState['status']) !== 'COMPLETED'
            || strtoupper((string)$caseState['current_stage']) !== 'COMPLETED') {
            json_error('Job Card approval / Maintenance Process closure is still pending. Approve the Job Card before closing this Job Card.', 409);
        }
    }

    if ($status === 'COMPLETED') {
        $stmt = db()->prepare(
            'UPDATE service_requests SET status=?, updated_at=NOW(), completed_by_id=?, completed_at=NOW() WHERE id=?'
        );
        $stmt->execute([$status, $user['id'], $id]);
    } elseif ($status === 'CANCELLED') {
        $stmt = db()->prepare(
            'UPDATE service_requests SET status=?, updated_at=NOW(), cancelled_by_id=?, cancelled_at=NOW() WHERE id=?'
        );
        $stmt->execute([$status, $user['id'], $id]);
    } elseif ($status === 'IN_PROGRESS') {
        $stmt = db()->prepare(
            'UPDATE service_requests SET status=?, updated_at=NOW(), started_by_id=?, started_at=NOW() WHERE id=?'
        );
        $stmt->execute([$status, $user['id'], $id]);
    } else {
        $stmt = db()->prepare('UPDATE service_requests SET status=?, updated_at=NOW() WHERE id=?');
        $stmt->execute([$status, $id]);
    }
    if ($stmt->rowCount() === 0) json_error('Job Card not found.', 404);
    if ($previousStatus !== $status) {
        log_service_request_history($id, 'STATUS', $previousStatus, $status, $user, trim((string)($b['note'] ?? '')) ?: null);
        notify_service_request_customer(
            (string)$id,
            'Job Card Update — ' . str_replace('_', ' ', $status),
            'BELM changed your Job Card status from ' . str_replace('_', ' ', $previousStatus) . ' to ' . str_replace('_', ' ', $status) . '.',
            $user
        );
    }
    belm_sync_breakdown_case_from_service_request((string)$id, (string)($user['name'] ?? 'BELM'));
    json_out(['ok' => true]);
}

if ($method === 'PUT' && $action === 'assign') {
    $b = body();
    $assignedToId = trim((string)($b['assignedToId'] ?? ''));
    $stmt = db()->prepare('SELECT customer_id, assigned_to_id, status FROM service_requests WHERE id = ?');
    $stmt->execute([$id]);
    $request = $stmt->fetch();
    if (!$request) json_error('Job Card not found.', 404);

    if (in_array((string)$request['status'], ['COMPLETED','CANCELLED'], true)) {
        json_error('A completed/cancelled Job Card cannot be assigned again.', 409);
    }

    $linkedJobStmt = db()->prepare(
        "SELECT j.status FROM digital_job_cards j
         JOIN breakdown_cases bc ON bc.id=j.case_id
         WHERE bc.source_type='SERVICE_REQUEST' AND bc.source_id=?
         ORDER BY j.created_at ASC LIMIT 1"
    );
    $linkedJobStmt->execute([$id]);
    $linkedJobStatus = strtoupper((string)($linkedJobStmt->fetchColumn() ?: ''));
    // RECEIVED/legacy OPEN cards have not started. A merely ASSIGNED card can
    // still be unassigned back to RECEIVED, but assigning a different Technician
    // after assignment must go through Job Card Dispatch so handover is audited.
    if ($assignedToId === '') {
        if ($linkedJobStatus !== '' && !in_array($linkedJobStatus, ['OPEN','RECEIVED','ASSIGNED'], true)) {
            json_error('This Job Card Job Card has already started. Use Job Card Dispatch/Workshop flow to change assignment.', 409);
        }
        if (!in_array((string)$request['status'], ['OPEN','ASSIGNED'], true)) {
            json_error('Only an Open/Assigned Job Card can be unassigned. Put active work back through the Job Card/Workshop flow.', 409);
        }
        db()->prepare(
            "UPDATE service_requests
             SET assigned_to_id=NULL,
                 status=CASE WHEN status='ASSIGNED' THEN 'OPEN' ELSE status END,
                 updated_at=NOW()
             WHERE id=?"
        )->execute([$id]);
        if ($request['assigned_to_id']) {
            log_service_request_history($id, 'ASSIGNMENT', $request['assigned_to_id'], null, $user);
        }
        belm_sync_breakdown_case_from_service_request((string)$id, (string)($user['name'] ?? 'BELM'));
        json_out(['ok' => true]);
    }

    if ($linkedJobStatus !== '' && !in_array($linkedJobStatus, ['OPEN','RECEIVED'], true)) {
        json_error('This Job Card Job Card is already assigned/started. Change Technician from Job Card Dispatch so the handover remains auditable.', 409);
    }

    $stmt = db()->prepare(
        "SELECT u.id, u.name, u.assigned_customer_id, hc.name AS home_customer_name
         FROM users u JOIN roles r ON r.id = u.role_id
         LEFT JOIN customers hc ON hc.id = u.assigned_customer_id
         WHERE u.id = ?
           AND u.deleted_at IS NULL AND u.is_active = 1
           AND (r.name='Technician' OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles rr ON rr.id=ur.role_id WHERE ur.user_id=u.id AND rr.name='Technician' AND rr.deleted_at IS NULL))
           AND u.is_customer_managed = 0"
    );
    $stmt->execute([$assignedToId]);
    $technician = $stmt->fetch();
    if (!$technician) json_error('Select an active Technician.', 422);
    $isTemporaryOverride = $request['customer_id']
        && !empty($technician['assigned_customer_id'])
        && (string)$technician['assigned_customer_id'] !== (string)$request['customer_id'];
    if ($isTemporaryOverride) {
        if (empty($b['temporaryOverride'])) {
            json_error('This Technician belongs to another customer. Confirm Temporary Override to assign this specific job.', 409);
        }
        if (!belm_can_override_technician_customer($user)) {
            json_error('Only BELM Super Admin or Workshop Manager can use a Temporary Technician Override.', 403);
        }
    }

    $nextRequestStatus = (string)$request['status'] === 'OPEN' ? 'ASSIGNED' : (string)$request['status'];
    db()->prepare(
        "UPDATE service_requests
         SET assigned_to_id=?, assigned_by_id=?, status=?, updated_at=NOW()
         WHERE id=?"
    )->execute([$assignedToId, $user['id'], $nextRequestStatus, $id]);
    $overrideNote = $isTemporaryOverride
        ? 'TEMPORARY OVERRIDE - Technician home customer: ' . ($technician['home_customer_name'] ?: 'Unassigned') . '. This override applies to this Job Card only.'
        : null;
    log_service_request_history($id, 'ASSIGNMENT', $request['assigned_to_id'], $technician['name'], $user, $overrideNote);
    if ((string)$request['status'] !== $nextRequestStatus) {
        log_service_request_history($id, 'STATUS', (string)$request['status'], $nextRequestStatus, $user);
    }
    notify_service_request_customer(
        (string)$id,
        'Technician Assigned — ' . $technician['name'],
        'BELM assigned Technician ' . $technician['name'] . ' to your Job Card.' . ($isTemporaryOverride ? ' This is a temporary job assignment.' : ''),
        $user
    );
    belm_sync_breakdown_case_from_service_request((string)$id, (string)($user['name'] ?? 'BELM'));
    json_out(['ok' => true]);
}

// V331 - one-click handoff from Job Cards to the operational Job Card.
// The customer request already IS the Job Card source: description = work instructions.
// OK/Activate verifies/repairs the linked Job Card and then removes the request from
// the active Job Cards inbox. The request remains intact in History/HIDDEN and
// the work continues in Engineering -> Job Cards.
if ($method === 'PUT' && $action === 'activate-job-card') {
    $stmt = db()->prepare(
        'SELECT id,customer_id,machine_id,status,assigned_to_id,description,service_type
         FROM service_requests WHERE id=?'
    );
    $stmt->execute([$id]);
    $request = $stmt->fetch();
    if (!$request) json_error('Job Card not found.', 404);
    if (empty($request['machine_id'])) {
        json_error('Select/link a machine before activating a Job Card.', 409);
    }
    if (in_array(strtoupper((string)$request['status']), ['COMPLETED','CANCELLED'], true)) {
        json_error('Completed or cancelled requests cannot be activated as a new Job Card.', 409);
    }
    if (empty($request['assigned_to_id'])) {
        json_error('Select an Assigned Technician first, then press OK to activate the Job Card.', 409);
    }

    try {
        $caseId = belm_sync_breakdown_case_from_service_request((string)$id, (string)($user['name'] ?? 'BELM'), true);
        if (!$caseId) json_error('Job Card activation could not create the maintenance case.', 500);

        $jobStmt = db()->prepare(
            "SELECT j.id,j.job_card_no,j.status,j.technician_id,j.technician_name,j.fault_description
             FROM digital_job_cards j
             JOIN breakdown_cases bc ON bc.id=j.case_id
             WHERE bc.source_type='SERVICE_REQUEST' AND bc.source_id=?
             ORDER BY j.created_at ASC LIMIT 1"
        );
        $jobStmt->execute([$id]);
        $job = $jobStmt->fetch();
        if (!$job) json_error('Job Card activation did not produce a Job Card. Try Sync / Refresh.', 500);

        // The request description is the Job Card instruction. The sync helper keeps
        // it current until work begins; explicitly repair legacy blank instructions too.
        if (trim((string)($job['fault_description'] ?? '')) === '') {
            db()->prepare(
                "UPDATE digital_job_cards SET fault_description=?,updated_at=NOW()
                 WHERE id=? AND status IN ('OPEN','RECEIVED','ASSIGNED')"
            )->execute([(string)($request['description'] ?? ''),(string)$job['id']]);
            $job['fault_description'] = (string)($request['description'] ?? '');
        }

        // Activation is the inbox handoff. Keep the source record for audit/customer
        // history, but hide it from the active BELM Job Card inbox so there is
        // only one operational work item: the Digital Job Card.
        db()->prepare(
            'UPDATE service_requests
             SET hidden_at=NOW(),hidden_by_id=?,updated_at=NOW()
             WHERE id=?'
        )->execute([$user['id'],$id]);
        log_service_request_history(
            (string)$id,
            'JOB_CARD_ACTIVATED',
            (string)$request['status'],
            (string)$job['status'],
            $user,
            'Activated '.$job['job_card_no'].' and handed work to TECHNICAL DEP Job Cards.'
        );
        // V338: make the Received process button auditable. The person who
        // confirms the Job Card -> Job Card handoff is recorded on the
        // same Breakdown Case timeline used by the Main Job Card Process UI.
        db()->prepare(
            'INSERT INTO breakdown_case_events(id,case_id,stage,department,action,note,actor_type,actor_id,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,NOW())'
        )->execute([
            uuid(),(string)$caseId,'TECHNICIAN_ASSIGNMENT','Workshop / Dispatch',
            'Job Card '.$job['job_card_no'].' received by BELM / activation confirmed',
            'Job Card handed to TECHNICAL DEP Job Cards.',
            'belm',$user['id']??null,$user['name']??'BELM'
        ]);

        json_out([
            'ok' => true,
            'hidden' => true,
            'jobCard' => [
                'id' => $job['id'],
                'jobCardNo' => $job['job_card_no'],
                'status' => $job['status'],
                'technicianId' => $job['technician_id'],
                'technicianName' => $job['technician_name'],
                'instructions' => $job['fault_description'],
            ],
        ]);
    } catch (Throwable $error) {
        if ($error instanceof RuntimeException) throw $error;
        error_log('Job Card Job Card activation failed: '.$error->getMessage());
        json_error('Could not activate the Job Card. Use Sync / Refresh and try again.', 500);
    }
}

// Hides a request from the main daily list without deleting it — it
// remains fully intact for the daily report and its History timeline.
// Only allowed once a request has reached a final state.
if ($method === 'PUT' && $action === 'hide') {
    $stmt = db()->prepare('SELECT status FROM service_requests WHERE id = ?');
    $stmt->execute([$id]);
    $existing = $stmt->fetch();
    if (!$existing) json_error('Job Card not found.', 404);
    if (!in_array($existing['status'], ['COMPLETED', 'CANCELLED'], true)) {
        json_error('Only Completed or Cancelled requests can be hidden.');
    }
    db()->prepare('UPDATE service_requests SET hidden_at = NOW(), hidden_by_id = ? WHERE id = ?')
        ->execute([$user['id'], $id]);
    log_service_request_history($id, 'HIDDEN', null, null, $user, 'Hidden from the daily list');
    json_out(['ok' => true]);
}

if ($method === 'PUT' && $action === 'unhide') {
    db()->prepare('UPDATE service_requests SET hidden_at = NULL, hidden_by_id = NULL WHERE id = ?')
        ->execute([$id]);
    log_service_request_history($id, 'HIDDEN', null, null, $user, 'Restored to the daily list');
    json_out(['ok' => true]);
}

if ($method === 'POST' && $action === 'notes') {
    $b = body();
    $note = trim((string)($b['note'] ?? ''));
    if ($note === '') json_error('Write a service note before saving.');
    $stmt = db()->prepare('SELECT 1 FROM service_requests WHERE id = ?');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) json_error('Job Card not found.', 404);
    db()->prepare('INSERT INTO service_notes (id, request_id, author, note, created_at) VALUES (?,?,?,?,NOW())')
        ->execute([uuid(), $id, $user['name'], $note]);
    json_out(['ok' => true], 201);
}

json_error('Unknown request', 404);
