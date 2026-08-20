<?php
require_once __DIR__ . '/../config/helpers.php';

// POST /api/operator?action=login          { machineId, name, pin }
// GET  /api/operator?action=me              (current operator + open shift)
// POST /api/operator?action=sign-in         { }  -> opens (or resumes) today's shift
// POST /api/operator?action=log-container   { }  -> +1 to the open shift's container count
// POST /api/operator?action=sign-out        { hasProblem, problemDescription }
// POST /api/operator?action=check-up         { engineOilLevel, gearboxOilLevel, coolantLevel, tires, brakes }
// POST /api/operator?action=report           { message }
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($action === 'login' && $method === 'POST') {
    $b = body();
    $machineId = trim((string)($b['machineId'] ?? ''));
    $name = trim((string)($b['name'] ?? ''));
    $pin = trim((string)($b['pin'] ?? ''));
    if ($machineId === '' || $name === '' || $pin === '') {
        json_error('Enter your name and PIN, and select your machine.');
    }

    assert_not_rate_limited('operator-login', "$machineId:$name", 8, 15);

    $stmt = db()->prepare(
        'SELECT o.id, o.name, o.contact, o.pin_hash, o.customer_id, m.id AS machine_id,
                m.brand, m.model, c.name AS customer_name, c.is_active AS customer_is_active
         FROM machine_operators o
         JOIN machines m ON m.id = o.machine_id
         JOIN customers c ON c.id = o.customer_id
         WHERE o.machine_id = ? AND LOWER(o.name) = LOWER(?) AND m.deleted_at IS NULL AND c.deleted_at IS NULL'
    );
    $stmt->execute([$machineId, $name]);
    $operator = $stmt->fetch();
    if (!$operator || !$operator['pin_hash'] || !password_verify($pin, $operator['pin_hash'])) {
        record_failed_attempt('operator-login', "$machineId:$name");
        json_error('Name or PIN is incorrect. Ask your Machine Admin to check your roster PIN.', 401);
    }
    // The customer's portal service being stopped (e.g. non-payment)
    // must also block their Operators from signing in — otherwise
    // "Stop portal service" wouldn't actually stop anyone from using it.
    if (!$operator['customer_is_active']) {
        record_failed_attempt('operator-login', "$machineId:$name");
        json_error('This machine is not currently active on the portal. Contact your Machine Admin.', 403);
    }
    clear_rate_limit('operator-login', "$machineId:$name");

    $token = jwt_encode([
        'type' => 'operator',
        'id' => $operator['id'],
        'name' => $operator['name'],
        'machineId' => $operator['machine_id'],
        'customerId' => $operator['customer_id'],
    ], 30 * 24 * 3600);

    json_out([
        'token' => $token,
        'operator' => [
            'id' => $operator['id'],
            'name' => $operator['name'],
            'machineName' => trim(($operator['brand'] ?? '') . ' ' . ($operator['model'] ?? '')),
            'customerName' => $operator['customer_name'],
        ],
    ]);
}

// Everything below requires a logged-in operator.
$payload = current_token_payload();
if (!$payload || ($payload['type'] ?? '') !== 'operator') json_error('Not authenticated', 401);
$operatorId = $payload['id'];
$machineId = $payload['machineId'];

function operator_open_shift(string $operatorId): ?array {
    $stmt = db()->prepare(
        "SELECT * FROM machine_operator_shifts
         WHERE operator_id = ? AND status = 'OPEN'
         ORDER BY signed_in_at DESC LIMIT 1"
    );
    $stmt->execute([$operatorId]);
    $shift = $stmt->fetch();
    return $shift ?: null;
}

