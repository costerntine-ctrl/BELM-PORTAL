<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/../config/mailer.php';
require_once __DIR__ . '/table_pdf_helper.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$id = trim((string)($_GET['id'] ?? ''));
$actionQuery = strtolower(trim((string)($_GET['action'] ?? '')));

function belm_procurement_access(array $user): void {
    $role = strtolower(trim((string)($user['roleName'] ?? '')));
    if (in_array($role, ['super admin', 'procurement', 'engineer', 'workshop manager'], true)) return;
    $allowed = is_array($user['allowedPages'] ?? null) ? $user['allowedPages'] : [];
    foreach (['spare-parts', 'suppliers', 'job-cards', 'service-requests'] as $page) {
        if (in_array($page, $allowed, true)) return;
    }
    json_error('Your BELM role does not have Procurement access.', 403);
}

function belm_procurement_supplier(string $supplierId): array {
    if ($supplierId === '') json_error('Select a supplier before marking an order.');
    $stmt = db()->prepare('SELECT id,name,email,phone,website,location,verified FROM suppliers WHERE id=? AND deleted_at IS NULL');
    $stmt->execute([$supplierId]);
    $supplier = $stmt->fetch();
    if (!$supplier) json_error('Supplier not found.', 404);
    return $supplier;
}

function belm_procurement_order_payload(array $body): array {
    $supplierId = trim((string)($body['supplierId'] ?? ''));
    $reference = trim((string)($body['supplierReference'] ?? ''));
    $note = trim((string)($body['note'] ?? ''));
    $expectedAt = trim((string)($body['expectedAt'] ?? ''));
    if (strlen($reference) > 120) json_error('Supplier reference is too long.');
    if (strlen($note) > 500) json_error('Procurement note is too long.');
    if ($expectedAt !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $expectedAt)) json_error('Expected date is invalid.');
    $supplier = belm_procurement_supplier($supplierId);
    return [
        'supplier' => $supplier,
        'supplierId' => $supplierId,
        'reference' => $reference !== '' ? $reference : null,
        'note' => $note !== '' ? $note : null,
        'expectedAt' => $expectedAt !== '' ? $expectedAt : null,
    ];
}

belm_procurement_access($user);

