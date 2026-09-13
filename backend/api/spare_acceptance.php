<?php
require_once __DIR__ . '/../config/helpers.php';

$payload = current_token_payload();
if (!$payload) json_error('Not authenticated', 401);

$method = $_SERVER['REQUEST_METHOD'];
$id = trim((string)($_GET['id'] ?? ''));
if ($method !== 'PUT' || $id === '') json_error('Spare acceptance request not found.', 404);

$body = body();
$approve = !empty($body['approve']);
$note = trim((string)($body['note'] ?? ''));

$stmt = db()->prepare(
    'SELECT bsr.*,bc.customer_id,bc.source_type,bc.current_stage,bc.status AS case_status,c.is_machinery_admin
     FROM breakdown_spare_requests bsr
     JOIN breakdown_cases bc ON bc.id=bsr.case_id
     JOIN customers c ON c.id=bc.customer_id
     WHERE bsr.id=?'
);
$stmt->execute([$id]);
$spare = $stmt->fetch();
if (!$spare) json_error('Spare request not found.', 404);

$status = strtoupper(trim((string)($spare['status'] ?? '')));
if ($status !== 'WAITING_BOSS_APPROVAL') {
    json_error('This spare request has already been actioned.', 409);
}

$actorType = 'BELM';
$actorName = 'BELM Administration';
$actorId = null;
$authorized = false;

if (($payload['type'] ?? '') === 'customer') {
    $customer = require_customer_auth();
    if ((string)($customer['id'] ?? '') !== (string)$spare['customer_id']) json_error('Not allowed.', 403);
    $role = strtolower(trim((string)($customer['customerRole'] ?? '')));
    $isOwner = ($customer['actorType'] ?? '') === 'owner';
    $authorized = $isOwner || in_array($role, ['admin','workshop_manager'], true);
    $actorType = 'CUSTOMER';
    $actorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer Administration')) ?: 'Customer Administration';
    $actorId = trim((string)($customer['actorId'] ?? '')) ?: null;
} else {
    $user = require_auth();
    $authorized = belm_user_has_named_role($user, ['Super Admin','Engineer','Workshop Manager']);
    $actorName = trim((string)($user['name'] ?? 'BELM Administration')) ?: 'BELM Administration';
    $actorId = trim((string)($user['id'] ?? '')) ?: null;
}

if (!$authorized) json_error('Administration or Workshop Manager approval is required.', 403);
if (!$approve && $note === '') json_error('Enter a reason before rejecting the spare request.', 422);

$nextStatus = $approve ? 'APPROVED' : 'REJECTED';
$pdo = db();
$pdo->beginTransaction();
try {
    $pdo->prepare(
        'UPDATE breakdown_spare_requests
         SET status=?,approved_by_name=?,approved_at=NOW(),approval_note=?,updated_at=NOW()
         WHERE id=?'
    )->execute([$nextStatus,$actorName,$note !== '' ? $note : null,$id]);

    if ($approve) {
        $pdo->prepare(
            "UPDATE breakdown_cases
             SET current_stage='STORE_CHECK',current_department='Store Keeper',blocker_reason=NULL,
                 stage_started_at=NOW(),updated_at=NOW()
             WHERE id=?"
        )->execute([(string)$spare['case_id']]);
        $pdo->prepare(
            'INSERT INTO breakdown_case_events
             (id,case_id,stage,department,action,note,actor_type,actor_id,actor_name,created_at)
             VALUES(?,?,?,?,?,?,?,?,?,NOW())'
        )->execute([uuid(),(string)$spare['case_id'],'STORE_CHECK','Store Keeper','Spare approved - Store check required',$note !== '' ? $note : null,$actorType,$actorId,$actorName]);
    } else {
        $pdo->prepare(
            "UPDATE breakdown_cases
             SET current_stage='DIAGNOSIS',current_department='Technician',blocker_reason=?,
                 stage_started_at=NOW(),updated_at=NOW()
             WHERE id=?"
        )->execute(['Spare rejected by Administration',(string)$spare['case_id']]);
        if (!empty($spare['job_card_id'])) {
            $pdo->prepare(
                "UPDATE digital_job_cards SET status='IN_PROGRESS',updated_at=NOW()
                 WHERE id=? AND status='WAITING_FOR_PARTS'"
            )->execute([(string)$spare['job_card_id']]);
        }
        $pdo->prepare(
            'INSERT INTO breakdown_case_events
             (id,case_id,stage,department,action,note,actor_type,actor_id,actor_name,created_at)
             VALUES(?,?,?,?,?,?,?,?,?,NOW())'
        )->execute([uuid(),(string)$spare['case_id'],'DIAGNOSIS','Technician','Spare request rejected',$note,$actorType,$actorId,$actorName]);
    }

    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $error;
}

json_out([
    'ok'=>true,
    'status'=>$nextStatus,
    'approved'=>$approve,
    'approvedBy'=>$actorName,
    'nextAction'=>$approve ? 'STORE_CHECK' : 'TECHNICIAN_REVIEW',
    'message'=>$approve ? 'Spare approved. Store check is the next action.' : 'Spare request rejected and returned to Technician review.'
]);
