<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/../config/mailer.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$id = trim((string)($_GET['id'] ?? ''));

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

function belm_procurement_schema_ready(): bool {
    $required = [
        'breakdown_spare_requests' => ['procurement_supplier_id','procurement_supplier_reference','procurement_note','procurement_ordered_at','procurement_expected_at','procurement_ordered_by_name'],
        'spare_part_requests' => ['procurement_order_status','procurement_supplier_id','procurement_supplier_reference','procurement_note','procurement_ordered_at','procurement_expected_at','procurement_ordered_by_name'],
        'customers' => ['is_machinery_admin'],
        'suppliers' => ['verified','website'],
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
    $metrics = [
        'waitingSourcing' => count(array_filter($jobs, fn($r) => ($r['status'] ?? '') === 'PROCUREMENT_REQUIRED'))
            + count(array_filter($inventory, fn($r) => ($r['procurement_order_status'] ?? '') !== 'ORDERED')),
        'waitingAccounts' => count(array_filter($jobs, fn($r) => ($r['status'] ?? '') === 'PI_WAITING_ACCOUNTS')),
        'ordered' => count(array_filter($jobs, fn($r) => ($r['status'] ?? '') === 'ORDERED'))
            + count(array_filter($inventory, fn($r) => ($r['procurement_order_status'] ?? '') === 'ORDERED')),
        'suppliers' => count($suppliers),
    ];
    json_out(['jobCardRequests' => $jobs, 'inventoryRequests' => $inventory, 'suppliers' => $suppliers, 'metrics' => $metrics]);
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
