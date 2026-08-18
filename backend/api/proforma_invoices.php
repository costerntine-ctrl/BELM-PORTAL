<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/table_pdf_helper.php';
require_once __DIR__ . '/invoice_pdf_helper.php';
require_once __DIR__ . '/proforma_pdf_helper.php';
require_once __DIR__ . '/../config/mailer.php';

$user = require_auth();
require_page_access($user, 'billing');
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;
$action = $_GET['action'] ?? '';

belm_ensure_invoice_proforma_schema();

// Money is rounded to 2dp at every step (matches how the company's own
// paper invoices are written up) rather than left as raw floating point,
// so Subtotal/Discount/VAT/Grand Total always add up exactly on screen,
// in the PDF and in the database.
function compute_totals(array $items, float $discount, string $discountType, string $vatMode, float $vatRate = 18.0): array {
    $subtotal = round(array_sum(array_map(fn($i) => $i['qty'] * $i['unit_price'], $items)), 2);
    $discountAmount = $discountType === 'PERCENT'
        ? round($subtotal * (max(0, min(100, $discount)) / 100), 2)
        : round($discount, 2);
    $discountAmount = max(0, min($discountAmount, $subtotal));
    $vat = $vatMode === 'VAT' ? round(($subtotal - $discountAmount) * ($vatRate / 100), 2) : 0.0;
    return [
        'subtotal' => $subtotal,
        'discount' => $discountAmount,
        'vat' => $vat,
        'grandTotal' => round($subtotal - $discountAmount + $vat, 2),
    ];
}

function proforma_validate_items(array $items): void {
    if (count($items) === 0) json_error('Add at least one proforma item.');
    foreach ($items as $item) {
        if (trim((string)($item['description'] ?? '')) === '') json_error('Every proforma item needs a description.');
        if (!is_numeric($item['qty'] ?? null)
            || (float)$item['qty'] <= 0
            || floor((float)$item['qty']) !== (float)$item['qty']) {
            json_error('Proforma quantity must be a whole number greater than zero.');
        }
        if (!is_numeric($item['unitPrice'] ?? null) || (float)$item['unitPrice'] < 0) {
            json_error('Proforma price cannot be negative.');
        }
    }
}

if ($method === 'GET' && $action === 'export-one') {
    $proformaId = trim((string)($_GET['proformaId'] ?? ''));
    belm_output_proforma_document_pdf($proformaId);
}

if ($method === 'GET' && $action === 'export') {
    $stmt = db()->query(
        'SELECT p.invoice_no, p.date, p.discount, p.discount_type, p.vat_mode, p.vat_rate, c.name AS customer_name, p.id
         FROM proforma_invoices p JOIN customers c ON c.id = p.customer_id
         WHERE p.deleted_at IS NULL ORDER BY p.date DESC'
    );
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $itemsStmt = db()->prepare('SELECT qty, unit_price FROM proforma_invoice_items WHERE proforma_id = ?');
        $itemsStmt->execute([$row['id']]);
        $items = $itemsStmt->fetchAll();
        $totals = compute_totals($items, (float)$row['discount'], (string)$row['discount_type'], (string)$row['vat_mode'], (float)$row['vat_rate']);
        $rows[] = [
            $row['invoice_no'],
            $row['customer_name'],
            display_date_billing((string)$row['date']),
            'Total: TZS ' . number_format($totals['grandTotal'], 2),
            (string)($row['vat_mode'] ?? '—'),
        ];
    }
    output_table_pdf(
        'BELM-proforma-' . date('Ymd-His') . '.pdf',
        'BELM General Tech Service Limited — Proforma Invoices Report',
        ['Generated: ' . date('d/m/Y H:i'), 'Total records: ' . count($rows)],
        $rows
    );
}