function belm_procurement_audit_rows(): array {
    $rows = [];
    $jobStmt = db()->query(
        "SELECT bsr.id,bsr.status,bsr.spare_name,bsr.part_number,bsr.quantity,bsr.unit,bsr.requested_at,
                bsr.requested_by_name,bsr.procurement_ordered_at,bsr.procurement_expected_at,
                bsr.procurement_ordered_by_name,bsr.procurement_supplier_reference,bsr.procurement_note,
                c.name customer_name,m.brand,m.model,m.fleet_number,m.serial_number,jc.job_card_no,s.name supplier_name
         FROM breakdown_spare_requests bsr
         JOIN breakdown_cases bc ON bc.id=bsr.case_id
         JOIN customers c ON c.id=bc.customer_id
         LEFT JOIN machines m ON m.id=bc.machine_id
         LEFT JOIN digital_job_cards jc ON jc.id=bsr.job_card_id
         LEFT JOIN suppliers s ON s.id=bsr.procurement_supplier_id
         WHERE bsr.procurement_ordered_at IS NOT NULL OR bsr.procurement_supplier_id IS NOT NULL
            OR bsr.status IN ('PROCUREMENT_REQUIRED','PI_WAITING_ACCOUNTS','ORDERED')
         ORDER BY COALESCE(bsr.procurement_ordered_at,bsr.requested_at) DESC LIMIT 1200"
    );
    foreach ($jobStmt->fetchAll() as $r) {
        $rows[] = [
            'eventDate' => $r['procurement_ordered_at'] ?: $r['requested_at'],
            'type' => 'JOB CARD PROCUREMENT',
            'reference' => $r['job_card_no'] ?: $r['id'],
            'customer' => $r['customer_name'] ?: '—',
            'machine' => trim(($r['brand'] ?? '').' '.($r['model'] ?? '')).' '.(($r['fleet_number'] ?? '') ? '· '.$r['fleet_number'] : ''),
            'item' => trim(($r['part_number'] ? $r['part_number'].' - ' : '').($r['spare_name'] ?? 'Spare')),
            'quantity' => (string)$r['quantity'].' '.($r['unit'] ?: 'PC'),
            'status' => (string)$r['status'],
            'supplier' => $r['supplier_name'] ?: '—',
            'actor' => $r['procurement_ordered_by_name'] ?: ($r['requested_by_name'] ?: '—'),
            'expectedAt' => $r['procurement_expected_at'] ?: '',
            'note' => trim((string)($r['procurement_supplier_reference'] ?? '').' '.(string)($r['procurement_note'] ?? '')),
        ];
    }
    $invStmt = db()->query(
        "SELECT spr.id,spr.status,spr.quantity,spr.created_at,spr.requested_by_name,spr.reference_number,
                spr.procurement_order_status,spr.procurement_ordered_at,spr.procurement_expected_at,
                spr.procurement_ordered_by_name,spr.procurement_supplier_reference,spr.procurement_note,
                sp.part_number,sp.name part_name,m.brand,m.model,m.fleet_number,m.serial_number,c.name customer_name,s.name supplier_name
         FROM spare_part_requests spr
         LEFT JOIN spare_parts sp ON sp.id=spr.spare_part_id
         LEFT JOIN machines m ON m.id=spr.machine_id
         LEFT JOIN customers c ON c.id=m.customer_id
         LEFT JOIN suppliers s ON s.id=spr.procurement_supplier_id
         WHERE spr.procurement_ordered_at IS NOT NULL OR spr.procurement_supplier_id IS NOT NULL OR spr.status='PURCHASE_REQUIRED'
         ORDER BY COALESCE(spr.procurement_ordered_at,spr.created_at) DESC LIMIT 1200"
    );
    foreach ($invStmt->fetchAll() as $r) {
        $rows[] = [
            'eventDate' => $r['procurement_ordered_at'] ?: $r['created_at'],
            'type' => 'INVENTORY PROCUREMENT',
            'reference' => $r['reference_number'] ?: $r['id'],
            'customer' => $r['customer_name'] ?: 'BELM STOCK',
            'machine' => trim(($r['brand'] ?? '').' '.($r['model'] ?? '')).' '.(($r['fleet_number'] ?? '') ? '· '.$r['fleet_number'] : ''),
            'item' => trim(($r['part_number'] ? $r['part_number'].' - ' : '').($r['part_name'] ?? 'Spare')),
            'quantity' => (string)($r['quantity'] ?? 1).' PC',
            'status' => $r['procurement_order_status'] ?: $r['status'],
            'supplier' => $r['supplier_name'] ?: '—',
            'actor' => $r['procurement_ordered_by_name'] ?: ($r['requested_by_name'] ?: '—'),
            'expectedAt' => $r['procurement_expected_at'] ?: '',
            'note' => trim((string)($r['procurement_supplier_reference'] ?? '').' '.(string)($r['procurement_note'] ?? '')),
        ];
    }
    $conStmt = db()->query(
        "SELECT pc.category,pc.usage_date,pc.created_at,pc.description,pc.quantity,pc.unit,pc.total_cost,pc.recorded_by_name,
                c.name customer_name,m.brand,m.model,m.fleet_number FROM belm_procurement_consumables pc
         LEFT JOIN customers c ON c.id=pc.customer_id LEFT JOIN machines m ON m.id=pc.machine_id
         ORDER BY pc.created_at DESC LIMIT 1200"
    );
    foreach ($conStmt->fetchAll() as $r) {
        $rows[] = [
            'eventDate' => $r['created_at'] ?: $r['usage_date'], 'type' => (string)$r['category'],
            'reference' => (string)$r['usage_date'], 'customer' => $r['customer_name'] ?: 'BELM / General',
            'machine' => trim(($r['brand'] ?? '').' '.($r['model'] ?? '')).' '.(($r['fleet_number'] ?? '') ? '· '.$r['fleet_number'] : ''),
            'item' => (string)$r['description'], 'quantity' => (string)$r['quantity'].' '.($r['unit'] ?: ''),
            'status' => 'RECORDED', 'supplier' => '—', 'actor' => $r['recorded_by_name'] ?: '—', 'expectedAt' => '',
            'note' => 'TZS '.number_format((float)$r['total_cost'],2),
        ];
    }
    $recStmt = db()->query("SELECT reference_label,supplier_name,receipt_date,receipt_name,note,uploaded_by_name,created_at FROM belm_procurement_receipts ORDER BY created_at DESC LIMIT 1200");
    foreach ($recStmt->fetchAll() as $r) {
        $rows[] = [
            'eventDate' => $r['created_at'], 'type' => 'RECEIPT', 'reference' => $r['reference_label'] ?: $r['receipt_name'],
            'customer' => '—', 'machine' => '—', 'item' => $r['receipt_name'] ?: 'Supplier receipt', 'quantity' => '—',
            'status' => 'UPLOADED', 'supplier' => $r['supplier_name'] ?: '—', 'actor' => $r['uploaded_by_name'] ?: '—',
            'expectedAt' => $r['receipt_date'] ?: '', 'note' => $r['note'] ?: '',
        ];
    }
    usort($rows, fn($a,$b) => strcmp((string)$b['eventDate'], (string)$a['eventDate']));
    $from = trim((string)($_GET['from'] ?? '')); $to = trim((string)($_GET['to'] ?? ''));
    $type = strtoupper(trim((string)($_GET['type'] ?? ''))); $status = strtoupper(trim((string)($_GET['status'] ?? '')));
    $userFilter = mb_strtolower(trim((string)($_GET['user'] ?? ''))); $search = mb_strtolower(trim((string)($_GET['search'] ?? '')));
    return array_values(array_filter($rows, function($r) use($from,$to,$type,$status,$userFilter,$search){
        $day = substr((string)$r['eventDate'],0,10);
        if ($from !== '' && $day < $from) return false; if ($to !== '' && $day > $to) return false;
        if ($type !== '' && $type !== 'ALL' && strtoupper((string)$r['type']) !== $type) return false;
        if ($status !== '' && $status !== 'ALL' && strpos(strtoupper((string)$r['status']),$status) === false) return false;
        if ($userFilter !== '' && strpos(mb_strtolower((string)$r['actor']),$userFilter) === false) return false;
        if ($search !== '') {
            $hay = mb_strtolower(implode(' ',[(string)$r['reference'],(string)$r['customer'],(string)$r['machine'],(string)$r['item'],(string)$r['supplier'],(string)$r['note']]));
            if (strpos($hay,$search) === false) return false;
        }
        return true;
    }));
}

