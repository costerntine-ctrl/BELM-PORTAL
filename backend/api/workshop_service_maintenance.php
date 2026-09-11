<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/table_pdf_helper.php';

$user = require_auth();
if (!belm_user_has_named_role($user, ['Super Admin', 'Engineer', 'Workshop Manager'])) {
    require_any_page_access($user, ['customers', 'reports', 'service-requests']);
}

$pdo = db();
$section = strtolower(trim((string)($_GET['section'] ?? 'reports')));
$action = strtolower(trim((string)($_GET['action'] ?? '')));
$method = $_SERVER['REQUEST_METHOD'];

function wsm_table_exists(PDO $pdo, string $table): bool {
    $stmt = $pdo->prepare("SELECT to_regclass(?) IS NOT NULL");
    $stmt->execute(['public.' . $table]);
    return (bool)$stmt->fetchColumn();
}

function wsm_valid_date(string $value, string $label): ?string {
    $value = trim($value);
    if ($value === '') return null;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) json_error($label . ' must use YYYY-MM-DD.', 422);
    $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    if (!$dt || $dt->format('Y-m-d') !== $value) json_error($label . ' is invalid.', 422);
    return $value;
}

function wsm_customer_directory(PDO $pdo): array {
    $contractCustomers = [];
    if (wsm_table_exists($pdo, 'customer_contracts')) {
        $rows = $pdo->query("SELECT DISTINCT customer_id FROM customer_contracts
                             WHERE status='ACTIVE'
                               AND start_date <= CURRENT_DATE
                               AND end_date >= CURRENT_DATE")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($rows as $id) $contractCustomers[(string)$id] = true;
    }
    $rows = $pdo->query("SELECT id,name,is_active FROM customers WHERE deleted_at IS NULL ORDER BY name ASC")->fetchAll();
    return array_map(static function(array $row) use ($contractCustomers): array {
        $id = (string)$row['id'];
        return [
            'id' => $id,
            'name' => (string)$row['name'],
            'isActive' => !empty($row['is_active']),
            'customerType' => isset($contractCustomers[$id]) ? 'PERMANENT' : 'NON_PERMANENT',
        ];
    }, $rows);
}

function wsm_customer_map(array $customers): array {
    $out = [];
    foreach ($customers as $customer) $out[(string)$customer['id']] = $customer;
    return $out;
}

function wsm_selected_customer_ids(array $customers): array {
    $customerId = trim((string)($_GET['customerId'] ?? ''));
    $customerType = strtoupper(trim((string)($_GET['customerType'] ?? 'ALL')));
    if (!in_array($customerType, ['ALL','PERMANENT','NON_PERMANENT'], true)) $customerType = 'ALL';
    $ids = [];
    foreach ($customers as $customer) {
        if ($customerId !== '' && (string)$customer['id'] !== $customerId) continue;
        if ($customerType !== 'ALL' && (string)$customer['customerType'] !== $customerType) continue;
        $ids[] = (string)$customer['id'];
    }
    return $ids;
}

function wsm_in_clause(array $ids, array &$params, string $column): string {
    if (!$ids) return ' AND 1=0';
    $marks = implode(',', array_fill(0, count($ids), '?'));
    foreach ($ids as $id) $params[] = $id;
    return " AND {$column} IN ({$marks})";
}

function wsm_machine_label(array $row): string {
    $label = trim((string)($row['brand'] ?? '') . ' ' . (string)($row['model'] ?? ''));
    return $label !== '' ? $label : (string)($row['machine_type'] ?? 'Machine');
}

function wsm_date_in_range(?string $value, ?string $from, ?string $to): bool {
    if (!$value) return $from === null && $to === null;
    $date = substr((string)$value, 0, 10);
    if ($from !== null && $date < $from) return false;
    if ($to !== null && $date > $to) return false;
    return true;
}

function wsm_report_payload(PDO $pdo): array {
    $reportType = strtolower(trim((string)($_GET['reportType'] ?? 'maintenance')));
    if (!in_array($reportType, ['maintenance','breakdown','lube'], true)) $reportType = 'maintenance';
    $from = wsm_valid_date((string)($_GET['from'] ?? ''), 'From date');
    $to = wsm_valid_date((string)($_GET['to'] ?? ''), 'To date');
    if ($from !== null && $to !== null && $from > $to) json_error('From date cannot be after To date.', 422);

    $customers = wsm_customer_directory($pdo);
    $customerMap = wsm_customer_map($customers);
    $customerIds = wsm_selected_customer_ids($customers);
    $rows = [];

    if ($reportType === 'maintenance') {
        $params = [];
        $sql = "SELECT m.id,m.customer_id,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number,m.reg_number,m.service_history
                FROM machines m JOIN customers c ON c.id=m.customer_id
                WHERE m.deleted_at IS NULL AND c.deleted_at IS NULL";
        $sql .= wsm_in_clause($customerIds, $params, 'm.customer_id');
        $sql .= ' ORDER BY c.name,m.model,m.fleet_number';
        $stmt = $pdo->prepare($sql); $stmt->execute($params);
        foreach ($stmt->fetchAll() as $machine) {
            $history = !empty($machine['service_history']) ? json_decode((string)$machine['service_history'], true) : [];
            if (!is_array($history)) $history = [];
            foreach ($history as $entry) {
                if (!is_array($entry)) continue;
                $date = trim((string)($entry['date'] ?? ''));
                if (!wsm_date_in_range($date, $from, $to)) continue;
                $requirements = $entry['requirementsDone'] ?? [];
                if (is_array($requirements)) $requirements = implode(', ', array_map('strval', $requirements));
                $customer = $customerMap[(string)$machine['customer_id']] ?? ['name'=>'Unknown','customerType'=>'NON_PERMANENT'];
                $rows[] = [
                    'id' => trim((string)($entry['reportId'] ?? '')) ?: 'MNT-' . substr(sha1((string)$machine['id'].'|'.$date.'|'.(string)($entry['serviceType'] ?? '')),0,14),
                    'date' => $date,
                    'customerId' => (string)$machine['customer_id'],
                    'customer' => (string)$customer['name'],
                    'customerType' => (string)$customer['customerType'],
                    'machineId' => (string)$machine['id'],
                    'machine' => wsm_machine_label($machine),
                    'fleetNumber' => (string)($machine['fleet_number'] ?? ''),
                    'serialNumber' => (string)($machine['serial_number'] ?? ''),
                    'serviceType' => (string)($entry['serviceType'] ?? 'Service / Maintenance'),
                    'hourMeter' => isset($entry['hourMeterReading']) ? (float)$entry['hourMeterReading'] : (isset($entry['hoursAtService']) ? (float)$entry['hoursAtService'] : null),
                    'recordedBy' => (string)($entry['recordedBy'] ?? 'Not recorded'),
                    'details' => trim((string)$requirements),
                    'status' => 'COMPLETED',
                ];
            }
        }
        usort($rows, static fn(array $a,array $b): int => strcmp((string)$b['date'], (string)$a['date']));
    }

    if ($reportType === 'breakdown') {
        if (wsm_table_exists($pdo, 'breakdown_cases')) {
            $params = [];
            $sql = "SELECT bc.id,bc.customer_id,bc.machine_id,bc.status,bc.current_stage,bc.current_department,bc.blocker_reason,
                           bc.source_type,bc.opened_at,bc.closed_at,bc.updated_at,
                           c.name AS customer_name,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number,m.reg_number
                    FROM breakdown_cases bc
                    JOIN customers c ON c.id=bc.customer_id
                    JOIN machines m ON m.id=bc.machine_id
                    WHERE c.deleted_at IS NULL AND m.deleted_at IS NULL";
            $sql .= wsm_in_clause($customerIds, $params, 'bc.customer_id');
            if ($from !== null) { $sql .= ' AND bc.opened_at::date >= ?'; $params[] = $from; }
            if ($to !== null) { $sql .= ' AND bc.opened_at::date <= ?'; $params[] = $to; }
            $sql .= ' ORDER BY bc.opened_at DESC';
            $stmt = $pdo->prepare($sql); $stmt->execute($params);
            foreach ($stmt->fetchAll() as $row) {
                $customer = $customerMap[(string)$row['customer_id']] ?? ['name'=>$row['customer_name'],'customerType'=>'NON_PERMANENT'];
                $rows[] = [
                    'id'=>(string)$row['id'], 'date'=>substr((string)($row['opened_at'] ?? ''),0,10),
                    'customerId'=>(string)$row['customer_id'],'customer'=>(string)$customer['name'],'customerType'=>(string)$customer['customerType'],
                    'machineId'=>(string)$row['machine_id'],'machine'=>wsm_machine_label($row),'fleetNumber'=>(string)($row['fleet_number'] ?? ''),'serialNumber'=>(string)($row['serial_number'] ?? ''),
                    'serviceType'=>(string)($row['source_type'] ?? 'Breakdown Case'),'hourMeter'=>null,
                    'recordedBy'=>(string)($row['current_department'] ?? 'Workshop'),
                    'details'=>trim((string)($row['current_stage'] ?? '') . (($row['blocker_reason'] ?? '') !== '' ? ' · ' . (string)$row['blocker_reason'] : '')),
                    'status'=>(string)($row['status'] ?? 'OPEN'),'closedAt'=>$row['closed_at'] ?? null,
                ];
            }
        }
    }

    if ($reportType === 'lube') {
        if (wsm_table_exists($pdo, 'usage_logs')) {
            $params = [];
            $sql = "SELECT u.id,u.customer_id,u.machine_id,u.date,u.category,u.description,u.quantity,u.unit,u.unit_price,u.cost,u.logged_by,u.created_at,
                           c.name AS customer_name,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number,m.reg_number
                    FROM usage_logs u
                    JOIN customers c ON c.id=u.customer_id
                    JOIN machines m ON m.id=u.machine_id
                    WHERE c.deleted_at IS NULL AND m.deleted_at IS NULL
                      AND UPPER(COALESCE(u.category,'')) IN ('OIL','OIL_LUBS','LUBE','LUBRICANT','LUBRICANTS','GREASE')";
            $sql .= wsm_in_clause($customerIds, $params, 'u.customer_id');
            if ($from !== null) { $sql .= ' AND u.date >= ?'; $params[] = $from; }
            if ($to !== null) { $sql .= ' AND u.date <= ?'; $params[] = $to; }
            $sql .= ' ORDER BY u.date DESC,u.created_at DESC';
            $stmt = $pdo->prepare($sql); $stmt->execute($params);
            foreach ($stmt->fetchAll() as $row) {
                $customer = $customerMap[(string)$row['customer_id']] ?? ['name'=>$row['customer_name'],'customerType'=>'NON_PERMANENT'];
                $qty = $row['quantity'] !== null ? (float)$row['quantity'] : null;
                $unit = trim((string)($row['unit'] ?? ''));
                $rows[] = [
                    'id'=>(string)$row['id'],'date'=>(string)$row['date'],'customerId'=>(string)$row['customer_id'],'customer'=>(string)$customer['name'],'customerType'=>(string)$customer['customerType'],
                    'machineId'=>(string)$row['machine_id'],'machine'=>wsm_machine_label($row),'fleetNumber'=>(string)($row['fleet_number'] ?? ''),'serialNumber'=>(string)($row['serial_number'] ?? ''),
                    'serviceType'=>(string)($row['category'] ?: 'LUBE'),'hourMeter'=>null,'recordedBy'=>(string)($row['logged_by'] ?? 'Not recorded'),
                    'details'=>trim((string)$row['description'] . ($qty !== null ? ' · ' . rtrim(rtrim(number_format($qty,2,'.',''),'0'),'.') . ($unit !== '' ? ' '.$unit : '') : '')),
                    'status'=>'RECORDED','quantity'=>$qty,'unit'=>$unit,'unitPrice'=>(float)($row['unit_price'] ?? 0),'cost'=>(float)($row['cost'] ?? 0),
                ];
            }
        }
    }

    $customerId = trim((string)($_GET['customerId'] ?? ''));
    $customerType = strtoupper(trim((string)($_GET['customerType'] ?? 'ALL')));
    if (!in_array($customerType,['ALL','PERMANENT','NON_PERMANENT'],true)) $customerType='ALL';
    return [
        'ok'=>true,'reportType'=>$reportType,'from'=>$from,'to'=>$to,
        'customerId'=>$customerId,'customerType'=>$customerType,
        'customers'=>$customers,'rows'=>$rows,'total'=>count($rows),'generatedAt'=>gmdate('c'),
    ];
}

function wsm_csv_cell($value): string {
    $text = (string)($value ?? '');
    return '"' . str_replace('"','""',$text) . '"';
}

function wsm_output_report_export(array $data, string $format): void {
    $typeLabels = ['maintenance'=>'Maintenance Report','breakdown'=>'Breakdown Case Report','lube'=>'Lube Use Report'];
    $title = $typeLabels[$data['reportType']] ?? 'Service & Maintenance Report';
    $customerLabel = 'All customers';
    if ($data['customerId'] !== '') {
        foreach ($data['customers'] as $c) if ((string)$c['id'] === $data['customerId']) { $customerLabel = (string)$c['name']; break; }
    }
    if ($data['customerType'] !== 'ALL') $customerLabel .= ' · ' . str_replace('_',' ', $data['customerType']);
    $period = ($data['from'] ?: 'Beginning') . ' to ' . ($data['to'] ?: 'Today');
    if ($format === 'csv') {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="BELM-' . $data['reportType'] . '-report.csv"');
        echo implode(',', array_map('wsm_csv_cell',['Date','Customer','Customer Type','Machine','Fleet No.','Type','Details','Status','Recorded By','Amount/Cost'])) . "\r\n";
        foreach ($data['rows'] as $row) {
            echo implode(',', array_map('wsm_csv_cell',[
                $row['date'] ?? '',$row['customer'] ?? '',$row['customerType'] ?? '',$row['machine'] ?? '',$row['fleetNumber'] ?? '',$row['serviceType'] ?? '',$row['details'] ?? '',$row['status'] ?? '',$row['recordedBy'] ?? '',$row['cost'] ?? ''
            ])) . "\r\n";
        }
        exit;
    }
    $pdfRows = [];
    $pdfRows[] = ['DATE','CUSTOMER','MACHINE','TYPE / DETAILS','STATUS'];
    foreach ($data['rows'] as $row) {
        $pdfRows[] = [
            (string)($row['date'] ?? '—'),
            (string)($row['customer'] ?? '—') . ' [' . (string)($row['customerType'] ?? '') . ']',
            trim((string)($row['machine'] ?? '—') . ' ' . ((string)($row['fleetNumber'] ?? '') !== '' ? '#'.(string)$row['fleetNumber'] : '')),
            trim((string)($row['serviceType'] ?? '') . ' · ' . (string)($row['details'] ?? '')),
            (string)($row['status'] ?? '—'),
        ];
    }
    output_table_pdf('BELM-' . $data['reportType'] . '-report.pdf', $title, ['Customer: '.$customerLabel,'Period: '.$period,'Records: '.count($data['rows']),'Generated: '.date('d/m/Y H:i')], $pdfRows);
}

function wsm_ensure_petty_cash(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS belm_workshop_petty_cash_entries (
        id VARCHAR(64) PRIMARY KEY,entry_type VARCHAR(16) NOT NULL,amount NUMERIC(14,2) NOT NULL,
        category VARCHAR(80) NULL,description VARCHAR(255) NULL,reference VARCHAR(120) NULL,
        transaction_date DATE NULL,created_by VARCHAR(64) NULL,created_by_name VARCHAR(160) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )");
    $pdo->exec("ALTER TABLE belm_workshop_petty_cash_entries ADD COLUMN IF NOT EXISTS transaction_date DATE NULL");
    $pdo->exec("ALTER TABLE belm_workshop_petty_cash_entries ADD COLUMN IF NOT EXISTS customer_id VARCHAR(36) NULL");
    $pdo->exec("ALTER TABLE belm_workshop_petty_cash_entries ADD COLUMN IF NOT EXISTS machine_id VARCHAR(36) NULL");
    $pdo->exec("ALTER TABLE belm_workshop_petty_cash_entries ADD COLUMN IF NOT EXISTS receipt_photo_data TEXT NULL");
    $pdo->exec("ALTER TABLE belm_workshop_petty_cash_entries ADD COLUMN IF NOT EXISTS receipt_photo_mime VARCHAR(60) NULL");
    $pdo->exec("ALTER TABLE belm_workshop_petty_cash_entries ADD COLUMN IF NOT EXISTS receipt_photo_name VARCHAR(255) NULL");
    $pdo->exec("ALTER TABLE belm_workshop_petty_cash_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NULL");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_belm_workshop_petty_cash_transaction_date ON belm_workshop_petty_cash_entries(transaction_date DESC)");
}

function wsm_petty_totals(PDO $pdo): array {
    $funded = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM belm_workshop_petty_cash_entries WHERE entry_type='FUND'")->fetchColumn();
    $used = (float)$pdo->query("SELECT COALESCE(SUM(amount),0) FROM belm_workshop_petty_cash_entries WHERE entry_type='EXPENSE'")->fetchColumn();
    return ['totalFunded'=>$funded,'totalUsed'=>$used,'balance'=>$funded-$used];
}

function wsm_receipt_payload(array $body): array {
    $dataUrl = trim((string)($body['receiptPhoto'] ?? ''));
    if ($dataUrl === '') return [null,null,null];
    if (!preg_match('#^data:(application/pdf|image/jpeg|image/png|image/webp);base64,(.+)$#s', $dataUrl, $m)) json_error('Receipt must be PDF, JPG, PNG or WebP.', 422);
    $binary = base64_decode($m[2], true);
    if ($binary === false) json_error('Receipt file is damaged.', 422);
    if (strlen($binary) > 8 * 1024 * 1024) json_error('Receipt must be 8 MB or smaller.', 422);
    $name = preg_replace('/[^A-Za-z0-9._-]+/','-',trim((string)($body['receiptName'] ?? 'receipt'))) ?: 'receipt';
    return [base64_encode($binary),(string)$m[1],substr($name,0,255)];
}

function wsm_validate_customer_machine(PDO $pdo, string $customerId, string $machineId): void {
    if ($machineId === '') return;
    $stmt = $pdo->prepare('SELECT customer_id FROM machines WHERE id=? AND deleted_at IS NULL LIMIT 1');
    $stmt->execute([$machineId]);
    $owner = $stmt->fetchColumn();
    if (!$owner) json_error('Selected machine was not found.', 422);
    if ($customerId !== '' && (string)$owner !== $customerId) json_error('Selected machine does not belong to the selected customer.', 422);
}

function wsm_petty_entries(PDO $pdo): array {
    $rows = $pdo->query("SELECT p.id,p.entry_type,p.amount,p.category,p.description,p.reference,p.transaction_date,p.customer_id,p.machine_id,
                                p.receipt_photo_mime,p.receipt_photo_name,p.created_by_name,p.created_at,p.updated_at,
                                c.name AS customer_name,m.brand,m.model,m.machine_type,m.fleet_number
                         FROM belm_workshop_petty_cash_entries p
                         LEFT JOIN customers c ON c.id=p.customer_id
                         LEFT JOIN machines m ON m.id=p.machine_id
                         ORDER BY COALESCE(p.transaction_date,p.created_at::date) DESC,p.created_at DESC LIMIT 500")->fetchAll();
    return array_map(static function(array $r): array {
        return [
            'id'=>(string)$r['id'],'type'=>(string)$r['entry_type'],'amount'=>(float)$r['amount'],'category'=>(string)($r['category'] ?? ''),'description'=>(string)($r['description'] ?? ''),'reference'=>(string)($r['reference'] ?? ''),
            'transactionDate'=>$r['transaction_date'] ?? null,'customerId'=>(string)($r['customer_id'] ?? ''),'customer'=>(string)($r['customer_name'] ?? ''),'machineId'=>(string)($r['machine_id'] ?? ''),
            'machine'=>isset($r['model']) ? wsm_machine_label($r) : '','fleetNumber'=>(string)($r['fleet_number'] ?? ''),'hasReceipt'=>!empty($r['receipt_photo_mime']),'receiptName'=>(string)($r['receipt_photo_name'] ?? ''),
            'createdBy'=>(string)($r['created_by_name'] ?? ''),'createdAt'=>$r['created_at'] ?? null,'updatedAt'=>$r['updated_at'] ?? null,
        ];
    }, $rows);
}

if ($section === 'reports') {
    $data = wsm_report_payload($pdo);
    if ($action === 'export') {
        $format = strtolower(trim((string)($_GET['format'] ?? 'pdf')));
        wsm_output_report_export($data, $format === 'csv' ? 'csv' : 'pdf');
    }
    json_out($data);
}

if ($section === 'petty-cash') {
    wsm_ensure_petty_cash($pdo);

    if ($method === 'GET' && $action === 'receipt') {
        $id = trim((string)($_GET['id'] ?? ''));
        $stmt = $pdo->prepare('SELECT receipt_photo_data,receipt_photo_mime,receipt_photo_name FROM belm_workshop_petty_cash_entries WHERE id=? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row || empty($row['receipt_photo_data']) || empty($row['receipt_photo_mime'])) json_error('Receipt not found.',404);
        $binary = base64_decode((string)$row['receipt_photo_data'], true);
        if ($binary === false) json_error('Receipt file is damaged.',500);
        header('Content-Type: '.(string)$row['receipt_photo_mime']);
        header('Content-Disposition: inline; filename="'.preg_replace('/[^A-Za-z0-9._-]+/','-',(string)($row['receipt_photo_name'] ?: 'receipt')).'"');
        header('Content-Length: '.strlen($binary));
        echo $binary; exit;
    }

    if ($method === 'GET' && $action === 'export') {
        $format = strtolower(trim((string)($_GET['format'] ?? 'pdf')));
        $entries = wsm_petty_entries($pdo); $totals = wsm_petty_totals($pdo);
        if ($format === 'csv') {
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="BELM-Workshop-Petty-Cash.csv"');
            echo implode(',',array_map('wsm_csv_cell',['Date','Type','Reference','Customer','Machine','Category','Description','Amount','Handled By','Receipt'])) . "\r\n";
            foreach ($entries as $e) echo implode(',',array_map('wsm_csv_cell',[$e['transactionDate'] ?: substr((string)$e['createdAt'],0,10),$e['type'],$e['reference'],$e['customer'],$e['machine'],$e['category'],$e['description'],$e['amount'],$e['createdBy'],$e['hasReceipt'] ? $e['receiptName'] : ''])) . "\r\n";
            exit;
        }
        $rows = [['DATE','TYPE / REF','CUSTOMER / MACHINE','DESCRIPTION','AMOUNT']];
        foreach ($entries as $e) $rows[]=[(string)($e['transactionDate'] ?: substr((string)$e['createdAt'],0,10)),(string)$e['type'].' '.(string)$e['reference'],trim((string)$e['customer'].' '.(string)$e['machine']),trim((string)$e['category'].' · '.(string)$e['description']),number_format((float)$e['amount'],2)];
        output_table_pdf('BELM-Workshop-Petty-Cash.pdf','BELM Workshop Petty Cash',['Balance: TZS '.number_format($totals['balance'],2),'Funded: TZS '.number_format($totals['totalFunded'],2),'Used: TZS '.number_format($totals['totalUsed'],2),'Generated: '.date('d/m/Y H:i')],$rows);
    }

    if ($method === 'POST' || $method === 'PUT') {
        $b = body();
        require_edit_confirmation($user, $b);
        $id = trim((string)($b['id'] ?? $_GET['id'] ?? ''));
        $editing = $method === 'PUT';
        if ($editing && $id === '') json_error('Entry id is required.',422);
        $type = strtoupper(trim((string)($b['type'] ?? 'EXPENSE')));
        if (!in_array($type,['FUND','EXPENSE'],true)) json_error('Entry type must be FUND or EXPENSE.',422);
        $amount = round((float)($b['amount'] ?? 0),2);
        if ($amount <= 0) json_error('Amount must be greater than zero.',422);
        $description = trim((string)($b['description'] ?? ''));
        $category = trim((string)($b['category'] ?? ''));
        $customerId = trim((string)($b['customerId'] ?? ''));
        $machineId = trim((string)($b['machineId'] ?? ''));
        $transactionDate = wsm_valid_date((string)($b['transactionDate'] ?? date('Y-m-d')), 'Transaction date') ?: date('Y-m-d');
        if ($description === '') json_error('Description is required.',422);
        if (mb_strlen($description)>255 || mb_strlen($category)>80) json_error('Petty Cash entry is too long.',422);
        wsm_validate_customer_machine($pdo,$customerId,$machineId);
        [$receiptData,$receiptMime,$receiptName] = wsm_receipt_payload($b);

        $old = null;
        if ($editing) {
            $stmt=$pdo->prepare('SELECT * FROM belm_workshop_petty_cash_entries WHERE id=? LIMIT 1');$stmt->execute([$id]);$old=$stmt->fetch();
            if (!$old) json_error('Petty Cash entry not found.',404);
            if ($receiptData === null && !empty($old['receipt_photo_data'])) { $receiptData=$old['receipt_photo_data'];$receiptMime=$old['receipt_photo_mime'];$receiptName=$old['receipt_photo_name']; }
        }

        $totals=wsm_petty_totals($pdo);
        $available=$totals['balance'];
        if ($editing && $old) {
            if ((string)$old['entry_type']==='EXPENSE') $available += (float)$old['amount'];
            if ((string)$old['entry_type']==='FUND') $available -= (float)$old['amount'];
        }
        if ($type==='EXPENSE' && $amount > $available + 0.005) json_error('Insufficient BELM Workshop Petty Cash balance.',422);

        $reference = trim((string)($b['reference'] ?? ''));
        if ($type==='EXPENSE' && (!$editing || $reference==='')) {
            $dt=new DateTimeImmutable($transactionDate);$prefix=$dt->format('d-m-y');
            $stmt=$pdo->prepare("SELECT reference FROM belm_workshop_petty_cash_entries WHERE entry_type='EXPENSE' AND transaction_date=? AND reference LIKE ?");
            $stmt->execute([$transactionDate,$prefix.'-%-VR']);$max=0;
            foreach($stmt->fetchAll(PDO::FETCH_COLUMN) as $ref) if(preg_match('/^'.preg_quote($prefix,'/').'-(\d+)-VR$/',(string)$ref,$m)) $max=max($max,(int)$m[1]);
            $reference=sprintf('%s-%02d-VR',$prefix,$max+1);
        }
        if ($type==='FUND' && $reference==='') $reference='PCF-'.date('Ymd-His');

        if ($editing) {
            $stmt=$pdo->prepare('UPDATE belm_workshop_petty_cash_entries SET entry_type=?,amount=?,category=?,description=?,reference=?,transaction_date=?,customer_id=?,machine_id=?,receipt_photo_data=?,receipt_photo_mime=?,receipt_photo_name=?,updated_at=NOW() WHERE id=?');
            $stmt->execute([$type,$amount,$category?:null,$description,$reference?:null,$transactionDate,$customerId?:null,$machineId?:null,$receiptData,$receiptMime,$receiptName,$id]);
            log_activity($user,'belm-workshop-petty-cash-edit','belmWorkshopPettyCash',$id,['amount'=>$amount,'type'=>$type,'customerId'=>$customerId,'machineId'=>$machineId]);
        } else {
            $id=uuid();
            $stmt=$pdo->prepare('INSERT INTO belm_workshop_petty_cash_entries(id,entry_type,amount,category,description,reference,transaction_date,customer_id,machine_id,receipt_photo_data,receipt_photo_mime,receipt_photo_name,created_by,created_by_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())');
            $stmt->execute([$id,$type,$amount,$category?:null,$description,$reference?:null,$transactionDate,$customerId?:null,$machineId?:null,$receiptData,$receiptMime,$receiptName,$user['id']??null,$user['name']??'BELM Workshop']);
            log_activity($user,'belm-workshop-petty-cash-'.strtolower($type),'belmWorkshopPettyCash',$id,['amount'=>$amount,'type'=>$type,'customerId'=>$customerId,'machineId'=>$machineId]);
        }
        json_out(['ok'=>true,'id'=>$id,'reference'=>$reference,'message'=>$editing?'Petty Cash entry updated.':($type==='FUND'?'Petty Cash deposit saved.':'Workshop expense saved.'),'totals'=>wsm_petty_totals($pdo)],$editing?200:201);
    }

    $customers=wsm_customer_directory($pdo);
    $machines=$pdo->query("SELECT m.id,m.customer_id,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number FROM machines m JOIN customers c ON c.id=m.customer_id WHERE m.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY c.name,m.model")->fetchAll();
    $machineRows=array_map(static fn(array $m):array=>['id'=>(string)$m['id'],'customerId'=>(string)$m['customer_id'],'label'=>wsm_machine_label($m),'fleetNumber'=>(string)($m['fleet_number']??''),'serialNumber'=>(string)($m['serial_number']??'')],$machines);
    json_out(['ok'=>true,'scope'=>'BELM_INTERNAL_WORKSHOP','owner'=>'BELM GENERAL TECH LTD',...wsm_petty_totals($pdo),'customers'=>$customers,'machines'=>$machineRows,'entries'=>wsm_petty_entries($pdo)]);
}

json_error('Unknown Service & Maintenance section.',404);