if ($method === 'GET' && $action === 'pending-spare-requests') {
    $stmt = db()->query(
        "SELECT spr.id,spr.machine_id,spr.quantity,spr.description,spr.status,
                sp.part_number,sp.name AS part_name,sp.selling_price,
                c.id AS customer_id,c.name AS customer_name,
                m.brand,m.model,m.machine_type,m.serial_number,m.reg_number
         FROM spare_part_requests spr
         JOIN machines m ON m.id=spr.machine_id AND m.deleted_at IS NULL
         JOIN customers c ON c.id=m.customer_id AND c.deleted_at IS NULL AND c.is_active=1
         JOIN spare_parts sp ON sp.id=spr.spare_part_id AND sp.deleted_at IS NULL
         WHERE spr.status IN ('PENDING','PURCHASE_REQUIRED')
           AND NOT EXISTS (
             SELECT 1 FROM proforma_spare_request_links l
             JOIN proforma_invoices p ON p.id=l.proforma_id AND p.deleted_at IS NULL
             WHERE l.spare_request_id=spr.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM proforma_invoices p
             WHERE p.source_spare_request_id=spr.id AND p.deleted_at IS NULL
           )
         ORDER BY c.name ASC,m.model ASC,spr.created_at ASC"
    );
    $rows=$stmt->fetchAll();
    foreach($rows as &$row){
        $row['machine_label']=trim(($row['brand']??'').' '.($row['model']??'')) ?: ($row['machine_type']??'Machine');
    }
    unset($row);
    json_out($rows);
}

if ($method === 'GET' && $action === 'pending-job-cards') {
    // V337: Billing must see the same assignment that Engineering sees. Older
    // Service Requests can be ASSIGNED while the copied technician_id/name on
    // digital_job_cards is still blank. Derive the effective Technician from
    // the source Service Request instead of dropping that Job Card from the
    // Proforma queue. This is read-side recovery; normal Engineering sync will
    // still persist the copied assignment on the Job Card itself.
    $stmt = db()->query(
        "SELECT j.id,j.job_card_no,j.title,j.fault_description,j.customer_id,j.machine_id,
                COALESCE(j.technician_id,sr.assigned_to_id) AS technician_id,
                COALESCE(NULLIF(j.technician_name,''),u.name) AS technician_name,
                CASE
                  WHEN UPPER(COALESCE(j.status,'')) IN ('OPEN','RECEIVED') AND COALESCE(j.technician_id,sr.assigned_to_id) IS NOT NULL THEN 'ASSIGNED'
                  ELSE j.status
                END AS status,
                CASE
                  WHEN UPPER(COALESCE(j.billing_status,'')) IN ('','NOT_READY') AND COALESCE(j.technician_id,sr.assigned_to_id) IS NOT NULL THEN 'PROFORMA_PENDING'
                  ELSE j.billing_status
                END AS billing_status,
                j.created_at,j.updated_at,c.name AS customer_name,m.brand,m.model,m.machine_type,bc.status AS case_status,bc.source_type,
                CASE
                  WHEN UPPER(COALESCE(bc.source_type,''))<>'SERVICE_REQUEST' THEN 1
                  WHEN UPPER(COALESCE(j.status,''))='COMPLETED'
                       AND UPPER(COALESCE(bc.status,''))='COMPLETED'
                       AND NULLIF(TRIM(COALESCE(j.signed_copy_data,'')),'') IS NOT NULL THEN 1
                  ELSE 0
                END AS can_prepare,
                CASE
                  WHEN UPPER(COALESCE(bc.source_type,''))<>'SERVICE_REQUEST' THEN 'Ready to generate Proforma'
                  WHEN UPPER(COALESCE(j.status,''))<>'COMPLETED' THEN 'Complete Technician Job Card'
                  WHEN UPPER(COALESCE(bc.status,''))<>'COMPLETED' THEN 'Complete Workshop testing'
                  WHEN NULLIF(TRIM(COALESCE(j.signed_copy_data,'')),'') IS NULL THEN 'Upload customer-signed Job Card'
                  ELSE 'Ready to generate Proforma'
                END AS pending_reason
         FROM digital_job_cards j
         JOIN breakdown_cases bc ON bc.id=j.case_id
         JOIN customers c ON c.id=j.customer_id
         LEFT JOIN machines m ON m.id=j.machine_id
         LEFT JOIN service_requests sr ON bc.source_type='SERVICE_REQUEST' AND sr.id=bc.source_id
         LEFT JOIN users u ON u.id=sr.assigned_to_id
         WHERE UPPER(COALESCE(j.status,'')) IN ('OPEN','RECEIVED','ASSIGNED','IN_PROGRESS','WAITING_PARTS','TESTING','COMPLETED')
           AND (COALESCE(j.technician_id,sr.assigned_to_id) IS NOT NULL OR UPPER(COALESCE(j.billing_status,''))='PROFORMA_PENDING')
           AND NOT EXISTS (SELECT 1 FROM proforma_invoices p WHERE p.source_job_card_id=j.id AND p.deleted_at IS NULL)
         ORDER BY CASE WHEN UPPER(COALESCE(j.status,''))='COMPLETED' THEN 0 ELSE 1 END,j.updated_at DESC"
    );
    $rows=$stmt->fetchAll();
    foreach($rows as &$row){
        $row['proforma_code']=$row['job_card_no'];
        $row['proforma_status']='PENDING';
        $row['machine_label']=trim(($row['brand']??'').' '.($row['model']??'')) ?: ($row['machine_type']??'Machine');
        $row['can_prepare']=(bool)$row['can_prepare'];
        $spareStmt=db()->prepare(
            "SELECT bsr.part_number,bsr.spare_name AS description,bsr.quantity,bsr.unit,COALESCE(sp.selling_price,0) AS unit_price
             FROM breakdown_spare_requests bsr
             LEFT JOIN spare_parts sp ON UPPER(sp.part_number)=UPPER(bsr.part_number) AND sp.deleted_at IS NULL
             WHERE bsr.job_card_id=? AND UPPER(COALESCE(bsr.status,''))<>'REJECTED'
             ORDER BY bsr.requested_at ASC"
        );
        $spareStmt->execute([$row['id']]);
        $row['requested_spares']=$spareStmt->fetchAll();
    }
    unset($row);
    json_out($rows);
}