function belm_procurement_report_rows(): array {
    $rows = [];
    $jobStmt = db()->query("SELECT bsr.status,bsr.spare_name,bsr.part_number,bsr.quantity,bsr.unit,bsr.requested_at,bsr.procurement_ordered_at,c.name customer_name,m.brand,m.model,jc.job_card_no,s.name supplier_name FROM breakdown_spare_requests bsr JOIN breakdown_cases bc ON bc.id=bsr.case_id JOIN customers c ON c.id=bc.customer_id LEFT JOIN machines m ON m.id=bc.machine_id LEFT JOIN digital_job_cards jc ON jc.id=bsr.job_card_id LEFT JOIN suppliers s ON s.id=bsr.procurement_supplier_id WHERE bsr.status IN ('PROCUREMENT_REQUIRED','PI_WAITING_ACCOUNTS','ORDERED') ORDER BY bsr.requested_at DESC");
    foreach ($jobStmt->fetchAll() as $r) $rows[] = ['JOB CARD',$r['job_card_no'] ?: '—',$r['customer_name'] ?: '—',trim(($r['brand'] ?? '').' '.($r['model'] ?? '')) ?: '—',trim(($r['part_number'] ? $r['part_number'].' - ' : '').($r['spare_name'] ?? 'Spare')),$r['quantity'].' '.($r['unit'] ?: 'PC'),$r['status'],$r['supplier_name'] ?: '—'];
    $invStmt = db()->query("SELECT spr.status,spr.quantity,spr.reference_number,spr.procurement_order_status,sp.part_number,sp.name part_name,m.brand,m.model,c.name customer_name,s.name supplier_name FROM spare_part_requests spr LEFT JOIN spare_parts sp ON sp.id=spr.spare_part_id LEFT JOIN machines m ON m.id=spr.machine_id LEFT JOIN customers c ON c.id=m.customer_id LEFT JOIN suppliers s ON s.id=spr.procurement_supplier_id WHERE spr.status='PURCHASE_REQUIRED' ORDER BY spr.created_at DESC");
    foreach ($invStmt->fetchAll() as $r) $rows[] = ['INVENTORY',$r['reference_number'] ?: '—',$r['customer_name'] ?: 'BELM Stock',trim(($r['brand'] ?? '').' '.($r['model'] ?? '')) ?: '—',trim(($r['part_number'] ? $r['part_number'].' - ' : '').($r['part_name'] ?? 'Spare')),$r['quantity'].' PC',$r['procurement_order_status'] ?: $r['status'],$r['supplier_name'] ?: '—'];
    $conStmt = db()->query("SELECT pc.category,pc.usage_date,pc.description,pc.quantity,pc.unit,pc.unit_price,pc.total_cost,c.name customer_name,m.brand,m.model FROM belm_procurement_consumables pc LEFT JOIN customers c ON c.id=pc.customer_id LEFT JOIN machines m ON m.id=pc.machine_id ORDER BY pc.usage_date DESC,pc.created_at DESC LIMIT 500");
    foreach ($conStmt->fetchAll() as $r) $rows[] = [$r['category'],date('d/m/Y',strtotime($r['usage_date'])),$r['customer_name'] ?: 'BELM / General',trim(($r['brand'] ?? '').' '.($r['model'] ?? '')) ?: '—',$r['description'],$r['quantity'].' '.$r['unit'],'TZS '.number_format((float)$r['total_cost'],2),'—'];
    return $rows;
}

