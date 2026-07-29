<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/checklist_reports_helpers.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

const SAFETY_RANK = ['GREEN' => 0, 'YELLOW' => 1, 'RED' => 2];
const CHECKLIST_REPORT_TIMEZONE = 'Africa/Dar_es_Salaam';

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
                   c.deleted_at AS customer_deleted_at, c.is_active';
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
    $report['createdAt'] = $report['created_at'] ?? null;
    $report['expiresAt'] = $expiry->format(DateTimeInterface::ATOM);
    $report['isExpired'] = $isExpired;
    $report['canEdit'] = $isOriginalTechnician && !$isExpired;
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
            && !in_array($value, $allowedOptions, true)
        ) {
            json_error("Select a valid result for checklist item: {$item['label']}.");
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
        ];
    }

    return ['answers' => $answers, 'overallStatus' => $worst];
}

// POST ?action=submit  { machineId, templateId, filledBy, hourMeterReading, answers[] }
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

    $validated = validate_checklist_report_answers(
        $b['templateId'],
        is_array($b['answers'] ?? null) ? $b['answers'] : []
    );
    $answers = $validated['answers'];
    $worst = $validated['overallStatus'];

    $reportId = uuid();
    $filledBy = ($user['roleName'] ?? '') === 'Technician'
        ? $user['name']
        : ($b['filledBy'] ?? $user['name']);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO checklist_reports (id, machine_id, template_id, filled_by, hour_meter_reading, overall_status, created_at) VALUES (?,?,?,?,?,?,NOW())')
            ->execute([$reportId, $b['machineId'], $b['templateId'], $filledBy, (float)$b['hourMeterReading'], $worst]);

        $answerStmt = $pdo->prepare(
            'INSERT INTO checklist_answers
             (id, report_id, template_item_id, label, value, photo_url, safety_level)
             VALUES (?,?,?,?,?,?,?)'
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
            ]);
        }

        $pdo->prepare('UPDATE machines SET status=?, last_checked_at=NOW() WHERE id=?')
            ->execute([$worst, $b['machineId']]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
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
    json_out($savedReport, 201);
}

// GET ?action=for-machine&machineId=...
if ($method === 'GET' && $action === 'for-machine') {
    $machine = require_report_machine_access($user, $_GET['machineId']);
    $stmt = db()->prepare(
        'SELECT cr.*, ct.name AS template_name
         FROM checklist_reports cr
         LEFT JOIN checklist_templates ct ON ct.id = cr.template_id
         WHERE cr.machine_id = ?
         ORDER BY cr.created_at DESC'
    );
    $stmt->execute([$_GET['machineId']]);
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

// PUT ?action=update&id=...  { hourMeterReading, answers[] }
if ($method === 'PUT' && $action === 'update') {
    if (($user['roleName'] ?? '') !== 'Technician') {
        json_error('Only a BELM Technician can edit a saved checklist.', 403);
    }
    $reportId = trim((string)($_GET['id'] ?? ''));
    if ($reportId === '') json_error('Checklist report is required.');

    $stmt = db()->prepare(
        'SELECT id, machine_id, template_id, filled_by, created_at
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
    if (checklist_report_is_expired((string)$report['created_at'])) {
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
             SET hour_meter_reading = ?, overall_status = ?
             WHERE id = ?'
        )->execute([(float)$b['hourMeterReading'], $worst, $reportId]);
        $pdo->prepare('DELETE FROM checklist_answers WHERE report_id = ?')
            ->execute([$reportId]);

        $answerStmt = $pdo->prepare(
            'INSERT INTO checklist_answers
             (id, report_id, template_item_id, label, value, photo_url, safety_level)
             VALUES (?,?,?,?,?,?,?)'
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

    json_out([
        'id' => $reportId,
        'overallStatus' => $worst,
        'expiresAt' => $expiry->format(DateTimeInterface::ATOM),
        'canEdit' => true,
    ]);
}

// GET ?action=service-status&machineId=...
if ($method === 'GET' && $action === 'service-status') {
    require_report_machine_access($user, $_GET['machineId']);
    json_out(compute_service_status_helper($_GET['machineId']));
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

    json_out(['ok' => true]);
}

json_error('Unknown request', 404);
