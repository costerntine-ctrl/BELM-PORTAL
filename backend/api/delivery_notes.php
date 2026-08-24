<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$action = trim((string)($_GET['action'] ?? ''));
$id = trim((string)($_GET['id'] ?? ''));
$isTechnician = strtolower((string)($user['roleName'] ?? '')) === 'technician';
if ($isTechnician) {
    $ownershipStmt = db()->prepare('SELECT is_customer_managed FROM users WHERE id=? AND deleted_at IS NULL AND is_active=1');
    $ownershipStmt->execute([$user['id'] ?? '']);
    if ((int)($ownershipStmt->fetchColumn() ?: 0) === 1) {
        json_error('BELM Delivery Notes are issued by BELM staff. Customer-managed Technicians use the Customer Workshop records.', 403);
    }
}

function delivery_note_manage_all(array $user): bool {
    if (belm_user_has_named_role($user, ['Super Admin', 'Engineer', 'Workshop Manager'])) return true;
    $allowed = is_array($user['allowedPages'] ?? null) ? $user['allowedPages'] : [];
    return in_array('job-cards', $allowed, true)
        || in_array('spare-parts', $allowed, true)
        || in_array('roles', $allowed, true);
}

function delivery_note_allowed_customer_ids(array $user): array {
    if (delivery_note_manage_all($user)) {
        return db()->query("SELECT id FROM customers WHERE deleted_at IS NULL AND is_active=1 ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
    }
    if (strtolower((string)($user['roleName'] ?? '')) !== 'technician') return [];
    $stmt = db()->prepare(
        "SELECT DISTINCT customer_id FROM (
            SELECT assigned_customer_id AS customer_id FROM users WHERE id=? AND assigned_customer_id IS NOT NULL
            UNION ALL
            SELECT customer_id FROM tasks WHERE assigned_to_id=? AND customer_id IS NOT NULL AND status<>'DONE'
            UNION ALL
            SELECT customer_id FROM digital_job_cards WHERE technician_id=? AND customer_id IS NOT NULL AND UPPER(COALESCE(status,'')) NOT IN ('COMPLETED','CANCELLED')
        ) x WHERE customer_id IS NOT NULL"
    );
    $stmt->execute([$user['id'], $user['id'], $user['id']]);
    return array_values(array_unique(array_filter(array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN)))));
}

function delivery_note_assert_customer_access(array $user, string $customerId): void {
    if ($customerId === '') json_error('Select a customer.');
    $allowed = delivery_note_allowed_customer_ids($user);
    if (!in_array($customerId, $allowed, true)) json_error('You do not have an active assignment for this customer.', 403);
    $stmt = db()->prepare('SELECT 1 FROM customers WHERE id=? AND deleted_at IS NULL AND is_active=1');
    $stmt->execute([$customerId]);
    if (!$stmt->fetchColumn()) json_error('Customer is not available.', 404);
}

function delivery_note_items_from_body(array $body): array {
    $rows = is_array($body['items'] ?? null) ? $body['items'] : [];
    $items = [];
    foreach ($rows as $row) {
        if (!is_array($row)) continue;
        $description = trim((string)($row['description'] ?? ''));
        $partNumber = trim((string)($row['partNumber'] ?? ''));
        $unit = trim((string)($row['unit'] ?? ''));
        $condition = trim((string)($row['condition'] ?? $row['itemCondition'] ?? ''));
        $quantity = (float)($row['quantity'] ?? 0);
        if ($description === '' && $partNumber === '') continue;
        if ($description === '') $description = $partNumber;
        if ($quantity <= 0) json_error('Every delivery item must have a quantity greater than zero.');
        $items[] = [
            'partNumber' => $partNumber !== '' ? mb_substr($partNumber, 0, 120) : null,
            'description' => mb_substr($description, 0, 500),
            'quantity' => $quantity,
            'unit' => $unit !== '' ? mb_substr($unit, 0, 60) : null,
            'condition' => $condition !== '' ? mb_substr($condition, 0, 255) : null,
        ];
    }
    if (!$items) json_error('Add at least one filter, spare, tool or other delivered item.');
    if (count($items) > 40) json_error('A Delivery Note can contain up to 40 item lines.');
    return $items;
}