function belm_procurement_schema_ready(): bool {
    $required = [
        'breakdown_spare_requests' => ['procurement_supplier_id','procurement_supplier_reference','procurement_note','procurement_ordered_at','procurement_expected_at','procurement_ordered_by_name'],
        'spare_part_requests' => ['procurement_order_status','procurement_supplier_id','procurement_supplier_reference','procurement_note','procurement_ordered_at','procurement_expected_at','procurement_ordered_by_name'],
        'customers' => ['is_machinery_admin'],
        'suppliers' => ['verified','website'],
        'belm_procurement_consumables' => ['category','usage_date','quantity','unit_price','total_cost','recorded_by_name'],
        'belm_procurement_receipts' => ['source_type','request_id','receipt_data','receipt_mime','receipt_name','uploaded_by_name'],
    ];
    foreach ($required as $table => $columns) {
        $tableStmt = db()->prepare('SELECT to_regclass(?) IS NOT NULL');
        $tableStmt->execute(['public.' . $table]);
        if (!$tableStmt->fetchColumn()) return false;
        foreach ($columns as $column) {
            $stmt = db()->prepare("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=? AND column_name=?)");
            $stmt->execute([$table, $column]);
            if (!$stmt->fetchColumn()) return false;
        }
    }
    return true;
}

if (!belm_procurement_schema_ready()) {
    json_error('BELM Procurement database update is still being applied. Refresh in a few seconds.', 503);
}


if ($method === 'GET' && $actionQuery === 'audit') {
    $rows = belm_procurement_audit_rows();
    $summary = ['rows'=>count($rows),'ordered'=>0,'pending'=>0,'receipts'=>0,'fuelOil'=>0];
    foreach ($rows as $r) {
        $st = strtoupper((string)$r['status']); $tp = strtoupper((string)$r['type']);
        if (strpos($st,'ORDERED') !== false) $summary['ordered']++;
        if (strpos($st,'WAITING') !== false || strpos($st,'REQUIRED') !== false) $summary['pending']++;
        if ($tp === 'RECEIPT') $summary['receipts']++;
        if ($tp === 'FUEL' || $tp === 'OIL') $summary['fuelOil']++;
    }
    json_out(['rows'=>$rows,'summary'=>$summary]);
}
if ($method === 'GET' && $actionQuery === 'audit-csv') {
    $rows = belm_procurement_audit_rows();
    header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="BELM-Procurement-Audit-Report.csv"');
    $out=fopen('php://output','w'); fputcsv($out,['BELM PROCUREMENT AUDIT REPORT']); fputcsv($out,['Generated',date('d/m/Y H:i')]); fputcsv($out,[]);
    fputcsv($out,['Date','Type','Reference','Customer','Machine','Item','Quantity','Status','Supplier','Handled By','Expected/Receipt Date','Note']);
    foreach($rows as $r) fputcsv($out,[$r['eventDate'],$r['type'],$r['reference'],$r['customer'],$r['machine'],$r['item'],$r['quantity'],$r['status'],$r['supplier'],$r['actor'],$r['expectedAt'],$r['note']]); fclose($out); exit;
}
if ($method === 'GET' && $actionQuery === 'audit-pdf') {
    $table=[['DATE','TYPE','REFERENCE','CUSTOMER','MACHINE','ITEM','QTY','STATUS','SUPPLIER','HANDLED BY']];
    foreach(belm_procurement_audit_rows() as $r) $table[]=[substr((string)$r['eventDate'],0,16),$r['type'],$r['reference'],$r['customer'],$r['machine'],$r['item'],$r['quantity'],$r['status'],$r['supplier'],$r['actor']];
    output_table_pdf('BELM-Procurement-Audit-Report.pdf','BELM PROCUREMENT AUDIT REPORT',['Generated: '.date('d/m/Y H:i')],$table);
}

if ($method === 'GET' && $actionQuery === 'receipts') {
    $stmt = db()->query("SELECT id,source_type,request_id,reference_label,supplier_name,receipt_date,receipt_name,note,uploaded_by_name,created_at FROM belm_procurement_receipts ORDER BY receipt_date DESC,created_at DESC LIMIT 300");
    json_out($stmt->fetchAll());
}

if ($method === 'GET' && $actionQuery === 'receipt') {
    $receiptId = trim((string)($_GET['receiptId'] ?? ''));
    if ($receiptId === '') json_error('Receipt was not specified.');
    $stmt = db()->prepare('SELECT receipt_data,receipt_mime,receipt_name FROM belm_procurement_receipts WHERE id=?');
    $stmt->execute([$receiptId]); $r=$stmt->fetch();
    if (!$r) json_error('Receipt not found.',404);
    $binary=base64_decode((string)$r['receipt_data'],true); if($binary===false) json_error('Receipt file is damaged.',500);
    $mime=in_array($r['receipt_mime'],['image/jpeg','image/png','image/webp','application/pdf'],true)?$r['receipt_mime']:'application/octet-stream';
    header('Content-Type: '.$mime); header('Content-Length: '.strlen($binary));
    header('Content-Disposition: attachment; filename="'.preg_replace('/[^A-Za-z0-9._-]+/','-',(string)$r['receipt_name']).'"'); echo $binary; exit;
}

