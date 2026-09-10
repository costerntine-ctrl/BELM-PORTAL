<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/table_pdf_helper.php';

$user = require_auth();
$pdo = db();

function wmr_role_name(array $user): string {
    return trim((string)($user['roleName'] ?? $user['role'] ?? ''));
}

function wmr_is_allowed(array $user): bool {
    return belm_user_has_named_role($user, [
        'Super Admin', 'Engineer', 'Workshop Manager', 'Technician',
        'Store Keeper', 'Storekeeper', 'Procurement', 'Finance', 'Accounts'
    ]);
}

function wmr_can_process(array $user): bool {
    return belm_user_has_named_role($user, [
        'Super Admin', 'Engineer', 'Workshop Manager',
        'Store Keeper', 'Storekeeper', 'Procurement'
    ]);
}

if (!wmr_is_allowed($user)) {
    json_error('Your role does not have access to Workshop Material Requests.', 403);
}

function wmr_ensure_schema(PDO $pdo): void {
    $pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS workshop_material_requests (
  id VARCHAR(36) PRIMARY KEY,
  request_no VARCHAR(50) NOT NULL UNIQUE,
  category VARCHAR(20) NOT NULL CHECK (category IN ('OIL','FUEL','SPARE')),
  item_name VARCHAR(255) NOT NULL,
  part_number VARCHAR(100) NULL,
  quantity NUMERIC(14,2) NOT NULL DEFAULT 1,
  unit VARCHAR(30) NOT NULL DEFAULT 'pcs',
  customer_site VARCHAR(255) NULL,
  machine_ref VARCHAR(255) NULL,
  purpose TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','ACKNOWLEDGED','FULFILLED','REJECTED','CANCELLED')),
  requested_by_id VARCHAR(36) NULL REFERENCES users(id),
  requested_by_name VARCHAR(255) NOT NULL,
  requested_by_role VARCHAR(100) NULL,
  submitted_at TIMESTAMPTZ NULL,
  acknowledged_at TIMESTAMPTZ NULL,
  acknowledged_by_name VARCHAR(255) NULL,
  fulfilled_at TIMESTAMPTZ NULL,
  fulfilled_by_name VARCHAR(255) NULL,
  status_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
)
SQL);
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_workshop_material_requests_status ON workshop_material_requests(status, updated_at DESC)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_workshop_material_requests_created ON workshop_material_requests(created_at DESC)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_workshop_material_requests_requester ON workshop_material_requests(requested_by_id, created_at DESC)');
}