if ($method === 'GET') {
    $stmt = db()->query("SELECT p.*, c.name AS customer_name,
                i.id AS generated_invoice_id, i.invoice_no AS generated_invoice_no
         FROM proforma_invoices p
         JOIN customers c ON c.id = p.customer_id
         LEFT JOIN invoices i ON i.source_proforma_id=p.id AND i.deleted_at IS NULL AND i.status<>'CANCELLED'
         WHERE p.deleted_at IS NULL ORDER BY p.date DESC");
    $proformas = $stmt->fetchAll();
    foreach ($proformas as &$p) {
        $p['customer'] = ['id' => $p['customer_id'], 'name' => $p['customer_name']];
        unset($p['customer_name']);
        $stmt2 = db()->prepare('SELECT * FROM proforma_invoice_items WHERE proforma_id = ? ORDER BY "order" ASC');
        $stmt2->execute([$p['id']]);
        $p['items'] = $stmt2->fetchAll();
        $linkStmt = db()->prepare('SELECT spare_request_id FROM proforma_spare_request_links WHERE proforma_id=? ORDER BY spare_request_id');
        $linkStmt->execute([$p['id']]);
        $p['source_spare_request_ids'] = array_map(static fn(array $row): string => (string)$row['spare_request_id'], $linkStmt->fetchAll());
        if (!$p['source_spare_request_ids'] && !empty($p['source_spare_request_id'])) $p['source_spare_request_ids'] = [(string)$p['source_spare_request_id']];
        $p['totals'] = compute_totals($p['items'], (float)$p['discount'], (string)$p['discount_type'], $p['vat_mode'], (float)$p['vat_rate']);
    }
    json_out($proformas);
}

if ($method === 'POST') {
    $b = body();
    $items = $b['items'] ?? [];
    $customerId = trim((string)($b['customerId'] ?? ''));
    $date = trim((string)($b['date'] ?? ''));
    $vatMode = strtoupper(trim((string)($b['vatMode'] ?? 'VAT')));
    $vatRate = isset($b['vatRate']) ? (float)$b['vatRate'] : 18.0;
    $discountType = strtoupper(trim((string)($b['discountType'] ?? 'FIXED')));
    $discount = (float)($b['discount'] ?? 0);
    $notice = trim((string)($b['notice'] ?? ''));
    $paymentTerms = trim((string)($b['paymentTerms'] ?? ''));
    $deliveryTime = trim((string)($b['deliveryTime'] ?? ''));
    $quoteValidity = trim((string)($b['quoteValidity'] ?? ''));
    $machineId = trim((string)($b['machineId'] ?? ''));
    $sourceSpareRequestId = trim((string)($b['sourceSpareRequestId'] ?? ''));
    $sourceSpareRequestIds = array_values(array_unique(array_filter(array_map(static fn($value): string => trim((string)$value), is_array($b['sourceSpareRequestIds'] ?? null) ? $b['sourceSpareRequestIds'] : []))));
    if ($sourceSpareRequestId !== '' && !in_array($sourceSpareRequestId, $sourceSpareRequestIds, true)) array_unshift($sourceSpareRequestIds, $sourceSpareRequestId);
    if ($sourceSpareRequestId === '' && $sourceSpareRequestIds) $sourceSpareRequestId = $sourceSpareRequestIds[0];
    $sourceJobCardId = trim((string)($b['sourceJobCardId'] ?? ''));
    $sourceJobCardNo = '';

    if (!is_array($items)) $items = [];
    proforma_validate_items($items);
    if ($date === '' || DateTime::createFromFormat('Y-m-d', $date) === false) {
        json_error('Select a valid proforma date.');
    }
    if (!in_array($vatMode, ['VAT', 'NO_VAT'], true)) json_error('Invalid VAT mode.');
    if ($vatRate < 0 || $vatRate > 100) json_error('VAT rate must be between 0 and 100.');
    if (!in_array($discountType, ['FIXED', 'PERCENT'], true)) json_error('Invalid discount type.');
    if ($discount < 0) json_error('Discount cannot be negative.');
    if ($discountType === 'PERCENT' && $discount > 100) json_error('Percentage discount cannot exceed 100%.');
    $stmt = db()->prepare('SELECT 1 FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
    $stmt->execute([$customerId]);
    if (!$stmt->fetch()) json_error('Select an active customer.', 422);
    if ($machineId !== '') {
        $machineCheck = db()->prepare('SELECT 1 FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL');
        $machineCheck->execute([$machineId, $customerId]);
        if (!$machineCheck->fetch()) json_error('Selected machine does not belong to this customer.', 422);
    }
    if ($sourceSpareRequestIds) {
        $requestCheck = db()->prepare(
            'SELECT spr.machine_id FROM spare_part_requests spr
             JOIN machines m ON m.id = spr.machine_id
             WHERE spr.id = ? AND m.customer_id = ?'
        );
        $resolvedRequestMachine = $machineId;
        foreach ($sourceSpareRequestIds as $requestId) {
            $requestCheck->execute([$requestId, $customerId]);
            $requestMachine = $requestCheck->fetchColumn();
            if ($requestMachine === false) json_error('One of the selected spare requests was not found for this customer.', 422);
            $requestMachine = (string)$requestMachine;
            if ($resolvedRequestMachine !== '' && $requestMachine !== '' && $requestMachine !== $resolvedRequestMachine) {
                if (count($sourceSpareRequestIds) === 1) json_error('Selected machine does not match the source spare request.', 422);
                json_error('Selected spare requests must belong to the same customer and machine.', 422);
            }
            if ($resolvedRequestMachine === '' && $requestMachine !== '') $resolvedRequestMachine = $requestMachine;
        }
        $machineId = $resolvedRequestMachine;
    }

    if ($sourceJobCardId !== '') {
        $jobCheck=db()->prepare(
            "SELECT j.machine_id,j.job_card_no,j.status,j.signed_copy_data,bc.source_type,bc.status AS case_status
             FROM digital_job_cards j JOIN breakdown_cases bc ON bc.id=j.case_id
             WHERE j.id=? AND j.customer_id=?"
        );
        $jobCheck->execute([$sourceJobCardId,$customerId]);
        $sourceJob=$jobCheck->fetch();
        if(!$sourceJob) json_error('Source Job Card was not found for this customer.',422);
        $sourceJobCardNo=trim((string)($sourceJob['job_card_no']??''));
        if($machineId!=='' && (string)$sourceJob['machine_id']!==$machineId) json_error('Selected machine does not match the source Job Card.',422);
        if($machineId==='' && !empty($sourceJob['machine_id'])) $machineId=(string)$sourceJob['machine_id'];
        if(strtoupper((string)$sourceJob['source_type'])==='SERVICE_REQUEST') {
            if(strtoupper((string)$sourceJob['status'])!=='COMPLETED' || strtoupper((string)$sourceJob['case_status'])!=='COMPLETED' || empty($sourceJob['signed_copy_data'])) {
                json_error('Complete the Service Job Card, Workshop test and customer signed-copy upload before preparing a Proforma.',409);
            }
        }
        $duplicate=db()->prepare('SELECT invoice_no FROM proforma_invoices WHERE source_job_card_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1');
        $duplicate->execute([$sourceJobCardId]);
        $duplicateNo=$duplicate->fetchColumn();
        if($duplicateNo) json_error('An active Proforma already exists for this Job Card: '.$duplicateNo.'. Open/edit that Proforma instead of creating a duplicate.',409);
    }

    $subtotal = round(array_sum(array_map(fn($i) => (int)$i['qty'] * (float)$i['unitPrice'], $items)), 2);
    $discountAmount = $discountType === 'PERCENT' ? round($subtotal * ($discount / 100), 2) : $discount;
    if ($discountAmount > $subtotal) json_error('Discount cannot be greater than the subtotal.');

    $newId = uuid();
    // V346: every new commercial Proforma has its own permanent PI number.
    // The Job Card stays linked through source_job_card_id / Job Card Ref, but
    // it no longer replaces the Proforma number.
    $invoiceNo = belm_next_commercial_number('PI');
    $invoiceNoCheck=db()->prepare('SELECT 1 FROM proforma_invoices WHERE invoice_no=? AND deleted_at IS NULL LIMIT 1');
    $invoiceNoCheck->execute([$invoiceNo]);
    if($invoiceNoCheck->fetchColumn()) json_error('Proforma code '.$invoiceNo.' is already in use. Open that Proforma instead of creating a duplicate.',409);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            "INSERT INTO proforma_invoices
             (id, customer_id, invoice_no, date, vat_mode, vat_rate, discount, discount_type, notice, payment_terms, delivery_time, quote_validity, machine_id, source_spare_request_id, source_job_card_id, delivery_status, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',NOW())"
        )->execute([
            $newId, $customerId, $invoiceNo, $date, $vatMode, $vatRate, $discount, $discountType,
            $notice !== '' ? $notice : null, $paymentTerms !== '' ? $paymentTerms : null,
            $deliveryTime !== '' ? $deliveryTime : null, $quoteValidity !== '' ? $quoteValidity : null,
            $machineId !== '' ? $machineId : null, $sourceSpareRequestId !== '' ? $sourceSpareRequestId : null,
            $sourceJobCardId !== '' ? $sourceJobCardId : null,
        ]);
        $itemStmt = $pdo->prepare(
            'INSERT INTO proforma_invoice_items
             (id, proforma_id, section, part_number, description, qty, unit, unit_price, "order")
             VALUES (?,?,?,?,?,?,?,?,?)'
        );
        foreach ($items as $order => $item) {
            $itemStmt->execute([
                uuid(), $newId, $item['section'] ?? null, $item['partNumber'] ?? '',
                trim((string)$item['description']), (int)$item['qty'],
                $item['unit'] ?? 'PC', (float)$item['unitPrice'], $order,
            ]);
        }
        if ($sourceSpareRequestIds) {
            $linkInsert = $pdo->prepare('INSERT INTO proforma_spare_request_links(proforma_id,spare_request_id) VALUES(?,?) ON CONFLICT DO NOTHING');
            foreach ($sourceSpareRequestIds as $requestId) $linkInsert->execute([$newId, $requestId]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    if ($sourceJobCardId !== '') { belm_recompute_job_billing_status($sourceJobCardId); }
    log_activity($user, 'proforma-created', 'proforma', $newId, ['invoiceNo' => $invoiceNo]);
    json_out(['id' => $newId, 'invoiceNo' => $invoiceNo, 'sourceJobCardId' => $sourceJobCardId !== '' ? $sourceJobCardId : null, 'billingStatus' => $sourceJobCardId !== '' ? 'PROFORMA_READY' : null], 201);
}


if ($method === 'PUT' && $action === 'send') {
    if (!$id) json_error('Proforma ID is required.');
    $stmt = db()->prepare(
        'SELECT p.id, p.invoice_no, p.customer_id, p.machine_id, p.delivery_status,
                c.name AS customer_name
         FROM proforma_invoices p JOIN customers c ON c.id = p.customer_id
         WHERE p.id = ? AND p.deleted_at IS NULL'
    );
    $stmt->execute([$id]);
    $proforma = $stmt->fetch();
    if (!$proforma) json_error('Proforma not found.', 404);

    [$fullProforma, $items] = belm_load_proforma_document($id);
    $totals = belm_proforma_totals($fullProforma, $items);
    $portalUrl = rtrim(portal_base_url(), '/') . '/portal/dashboard';
    $subject = 'BELM Proforma Ready — ' . $proforma['invoice_no'];
    $bodyText = "BELM has prepared Proforma {$proforma['invoice_no']} for {$proforma['customer_name']}.\n\n"
        . 'Total: TZS ' . number_format((float)$totals['grandTotal'], 2) . "\n"
        . "Open your BELM Customer Portal to view/download the PDF and respond.\n"
        . $portalUrl . "\n\n"
        . "You can Accept the Proforma or Request Change from the portal.";

    $delivery = belm_send_customer_alert(
        (string)$proforma['customer_id'],
        $proforma['machine_id'] ? (string)$proforma['machine_id'] : null,
        ['admin', 'accounts'],
        $subject,
        $bodyText,
        'PROFORMA',
        (string)$id,
        (string)($user['name'] ?? 'BELM Accounts')
    );
    db()->prepare(
        "UPDATE proforma_invoices
         SET delivery_status = 'SENT', sent_at = NOW(), sent_by_id = ?, customer_response = NULL,
             customer_response_message = NULL, customer_responded_at = NULL
         WHERE id = ?"
    )->execute([$user['id'], $id]);
    db()->prepare(
        "UPDATE service_due_alerts SET status = 'PI_SENT', reviewed_at = NOW(), updated_at = NOW()
         WHERE draft_proforma_id = ? AND status = 'REVIEW'"
    )->execute([$id]);
    $jobLink=db()->prepare('SELECT source_job_card_id FROM proforma_invoices WHERE id=? AND deleted_at IS NULL');
    $jobLink->execute([$id]);
    $linkedJobId=(string)($jobLink->fetchColumn() ?: '');
    if ($linkedJobId !== '') belm_recompute_job_billing_status($linkedJobId);
    log_activity($user, 'proforma-sent', 'proforma', $id, ['invoiceNo' => $proforma['invoice_no']]);
    $emailDelivered = (int)($delivery['sent'] ?? 0) > 0;
    json_out([
        'ok' => true,
        'deliveryStatus' => 'SENT',
        'emailDelivered' => $emailDelivered,
        'recipients' => $delivery['recipients'] ?? [],
        'message' => $emailDelivered
            ? 'Proforma sent by email and published in the Customer Portal.'
            : 'Proforma published in the Customer Portal, but email delivery failed. Check customer email/SMTP settings.',
    ]);
}

if ($method === 'PUT') {
    $b = body();
    $generatedInvoice = db()->prepare("SELECT invoice_no FROM invoices WHERE source_proforma_id=? AND deleted_at IS NULL AND status<>'CANCELLED' ORDER BY created_at DESC LIMIT 1");
    $generatedInvoice->execute([$id]);
    $generatedInvoiceNo = $generatedInvoice->fetchColumn();
    if ($generatedInvoiceNo) json_error('This Proforma already generated Invoice '.$generatedInvoiceNo.'. Cancel that Invoice before changing the Proforma.', 409);

    require_edit_confirmation($user, $b);
    $items = $b['items'] ?? [];
    $vatMode = strtoupper(trim((string)($b['vatMode'] ?? '')));
    $vatRate = isset($b['vatRate']) ? (float)$b['vatRate'] : 18.0;
    $discountType = strtoupper(trim((string)($b['discountType'] ?? 'FIXED')));
    $discount = (float)($b['discount'] ?? 0);
    $notice = trim((string)($b['notice'] ?? ''));
    $paymentTerms = trim((string)($b['paymentTerms'] ?? ''));
    $deliveryTime = trim((string)($b['deliveryTime'] ?? ''));
    $quoteValidity = trim((string)($b['quoteValidity'] ?? ''));
    $machineId = trim((string)($b['machineId'] ?? ''));
    $sourceSpareRequestId = trim((string)($b['sourceSpareRequestId'] ?? ''));
    $sourceSpareRequestIds = array_values(array_unique(array_filter(array_map(static fn($value): string => trim((string)$value), is_array($b['sourceSpareRequestIds'] ?? null) ? $b['sourceSpareRequestIds'] : []))));
    if ($sourceSpareRequestId !== '' && !in_array($sourceSpareRequestId, $sourceSpareRequestIds, true)) array_unshift($sourceSpareRequestIds, $sourceSpareRequestId);

    if (!is_array($items) || count($items) === 0) json_error('Add at least one proforma item.');
    if (!in_array($vatMode, ['VAT', 'NO_VAT'], true)) json_error('Invalid VAT mode.');
    if ($vatRate < 0 || $vatRate > 100) json_error('VAT rate must be between 0 and 100.');
    if (!in_array($discountType, ['FIXED', 'PERCENT'], true)) json_error('Invalid discount type.');
    if ($discount < 0) json_error('Discount cannot be negative.');
    if ($discountType === 'PERCENT' && $discount > 100) json_error('Percentage discount cannot exceed 100%.');

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            "UPDATE proforma_invoices
             SET vat_mode=?, vat_rate=?, discount=?, discount_type=?, notice=?, payment_terms=?, delivery_time=?, quote_validity=?,
                 delivery_status='DRAFT', sent_at=NULL, sent_by_id=NULL, customer_response=NULL,
                 customer_response_message=NULL, customer_responded_at=NULL
             WHERE id=? AND deleted_at IS NULL"
        );
        $stmt->execute([
            $vatMode, $vatRate, $discount, $discountType,
            $notice !== '' ? $notice : null, $paymentTerms !== '' ? $paymentTerms : null,
            $deliveryTime !== '' ? $deliveryTime : null, $quoteValidity !== '' ? $quoteValidity : null,
            $id,
        ]);
        if ($stmt->rowCount() === 0) {
            $pdo->rollBack();
            json_error('Proforma invoice not found.', 404);
        }
        $pdo->prepare('DELETE FROM proforma_invoice_items WHERE proforma_id = ?')->execute([$id]);
        $itemStmt = $pdo->prepare(
            'INSERT INTO proforma_invoice_items
             (id, proforma_id, section, part_number, description, qty, unit, unit_price, "order")
             VALUES (?,?,?,?,?,?,?,?,?)'
        );
        $subtotal = 0;
        foreach ($items as $order => $item) {
            if (trim((string)($item['description'] ?? '')) === '') {
                throw new InvalidArgumentException('Every proforma item needs a description.');
            }
            if (!is_numeric($item['qty'] ?? null)
                || (float)$item['qty'] <= 0
                || floor((float)$item['qty']) !== (float)$item['qty']) {
                throw new InvalidArgumentException('Proforma quantity must be a whole number greater than zero.');
            }
            if (!is_numeric($item['unitPrice'] ?? null) || (float)$item['unitPrice'] < 0) {
                throw new InvalidArgumentException('Proforma price cannot be negative.');
            }
            $subtotal += (int)$item['qty'] * (float)$item['unitPrice'];
            $itemStmt->execute([
                uuid(), $id, $item['section'] ?? null, $item['partNumber'] ?? '',
                trim((string)$item['description']), (int)$item['qty'],
                $item['unit'] ?? 'PC', (float)$item['unitPrice'], $order,
            ]);
        }
        $discountAmount = $discountType === 'PERCENT' ? round($subtotal * ($discount / 100), 2) : $discount;
        if ($discountAmount > $subtotal) {
            throw new InvalidArgumentException('Discount cannot be greater than the subtotal.');
        }
        if (isset($sourceSpareRequestIds)) {
            $pdo->prepare('DELETE FROM proforma_spare_request_links WHERE proforma_id=?')->execute([$id]);
            if ($sourceSpareRequestIds) {
                $linkInsert = $pdo->prepare('INSERT INTO proforma_spare_request_links(proforma_id,spare_request_id) VALUES(?,?) ON CONFLICT DO NOTHING');
                foreach ($sourceSpareRequestIds as $requestId) $linkInsert->execute([$id, $requestId]);
            }
        }
        $pdo->commit();
    } catch (InvalidArgumentException $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        json_error($error->getMessage());
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    log_activity($user, 'proforma-edited', 'proforma', $id);
    json_out(['ok' => true]);
}

if ($method === 'DELETE') {
    $stmt = db()->prepare('SELECT invoice_no,source_job_card_id FROM proforma_invoices WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    $reason = require_delete_confirmation($user, body());
    send_to_trash('proformaInvoice', $id, $row['invoice_no'], $user['id'], $reason);
    soft_delete('proforma_invoices', $id);
    if (!empty($row['source_job_card_id'])) {
        $invoiceCheck=db()->prepare('SELECT 1 FROM invoices WHERE source_job_card_id=? AND deleted_at IS NULL LIMIT 1');
        $invoiceCheck->execute([(string)$row['source_job_card_id']]);
        belm_recompute_job_billing_status((string)$row['source_job_card_id']);
    }
    json_out(null, 204);
}

json_error('Unknown request', 404);