if ($method === 'GET' && $actionQuery === 'csv') {
    $rows=belm_procurement_report_rows();
    header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="BELM-Procurement-Report.csv"');
    $out=fopen('php://output','w'); fputcsv($out,['BELM PROCUREMENT REPORT']); fputcsv($out,['Generated',date('d/m/Y H:i')]); fputcsv($out,[]); fputcsv($out,['Type','Reference/Date','Customer','Machine','Item/Description','Quantity','Status/Cost','Supplier']); foreach($rows as $row) fputcsv($out,$row); fclose($out); exit;
}

if ($method === 'GET' && $actionQuery === 'pdf') {
    output_table_pdf('BELM-Procurement-Report.pdf','BELM PROCUREMENT REPORT',['Generated: '.date('d/m/Y H:i')],[['TYPE','REFERENCE','CUSTOMER','MACHINE','ITEM','QTY','STATUS/COST','SUPPLIER'],...belm_procurement_report_rows()]);
}

if ($method === 'POST' && $actionQuery === 'consumable') {
    $b=body(); $category=strtoupper(trim((string)($b['category']??''))); if(!in_array($category,['FUEL','OIL'],true)) json_error('Choose Fuel or Oil.');
    $customerId=trim((string)($b['customerId']??'')); $machineId=trim((string)($b['machineId']??'')); $date=trim((string)($b['date']??date('Y-m-d'))); $qty=(float)($b['quantity']??0); $unit=trim((string)($b['unit']??'L')); $unitPrice=(float)($b['unitPrice']??0); $desc=trim((string)($b['description']??($category==='FUEL'?'Fuel':'Oil')));
    if(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$date)) json_error('Enter a valid date.'); if($qty<=0) json_error('Quantity must be greater than zero.'); if($unitPrice<0) json_error('Unit price cannot be negative.');
    if($machineId!==''){ $st=db()->prepare('SELECT customer_id FROM machines WHERE id=? AND deleted_at IS NULL'); $st->execute([$machineId]); $mid=$st->fetchColumn(); if(!$mid) json_error('Machine not found.',404); if($customerId!=='' && $mid!==$customerId) json_error('Machine does not belong to selected customer.'); $customerId=(string)$mid; }
    if($customerId==='') $customerId=null; if($machineId==='') $machineId=null; $total=round($qty*$unitPrice,2); $actor=trim((string)($user['name']??'BELM Procurement'))?:'BELM Procurement'; $rid=uuid();
    db()->prepare('INSERT INTO belm_procurement_consumables(id,category,customer_id,machine_id,usage_date,description,quantity,unit,unit_price,total_cost,recorded_by_id,recorded_by_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NOW())')->execute([$rid,$category,$customerId,$machineId,$date,$desc!==''?$desc:$category,$qty,$unit!==''?$unit:'L',$unitPrice,$total,$user['id']??null,$actor]);
    log_activity($user,'procurement-consumable-recorded','belmProcurementConsumable',$rid,['category'=>$category,'quantity'=>$qty,'unit'=>$unit]); json_out(['ok'=>true,'id'=>$rid,'totalCost'=>$total],201);
}

if ($method === 'POST' && $actionQuery === 'receipt-upload') {
    $b=body(); $source=trim((string)($b['source']??'')); $requestId=trim((string)($b['requestId']??'')); if(!in_array($source,['job-card','inventory'],true)||$requestId==='') json_error('Select a Procurement order.');
    $receiptPhoto=trim((string)($b['receiptPhoto']??'')); $receiptName=trim((string)($b['receiptName']??'')); if($receiptPhoto==='') json_error('Choose a receipt file.'); [$data,$mime,$name]=validate_receipt_upload($receiptPhoto,$receiptName);
    $label=''; $supplier='';
    if($source==='job-card'){ $st=db()->prepare("SELECT bsr.spare_name,bsr.part_number,bsr.procurement_supplier_id,s.name supplier_name,jc.job_card_no FROM breakdown_spare_requests bsr LEFT JOIN suppliers s ON s.id=bsr.procurement_supplier_id LEFT JOIN digital_job_cards jc ON jc.id=bsr.job_card_id WHERE bsr.id=?"); $st->execute([$requestId]); $r=$st->fetch(); if(!$r) json_error('Procurement order not found.',404); $label=trim(($r['job_card_no']?:'Job Card').' · '.(($r['part_number']?$r['part_number'].' - ':'').$r['spare_name'])); $supplier=$r['supplier_name']?:''; }
    else { $st=db()->prepare("SELECT spr.reference_number,sp.part_number,sp.name part_name,s.name supplier_name FROM spare_part_requests spr LEFT JOIN spare_parts sp ON sp.id=spr.spare_part_id LEFT JOIN suppliers s ON s.id=spr.procurement_supplier_id WHERE spr.id=?"); $st->execute([$requestId]); $r=$st->fetch(); if(!$r) json_error('Procurement order not found.',404); $label=trim(($r['reference_number']?:'Inventory').' · '.(($r['part_number']?$r['part_number'].' - ':'').($r['part_name']?:'Spare'))); $supplier=$r['supplier_name']?:''; }
    $receiptDate=trim((string)($b['receiptDate']??date('Y-m-d'))); if(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$receiptDate)) json_error('Receipt date is invalid.'); $note=trim((string)($b['note']??'')); $actor=trim((string)($user['name']??'BELM Procurement'))?:'BELM Procurement'; $rid=uuid();
    db()->prepare('INSERT INTO belm_procurement_receipts(id,source_type,request_id,reference_label,supplier_name,receipt_date,receipt_data,receipt_mime,receipt_name,note,uploaded_by_id,uploaded_by_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NOW())')->execute([$rid,$source,$requestId,$label,$supplier,$receiptDate,$data,$mime,$name,$note!==''?$note:null,$user['id']??null,$actor]);
    log_activity($user,'procurement-receipt-uploaded','belmProcurementReceipt',$rid,['source'=>$source,'requestId'=>$requestId]); json_out(['ok'=>true,'id'=>$rid],201);
}

