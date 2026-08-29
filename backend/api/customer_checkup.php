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
    if (!is_array($permissions) || !in_array('check-up', $permissions, true)) json_error('Your role does not include Check Up.', 403);
}

function checkup_machine(string $customerId, string $machineId): array {
    $stmt = db()->prepare('SELECT id,customer_id,machine_type,brand,model,serial_number,reg_number,fleet_number,status,last_checked_at,service_interval_hours,last_service_hours FROM machines WHERE id=? AND customer_id=? AND deleted_at IS NULL LIMIT 1');
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
    $machineTypeKey = checkup_normalized_machine_key((string)($machine['machine_type'] ?? ''));
    $modelKey = checkup_normalized_machine_key((string)($machine['model'] ?? ''));
    $stmt = db()->query("SELECT ct.id,ct.name,ct.machine_type,ct.service_type,ct.created_at FROM checklist_templates ct WHERE ct.deleted_at IS NULL AND ct.is_active=1 AND ct.is_master=1 AND EXISTS (SELECT 1 FROM checklist_template_items cti WHERE cti.template_id=ct.id AND UPPER(cti.input_type)='DROPDOWN') ORDER BY ct.created_at DESC");
    $matched = [];
    foreach ($stmt->fetchAll() as $candidate) {
        $templateKey = checkup_normalized_machine_key((string)($candidate['machine_type'] ?? ''));
        $score = ($machineTypeKey !== '' && $templateKey === $machineTypeKey) ? 2 : (($modelKey !== '' && $templateKey === $modelKey) ? 1 : 0);
        if ($score === 0) continue;
        $candidate['_matchScore'] = $score;
        $matched[] = $candidate;
    }
    if (!$matched) return [];
    usort($matched, static function(array $a, array $b): int {
        $score = ((int)$b['_matchScore']) <=> ((int)$a['_matchScore']);
        return $score !== 0 ? $score : strcmp((string)$b['created_at'], (string)$a['created_at']);
    });
    $template = $matched[0];
    unset($template['_matchScore'], $template['created_at']);
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
    $template['syncMode'] = 'BELM_MASTER_AUTO';
    $template['autoSynced'] = true;
    return [$template];
}

function checkup_today_report(string $machineId): ?array {
    $stmt = db()->prepare("SELECT cr.id,cr.template_id,cr.overall_status,cr.hour_meter_reading,cr.filled_by,cr.display_photo_url,cr.service_day_checked,cr.next_service_hours,cr.created_at,cr.updated_at,ct.service_type FROM checklist_reports cr JOIN checklist_templates ct ON ct.id=cr.template_id WHERE cr.machine_id=? AND cr.created_at >= date_trunc('day', NOW() AT TIME ZONE 'Africa/Dar_es_Salaam') AT TIME ZONE 'Africa/Dar_es_Salaam' ORDER BY cr.created_at DESC LIMIT 1");
    $stmt->execute([$machineId]);
    $report = $stmt->fetch();
    if (!$report) return null;
    $ans = db()->prepare('SELECT template_item_id,value,photo_url,safety_level,note FROM checklist_answers WHERE report_id=? ORDER BY id ASC');
    $ans->execute([$report['id']]);
    $report['answers'] = $ans->fetchAll();
    $report['editableUntil'] = (new DateTimeImmutable('tomorrow', new DateTimeZone('Africa/Dar_es_Salaam')))->format(DateTimeInterface::ATOM);
    $report['editable'] = true;
    return $report;
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
    $today = checkup_today_report($machineId);
    $tz = new DateTimeZone('Africa/Dar_es_Salaam');
    $now = new DateTimeImmutable('now', $tz);
    json_out([
        'machine' => ['id'=>$machine['id'],'machineType'=>$machine['machine_type'],'brand'=>$machine['brand'],'model'=>$machine['model'],'serialNumber'=>$machine['serial_number'],'regNumber'=>$machine['reg_number'],'fleetNumber'=>$machine['fleet_number'],'status'=>$machine['status'],'lastCheckedAt'=>$machine['last_checked_at'],'serviceIntervalHours'=>$machine['service_interval_hours'] !== null ? (int)$machine['service_interval_hours'] : null,'lastServiceHours'=>(float)($machine['last_service_hours'] ?? 0)],
        'templates'=>$templates,
        'sync'=>['mode'=>'BELM_MASTER_AUTO','historicalReportsPreserved'=>true,'message'=>'Machine Type automatically uses the matching active BELM Master Checklist.'],
        'latestHourMeter'=>$latest ? (float)$latest['hour_meter_reading'] : 0,
        'serviceDay'=>$now->format('Y-m-d'),'editExpiresAt'=>$now->modify('tomorrow')->setTime(0,0,0)->format(DateTimeInterface::ATOM),'todayReport'=>$today,
    ]);
}