function delivery_note_signature(array $body, string $status): array {
    $data = trim((string)($body['signatureData'] ?? ''));
    $recipientName = trim((string)($body['recipientName'] ?? $body['receivedBy'] ?? ''));
    if ($status !== 'SIGNED') return [null, null, $recipientName !== '' ? mb_substr($recipientName, 0, 255) : null];
    if ($recipientName === '') json_error('Customer signatory name is required before saving a signed Delivery Note.');
    if ($data === '') json_error('Customer signature is required before saving a signed Delivery Note.');
    if (!preg_match('#^data:image/(jpeg|png);base64,([A-Za-z0-9+/=\r\n]+)$#', $data, $match)) {
        json_error('Signature format is not valid. Please clear and sign again.');
    }
    if (strlen($data) > 1800000) json_error('Signature image is too large. Please clear and sign again.');
    $decoded = base64_decode($match[2], true);
    if ($decoded === false || strlen($decoded) < 100) json_error('Signature image could not be read. Please sign again.');
    return [$data, strtolower($match[1]) === 'png' ? 'image/png' : 'image/jpeg', mb_substr($recipientName, 0, 255)];
}

function delivery_note_number(PDO $pdo): string {
    $number = (int)$pdo->query("SELECT nextval('belm_delivery_note_no_seq')")->fetchColumn();
    return 'DN-' . date('Y') . '-' . str_pad((string)$number, 6, '0', STR_PAD_LEFT);
}

function delivery_note_fetch(string $id): ?array {
    $stmt = db()->prepare(
        "SELECT dn.*, c.name AS customer_name, c.address AS customer_address, c.phone AS customer_phone, c.email AS customer_email,
                m.brand AS machine_brand, m.model AS machine_model, m.machine_type, m.fleet_number, m.serial_number, m.reg_number,
                j.job_card_no
         FROM delivery_notes dn
         JOIN customers c ON c.id=dn.customer_id
         LEFT JOIN machines m ON m.id=dn.machine_id
         LEFT JOIN digital_job_cards j ON j.id=dn.job_card_id
         WHERE dn.id=?"
    );
    $stmt->execute([$id]);
    $note = $stmt->fetch();
    if (!$note) return null;
    $itemStmt = db()->prepare('SELECT * FROM delivery_note_items WHERE delivery_note_id=? ORDER BY item_no,id');
    $itemStmt->execute([$id]);
    $note['items'] = $itemStmt->fetchAll();
    return $note;
}

function delivery_note_assert_record_access(array $user, array $note): void {
    if (delivery_note_manage_all($user)) return;
    if (strtolower((string)($user['roleName'] ?? '')) === 'technician'
        && (string)($note['technician_id'] ?? '') === (string)($user['id'] ?? '')) return;
    json_error('You do not have access to this Delivery Note.', 403);
}