if ($method === 'GET') {
    $jobStmt = db()->query(
        "SELECT bsr.id,bsr.case_id,bsr.job_card_id,bsr.spare_name,bsr.part_number,bsr.quantity,bsr.unit,
                bsr.reason,bsr.status,bsr.requested_by_name,bsr.requested_at,bsr.approval_note,
                bsr.procurement_supplier_id,bsr.procurement_supplier_reference,bsr.procurement_note,
                bsr.procurement_ordered_at,bsr.procurement_expected_at,bsr.procurement_ordered_by_name,
                bc.source_type,bc.current_stage,bc.current_department,
                c.id AS customer_id,c.name AS customer_name,
                m.id AS machine_id,m.brand AS machine_brand,m.model AS machine_model,m.machine_type,
                m.serial_number,m.reg_number,m.fleet_number,
                jc.job_card_no,jc.technician_name,
                s.name AS supplier_name,s.phone AS supplier_phone,s.email AS supplier_email
         FROM breakdown_spare_requests bsr
         JOIN breakdown_cases bc ON bc.id=bsr.case_id
         JOIN customers c ON c.id=bc.customer_id AND c.deleted_at IS NULL
         JOIN machines m ON m.id=bc.machine_id AND m.deleted_at IS NULL
         LEFT JOIN digital_job_cards jc ON jc.id=bsr.job_card_id
         LEFT JOIN suppliers s ON s.id=bsr.procurement_supplier_id AND s.deleted_at IS NULL
         WHERE bsr.status IN ('PROCUREMENT_REQUIRED','PI_WAITING_ACCOUNTS','ORDERED')
           AND (c.is_machinery_admin=0 OR bc.source_type='SERVICE_REQUEST')
         ORDER BY CASE bsr.status WHEN 'PROCUREMENT_REQUIRED' THEN 0 WHEN 'PI_WAITING_ACCOUNTS' THEN 1 ELSE 2 END,
                  bsr.requested_at ASC"
    );

    $inventoryStmt = db()->query(
        "SELECT spr.id,spr.spare_part_id,spr.procurement_request_id,spr.machine_id,spr.quantity,spr.status,
                spr.requested_by_name,spr.description,spr.machine_type,spr.created_at,spr.reference_number,
                spr.procurement_order_status,spr.procurement_supplier_id,spr.procurement_supplier_reference,
                spr.procurement_note,spr.procurement_ordered_at,spr.procurement_expected_at,spr.procurement_ordered_by_name,
                sp.part_number,sp.name AS part_name,sp.stock_qty,sp.purchase_price,
                m.brand AS machine_brand,m.model AS machine_model,m.serial_number,m.reg_number,m.fleet_number,
                c.id AS customer_id,c.name AS customer_name,
                s.name AS supplier_name,s.phone AS supplier_phone,s.email AS supplier_email
         FROM spare_part_requests spr
         LEFT JOIN spare_parts sp ON sp.id=spr.spare_part_id
         LEFT JOIN machines m ON m.id=spr.machine_id
         LEFT JOIN customers c ON c.id=m.customer_id
         LEFT JOIN suppliers s ON s.id=spr.procurement_supplier_id AND s.deleted_at IS NULL
         WHERE spr.status='PURCHASE_REQUIRED'
         ORDER BY CASE WHEN spr.procurement_order_status='ORDERED' THEN 1 ELSE 0 END, spr.created_at ASC"
    );

    $supplierStmt = db()->query(
        "SELECT id,name,specialty,phone,email,website,location,verified
         FROM suppliers WHERE deleted_at IS NULL
         ORDER BY verified DESC,name ASC"
    );

    $jobs = $jobStmt->fetchAll();
    $inventory = $inventoryStmt->fetchAll();
    $suppliers = $supplierStmt->fetchAll();
    $machineStmt = db()->query("SELECT m.id,m.customer_id,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number,c.name customer_name FROM machines m JOIN customers c ON c.id=m.customer_id AND c.deleted_at IS NULL WHERE m.deleted_at IS NULL ORDER BY c.name,m.brand,m.model");
    $machines = $machineStmt->fetchAll();
    $consumableStmt = db()->query("SELECT pc.id,pc.category,pc.customer_id,pc.machine_id,pc.usage_date,pc.description,pc.quantity,pc.unit,pc.unit_price,pc.total_cost,pc.recorded_by_name,c.name customer_name,m.brand,m.model,m.fleet_number FROM belm_procurement_consumables pc LEFT JOIN customers c ON c.id=pc.customer_id LEFT JOIN machines m ON m.id=pc.machine_id ORDER BY pc.usage_date DESC,pc.created_at DESC LIMIT 100");
    $consumables = $consumableStmt->fetchAll();
    $receiptCount = (int)db()->query('SELECT COUNT(*) FROM belm_procurement_receipts')->fetchColumn();
    $metrics = [
        'waitingSourcing' => count(array_filter($jobs, fn($r) => ($r['status'] ?? '') === 'PROCUREMENT_REQUIRED'))
            + count(array_filter($inventory, fn($r) => ($r['procurement_order_status'] ?? '') !== 'ORDERED')),
        'waitingAccounts' => count(array_filter($jobs, fn($r) => ($r['status'] ?? '') === 'PI_WAITING_ACCOUNTS')),
        'ordered' => count(array_filter($jobs, fn($r) => ($r['status'] ?? '') === 'ORDERED'))
            + count(array_filter($inventory, fn($r) => ($r['procurement_order_status'] ?? '') === 'ORDERED')),
        'suppliers' => count($suppliers),
        'receipts' => $receiptCount,
    ];
    json_out(['jobCardRequests' => $jobs, 'inventoryRequests' => $inventory, 'suppliers' => $suppliers, 'machines' => $machines, 'consumables' => $consumables, 'metrics' => $metrics]);
}