function wmr_log(array $user, string $action, string $id, array $metadata = []): void {
    try {
        $userId = trim((string)($user['id'] ?? ''));
        if ($userId === '') return;
        db()->prepare('INSERT INTO activity_logs(id,user_id,action,entity,entity_id,metadata,created_at) VALUES(?,?,?,?,?,?::jsonb,NOW())')
            ->execute([uuid(), $userId, $action, 'WORKSHOP_MATERIAL_REQUEST', $id, json_encode($metadata, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]);
    } catch (Throwable $e) {
        error_log('Workshop material request activity log failed: ' . $e->getMessage());
    }
}

function wmr_request_no(): string {
    $short = strtoupper(substr(str_replace('-', '', uuid()), 0, 6));
    return 'WR-' . date('Ym') . '-' . $short;
}

function wmr_validate_category(string $value): string {
    $value = strtoupper(trim($value));
    if (!in_array($value, ['OIL','FUEL','SPARE'], true)) json_error('Request type must be Oil, Fuel or Spare Part.', 422);
    return $value;
}

function wmr_row_view(array $row): array {
    return [
        'id' => (string)$row['id'],
        'requestNo' => (string)$row['request_no'],
        'category' => (string)$row['category'],
        'itemName' => (string)$row['item_name'],
        'partNumber' => (string)($row['part_number'] ?? ''),
        'quantity' => (float)$row['quantity'],
        'unit' => (string)$row['unit'],
        'customerSite' => (string)($row['customer_site'] ?? ''),
        'machineRef' => (string)($row['machine_ref'] ?? ''),
        'purpose' => (string)($row['purpose'] ?? ''),
        'status' => (string)$row['status'],
        'requestedById' => (string)($row['requested_by_id'] ?? ''),
        'requestedByName' => (string)$row['requested_by_name'],
        'requestedByRole' => (string)($row['requested_by_role'] ?? ''),
        'submittedAt' => $row['submitted_at'] ?? null,
        'acknowledgedAt' => $row['acknowledged_at'] ?? null,
        'acknowledgedByName' => (string)($row['acknowledged_by_name'] ?? ''),
        'fulfilledAt' => $row['fulfilled_at'] ?? null,
        'fulfilledByName' => (string)($row['fulfilled_by_name'] ?? ''),
        'statusNote' => (string)($row['status_note'] ?? ''),
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
    ];
}

wmr_ensure_schema($pdo);
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$action = strtolower(trim((string)($_GET['action'] ?? 'list')));
$id = trim((string)($_GET['id'] ?? ''));
$userId = trim((string)($user['id'] ?? ''));
$userName = trim((string)($user['name'] ?? '')) ?: 'BELM User';
$userRole = wmr_role_name($user);

if ($method === 'GET' && $action === 'pending') {
    $blink = (int)$pdo->query("SELECT COUNT(*) FROM workshop_material_requests WHERE status='SUBMITTED'")->fetchColumn();
    $pending = (int)$pdo->query("SELECT COUNT(*) FROM workshop_material_requests WHERE status IN ('SUBMITTED','ACKNOWLEDGED')")->fetchColumn();
    json_out(['ok' => true, 'blinkCount' => $blink, 'pendingCount' => $pending, 'generatedAt' => date(DATE_ATOM)]);
}

if ($method === 'GET' && $action === 'pdf' && $id !== '') {
    $stmt = $pdo->prepare('SELECT * FROM workshop_material_requests WHERE id=? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Request not found.', 404);
    $summary = [
        'Request No: ' . $row['request_no'],
        'Date: ' . display_date_billing((string)$row['created_at']),
        'Type: ' . $row['category'],
        'Status: ' . $row['status'],
        'Requested by: ' . $row['requested_by_name'] . (($row['requested_by_role'] ?? '') !== '' ? ' (' . $row['requested_by_role'] . ')' : ''),
    ];
    $rows = [
        ['Item', (string)$row['item_name']],
        ['Part Number', (string)($row['part_number'] ?? '—')],
        ['Quantity', rtrim(rtrim(number_format((float)$row['quantity'], 2, '.', ''), '0'), '.') . ' ' . $row['unit']],
        ['Customer / Site', (string)($row['customer_site'] ?? '—')],
        ['Machine / Fleet', (string)($row['machine_ref'] ?? '—')],
        ['Purpose / Reason', (string)($row['purpose'] ?? '—')],
        ['Status Note', (string)($row['status_note'] ?? '—')],
    ];
    output_table_pdf('BELM-' . preg_replace('/[^A-Za-z0-9-]+/', '-', (string)$row['request_no']) . '.pdf', 'WORKSHOP MATERIAL REQUEST', $summary, $rows);
}

if ($method === 'GET' && $action === 'monthly-pdf') {
    $month = trim((string)($_GET['month'] ?? date('Y-m')));
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) json_error('Invalid month. Use YYYY-MM.', 422);
    $stmt = $pdo->prepare("SELECT * FROM workshop_material_requests WHERE TO_CHAR(created_at,'YYYY-MM')=? ORDER BY created_at ASC");
    $stmt->execute([$month]);
    $rows = $stmt->fetchAll() ?: [];
    $green = count(array_filter($rows, fn($r) => ($r['status'] ?? '') === 'FULFILLED'));
    $open = count(array_filter($rows, fn($r) => in_array(($r['status'] ?? ''), ['SUBMITTED','ACKNOWLEDGED'], true)));
    $draft = count(array_filter($rows, fn($r) => ($r['status'] ?? '') === 'DRAFT'));
    $pdfRows = [];
    foreach ($rows as $r) {
        $pdfRows[] = [
            (string)$r['request_no'],
            display_date_billing((string)$r['created_at']),
            (string)$r['category'],
            (string)$r['item_name'],
            rtrim(rtrim(number_format((float)$r['quantity'], 2, '.', ''), '0'), '.') . ' ' . $r['unit'],
            trim((string)($r['machine_ref'] ?? '')) ?: (trim((string)($r['customer_site'] ?? '')) ?: '—'),
            (string)$r['status'],
            (string)$r['requested_by_name'],
        ];
    }
    output_table_pdf(
        'BELM-Workshop-Requests-' . $month . '.pdf',
        'WORKSHOP MATERIAL REQUESTS - MONTHLY REPORT',
        ['Month: ' . $month, 'Total: ' . count($rows), 'Pending: ' . $open, 'Fulfilled: ' . $green, 'Draft: ' . $draft],
        $pdfRows
    );
}

