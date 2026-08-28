<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
if (!belm_user_has_named_role($user, ['Super Admin', 'Engineer', 'Workshop Manager'])) {
    require_page_access($user, 'customers');
}

$pdo = db();
$section = trim((string)($_GET['section'] ?? ''));

// BELM WM Petty Cash is BELM-owned internal workshop money. It deliberately
// does not read or write customer petty_cash_topups / usage_logs used by CWM.
if ($section === 'petty-cash') {
    $pdo->exec("CREATE TABLE IF NOT EXISTS belm_workshop_petty_cash_entries (
        id VARCHAR(64) PRIMARY KEY,
        entry_type VARCHAR(16) NOT NULL,
        amount NUMERIC(14,2) NOT NULL,
        category VARCHAR(80) NULL,
        description VARCHAR(255) NULL,
        reference VARCHAR(120) NULL,
        created_by VARCHAR(64) NULL,
        created_by_name VARCHAR(160) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_belm_workshop_petty_cash_created_at ON belm_workshop_petty_cash_entries(created_at DESC)");

    $totals = static function () use ($pdo): array {
        $funded = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM belm_workshop_petty_cash_entries WHERE entry_type='FUND'")->fetchColumn();
        $used = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM belm_workshop_petty_cash_entries WHERE entry_type='EXPENSE'")->fetchColumn();
        return ['funded'=>$funded,'used'=>$used,'balance'=>$funded-$used];
    };

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $b = body();
        require_edit_confirmation($user, $b);
        $type = strtoupper(trim((string)($b['type'] ?? '')));
        if (!in_array($type, ['FUND','EXPENSE'], true)) json_error('Entry type must be FUND or EXPENSE.');
        $amount = round((float)($b['amount'] ?? 0), 2);
        if ($amount <= 0) json_error('Amount must be greater than zero.');
        $category = trim((string)($b['category'] ?? ''));
        $description = trim((string)($b['description'] ?? ''));
        $reference = trim((string)($b['reference'] ?? ''));
        if ($description === '') json_error('Description is required.');
        if (mb_strlen($description) > 255 || mb_strlen($category) > 80 || mb_strlen($reference) > 120) json_error('Petty Cash entry is too long.');
        $before = $totals();
        if ($type === 'EXPENSE' && $amount > $before['balance'] + 0.005) json_error('Insufficient BELM Workshop Petty Cash balance.', 422);
        $id = uuid();
        $stmt = $pdo->prepare("INSERT INTO belm_workshop_petty_cash_entries (id,entry_type,amount,category,description,reference,created_by,created_by_name,created_at) VALUES (?,?,?,?,?,?,?,?,NOW())");
        $stmt->execute([$id,$type,$amount,$category !== '' ? $category : null,$description,$reference !== '' ? $reference : null,$user['id'] ?? null,$user['name'] ?? 'BELM Workshop']);
        log_activity($user,'belm-workshop-petty-cash-'.strtolower($type),'belmWorkshopPettyCash',$id,['amount'=>$amount,'category'=>$category,'description'=>$description,'reference'=>$reference]);
        $after = $totals();
        json_out(['ok'=>true,'id'=>$id,'balance'=>$after['balance'],'message'=>$type === 'FUND' ? 'BELM Workshop funds added.' : 'BELM Workshop expense recorded.'],201);
    }

    $sum = $totals();
    $entries = $pdo->query("SELECT id,entry_type,amount,category,description,reference,created_by_name,created_at FROM belm_workshop_petty_cash_entries ORDER BY created_at DESC LIMIT 300")->fetchAll();
    json_out(['ok'=>true,'scope'=>'BELM_INTERNAL_WORKSHOP','owner'=>'BELM GENERAL TECH LTD','balance'=>$sum['balance'],'totalFunded'=>$sum['funded'],'totalUsed'=>$sum['used'],'entries'=>$entries]);
}

$rows = $pdo->query(
    "SELECT
        m.id,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number,m.reg_number,m.status,
        m.operational_status,m.operational_status_note,m.operational_status_updated_at,m.service_kit,m.last_checked_at,
        c.name AS customer_name,
        (SELECT orp.message FROM operator_reports orp WHERE orp.machine_id=m.id ORDER BY orp.created_at DESC,orp.id DESC LIMIT 1) AS operator_message,
        (SELECT orp.status FROM operator_reports orp WHERE orp.machine_id=m.id ORDER BY orp.created_at DESC,orp.id DESC LIMIT 1) AS operator_status,
        (SELECT orp.operator_name FROM operator_reports orp WHERE orp.machine_id=m.id ORDER BY orp.created_at DESC,orp.id DESC LIMIT 1) AS operator_name,
        (SELECT COUNT(*) FROM digital_job_cards dj WHERE dj.machine_id=m.id AND COALESCE(UPPER(dj.status),'') NOT IN ('COMPLETED','CANCELLED')) AS open_job_cards,
        (SELECT dj.status FROM digital_job_cards dj WHERE dj.machine_id=m.id AND COALESCE(UPPER(dj.status),'') NOT IN ('COMPLETED','CANCELLED') ORDER BY dj.updated_at DESC,dj.created_at DESC,dj.id DESC LIMIT 1) AS latest_job_status,
        (SELECT COUNT(*) FROM breakdown_spare_requests bsr JOIN breakdown_cases bc ON bc.id=bsr.case_id WHERE bc.machine_id=m.id AND COALESCE(UPPER(bsr.status),'') NOT IN ('PARTS_READY','REJECTED','CANCELLED')) +
        (SELECT COUNT(*) FROM spare_part_requests spr WHERE spr.machine_id=m.id AND COALESCE(UPPER(spr.status),'') NOT IN ('COMPLETED','CANCELLED','REJECTED')) AS pending_spares
     FROM machines m JOIN customers c ON c.id=m.customer_id
     WHERE m.deleted_at IS NULL AND c.deleted_at IS NULL AND c.is_active=1
     ORDER BY c.name ASC,m.model ASC,m.fleet_number ASC"
)->fetchAll();

$machines = array_map(static function (array $row): array {
    return [
        'id'=>(string)$row['id'],'brand'=>(string)($row['brand']??''),'model'=>(string)($row['model']??''),'machineType'=>(string)($row['machine_type']??''),
        'fleetNumber'=>(string)($row['fleet_number']??''),'serialNumber'=>(string)($row['serial_number']??''),'regNumber'=>(string)($row['reg_number']??''),'status'=>(string)($row['status']??''),
        'operationalStatus'=>(string)($row['operational_status']??''),'operationalStatusNote'=>(string)($row['operational_status_note']??''),'operationalStatusUpdatedAt'=>$row['operational_status_updated_at']??null,
        'serviceKit'=>(string)($row['service_kit']??''),'lastCheckedAt'=>$row['last_checked_at']??null,'customerName'=>(string)($row['customer_name']??''),'operatorMessage'=>(string)($row['operator_message']??''),
        'operatorStatus'=>(string)($row['operator_status']??''),'operatorName'=>(string)($row['operator_name']??''),'openJobCards'=>(int)($row['open_job_cards']??0),'latestJobStatus'=>(string)($row['latest_job_status']??''),'pendingSpares'=>(int)($row['pending_spares']??0),
    ];
}, $rows);
json_out(['ok'=>true,'generatedAt'=>date(DATE_ATOM),'machines'=>$machines]);