if ($method !== 'POST') json_error('Method not allowed.', 405);
$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) json_error('Invalid request body.');
$machineId = trim((string)($body['machineId'] ?? ''));
$templateId = trim((string)($body['templateId'] ?? ''));
$hours = $body['hourMeterReading'] ?? null;
$displayPhoto = trim((string)($body['displayPhotoUrl'] ?? ''));
$serviceDayChecked = !empty($body['serviceDayChecked']);
$nextServiceHours = isset($body['nextServiceHours']) ? (int)$body['nextServiceHours'] : 0;
$answers = $body['answers'] ?? [];
if ($machineId === '' || $templateId === '') json_error('Machine and Checklist Template are required.');
if (!is_numeric($hours) || (float)$hours < 0) json_error('Enter a valid hour meter reading.');
if ($serviceDayChecked && !in_array($nextServiceHours,[250,500,1000,2000],true)) json_error('Select Next Service Type: 250, 500, 1000 or 2000 HRS.');
if (!$serviceDayChecked) $nextServiceHours = 0;
if (!is_array($answers)) json_error('Checklist answers are required.');
$machine = checkup_machine($customerId,$machineId);
$templates = checkup_templates_for_machine($machine);
$template = null;
foreach ($templates as $candidate) if ((string)$candidate['id'] === $templateId) { $template=$candidate; break; }
if (!$template) json_error('Checklist Template is not active for this machine.',400);
$existing = checkup_today_report($machineId);
if (!$existing && $displayPhoto === '') json_error('Display Photo is required for today\'s Check Up.');
if ($existing && $displayPhoto === '') $displayPhoto=(string)($existing['display_photo_url'] ?? '');
$answerMap=[];
foreach ($answers as $answer) if (is_array($answer) && trim((string)($answer['itemId'] ?? '')) !== '') $answerMap[trim((string)$answer['itemId'])]=$answer;
$rank=['NONE'=>-1,'GREEN'=>0,'YELLOW'=>1,'RED'=>2]; $overall='GREEN'; $normalized=[];
foreach ($template['items'] as $item) {
    $id=(string)$item['id']; $answer=$answerMap[$id] ?? []; $value=trim((string)($answer['value'] ?? '')); $photo=trim((string)($answer['photoUrl'] ?? ''));
    if (!empty($item['isRequired']) && $value==='' && $photo==='') json_error('Complete required item: '.$item['label']);
    $inputType=strtoupper((string)$item['input_type']); $options=$item['options'];
    if (($inputType==='DROPDOWN'||$inputType==='YES_NO') && $value!=='') { $allowed=$options; if($inputType==='YES_NO'&&!$allowed)$allowed=['YES','NO','Yes','No']; if($allowed&&!in_array($value,array_map('strval',$allowed),true))json_error('Invalid answer for '.$item['label']); }
    $safety=strtoupper((string)($item['safety_level'] ?: 'GREEN')); $optionSafety=$item['optionSafety']; if($value!==''&&isset($optionSafety[$value]))$safety=strtoupper((string)$optionSafety[$value]); if(!isset($rank[$safety]))$safety='GREEN'; if($rank[$safety]>$rank[$overall])$overall=$safety;
    $normalized[]=['item'=>$item,'value'=>$value,'photo'=>$photo!==''?$photo:null,'safety'=>$safety,'note'=>trim((string)($answer['note'] ?? ''))];
}
$pdo=db();
try {
    $pdo->beginTransaction();
    $filledBy=trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer Inspector')) ?: 'Customer Inspector';
    if($existing){$reportId=(string)$existing['id'];$pdo->prepare('UPDATE checklist_reports SET template_id=?,filled_by=?,hour_meter_reading=?,overall_status=?,display_photo_url=?,service_day_checked=?,next_service_hours=?,updated_at=NOW() WHERE id=? AND machine_id=?')->execute([$templateId,$filledBy,(float)$hours,$overall,$displayPhoto,$serviceDayChecked?1:0,$serviceDayChecked?$nextServiceHours:null,$reportId,$machineId]);$pdo->prepare('DELETE FROM checklist_answers WHERE report_id=?')->execute([$reportId]);$statusCode=200;$message='Today\'s Check Up updated. Editing remains available until 00:00 East Africa Time.';}else{$reportId=uuid();$pdo->prepare('INSERT INTO checklist_reports (id,machine_id,template_id,filled_by,hour_meter_reading,overall_status,display_photo_url,service_day_checked,next_service_hours,created_at) VALUES (?,?,?,?,?,?,?,?,?,NOW())')->execute([$reportId,$machineId,$templateId,$filledBy,(float)$hours,$overall,$displayPhoto,$serviceDayChecked?1:0,$serviceDayChecked?$nextServiceHours:null]);$statusCode=201;$message='Today\'s Check Up completed and saved. Editing remains available until 00:00 East Africa Time.';}
    $insert=$pdo->prepare('INSERT INTO checklist_answers (id,report_id,template_item_id,label,value,photo_url,safety_level,note) VALUES (?,?,?,?,?,?,?,?)'); foreach($normalized as $row)$insert->execute([uuid(),$reportId,$row['item']['id'],$row['item']['label'],$row['value'],$row['photo'],$row['safety'],$row['note']!==''?$row['note']:null]);
    if($serviceDayChecked)$pdo->prepare('UPDATE machines SET status=?,last_checked_at=NOW(),last_service_hours=?,service_interval_hours=?,updated_at=NOW() WHERE id=?')->execute([$overall,(float)$hours,$nextServiceHours,$machineId]);else$pdo->prepare('UPDATE machines SET status=?,last_checked_at=NOW(),updated_at=NOW() WHERE id=?')->execute([$overall,$machineId]);
    $pdo->commit(); $tz=new DateTimeZone('Africa/Dar_es_Salaam'); $expires=(new DateTimeImmutable('tomorrow',$tz))->setTime(0,0,0)->format(DateTimeInterface::ATOM);
    json_out(['ok'=>true,'reportId'=>$reportId,'overallStatus'=>$overall,'serviceDayChecked'=>$serviceDayChecked,'nextServiceHours'=>$serviceDayChecked?$nextServiceHours:null,'nextServiceDueAtHours'=>$serviceDayChecked?(float)$hours+$nextServiceHours:null,'editable'=>true,'editExpiresAt'=>$expires,'historicalReportsPreserved'=>true,'message'=>$message],$statusCode);
} catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