if ($action === 'meta' && $method === 'GET') {
    $customerIds = delivery_note_allowed_customer_ids($user);
    if (!$customerIds) json_out(['customers'=>[], 'machines'=>[], 'jobCards'=>[], 'actor'=>$user]);
    $marks = implode(',', array_fill(0, count($customerIds), '?'));
    $customerStmt = db()->prepare("SELECT id,name,address,phone,email FROM customers WHERE id IN ($marks) AND deleted_at IS NULL AND is_active=1 ORDER BY name");
    $customerStmt->execute($customerIds);
    $machineStmt = db()->prepare("SELECT id,customer_id,brand,model,machine_type,fleet_number,serial_number,reg_number FROM machines WHERE customer_id IN ($marks) AND deleted_at IS NULL ORDER BY customer_id,COALESCE(fleet_number,''),brand,model");
    $machineStmt->execute($customerIds);
    if ($isTechnician) {
        $jobStmt = db()->prepare("SELECT id,customer_id,machine_id,job_card_no,title,status FROM digital_job_cards WHERE technician_id=? ORDER BY created_at DESC LIMIT 250");
        $jobStmt->execute([$user['id']]);
    } else {
        $jobStmt = db()->prepare("SELECT id,customer_id,machine_id,job_card_no,title,status FROM digital_job_cards WHERE customer_id IN ($marks) ORDER BY created_at DESC LIMIT 500");
        $jobStmt->execute($customerIds);
    }
    json_out([
        'customers'=>$customerStmt->fetchAll(),
        'machines'=>$machineStmt->fetchAll(),
        'jobCards'=>$jobStmt->fetchAll(),
        'actor'=>[
            'id'=>$user['id'] ?? null,
            'name'=>$user['name'] ?? 'BELM Staff',
            'roleName'=>$user['roleName'] ?? null,
            'canManageAll'=>delivery_note_manage_all($user),
        ],
    ]);
}

if ($method === 'GET' && $id !== '') {
    $note = delivery_note_fetch($id);
    if (!$note) json_error('Delivery Note not found.', 404);
    delivery_note_assert_record_access($user, $note);
    json_out($note);
}

if ($method === 'GET') {
    $params = [];
    $where = ['1=1'];
    if (!delivery_note_manage_all($user)) {
        $where[] = 'dn.technician_id=?';
        $params[] = $user['id'];
    }
    $customerId = trim((string)($_GET['customerId'] ?? ''));
    if ($customerId !== '') { delivery_note_assert_customer_access($user, $customerId); $where[]='dn.customer_id=?'; $params[]=$customerId; }
    $status = strtoupper(trim((string)($_GET['status'] ?? '')));
    if (in_array($status, ['DRAFT','SIGNED'], true)) { $where[]='dn.status=?'; $params[]=$status; }
    $stmt = db()->prepare(
        "SELECT dn.id,dn.delivery_note_no,dn.customer_id,dn.machine_id,dn.job_card_id,dn.technician_id,dn.technician_name,
                dn.delivery_date,dn.received_by,dn.on_behalf_of,dn.condition_status,dn.recipient_name,dn.signed_at,dn.status,dn.created_by_name,dn.created_at,dn.updated_at,
                c.name AS customer_name,m.brand AS machine_brand,m.model AS machine_model,m.machine_type,m.fleet_number,j.job_card_no,
                (SELECT COUNT(*) FROM delivery_note_items di WHERE di.delivery_note_id=dn.id) AS item_count
         FROM delivery_notes dn
         JOIN customers c ON c.id=dn.customer_id
         LEFT JOIN machines m ON m.id=dn.machine_id
         LEFT JOIN digital_job_cards j ON j.id=dn.job_card_id
         WHERE " . implode(' AND ', $where) . "
         ORDER BY COALESCE(dn.signed_at,dn.created_at) DESC
         LIMIT 400"
    );
    $stmt->execute($params);
    json_out($stmt->fetchAll());
}

