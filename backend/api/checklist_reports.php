<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/checklist_reports_helpers.php';
require_once __DIR__ . '/service_due_helper.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

const SAFETY_RANK = ['NONE' => -1, 'GREEN' => 0, 'YELLOW' => 1, 'RED' => 2];
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
    $filledBy = ($user['roleName'] ?? '') === 'Technician'
        ? $user['name']
        : ($b['filledBy'] ?? $user['name']);
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

    // Role-aware customer alert after EVERY technician check-up. The customer
    // owner and users who have Check Up dashboard access receive the report
    // summary. This keeps Workshop Manager / delegated users in sync without
    // emailing unrelated roles such as Procurement or Accounts.
    try {
        $machineName = trim(($machine['brand'] ?? '') . ' ' . ($machine['model'] ?? '')) ?: ($machine['machine_type'] ?? 'Machine');
        $serial = $machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded');
        $statusLabel = strtoupper((string)$worst);
        $subject = "CHECK UP REPORT - $machineName - $statusLabel";
        $bodyText = "TECHNICIAN CHECK UP SUBMITTED

"
            . "Customer: " . ($machine['customer_name'] ?? 'Customer') . "
"
            . "Machine: $machineName
"
            . "Serial / Reg: $serial
"
            . "Filled by: $filledBy
"
            . "Hour meter: " . $b['hourMeterReading'] . "
"
            . "Overall status: $statusLabel
"
            . ($isServiceDay ? "Service recorded: " . ($serviceIntervals[$serviceType]['label'] ?? $serviceType) . " on $serviceDate
" : '')
            . "
Open the Customer Portal > Check Up to view the full report/PDF.";
        customer_send_team_alert((string)$machine['customer_id'], ['check-up'], $subject, $bodyText, true);
    } catch (Throwable $error) { /* alerts are best-effort */ }

    // Urgent RED/YELLOW/service-due alert. BELM receives it only when BELM is
    // the active Service Provider OR the report was submitted by a BELM-owned
    // Technician. A customer's own independent Technician report stays inside
    // the customer's business unless BELM support was explicitly requested.
    try {
        $customerEmailStmt = db()->prepare('SELECT email FROM customers WHERE id = ?');
        $customerEmailStmt->execute([$machine['customer_id']]);
        $customerEmail = trim((string)($customerEmailStmt->fetchColumn() ?: ''));
        $notifyBelm = empty($machine['is_machinery_admin']) || empty($user['isCustomerManaged']);
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

    // Best-effort safety/service alert email for this same-day correction —
    // same three triggers as a fresh submission.
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

// GET ?action=operator-reports&machineId=... — same "who reported what,
// resolved or not" list the Customer already sees, now also reachable by
// Technician/Engineer/Admin for a specific machine they have access to.
if ($method === 'GET' && $action === 'operator-reports') {
    require_report_machine_access($user, $_GET['machineId']);
    $stmt = db()->prepare(
        'SELECT id, operator_name, operator_contact, message, status, created_at, resolved_at
         FROM operator_reports WHERE machine_id = ? ORDER BY created_at DESC'
    );
    $stmt->execute([$_GET['machineId']]);
    json_out($stmt->fetchAll());
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