if ($method === 'GET') {
    $month = trim((string)($_GET['month'] ?? ''));
    $status = strtoupper(trim((string)($_GET['status'] ?? '')));
    $category = strtoupper(trim((string)($_GET['category'] ?? '')));
    $where = ['1=1'];
    $params = [];
    if ($month !== '') {
        if (!preg_match('/^\d{4}-\d{2}$/', $month)) json_error('Invalid month. Use YYYY-MM.', 422);
        $where[] = "TO_CHAR(created_at,'YYYY-MM')=?";
        $params[] = $month;
    }
    if ($status !== '') {
        $where[] = 'status=?';
        $params[] = $status;
    }
    if ($category !== '') {
        $category = wmr_validate_category($category);
        $where[] = 'category=?';
        $params[] = $category;
    }
    $stmt = $pdo->prepare('SELECT * FROM workshop_material_requests WHERE ' . implode(' AND ', $where) . ' ORDER BY created_at DESC LIMIT 500');
    $stmt->execute($params);
    $rows = array_map('wmr_row_view', $stmt->fetchAll() ?: []);
    $blink = (int)$pdo->query("SELECT COUNT(*) FROM workshop_material_requests WHERE status='SUBMITTED'")->fetchColumn();
    $pending = (int)$pdo->query("SELECT COUNT(*) FROM workshop_material_requests WHERE status IN ('SUBMITTED','ACKNOWLEDGED')")->fetchColumn();
    json_out([
        'ok' => true,
        'requests' => $rows,
        'blinkCount' => $blink,
        'pendingCount' => $pending,
        'canProcess' => wmr_can_process($user),
        'currentUserId' => $userId,
        'currentUserName' => $userName,
        'currentUserRole' => $userRole,
        'generatedAt' => date(DATE_ATOM),
    ]);
}

if ($method === 'POST' && $action === 'save') {
    $b = body();
    $requestId = trim((string)($b['id'] ?? ''));
    $category = wmr_validate_category((string)($b['category'] ?? ''));
    $item = trim((string)($b['itemName'] ?? ''));
    $partNumber = trim((string)($b['partNumber'] ?? ''));
    $quantity = (float)($b['quantity'] ?? 0);
    $unit = trim((string)($b['unit'] ?? ''));
    $site = trim((string)($b['customerSite'] ?? ''));
    $machine = trim((string)($b['machineRef'] ?? ''));
    $purpose = trim((string)($b['purpose'] ?? ''));
    if ($item === '') json_error('Item / material name is required.', 422);
    if ($quantity <= 0) json_error('Quantity must be greater than zero.', 422);
    if ($unit === '') $unit = in_array($category, ['OIL','FUEL'], true) ? 'litres' : 'pcs';

    if ($requestId === '') {
        $requestId = uuid();
        $requestNo = wmr_request_no();
        $pdo->prepare('INSERT INTO workshop_material_requests(id,request_no,category,item_name,part_number,quantity,unit,customer_site,machine_ref,purpose,status,requested_by_id,requested_by_name,requested_by_role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,\'DRAFT\',?,?,?,?,NOW())')
            ->execute([$requestId,$requestNo,$category,$item,$partNumber ?: null,$quantity,$unit,$site ?: null,$machine ?: null,$purpose ?: null,$userId ?: null,$userName,$userRole,NOW()]);
    } else {
        $check = $pdo->prepare('SELECT requested_by_id,status FROM workshop_material_requests WHERE id=? LIMIT 1');
        $check->execute([$requestId]);
        $existing = $check->fetch();
        if (!$existing) json_error('Request not found.', 404);
        if (($existing['status'] ?? '') !== 'DRAFT') json_error('Only Draft requests can be edited.', 409);
        if (!wmr_can_process($user) && $userId !== '' && (string)($existing['requested_by_id'] ?? '') !== $userId) json_error('You can edit only your own Draft request.', 403);
        $pdo->prepare('UPDATE workshop_material_requests SET category=?,item_name=?,part_number=?,quantity=?,unit=?,customer_site=?,machine_ref=?,purpose=?,updated_at=NOW() WHERE id=?')
            ->execute([$category,$item,$partNumber ?: null,$quantity,$unit,$site ?: null,$machine ?: null,$purpose ?: null,$requestId]);
    }
    wmr_log($user, 'WORKSHOP_REQUEST_SAVED', $requestId, ['category' => $category, 'item' => $item]);
    $stmt = $pdo->prepare('SELECT * FROM workshop_material_requests WHERE id=?');
    $stmt->execute([$requestId]);
    json_out(['ok' => true, 'request' => wmr_row_view($stmt->fetch())]);
}

