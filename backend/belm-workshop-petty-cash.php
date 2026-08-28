<?php
require_once __DIR__ . '/config/helpers.php';

$user = require_auth();
$role = strtolower(trim((string)($user['roleName'] ?? $user['role'] ?? '')));
if (!in_array($role, ['super admin','engineer','workshop manager'], true)) {
    json_error('BELM Workshop Petty Cash is restricted to BELM Workshop control roles.', 403);
}

$pdo = db();
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

$method = $_SERVER['REQUEST_METHOD'];

function belm_pc_totals(PDO $pdo): array {
    $funded = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM belm_workshop_petty_cash_entries WHERE entry_type='FUND'")->fetchColumn();
    $used = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM belm_workshop_petty_cash_entries WHERE entry_type='EXPENSE'")->fetchColumn();
    return ['funded'=>$funded,'used'=>$used,'balance'=>$funded-$used];
}

if ($method === 'GET') {
    $totals = belm_pc_totals($pdo);
    $rows = $pdo->query("SELECT id,entry_type,amount,category,description,reference,created_by_name,created_at
                         FROM belm_workshop_petty_cash_entries
                         ORDER BY created_at DESC LIMIT 300")->fetchAll();
    json_out([
        'scope'=>'BELM_INTERNAL_WORKSHOP',
        'owner'=>'BELM GENERAL TECH LTD',
        'balance'=>$totals['balance'],
        'totalFunded'=>$totals['funded'],
        'totalUsed'=>$totals['used'],
        'entries'=>$rows,
    ]);
}

if ($method === 'POST') {
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
    if (mb_strlen($description) > 255) json_error('Description is too long.');
    if (mb_strlen($category) > 80) json_error('Category is too long.');
    if (mb_strlen($reference) > 120) json_error('Reference is too long.');

    if ($type === 'EXPENSE') {
        $totals = belm_pc_totals($pdo);
        if ($amount > $totals['balance'] + 0.005) {
            json_error('Insufficient BELM Workshop Petty Cash balance.', 422);
        }
    }

    $id = uuid();
    $stmt = $pdo->prepare("INSERT INTO belm_workshop_petty_cash_entries
        (id,entry_type,amount,category,description,reference,created_by,created_by_name,created_at)
        VALUES (?,?,?,?,?,?,?,?,NOW())");
    $stmt->execute([
        $id,$type,$amount,$category !== '' ? $category : null,$description,
        $reference !== '' ? $reference : null,$user['id'] ?? null,$user['name'] ?? 'BELM Workshop'
    ]);
    log_activity($user,'belm-workshop-petty-cash-'.strtolower($type),'belmWorkshopPettyCash',$id,[
        'amount'=>$amount,'category'=>$category,'description'=>$description,'reference'=>$reference
    ]);
    $totals = belm_pc_totals($pdo);
    json_out(['ok'=>true,'id'=>$id,'balance'=>$totals['balance'],'message'=>$type==='FUND'?'BELM Workshop funds added.':'BELM Workshop expense recorded.'],201);
}

json_error('Method not allowed.',405);