if ($method === 'PUT') {
    if ($id === '') json_error('Procurement request ID is required.');
    $body = body();
    $source = strtolower(trim((string)($body['source'] ?? '')));
    $action = strtolower(trim((string)($body['action'] ?? '')));
    $actor = trim((string)($user['name'] ?? 'BELM Procurement')) ?: 'BELM Procurement';

    if ($source === 'job-card') {
        $stmt = db()->prepare(
            "SELECT bsr.*,bc.customer_id,bc.machine_id,bc.source_type,c.is_machinery_admin,
                    c.name AS customer_name,m.brand,m.model,jc.job_card_no
             FROM breakdown_spare_requests bsr
             JOIN breakdown_cases bc ON bc.id=bsr.case_id
             JOIN customers c ON c.id=bc.customer_id
             JOIN machines m ON m.id=bc.machine_id
             LEFT JOIN digital_job_cards jc ON jc.id=bsr.job_card_id
             WHERE bsr.id=?"
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) json_error('Job Card spare request not found.', 404);
        if (!empty($row['is_machinery_admin']) && strtoupper((string)$row['source_type']) !== 'SERVICE_REQUEST') {
            json_error('This spare belongs to the customer\'s private PORTAL-CWM workflow.', 403);
        }

        if ($action === 'send-accounts') {
            if (!in_array((string)$row['status'], ['PROCUREMENT_REQUIRED','PI_WAITING_ACCOUNTS'], true)) json_error('This spare is not waiting for Procurement.');
            $note = trim((string)($body['note'] ?? ''));
            if (strlen($note) > 500) json_error('Procurement note is too long.');
            db()->prepare("UPDATE breakdown_spare_requests SET status='PI_WAITING_ACCOUNTS',procurement_note=?,updated_at=NOW() WHERE id=?")
                ->execute([$note !== '' ? $note : null, $id]);
            db()->prepare("UPDATE breakdown_cases SET current_stage='ACCOUNTS',current_department='Accounts',blocker_reason='Waiting Accounts / PI clearance for BELM spare procurement.',stage_started_at=NOW(),updated_at=NOW() WHERE id=? AND status<>'COMPLETED'")
                ->execute([$row['case_id']]);
            db()->prepare("INSERT INTO breakdown_case_events(id,case_id,stage,department,action,note,actor_type,actor_id,actor_name,created_at) VALUES(?,?,'ACCOUNTS','Accounts','Procurement sent spare to Accounts',?,'belm',?,?,NOW())")
                ->execute([uuid(),$row['case_id'],$note !== '' ? $note : 'Waiting Accounts / PI clearance.',$user['id'] ?? null,$actor]);
            try {
                belm_send_staff_page_alert(['billing'], 'BELM PROCUREMENT - ACCOUNTS / PI ACTION',
                    'Procurement sent a Job Card spare to Accounts / PI.\nJob Card: '.($row['job_card_no'] ?: '—').'\nCustomer: '.$row['customer_name'].'\nSpare: '.$row['spare_name'].' x '.$row['quantity'].' '.$row['unit'].($note !== '' ? "\nNote: ".$note : ''));
            } catch (Throwable $ignored) {}
            log_activity($user, 'procurement-sent-accounts', 'breakdownSpareRequest', $id, ['caseId'=>$row['case_id']]);
            json_out(['ok'=>true,'status'=>'PI_WAITING_ACCOUNTS']);
        }

        if ($action === 'order') {
            if (!in_array((string)$row['status'], ['PROCUREMENT_REQUIRED','PI_WAITING_ACCOUNTS','ORDERED'], true)) json_error('This spare is not in the BELM Procurement queue.');
            $order = belm_procurement_order_payload($body);
            db()->prepare(
                "UPDATE breakdown_spare_requests
                 SET status='ORDERED',procurement_supplier_id=?,procurement_supplier_reference=?,procurement_note=?,
                     procurement_ordered_at=NOW(),procurement_expected_at=?,procurement_ordered_by_name=?,updated_at=NOW()
                 WHERE id=?"
            )->execute([$order['supplierId'],$order['reference'],$order['note'],$order['expectedAt'],$actor,$id]);
            $blocker = 'Spare ordered from ' . $order['supplier']['name'] . '; waiting BELM Store receipt.';
            db()->prepare("UPDATE breakdown_cases SET current_stage='PROCUREMENT',current_department='Procurement',blocker_reason=?,stage_started_at=NOW(),updated_at=NOW() WHERE id=? AND status<>'COMPLETED'")
                ->execute([$blocker,$row['case_id']]);
            db()->prepare("INSERT INTO breakdown_case_events(id,case_id,stage,department,action,note,actor_type,actor_id,actor_name,created_at) VALUES(?,?,'PROCUREMENT','Procurement','Spare ordered',?,'belm',?,?,NOW())")
                ->execute([uuid(),$row['case_id'],$blocker . ($order['reference'] ? ' Ref: '.$order['reference'] : ''),$user['id'] ?? null,$actor]);
            try {
                belm_send_staff_page_alert(['spare-parts'], 'BELM PROCUREMENT - ORDER PLACED',
                    'Order placed for '.$row['spare_name'].' x '.$row['quantity'].' '.$row['unit']."\nCustomer: ".$row['customer_name']."\nMachine: ".trim(($row['brand'] ?? '').' '.($row['model'] ?? ''))."\nSupplier: ".$order['supplier']['name']."\nStore: receive the part and mark Parts Ready when it arrives.");
            } catch (Throwable $ignored) {}
            json_out(['ok'=>true,'status'=>'ORDERED','supplierName'=>$order['supplier']['name']]);
        }
        json_error('Choose Send Accounts / PI or Mark Ordered.');
    }

    if ($source === 'inventory') {
        $stmt = db()->prepare(
            "SELECT spr.*,sp.part_number,sp.name AS part_name,m.brand,m.model,c.name AS customer_name
             FROM spare_part_requests spr
             LEFT JOIN spare_parts sp ON sp.id=spr.spare_part_id
             LEFT JOIN machines m ON m.id=spr.machine_id
             LEFT JOIN customers c ON c.id=m.customer_id
             WHERE spr.id=?"
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) json_error('Inventory purchase request not found.', 404);
        if ((string)$row['status'] !== 'PURCHASE_REQUIRED') json_error('This Inventory request is no longer waiting for purchase.', 409);

        if ($action === 'order') {
            $order = belm_procurement_order_payload($body);
            db()->prepare(
                "UPDATE spare_part_requests
                 SET procurement_order_status='ORDERED',procurement_supplier_id=?,procurement_supplier_reference=?,procurement_note=?,
                     procurement_ordered_at=NOW(),procurement_expected_at=?,procurement_ordered_by_name=?
                 WHERE id=? AND status='PURCHASE_REQUIRED'"
            )->execute([$order['supplierId'],$order['reference'],$order['note'],$order['expectedAt'],$actor,$id]);
            try {
                belm_send_staff_page_alert(['spare-parts'], 'BELM PROCUREMENT - INVENTORY ORDER PLACED',
                    'Order placed for '.(($row['part_number'] ?? '') ?: ($row['description'] ?? 'Spare')).' x '.($row['quantity'] ?? 1)."\nSupplier: ".$order['supplier']['name']."\nReceive this order into BELM Spare Parts Inventory when it arrives, then mark the request fulfilled.");
            } catch (Throwable $ignored) {}
            log_activity($user, 'procurement-ordered', 'sparePartRequest', $id, ['supplierId'=>$order['supplierId'],'supplierName'=>$order['supplier']['name']]);
            json_out(['ok'=>true,'status'=>'ORDERED','supplierName'=>$order['supplier']['name']]);
        }
        json_error('Choose Mark Ordered.');
    }

    json_error('Invalid Procurement source.');
}

json_error('Unknown Procurement request.', 404);