if ($method === 'POST' && $action === 'submit') {
    $b = body();
    $requestId = trim((string)($b['id'] ?? ''));
    if ($requestId === '') json_error('Save the request before submitting it.', 422);
    $stmt = $pdo->prepare('SELECT * FROM workshop_material_requests WHERE id=? LIMIT 1');
    $stmt->execute([$requestId]);
    $row = $stmt->fetch();
    if (!$row) json_error('Request not found.', 404);
    if (($row['status'] ?? '') !== 'DRAFT') json_error('This request has already been submitted.', 409);
    if (!wmr_can_process($user) && $userId !== '' && (string)($row['requested_by_id'] ?? '') !== $userId) json_error('You can submit only your own Draft request.', 403);
    $pdo->prepare("UPDATE workshop_material_requests SET status='SUBMITTED',submitted_at=NOW(),updated_at=NOW() WHERE id=?")->execute([$requestId]);
    wmr_log($user, 'WORKSHOP_REQUEST_SUBMITTED', $requestId, ['requestNo' => $row['request_no'], 'category' => $row['category'], 'item' => $row['item_name']]);
    json_out(['ok' => true, 'id' => $requestId, 'status' => 'SUBMITTED']);
}

if (($method === 'POST' || $method === 'PUT' || $method === 'PATCH') && $action === 'status' && $id !== '') {
    if (!wmr_can_process($user)) json_error('Store, Procurement or Workshop authorization is required.', 403);
    $b = body();
    $next = strtoupper(trim((string)($b['status'] ?? '')));
    if (!in_array($next, ['ACKNOWLEDGED','FULFILLED','REJECTED','CANCELLED'], true)) json_error('Invalid request status.', 422);
    $note = trim((string)($b['note'] ?? ''));
    $stmt = $pdo->prepare('SELECT * FROM workshop_material_requests WHERE id=? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Request not found.', 404);
    if (($row['status'] ?? '') === 'DRAFT') json_error('Submit the request before processing it.', 409);
    if (in_array(($row['status'] ?? ''), ['FULFILLED','REJECTED','CANCELLED'], true)) json_error('This request is already closed.', 409);
    if ($next === 'ACKNOWLEDGED') {
        $pdo->prepare("UPDATE workshop_material_requests SET status='ACKNOWLEDGED',acknowledged_at=NOW(),acknowledged_by_name=?,status_note=?,updated_at=NOW() WHERE id=?")
            ->execute([$userName,$note ?: null,$id]);
    } elseif ($next === 'FULFILLED') {
        $pdo->prepare("UPDATE workshop_material_requests SET status='FULFILLED',fulfilled_at=NOW(),fulfilled_by_name=?,status_note=?,updated_at=NOW() WHERE id=?")
            ->execute([$userName,$note ?: null,$id]);
    } else {
        $pdo->prepare('UPDATE workshop_material_requests SET status=?,status_note=?,updated_at=NOW() WHERE id=?')->execute([$next,$note ?: null,$id]);
    }
    wmr_log($user, 'WORKSHOP_REQUEST_' . $next, $id, ['requestNo' => $row['request_no'], 'note' => $note]);
    json_out(['ok' => true, 'id' => $id, 'status' => $next]);
}

json_error('Unsupported Workshop Material Request action.', 404);