// V398: the Operator lands on the same machine-card information surface used
// by the Technician. This endpoint is intentionally read-only: button/action
// permissions will be connected separately without granting Technician rights.
if ($action === 'dashboard' && $method === 'GET') {
    $stmt = db()->prepare(
        'SELECT m.*, c.name AS customer_name
         FROM machines m
         JOIN customers c ON c.id = m.customer_id
         WHERE m.id = ? AND m.customer_id = ? AND m.deleted_at IS NULL AND c.deleted_at IS NULL'
    );
    $stmt->execute([$machineId, $payload['customerId']]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine is no longer available for this Operator.', 404);

    $reasonStmt = db()->prepare(
        "SELECT ca.label, ca.value, ca.safety_level
         FROM checklist_answers ca
         JOIN checklist_reports cr ON cr.id = ca.report_id
         WHERE cr.id = (
           SELECT id FROM checklist_reports
           WHERE machine_id = ?
           ORDER BY created_at DESC, id DESC LIMIT 1
         ) AND ca.safety_level IN ('YELLOW','RED')
         ORDER BY CASE ca.safety_level WHEN 'RED' THEN 0 ELSE 1 END, ca.label ASC"
    );
    $reasonStmt->execute([$machineId]);
    $alertReasons = [];
    foreach ($reasonStmt->fetchAll() as $flag) {
        $label = trim((string)($flag['label'] ?? ''));
        $value = trim((string)($flag['value'] ?? ''));
        if ($label !== '') $alertReasons[] = $label . ($value !== '' ? ': ' . $value : '');
    }

    $operatorStmt = db()->prepare(
        "SELECT id, operator_name, message, status, created_at
         FROM operator_reports WHERE machine_id = ?
         ORDER BY CASE WHEN status = 'OPEN' THEN 0 ELSE 1 END, created_at DESC, id DESC LIMIT 1"
    );
    $operatorStmt->execute([$machineId]);
    $latestOperator = $operatorStmt->fetch() ?: null;

    $checkStmt = db()->prepare(
        'SELECT id, filled_by, overall_status, hour_meter_reading, created_at
         FROM checklist_reports WHERE machine_id = ?
         ORDER BY created_at DESC, id DESC LIMIT 1'
    );
    $checkStmt->execute([$machineId]);
    $latestCheck = $checkStmt->fetch() ?: null;

    $serviceStatus = null;
    try {
        require_once __DIR__ . '/checklist_reports_helpers.php';
        $serviceStatus = compute_service_status_helper((string)$machineId);
    } catch (Throwable $ignored) {}

    json_out([
        'operator' => [
            'id' => (string)$operatorId,
            'name' => (string)($payload['name'] ?? 'Operator'),
        ],
        'customerName' => (string)($machine['customer_name'] ?? ''),
        'machine' => [
            'id' => (string)$machine['id'],
            'brand' => (string)($machine['brand'] ?? ''),
            'model' => (string)($machine['model'] ?? ''),
            'machineType' => (string)($machine['machine_type'] ?? ''),
            'serialNumber' => (string)($machine['serial_number'] ?? ''),
            'regNumber' => (string)($machine['reg_number'] ?? ''),
            'fleetNumber' => (string)($machine['fleet_number'] ?? ''),
            'status' => strtoupper((string)($machine['status'] ?? 'UNKNOWN')),
            'lastCheckedAt' => $machine['last_checked_at'] ?? null,
            'serviceKit' => (string)($machine['service_kit'] ?? 'OK'),
            'operationalStatus' => strtoupper((string)($machine['operational_status'] ?? 'NORMAL')),
            'alertReasons' => $alertReasons,
            'latestOperatorMessage' => $latestOperator ? [
                'id' => (string)$latestOperator['id'],
                'operatorName' => (string)$latestOperator['operator_name'],
                'message' => (string)$latestOperator['message'],
                'status' => (string)$latestOperator['status'],
                'createdAt' => (string)$latestOperator['created_at'],
            ] : null,
            'latestChecklist' => $latestCheck ? [
                'id' => (string)$latestCheck['id'],
                'filledBy' => (string)$latestCheck['filled_by'],
                'overallStatus' => (string)$latestCheck['overall_status'],
                'hourMeterReading' => (float)$latestCheck['hour_meter_reading'],
                'createdAt' => (string)$latestCheck['created_at'],
            ] : null,
            'serviceStatus' => $serviceStatus,
        ],
    ]);
}

if ($action === 'me' && $method === 'GET') {
    $shift = operator_open_shift($operatorId);
    json_out([
        'operator' => ['id' => $operatorId, 'name' => $payload['name'] ?? ''],
        'openShift' => $shift ? [
            'id' => $shift['id'],
            'signedInAt' => $shift['signed_in_at'],
            'containerCount' => (int)$shift['container_count'],
        ] : null,
    ]);
}

if ($action === 'sign-in' && $method === 'POST') {
    $existing = operator_open_shift($operatorId);
    if ($existing) {
        json_out(['id' => $existing['id'], 'containerCount' => (int)$existing['container_count'], 'resumed' => true]);
    }
    $shiftId = uuid();
    db()->prepare(
        "INSERT INTO machine_operator_shifts
         (id, operator_id, machine_id, customer_id, signed_in_at, container_count, status)
         VALUES (?,?,?,?,NOW(),0,'OPEN')"
    )->execute([$shiftId, $operatorId, $machineId, $payload['customerId']]);
    json_out(['id' => $shiftId, 'containerCount' => 0, 'resumed' => false], 201);
}

if ($action === 'log-container' && $method === 'POST') {
    $shift = operator_open_shift($operatorId);
    if (!$shift) json_error('Sign in first before logging a container.', 422);
    db()->prepare("UPDATE machine_operator_shifts SET container_count = container_count + 1 WHERE id = ?")
        ->execute([$shift['id']]);
    $stmt = db()->prepare('SELECT container_count FROM machine_operator_shifts WHERE id = ?');
    $stmt->execute([$shift['id']]);
    json_out(['containerCount' => (int)$stmt->fetchColumn()]);
}

if ($action === 'check-up' && $method === 'POST') {
    $shift = operator_open_shift($operatorId);
    if (!$shift) json_error('Sign in first before completing Operator Check Up.', 422);

    $b = body();
    $fields = [
        'engineOilLevel' => ['label' => 'Engine Oil Level', 'allowed' => ['OK','LOW','CONTAMINATED']],
        'gearboxOilLevel' => ['label' => 'Gearbox Oil Level', 'allowed' => ['OK','LOW','CONTAMINATED']],
        'coolantLevel' => ['label' => 'Coolant Level', 'allowed' => ['OK','LOW']],
        'tires' => ['label' => 'Tires', 'allowed' => ['OK','WORN','DAMAGED']],
        'brakes' => ['label' => 'Brakes', 'allowed' => ['OK','NEEDS_ATTENTION','CRITICAL']],
    ];
    $values = [];
    foreach ($fields as $key => $meta) {
        $value = strtoupper(trim((string)($b[$key] ?? '')));
        if (!in_array($value, $meta['allowed'], true)) {
            json_error($meta['label'] . ' selection is invalid.');
        }
        $values[$key] = $value;
    }
    $abnormal = $values['engineOilLevel'] !== 'OK'
        || $values['gearboxOilLevel'] !== 'OK'
        || $values['coolantLevel'] !== 'OK'
        || $values['tires'] !== 'OK'
        || $values['brakes'] !== 'OK';
    $status = $abnormal ? 'OPEN' : 'CHECKED';
    $operatorName = (string)($payload['name'] ?? 'Operator');
    $reportId = uuid();
    $lines = [
        'OPERATOR CHECK UP',
        'Engine Oil Level: ' . str_replace('_', ' ', $values['engineOilLevel']),
        'Gearbox Oil Level: ' . str_replace('_', ' ', $values['gearboxOilLevel']),
        'Coolant Level: ' . str_replace('_', ' ', $values['coolantLevel']),
        'Tires: ' . str_replace('_', ' ', $values['tires']),
        'Brakes: ' . str_replace('_', ' ', $values['brakes']),
    ];
    $reportMessage = implode("
", $lines);

    db()->prepare(
        "INSERT INTO operator_reports
         (id, machine_id, customer_id, operator_id, operator_name, operator_contact, message, status, notify_belm, created_at)
         VALUES (?,?,?,?,?,?,?, ?,1,NOW())"
    )->execute([
        $reportId, $machineId, $payload['customerId'], $operatorId, $operatorName, null, $reportMessage, $status,
    ]);

    $whatsappDelivery = null;
    if ($abnormal) {
        belm_ensure_breakdown_case_from_operator_report($reportId, $operatorName);
        try {
            $machineStmt = db()->prepare(
                'SELECT c.name AS customer_name, m.brand, m.model, m.machine_type, m.serial_number, m.reg_number
                 FROM machines m JOIN customers c ON c.id = m.customer_id
                 WHERE m.id = ? AND c.id = ?'
            );
            $machineStmt->execute([$machineId, $payload['customerId']]);
            $ctx = $machineStmt->fetch() ?: [];
            $machineLabel = trim(($ctx['brand'] ?? '') . ' ' . ($ctx['model'] ?? '')) ?: ($ctx['machine_type'] ?? 'Machine');
            $serial = $ctx['serial_number'] ?: ($ctx['reg_number'] ?: 'Not recorded');
            $subject = 'OPERATOR CHECK UP ALERT - ' . $machineLabel;
            $bodyText = "OPERATOR CHECK UP REQUIRES ATTENTION

"
                . 'Customer: ' . ($ctx['customer_name'] ?? 'Customer') . "
"
                . "Operator: $operatorName
"
                . "Machine: $machineLabel
"
                . "Serial / Reg: $serial

"
                . $reportMessage;
            $whatsappDelivery = belm_send_operator_message_whatsapp_group(
                (string)$payload['customerId'], $subject, $bodyText
            );
        } catch (Throwable $ignored) {
            $whatsappDelivery = ['sent' => 0, 'failed' => 0, 'pending' => 0, 'skipped' => 0, 'recipients' => []];
        }
    }

    json_out([
        'id' => $reportId,
        'status' => $status,
        'message' => $reportMessage,
        'whatsappDelivery' => $whatsappDelivery,
    ], 201);
}

if ($action === 'report' && $method === 'POST') {
    $shift = operator_open_shift($operatorId);
    if (!$shift) json_error('Sign in first before sending an Operator Report.', 422);
    $b = body();
    $message = trim((string)($b['message'] ?? ''));
    if ($message === '') json_error('Write the Operator Report message first.');
    if (mb_strlen($message) > 1000) json_error('Operator Report message is too long.');

    $reportId = uuid();
    $operatorName = (string)($payload['name'] ?? 'Operator');
    db()->prepare(
        "INSERT INTO operator_reports
         (id, machine_id, customer_id, operator_id, operator_name, operator_contact, message, status, notify_belm, created_at)
         VALUES (?,?,?,?,?,?,?,'OPEN',1,NOW())"
    )->execute([$reportId, $machineId, $payload['customerId'], $operatorId, $operatorName, null, $message]);

    belm_ensure_breakdown_case_from_operator_report($reportId, $operatorName);
    $whatsappDelivery = null;
    try {
        $machineStmt = db()->prepare(
            'SELECT c.name AS customer_name, m.brand, m.model, m.machine_type, m.serial_number, m.reg_number
             FROM machines m JOIN customers c ON c.id = m.customer_id
             WHERE m.id = ? AND c.id = ?'
        );
        $machineStmt->execute([$machineId, $payload['customerId']]);
        $ctx = $machineStmt->fetch() ?: [];
        $machineLabel = trim(($ctx['brand'] ?? '') . ' ' . ($ctx['model'] ?? '')) ?: ($ctx['machine_type'] ?? 'Machine');
        $serial = $ctx['serial_number'] ?: ($ctx['reg_number'] ?: 'Not recorded');
        $subject = 'OPERATOR REPORT - ' . $machineLabel;
        $bodyText = "OPERATOR MESSAGE\n\n"
            . 'Customer: ' . ($ctx['customer_name'] ?? 'Customer') . "\n"
            . "Operator: $operatorName\n"
            . "Machine: $machineLabel\n"
            . "Serial / Reg: $serial\n"
            . "Message: $message";
        $whatsappDelivery = belm_send_operator_message_whatsapp_group(
            (string)$payload['customerId'], $subject, $bodyText
        );
    } catch (Throwable $ignored) {
        $whatsappDelivery = ['sent' => 0, 'failed' => 0, 'pending' => 0, 'skipped' => 0, 'recipients' => []];
    }

    json_out([
        'id' => $reportId,
        'status' => 'OPEN',
        'message' => $message,
        'whatsappDelivery' => $whatsappDelivery,
    ], 201);
}

if ($action === 'sign-out' && $method === 'POST') {
    $shift = operator_open_shift($operatorId);
    if (!$shift) json_error('No open shift to sign out of.', 422);
    $b = body();
    $hasProblem = !empty($b['hasProblem']);
    $problemDescription = trim((string)($b['problemDescription'] ?? ''));
    if ($hasProblem && $problemDescription === '') {
        json_error('Describe the challenge before signing out.');
    }
    db()->prepare(
        "UPDATE machine_operator_shifts
         SET signed_out_at = NOW(), has_problem = ?, problem_description = ?, status = 'CLOSED'
         WHERE id = ?"
    )->execute([$hasProblem ? 1 : 0, $hasProblem ? $problemDescription : null, $shift['id']]);

    // A reported challenge also becomes a normal Operator Report, so it
    // shows up everywhere the customer/BELM team already reviews problems.
    // The report now follows the same Service Provider switch and role-aware
    // alert rules as reports created from the Customer Portal.
    $whatsappDelivery = null;
    if ($hasProblem) {
        $contextStmt = db()->prepare(
            'SELECT c.name AS customer_name, c.email AS customer_email, c.is_machinery_admin,
                    m.brand, m.model, m.machine_type, m.serial_number, m.reg_number
             FROM customers c JOIN machines m ON m.customer_id = c.id
             WHERE c.id = ? AND m.id = ? AND c.deleted_at IS NULL AND m.deleted_at IS NULL'
        );
        $contextStmt->execute([$payload['customerId'], $machineId]);
        $context = $contextStmt->fetch() ?: [];
        $selfServiceMode = !empty($context['is_machinery_admin']);
        $notifyBelm = !$selfServiceMode;
        $reportId = uuid();
        $operatorName = (string)($payload['name'] ?? 'Operator');
        $reportMessage = "End-of-shift report: $problemDescription (Containers handled: {$shift['container_count']})";
        db()->prepare(
            "INSERT INTO operator_reports
             (id, machine_id, customer_id, operator_id, operator_name, operator_contact, message, status, notify_belm, created_at)
             VALUES (?,?,?,?,?,?,?,'OPEN',?,NOW())"
        )->execute([
            $reportId, $machineId, $payload['customerId'], $operatorId, $operatorName,
            null, $reportMessage, $notifyBelm ? 1 : 0,
        ]);

        belm_ensure_breakdown_case_from_operator_report($reportId, $operatorName);

        $machineLabel = trim(($context['brand'] ?? '') . ' ' . ($context['model'] ?? '')) ?: ($context['machine_type'] ?? 'Machine');
        $serial = $context['serial_number'] ?: ($context['reg_number'] ?: 'Not recorded');
        $subject = "OPERATOR PROBLEM REPORT - $machineLabel";
        $bodyText = "OPERATOR PROBLEM REPORTED

"
            . "Customer: " . ($context['customer_name'] ?? 'Customer') . "
"
            . "Operator: $operatorName
"
            . "Machine: $machineLabel
"
            . "Serial / Reg: $serial
"
            . "Containers handled: {$shift['container_count']}
"
            . "Problem: $problemDescription

"
            . "Open the Customer Portal > Operator Reports to review and act.";
        try {
            customer_send_team_alert((string)$payload['customerId'], ['operator-reports', 'report-problem'], $subject, $bodyText, true);
        } catch (Throwable $ignored) {}

        // V397: an Operator problem is a team-wide operational message. Send
        // it by WhatsApp to every active Customer user and BELM user with a
        // valid phone number. The transport remains truthful: if no provider
        // is configured, each recipient is logged PENDING_PROVIDER.
        try {
            $whatsappDelivery = belm_send_operator_message_whatsapp_group(
                (string)$payload['customerId'],
                $subject,
                $bodyText
            );
        } catch (Throwable $ignored) {
            $whatsappDelivery = ['sent' => 0, 'failed' => 0, 'pending' => 0, 'skipped' => 0, 'recipients' => []];
        }

        if ($notifyBelm) {
            belm_log_customer_communication(
                (string)$payload['customerId'], $machineId, 'CUSTOMER_TO_BELM', 'EMAIL',
                'BELM Technical Support - Operator Problem Report', $reportMessage,
                'OPERATOR_REPORT', $reportId, $operatorName, 'SENT'
            );
            try {
                belm_send_customer_to_belm_alert(
                    ['service-requests'],
                    'OFFICIAL OPERATOR REPORT - ' . ($context['customer_name'] ?? 'Customer') . ' - ' . $machineLabel,
                    $bodyText . "

BELM Service Provider is active for this customer.",
                    $context['customer_email'] ?? null
                );
            } catch (Throwable $ignored) {}
        }
    }
    json_out(['ok' => true, 'containerCount' => (int)$shift['container_count'], 'whatsappDelivery' => $whatsappDelivery]);
}

json_error('Unknown request', 404);
