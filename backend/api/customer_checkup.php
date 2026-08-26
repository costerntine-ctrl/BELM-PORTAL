<?php
require_once __DIR__ . '/../config/helpers.php';

$customer = require_customer_auth();
$method = $_SERVER['REQUEST_METHOD'];

function checkup_json_array($value): array {
    if (is_array($value)) return $value;
    if ($value === null || $value === '') return [];
    $decoded = json_decode((string)$value, true);
    return is_array($decoded) ? $decoded : [];
}

function checkup_require_access(array $customer): void {
    if (($customer['actorType'] ?? '') === 'owner') return;
    $permissions = $customer['permissions'] ?? null;
    if ($permissions === null) return;
    if (!is_array($permissions) || !in_array('check-up', $permissions, true)) {
        json_error('Your role does not include Check Up.', 403);
    }
}

function checkup_machine(string $customerId, string $machineId): array {
    $stmt = db()->prepare('SELECT id,customer_id,machine_type,brand,model,serial_number,reg_number,fleet_number,status,last_checked_at FROM machines WHERE id=? AND customer_id=? AND deleted_at IS NULL LIMIT 1');
    $stmt->execute([$machineId, $customerId]);
    $row = $stmt->fetch();
    if (!$row) json_error('Machine not found.', 404);
    return $row;
}

function checkup_normalized_machine_key(?string $value): string {
    $value = strtolower(trim((string)$value));
    if ($value === '') return '';
    return preg_replace('/[^a-z0-9]+/', '', $value) ?: '';
}

function checkup_templates_for_machine(array $machine): array {
    // BELM Checklist Templates are global master templates. They are never copied
    // into customer-owned template rows. A machine reads the current ACTIVE master
    // template for future Check Ups only. Existing checklist_reports/checklist_answers
    // are historical snapshots and are never changed by this sync.
    $machineTypeKey = checkup_normalized_machine_key((string)($machine['machine_type'] ?? ''));
    $modelKey = checkup_normalized_machine_key((string)($machine['model'] ?? ''));

    $stmt = db()->query(
        "SELECT ct.id,ct.name,ct.machine_type,ct.service_type
         FROM checklist_templates ct
         WHERE ct.deleted_at IS NULL AND ct.is_active=1
         ORDER BY ct.created_at DESC"
    );
    $candidates = $stmt->fetchAll();
    $templates = [];
    foreach ($candidates as $candidate) {
        $templateKey = checkup_normalized_machine_key((string)($candidate['machine_type'] ?? ''));
        if ($templateKey === '') continue;
        if ($templateKey !== $machineTypeKey && $templateKey !== $modelKey) continue;
        $templates[] = $candidate;
    }

    foreach ($templates as &$template) {
        $itemStmt = db()->prepare('SELECT id,label,input_type,safety_level,options,option_safety,"order",is_required FROM checklist_template_items WHERE template_id=? ORDER BY "order" ASC,id ASC');
        $itemStmt->execute([$template['id']]);
        $items = $itemStmt->fetchAll();
        foreach ($items as &$item) {
            $item['options'] = checkup_json_array($item['options'] ?? null);
            $item['optionSafety'] = checkup_json_array($item['option_safety'] ?? null);
            $item['isRequired'] = !empty($item['is_required']);
        }
        unset($item);
        $template['items'] = $items;
        $template['syncMode'] = 'BELM_MASTER_LIVE';
    }
    unset($template);
    return $templates;
}

checkup_require_access($customer);
$customerId = (string)$customer['id'];

if ($method === 'GET') {
    $machineId = trim((string)($_GET['machine'] ?? ''));
    if ($machineId === '') json_error('Machine is required.');
    $machine = checkup_machine($customerId, $machineId);
    $templates = checkup_templates_for_machine($machine);
    $latestStmt = db()->prepare('SELECT hour_meter_reading,created_at FROM checklist_reports WHERE machine_id=? ORDER BY created_at DESC LIMIT 1');
    $latestStmt->execute([$machineId]);
    $latest = $latestStmt->fetch() ?: null;
    $todayStmt = db()->prepare("SELECT id,overall_status,hour_meter_reading,filled_by,created_at FROM checklist_reports WHERE machine_id=? AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Africa/Dar_es_Salaam') AT TIME ZONE 'Africa/Dar_es_Salaam' ORDER BY created_at DESC LIMIT 1");
    $todayStmt->execute([$machineId]);
    json_out([
        'machine' => [
            'id' => $machine['id'], 'machineType' => $machine['machine_type'], 'brand' => $machine['brand'],
            'model' => $machine['model'], 'serialNumber' => $machine['serial_number'], 'regNumber' => $machine['reg_number'],
            'fleetNumber' => $machine['fleet_number'], 'status' => $machine['status'], 'lastCheckedAt' => $machine['last_checked_at'],
        ],
        'templates' => $templates,
        'sync' => [
            'mode' => 'BELM_MASTER_LIVE',
            'historicalReportsPreserved' => true,
            'message' => 'Current active BELM master template is used for new Check Ups only. Existing reports are never modified or deleted by template sync.',
        ],
        'latestHourMeter' => $latest ? (float)$latest['hour_meter_reading'] : 0,
        'todayReport' => $todayStmt->fetch() ?: null,
    ]);
}