if ($method === 'POST' || $method === 'PUT') {
    $body = body();
    $status = strtoupper(trim((string)($body['status'] ?? 'DRAFT')));
    if (!in_array($status, ['DRAFT','SIGNED'], true)) json_error('Delivery Note status must be DRAFT or SIGNED.');
    $customerId = trim((string)($body['customerId'] ?? ''));
    delivery_note_assert_customer_access($user, $customerId);
    $machineId = trim((string)($body['machineId'] ?? ''));
    $jobCardId = trim((string)($body['jobCardId'] ?? ''));
    if ($machineId !== '') {
        $stmt = db()->prepare('SELECT 1 FROM machines WHERE id=? AND customer_id=? AND deleted_at IS NULL');
        $stmt->execute([$machineId,$customerId]);
        if (!$stmt->fetchColumn()) json_error('Selected machine does not belong to this customer.');
    }
    if ($jobCardId !== '') {
        $stmt = db()->prepare('SELECT machine_id FROM digital_job_cards WHERE id=? AND customer_id=?');
        $stmt->execute([$jobCardId,$customerId]);
        $jobMachineId = $stmt->fetchColumn();
        if ($jobMachineId === false) json_error('Selected Job Card does not belong to this customer.');
        if ($machineId === '') $machineId = (string)$jobMachineId;
        elseif ((string)$jobMachineId !== $machineId) json_error('Selected Job Card belongs to a different machine.');
        if ($isTechnician) {
            $stmt = db()->prepare('SELECT 1 FROM digital_job_cards WHERE id=? AND technician_id=?');
            $stmt->execute([$jobCardId,$user['id']]);
            if (!$stmt->fetchColumn()) json_error('This Job Card is not assigned to you.', 403);
        }
    }
    $items = delivery_note_items_from_body($body);
    $conditionStatus = strtoupper(trim((string)($body['conditionStatus'] ?? 'GOOD')));
    if (!in_array($conditionStatus, ['GOOD','DAMAGED','PARTIAL','OTHER'], true)) $conditionStatus='OTHER';
    $damage = trim((string)($body['damageDescription'] ?? ''));
    if ($conditionStatus === 'DAMAGED' && $damage === '') json_error('Describe the damage before saving.');
    [$signatureData,$signatureMime,$recipientName] = delivery_note_signature($body,$status);
    $deliveryDate = trim((string)($body['deliveryDate'] ?? date('Y-m-d')));
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/',$deliveryDate)) json_error('Enter a valid delivery date.');
    $receivedBy = trim((string)($body['receivedBy'] ?? ''));
    $onBehalfOf = trim((string)($body['onBehalfOf'] ?? ''));
    if ($status === 'SIGNED' && ($receivedBy === '' || $onBehalfOf === '')) {
        json_error('Received by and On behalf of are required before customer signature.');
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        if ($method === 'POST') {
            $noteId = uuid();
            $number = delivery_note_number($pdo);
            $stmt = $pdo->prepare(
                "INSERT INTO delivery_notes
                 (id,delivery_note_no,customer_id,machine_id,job_card_id,technician_id,technician_name,delivery_date,received_by,on_behalf_of,address,phone,fax,email,condition_status,condition_summary,damage_description,other_comments,recipient_name,signature_data,signature_mime,signed_at,status,created_by_id,created_by_name,created_at,updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='SIGNED' THEN NOW() ELSE NULL END,?,?,?,NOW(),NOW())"
            );
            $stmt->execute([
                $noteId,$number,$customerId,$machineId!==''?$machineId:null,$jobCardId!==''?$jobCardId:null,
                $user['id']??null,mb_substr((string)($user['name']??'BELM Staff'),0,255),$deliveryDate,
                $receivedBy!==''?mb_substr($receivedBy,0,255):null,$onBehalfOf!==''?mb_substr($onBehalfOf,0,255):null,
                ($v=trim((string)($body['address']??'')))!==''?mb_substr($v,0,500):null,
                ($v=trim((string)($body['phone']??'')))!==''?mb_substr($v,0,80):null,
                ($v=trim((string)($body['fax']??'')))!==''?mb_substr($v,0,80):null,
                ($v=trim((string)($body['email']??'')))!==''?mb_substr($v,0,255):null,
                $conditionStatus,
                ($v=trim((string)($body['conditionSummary']??'')))!==''?mb_substr($v,0,500):null,
                $damage!==''?$damage:null,
                ($v=trim((string)($body['otherComments']??'')))!==''?$v:null,
                $recipientName,$signatureData,$signatureMime,$status,$status,$user['id']??null,mb_substr((string)($user['name']??'BELM Staff'),0,255)
            ]);
        } else {
            if ($id === '') json_error('Delivery Note id is required.');
            $existing = delivery_note_fetch($id);
            if (!$existing) json_error('Delivery Note not found.',404);
            delivery_note_assert_record_access($user,$existing);
            if (strtoupper((string)$existing['status']) === 'SIGNED') json_error('A signed Delivery Note is locked. Delete it with authorization instead of editing it.',409);
            $noteId = $id;
            $stmt = $pdo->prepare(
                "UPDATE delivery_notes SET customer_id=?,machine_id=?,job_card_id=?,delivery_date=?,received_by=?,on_behalf_of=?,address=?,phone=?,fax=?,email=?,condition_status=?,condition_summary=?,damage_description=?,other_comments=?,recipient_name=?,signature_data=?,signature_mime=?,signed_at=CASE WHEN ?='SIGNED' THEN NOW() ELSE NULL END,status=?,updated_at=NOW() WHERE id=?"
            );
            $stmt->execute([
                $customerId,$machineId!==''?$machineId:null,$jobCardId!==''?$jobCardId:null,$deliveryDate,
                $receivedBy!==''?mb_substr($receivedBy,0,255):null,$onBehalfOf!==''?mb_substr($onBehalfOf,0,255):null,
                ($v=trim((string)($body['address']??'')))!==''?mb_substr($v,0,500):null,
                ($v=trim((string)($body['phone']??'')))!==''?mb_substr($v,0,80):null,
                ($v=trim((string)($body['fax']??'')))!==''?mb_substr($v,0,80):null,
                ($v=trim((string)($body['email']??'')))!==''?mb_substr($v,0,255):null,
                $conditionStatus,
                ($v=trim((string)($body['conditionSummary']??'')))!==''?mb_substr($v,0,500):null,
                $damage!==''?$damage:null,
                ($v=trim((string)($body['otherComments']??'')))!==''?$v:null,
                $recipientName,$signatureData,$signatureMime,$status,$status,$noteId
            ]);
            $pdo->prepare('DELETE FROM delivery_note_items WHERE delivery_note_id=?')->execute([$noteId]);
        }
        $itemStmt = $pdo->prepare('INSERT INTO delivery_note_items(id,delivery_note_id,item_no,part_number,description,quantity,unit,item_condition) VALUES(?,?,?,?,?,?,?,?)');
        foreach ($items as $index=>$item) {
            $itemStmt->execute([uuid(),$noteId,$index+1,$item['partNumber'],$item['description'],$item['quantity'],$item['unit'],$item['condition']]);
        }
        $pdo->commit();
        $saved = delivery_note_fetch($noteId);
        log_activity($user,$status==='SIGNED'?'delivery-note-signed':'delivery-note-draft-saved','delivery-note',$noteId,[
            'number'=>$saved['delivery_note_no']??null,'customerId'=>$customerId,'machineId'=>$machineId?:null,'jobCardId'=>$jobCardId?:null
        ]);
        json_out($saved,$method==='POST'?201:200);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

if ($method === 'DELETE') {
    if ($id === '') json_error('Delivery Note id is required.');
    $note = delivery_note_fetch($id);
    if (!$note) json_error('Delivery Note not found.',404);
    delivery_note_assert_record_access($user,$note);
    $deleteBody = body();
    $isOwnDraft = strtoupper((string)$note['status']) === 'DRAFT'
        && (string)($note['technician_id'] ?? '') === (string)($user['id'] ?? '');
    if (!$isOwnDraft) {
        if (!delivery_note_manage_all($user)) json_error('Only BELM Workshop Manager / Administration can delete a signed Delivery Note.',403);
        $reason = require_delete_confirmation($user,$deleteBody);
    } else {
        $reason = trim((string)($deleteBody['reason'] ?? 'Draft cancelled by creator')) ?: 'Draft cancelled by creator';
    }
    db()->prepare('DELETE FROM delivery_notes WHERE id=?')->execute([$id]);
    log_activity($user,'delivery-note-deleted','delivery-note',$id,['number'=>$note['delivery_note_no']??null,'reason'=>$reason,'status'=>$note['status']??null]);
    json_out(['ok'=>true]);
}

json_error('Unknown Delivery Note request.',404);
