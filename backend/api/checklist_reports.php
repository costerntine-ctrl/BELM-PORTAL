<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/checklist_reports_helpers.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

const SAFETY_RANK = ['GREEN' => 0, 'YELLOW' => 1, 'RED' => 2];

function require_report_machine_access(array $user, string $machineId, ?string $templateId = null): array {
    $sql = 'SELECT m.id, m.customer_id, m.machine_type, m.deleted_at,
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

// POST ?action=submit  { machineId, templateId, filledBy, hourMeterReading, answers[] }
if ($method === 'POST' && $action === 'submit') {
    $b = body();
    if (empty($b['machineId']) || empty($b['templateId'])) {
        json_error('Machine and checklist template are required.');
    }
    require_report_machine_access($user, $b['machineId'], $b['templateId']);
    if (!isset($b['hourMeterReading']) || $b['hourMeterReading'] === '') {
        json_error("Enter the machine's current hour meter reading before submitting.");
    }
    if (!is_numeric($b['hourMeterReading']) || (float)$b['hourMeterReading'] < 0) {
        json_error('Hour meter reading must be a valid positive number.');
    }

    $itemStmt = db()->prepare(
        'SELECT id, label, input_type, safety_level, options, option_safety, is_required
         FROM checklist_template_items WHERE template_id = ? ORDER BY "order" ASC'
    );
    $itemStmt->execute([$b['templateId']]);
    $templateItems = $itemStmt->fetchAll();
    $submittedById = [];
    foreach (($b['answers'] ?? []) as $answer) {
        $answerId = (string)($answer['templateItemId'] ?? '');
        if ($answerId !== '') $submittedById[$answerId] = $answer;
    }

    $worst = 'GREEN';
    $answers = [];
    foreach ($templateItems as $item) {
        $answer = $submittedById[$item['id']] ?? null;
        $value = $answer !== null ? trim((string)($answer['value'] ?? '')) : '';
        if (in_array(strtolower($value), ['undefined', 'null'], true)) $value = '';
        $photoUrl = $answer !== null ? trim((string)($answer['photoUrl'] ?? '')) : '';
        if ((bool)$item['is_required'] && $value === '' && $photoUrl === '') {
            json_error("Complete the required checklist item: {$item['label']}.");
        }
        if ($answer === null || ($value === '' && $photoUrl === '')) continue;

        $level = strtoupper((string)($item['safety_level'] ?: 'GREEN'));
        if (($item['input_type'] === 'DROPDOWN' || $item['input_type'] === 'YES_NO') && $item['option_safety']) {
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

    json_out(['id' => $reportId, 'overallStatus' => $worst], 201);
}

// GET ?action=for-machine&machineId=...
if ($method === 'GET' && $action === 'for-machine') {
    require_report_machine_access($user, $_GET['machineId']);
    $stmt = db()->prepare('SELECT * FROM checklist_reports WHERE machine_id = ? ORDER BY created_at DESC');
    $stmt->execute([$_GET['machineId']]);
    $reports = $stmt->fetchAll();
    foreach ($reports as &$r) {
        $stmt2 = db()->prepare('SELECT * FROM checklist_answers WHERE report_id = ?');
        $stmt2->execute([$r['id']]);
        $r['answers'] = $stmt2->fetchAll();
    }
    json_out($reports);
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