if ($method !== 'POST') json_error('Method not allowed.', 405);
$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) json_error('Invalid request body.');
$machineId = trim((string)($body['machineId'] ?? ''));
$templateId = trim((string)($body['templateId'] ?? ''));
$hours = $body['hourMeterReading'] ?? null;
$answers = $body['answers'] ?? [];
if ($machineId === '' || $templateId === '') json_error('Machine and Checklist Template are required.');
if (!is_numeric($hours) || (float)$hours < 0) json_error('Enter a valid hour meter reading.');
if (!is_array($answers)) json_error('Checklist answers are required.');
$machine = checkup_machine($customerId, $machineId);
$templates = checkup_templates_for_machine($machine);
$template = null;
foreach ($templates as $candidate) if ((string)$candidate['id'] === $templateId) { $template = $candidate; break; }
if (!$template) json_error('Checklist Template is not active for this machine.', 400);

$answerMap = [];
foreach ($answers as $answer) {
    if (!is_array($answer)) continue;
    $id = trim((string)($answer['itemId'] ?? ''));
    if ($id !== '') $answerMap[$id] = $answer;
}
$rank = ['NONE'=>-1,'GREEN'=>0,'YELLOW'=>1,'RED'=>2];
$overall = 'GREEN';
$normalized = [];
foreach ($template['items'] as $item) {
    $id = (string)$item['id'];
    $answer = $answerMap[$id] ?? [];
    $value = trim((string)($answer['value'] ?? ''));
    $photo = trim((string)($answer['photoUrl'] ?? ''));
    if (!empty($item['isRequired']) && $value === '' && $photo === '') json_error('Complete required item: ' . $item['label']);
    $inputType = strtoupper((string)$item['input_type']);
    $options = $item['options'];
    if (($inputType === 'DROPDOWN' || $inputType === 'YES_NO') && $value !== '') {
        $allowed = $options;
        if ($inputType === 'YES_NO' && !$allowed) $allowed = ['Yes','No'];
        if ($allowed && !in_array($value, array_map('strval',$allowed), true)) json_error('Invalid answer for ' . $item['label']);
    }
    $safety = strtoupper((string)($item['safety_level'] ?: 'GREEN'));
    $optionSafety = $item['optionSafety'];
    if ($value !== '' && isset($optionSafety[$value])) $safety = strtoupper((string)$optionSafety[$value]);
    if (!isset($rank[$safety])) $safety = 'GREEN';
    if ($rank[$safety] > $rank[$overall]) $overall = $safety;
    $normalized[] = ['item'=>$item,'value'=>$value,'photo'=>$photo !== '' ? $photo : null,'safety'=>$safety,'note'=>trim((string)($answer['note'] ?? ''))];
}

$pdo = db();
try {
    $pdo->beginTransaction();
    // Data-safety rule: a new Check Up only INSERTS a new historical record.
    // No previous checklist report or answer is updated/deleted by this flow.
    $dupStmt = $pdo->prepare("SELECT id FROM checklist_reports WHERE machine_id=? AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Africa/Dar_es_Salaam') AT TIME ZONE 'Africa/Dar_es_Salaam' LIMIT 1");
    $dupStmt->execute([$machineId]);
    if ($dupStmt->fetchColumn()) {
        $pdo->rollBack();
        json_error('Today\'s Check Up is already completed for this machine.', 409);
    }
    $reportId = uuid();
    $filledBy = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer Inspector')) ?: 'Customer Inspector';
    $pdo->prepare('INSERT INTO checklist_reports (id,machine_id,template_id,filled_by,hour_meter_reading,overall_status,created_at) VALUES (?,?,?,?,?,?,NOW())')->execute([$reportId,$machineId,$templateId,$filledBy,(float)$hours,$overall]);
    $insert = $pdo->prepare('INSERT INTO checklist_answers (id,report_id,template_item_id,label,value,photo_url,safety_level,note) VALUES (?,?,?,?,?,?,?,?)');
    foreach ($normalized as $row) {
        $insert->execute([uuid(),$reportId,$row['item']['id'],$row['item']['label'],$row['value'],$row['photo'],$row['safety'],$row['note'] !== '' ? $row['note'] : null]);
    }
    $pdo->prepare('UPDATE machines SET status=?,last_checked_at=NOW(),updated_at=NOW() WHERE id=?')->execute([$overall,$machineId]);
    $pdo->commit();
    json_out(['ok'=>true,'reportId'=>$reportId,'overallStatus'=>$overall,'historicalReportsPreserved'=>true,'message'=>'Check Up completed and saved. Existing checklist records were preserved.'],201);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
}
