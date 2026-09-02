<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/table_pdf_helper.php';
require_once __DIR__ . '/invoice_pdf_helper.php';

$user = require_auth();
require_page_access($user, 'billing');
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = $_GET['id'] ?? null;
$paymentId = $_GET['paymentId'] ?? null;

belm_ensure_invoice_proforma_schema();

function belm_sync_invoice_job_card(string $invoiceId): void {
    try {
        $stmt=db()->prepare('SELECT source_job_card_id FROM invoices WHERE id=?');
        $stmt->execute([$invoiceId]);
        $jobId=(string)($stmt->fetchColumn() ?: '');
        if($jobId !== '') belm_recompute_job_billing_status($jobId);
    } catch(Throwable $error) {
        error_log('Invoice to Job Card billing sync failed: '.$error->getMessage());
    }
}


// V212: Billing-only staff need a small, read-only lookup of customers and
// inventory items to prepare invoices/proformas. Do NOT make Billing depend on
// the separate Customers Manager or Spare Parts Manager permissions.
if ($method === 'GET' && $action === 'customer-lookup') {
    $stmt = db()->query(
        'SELECT id, name, email, phone, address, tin_number, vrn
         FROM customers
         WHERE deleted_at IS NULL AND is_active = 1
         ORDER BY name ASC'
    );
    $customers = $stmt->fetchAll();

    $machineStmt = db()->prepare(
        'SELECT id, machine_type, brand, model, serial_number, reg_number, fleet_number
         FROM machines
         WHERE customer_id = ? AND deleted_at IS NULL
         ORDER BY model ASC, created_at ASC'
    );
    foreach ($customers as &$customer) {
        $machineStmt->execute([$customer['id']]);
        $customer['machines'] = $machineStmt->fetchAll();
    }
    unset($customer);
    json_out($customers);
}

if ($method === 'GET' && $action === 'spare-lookup') {
    $stmt = db()->query(
        'SELECT id, part_number, reference_number, name, stock_qty, selling_price
         FROM spare_parts
         WHERE deleted_at IS NULL
         ORDER BY part_number ASC, name ASC'
    );
    json_out($stmt->fetchAll());
}

if ($method === 'GET' && $action === 'export-invoice') {
    $invoiceId = trim((string)($_GET['id'] ?? ''));
    if ($invoiceId === '') json_error('Invoice id is required.', 422);
    belm_output_invoice_document_pdf($invoiceId);
}


if ($method === 'GET' && $action === 'export-invoices') {
    $stmt = db()->query(
        'SELECT i.invoice_no, i.total, i.status, i.due_date, c.name AS customer_name,
                COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid
         FROM invoices i JOIN customers c ON c.id = i.customer_id
         WHERE i.deleted_at IS NULL ORDER BY i.created_at DESC'
    );
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $balance = (float)$row['total'] - (float)$row['paid'];
        $rows[] = [
            $row['invoice_no'],
            $row['customer_name'],
            'Total: TZS ' . number_format((float)$row['total'], 2),
            'Paid: TZS ' . number_format((float)$row['paid'], 2),
            'Balance: TZS ' . number_format($balance, 2),
            'Due: ' . display_date_billing((string)$row['due_date']),
            strtoupper((string)$row['status']),
        ];
    }
    output_table_pdf(
        'BELM-invoices-' . date('Ymd-His') . '.pdf',
        'BELM General Tech Service Limited — Invoices Report',
        ['Generated: ' . date('d/m/Y H:i'), 'Total records: ' . count($rows)],
        $rows
    );
}

if ($method === 'GET' && $action === 'export-payments') {
    $stmt = db()->query(
        "SELECT p.paid_at, p.amount, p.method, i.invoice_no, c.name AS customer_name,
                b.bank_name, b.account_name
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         JOIN customers c ON c.id = i.customer_id
         LEFT JOIN bank_accounts b ON b.id = p.bank_account_id
         ORDER BY p.paid_at DESC"
    );
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $rows[] = [
            display_date_billing((string)$row['paid_at']),
            $row['invoice_no'],
            $row['customer_name'],
            'TZS ' . number_format((float)$row['amount'], 2),
            (string)($row['method'] ?? '—'),
            $row['bank_name'] ? "{$row['bank_name']} ({$row['account_name']})" : '—',
        ];
    }
    output_table_pdf(
        'BELM-payments-' . date('Ymd-His') . '.pdf',
        'BELM General Tech Service Limited — Payments Report',
        ['Generated: ' . date('d/m/Y H:i'), 'Total records: ' . count($rows)],
        $rows
    );
}

function belm_invoice_totals_from_proforma(array $proforma, array $items): array {
    $subtotal = round(array_sum(array_map(static fn(array $item): float => (float)$item['qty'] * (float)$item['unit_price'], $items)), 2);
    $discountType = strtoupper((string)($proforma['discount_type'] ?? 'FIXED'));
    $discountValue = (float)($proforma['discount'] ?? 0);
    $discount = $discountType === 'PERCENT'
        ? round($subtotal * (max(0, min(100, $discountValue)) / 100), 2)
        : round(max(0, $discountValue), 2);
    $discount = min($discount, $subtotal);
    $vatRate = (float)($proforma['vat_rate'] ?? 18);
    $tax = strtoupper((string)($proforma['vat_mode'] ?? 'VAT')) === 'VAT'
        ? round(($subtotal - $discount) * ($vatRate / 100), 2)
        : 0.0;
    return [
        'subtotal' => $subtotal,
        'discount' => $discount,
        'discountType' => $discountType,
        'vatRate' => $vatRate,
        'tax' => $tax,
        'total' => round($subtotal - $discount + $tax, 2),
    ];
}

function validate_invoice_input(array $payload): array {
    $items = $payload['items'] ?? [];
    $isEditPayload = (($payload['action'] ?? '') === 'edit');
    if (!is_array($items) || count($items) === 0) json_error('Add at least one invoice item.');
    $customerId = trim((string)($payload['customerId'] ?? ''));
    $machineId = trim((string)($payload['machineId'] ?? ''));
    $sourceJobCardId = trim((string)($payload['sourceJobCardId'] ?? ''));
    $stmt = db()->prepare('SELECT 1 FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
    $stmt->execute([$customerId]);
    if (!$stmt->fetch()) json_error('Select an active customer.', 422);
    if ($machineId !== '') {
        $stmt = db()->prepare(
            'SELECT 1 FROM machines
             WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
        );
        $stmt->execute([$machineId, $customerId]);
        if (!$stmt->fetch()) json_error('Selected machine does not belong to this customer.', 422);
    }
    if ($sourceJobCardId !== '') {
        $jobCheck=db()->prepare(
            "SELECT j.machine_id,j.status,j.billing_status,j.signed_copy_data,bc.source_type,bc.status AS case_status
             FROM digital_job_cards j JOIN breakdown_cases bc ON bc.id=j.case_id
             WHERE j.id=? AND j.customer_id=?"
        );
        $jobCheck->execute([$sourceJobCardId,$customerId]);
        $sourceJob=$jobCheck->fetch();
        if(!$sourceJob) json_error('Source Job Card was not found for this customer.',422);
        if($machineId!=='' && (string)$sourceJob['machine_id']!==$machineId) json_error('Selected machine does not match the source Job Card.',422);
        if($machineId==='' && !empty($sourceJob['machine_id'])) $machineId=(string)$sourceJob['machine_id'];
        if(strtoupper((string)$sourceJob['source_type'])==='SERVICE_REQUEST') {
            if(strtoupper((string)$sourceJob['status'])!=='COMPLETED' || strtoupper((string)$sourceJob['case_status'])!=='COMPLETED' || empty($sourceJob['signed_copy_data'])) {
                json_error('Complete the Service Job Card, Workshop test and customer signed-copy upload before invoicing.',409);
            }
        }
    }
    $normalizedItems = [];
    $subtotal = 0.0;
    foreach ($items as $item) {
        $partNumber = trim((string)($item['partNumber'] ?? $item['part_number'] ?? ''));
        $description = trim((string)($item['description'] ?? ''));
        $quantity = $item['quantity'] ?? null;
        $unit = strtoupper(trim((string)($item['unit'] ?? 'PC'))) ?: 'PC';
        $unitPrice = $item['unitPrice'] ?? null;
        $sparePartId = trim((string)($item['sparePartId'] ?? ''));
        if ($description === '') json_error('Every invoice item needs a description.');
        if (!is_numeric($quantity)
            || (float)$quantity <= 0
            || floor((float)$quantity) !== (float)$quantity) {
            json_error('Invoice item quantity must be a whole number greater than zero.');
        }
        if (!is_numeric($unitPrice) || (float)$unitPrice < 0) {
            json_error('Invoice item price cannot be negative.');
        }
        if ($sparePartId !== '') {
            $partCheck = db()->prepare($isEditPayload
                ? 'SELECT 1 FROM spare_parts WHERE id = ?'
                : 'SELECT 1 FROM spare_parts WHERE id = ? AND deleted_at IS NULL');
            $partCheck->execute([$sparePartId]);
            if (!$partCheck->fetch()) json_error('Selected spare part was not found.', 422);
        }
        $lineTotal = (int)$quantity * (float)$unitPrice;
        $normalizedItems[] = [
            'partNumber' => $partNumber !== '' ? $partNumber : null,
            'description' => $description,
            'quantity' => (int)$quantity,
            'unit' => $unit,
            'unitPrice' => (float)$unitPrice,
            'lineTotal' => $lineTotal,
            'sparePartId' => $sparePartId !== '' ? $sparePartId : null,
        ];
        $subtotal += $lineTotal;
    }
    $tax = (float)($payload['tax'] ?? 0);
    if ($tax < 0) json_error('Tax cannot be negative.');
    $discount = (float)($payload['discount'] ?? 0);
    if ($discount < 0) json_error('Discount cannot be negative.');
    if ($discount > $subtotal + 0.005) json_error('Discount cannot be greater than the invoice subtotal.');
    $vatRate = (float)($payload['vatRate'] ?? 18);
    if ($vatRate < 0 || $vatRate > 100) json_error('VAT rate must be between 0 and 100.');
    $dueDate = trim((string)($payload['dueDate'] ?? ''));
    $notice = trim((string)($payload['notice'] ?? ''));
    $paymentTerms = trim((string)($payload['paymentTerms'] ?? ''));
    return [
        'customerId' => $customerId,
        'machineId' => $machineId !== '' ? $machineId : null,
        'sourceJobCardId' => $sourceJobCardId !== '' ? $sourceJobCardId : null,
        'dueDate' => $dueDate !== '' ? $dueDate : null,
        'notice' => $notice !== '' ? $notice : null,
        'paymentTerms' => $paymentTerms !== '' ? $paymentTerms : null,
        'items' => $normalizedItems,
        'subtotal' => $subtotal,
        'discount' => $discount,
        'vatRate' => $vatRate,
        'tax' => $tax,
        'total' => round($subtotal - $discount + $tax, 2),
    ];
}


function validated_payment_bank_id(array $payload): ?string {
    $bankAccountId = trim((string)($payload['bankAccountId'] ?? ''));
    if ($bankAccountId === '') return null;
    $stmt = db()->prepare(
        'SELECT 1 FROM bank_accounts
         WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
    );
    $stmt->execute([$bankAccountId]);
    if (!$stmt->fetch()) json_error('Selected bank account is not active.', 422);
    return $bankAccountId;
}

if ($method === 'POST' && $action === 'generate-from-proforma') {
    $b = body();
    $proformaId = trim((string)($b['proformaId'] ?? ''));
    $proformaNoInput = strtoupper(trim((string)($b['proformaNo'] ?? '')));
    if ($proformaId === '' && $proformaNoInput === '') json_error('Enter or select a PI Number to generate the Invoice from.', 422);

    if ($proformaId !== '') {
        $stmt = db()->prepare("SELECT p.* FROM proforma_invoices p WHERE p.id=? AND p.deleted_at IS NULL");
        $stmt->execute([$proformaId]);
    } else {
        $stmt = db()->prepare("SELECT p.* FROM proforma_invoices p WHERE UPPER(TRIM(p.invoice_no))=? AND p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT 1");
        $stmt->execute([$proformaNoInput]);
    }
    $proforma = $stmt->fetch();
    if (!$proforma) json_error('Proforma not found.', 404);
    $proformaId = (string)$proforma['id'];
    if (strtoupper((string)($proforma['customer_response'] ?? '')) === 'CHANGE_REQUESTED') {
        json_error('Customer requested changes to this Proforma. Re-edit and resend it before generating the Invoice.', 409);
    }

    $existing = db()->prepare("SELECT invoice_no FROM invoices WHERE source_proforma_id=? AND deleted_at IS NULL AND status<>'CANCELLED' ORDER BY created_at DESC LIMIT 1");
    $existing->execute([$proformaId]);
    $existingNo = $existing->fetchColumn();
    if ($existingNo) json_error('Invoice already exists for this Proforma: '.$existingNo.'.', 409);

    $sourceJobCardId = trim((string)($proforma['source_job_card_id'] ?? ''));
    if ($sourceJobCardId !== '') {
        $jobInvoice = db()->prepare("SELECT invoice_no FROM invoices WHERE source_job_card_id=? AND deleted_at IS NULL AND status<>'CANCELLED' ORDER BY created_at DESC LIMIT 1");
        $jobInvoice->execute([$sourceJobCardId]);
        $jobInvoiceNo = $jobInvoice->fetchColumn();
        if ($jobInvoiceNo) json_error('An active Invoice already exists for this Job Card: '.$jobInvoiceNo.'.', 409);
    }

    $itemsStmt = db()->prepare('SELECT part_number, description, qty, unit, unit_price FROM proforma_invoice_items WHERE proforma_id=? ORDER BY "order" ASC');
    $itemsStmt->execute([$proformaId]);
    $proformaItems = $itemsStmt->fetchAll();
    if (!$proformaItems) json_error('This Proforma has no items to copy.', 409);
    $totals = belm_invoice_totals_from_proforma($proforma, $proformaItems);

    $invoiceNo = belm_invoice_number_from_proforma((string)$proforma['invoice_no']);
    $newId = uuid();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            "INSERT INTO invoices
             (id, customer_id, machine_id, source_job_card_id, source_proforma_id, invoice_no,
              subtotal, discount, discount_type, vat_rate, tax, total, status, due_date, notice, payment_terms, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'UNPAID',?,?,?,NOW())"
        )->execute([
            $newId,
            $proforma['customer_id'],
            $proforma['machine_id'] ?: null,
            $sourceJobCardId !== '' ? $sourceJobCardId : null,
            $proformaId,
            $invoiceNo,
            $totals['subtotal'],
            $totals['discount'],
            $totals['discountType'],
            $totals['vatRate'],
            $totals['tax'],
            $totals['total'],
            null,
            $proforma['notice'] ?: null,
            $proforma['payment_terms'] ?: null,
        ]);
        $itemInsert = $pdo->prepare(
            'INSERT INTO invoice_items (id, invoice_id, part_number, description, quantity, unit, unit_price, line_total, spare_part_id) VALUES (?,?,?,?,?,?,?,?,?)'
        );
        $partLookup = $pdo->prepare('SELECT id FROM spare_parts WHERE UPPER(part_number)=UPPER(?) AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1');
        foreach ($proformaItems as $item) {
            $partNumber = trim((string)($item['part_number'] ?? ''));
            $sparePartId = null;
            if ($partNumber !== '') {
                $partLookup->execute([$partNumber]);
                $sparePartId = $partLookup->fetchColumn() ?: null;
            }
            $qty = (int)$item['qty'];
            $unitPrice = (float)$item['unit_price'];
            $itemInsert->execute([
                uuid(), $newId, $partNumber !== '' ? $partNumber : null, (string)$item['description'], $qty,
                (string)($item['unit'] ?: 'PC'), $unitPrice, round($qty * $unitPrice, 2), $sparePartId,
            ]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    belm_sync_invoice_job_card($newId);
    log_activity($user, 'invoice-generated-from-proforma', 'invoice', $newId, [
        'invoiceNo' => $invoiceNo,
        'proformaId' => $proformaId,
        'proformaNo' => $proforma['invoice_no'],
        'total' => $totals['total'],
    ]);
    json_out(['id' => $newId, 'invoiceNo' => $invoiceNo, 'proformaNo' => $proforma['invoice_no']], 201);
}

if ($method === 'GET' && !$action) {
    $customerId = $_GET['customerId'] ?? null;
    $status = $_GET['status'] ?? null;
    $sql = 'SELECT i.*, c.name AS customer_name, p.invoice_no AS source_proforma_no FROM invoices i JOIN customers c ON c.id = i.customer_id LEFT JOIN proforma_invoices p ON p.id=i.source_proforma_id WHERE i.deleted_at IS NULL';
    $params = [];
    if ($customerId) { $sql .= ' AND i.customer_id = ?'; $params[] = $customerId; }
    if ($status) { $sql .= ' AND i.status = ?'; $params[] = $status; }
    $sql .= ' ORDER BY i.created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $invoices = $stmt->fetchAll();
    foreach ($invoices as &$inv) {
        $inv['customer'] = ['id' => $inv['customer_id'], 'name' => $inv['customer_name']];
        unset($inv['customer_name']);
        $stmt2 = db()->prepare('SELECT * FROM invoice_items WHERE invoice_id = ?');
        $stmt2->execute([$inv['id']]);
        $inv['items'] = $stmt2->fetchAll();
        $stmt2 = db()->prepare(
            'SELECT p.*, b.bank_name, b.account_name
             FROM payments p
             LEFT JOIN bank_accounts b ON b.id = p.bank_account_id
             WHERE p.invoice_id = ?
             ORDER BY p.paid_at DESC'
        );
        $stmt2->execute([$inv['id']]);
        $inv['payments'] = $stmt2->fetchAll();
        $inv['paidAmount'] = array_sum(array_map(
            static fn(array $payment): float => (float)$payment['amount'],
            $inv['payments']
        ));
        $inv['balance'] = max(0, (float)$inv['total'] - $inv['paidAmount']);
    }
    json_out($invoices);
}

if ($method === 'POST' && !$action) {
    $b = body();
    $invoice = validate_invoice_input($b);
    if (!empty($invoice['sourceJobCardId'])) {
        $existingInvoice=db()->prepare("SELECT invoice_no FROM invoices WHERE source_job_card_id=? AND deleted_at IS NULL AND status<>'CANCELLED' ORDER BY created_at DESC LIMIT 1");
        $existingInvoice->execute([$invoice['sourceJobCardId']]);
        $existingNo=$existingInvoice->fetchColumn();
        if($existingNo) json_error('An active Invoice already exists for this Job Card: '.$existingNo.'. Open/edit that Invoice instead of creating a duplicate.',409);
    }
    $invoiceNo = belm_next_commercial_number('INV');
    $newId = uuid();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare("INSERT INTO invoices (id, customer_id, machine_id, source_job_card_id, invoice_no, subtotal, discount, discount_type, vat_rate, tax, total, status, due_date, notice, payment_terms, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'UNPAID',?,?,?,NOW())")
            ->execute([
                $newId,
                $invoice['customerId'],
                $invoice['machineId'],
                $invoice['sourceJobCardId'],
                $invoiceNo,
                $invoice['subtotal'],
                $invoice['discount'],
                'FIXED',
                $invoice['vatRate'],
                $invoice['tax'],
                $invoice['total'],
                $invoice['dueDate'],
                $invoice['notice'],
                $invoice['paymentTerms'],
            ]);
        $itemStmt = $pdo->prepare(
            'INSERT INTO invoice_items
             (id, invoice_id, part_number, description, quantity, unit, unit_price, line_total, spare_part_id)
             VALUES (?,?,?,?,?,?,?,?,?)'
        );
        foreach ($invoice['items'] as $item) {
            $itemStmt->execute([
                uuid(),
                $newId,
                $item['partNumber'],
                $item['description'],
                $item['quantity'],
                $item['unit'],
                $item['unitPrice'],
                $item['lineTotal'],
                $item['sparePartId'],
            ]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    belm_sync_invoice_job_card($newId);
    log_activity($user, 'invoice-created', 'invoice', $newId, ['invoiceNo' => $invoiceNo, 'total' => $invoice['total']]);
    json_out(['id' => $newId, 'invoiceNo' => $invoiceNo], 201);
}

if ($method === 'PUT' && !$action) {
    $b = body();
    if (($b['action'] ?? '') === 'edit') {
        // V351: Billing-authorized staff can Re-edit Invoices directly.
        // No Edit PIN is required; the edit is still authenticated and audit logged.
        $invoice = validate_invoice_input($b);
        if (!empty($invoice['sourceJobCardId'])) {
            $duplicateInvoice = db()->prepare("SELECT invoice_no FROM invoices WHERE source_job_card_id=? AND id<>? AND deleted_at IS NULL AND status<>'CANCELLED' ORDER BY created_at DESC LIMIT 1");
            $duplicateInvoice->execute([$invoice['sourceJobCardId'], $id]);
            $duplicateNo = $duplicateInvoice->fetchColumn();
            if ($duplicateNo) json_error('Another active Invoice already exists for this Job Card: '.$duplicateNo.'.',409);
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'SELECT status, source_job_card_id, source_proforma_id
                 FROM invoices
                 WHERE id = ? AND deleted_at IS NULL
                 FOR UPDATE'
            );
            $stmt->execute([$id]);
            $currentInvoice = $stmt->fetch();
            if (!$currentInvoice) {
                $pdo->rollBack();
                json_error('Invoice not found.', 404);
            }
            $currentStatus = (string)$currentInvoice['status'];
            $linkedProformaId = trim((string)($currentInvoice['source_proforma_id'] ?? ''));
            // V351: source_proforma_id remains as traceability only. It no longer
            // locks the Invoice commercial lines; an authorized re-edit is allowed.
            $oldSourceJobCardId = trim((string)($currentInvoice['source_job_card_id'] ?? ''));
            $stmt = $pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id = ?');
            $stmt->execute([$id]);
            $paid = (float)$stmt->fetchColumn();
            if ($paid > $invoice['total'] + 0.005) {
                $pdo->rollBack();
                json_error('Invoice total cannot be lower than payments already recorded.', 422);
            }
            $status = $currentStatus === 'CANCELLED'
                ? 'CANCELLED'
                : calculated_invoice_status($invoice['total'], $paid, $invoice['dueDate']);
            $pdo->prepare(
                'UPDATE invoices
                 SET customer_id=?, machine_id=?, source_job_card_id=?, subtotal=?, discount=?, vat_rate=?, tax=?, total=?,
                     status=?, due_date=?, notice=?, payment_terms=?
                 WHERE id=? AND deleted_at IS NULL'
            )->execute([
                $invoice['customerId'],
                $invoice['machineId'],
                $invoice['sourceJobCardId'],
                $invoice['subtotal'],
                $invoice['discount'],
                $invoice['vatRate'],
                $invoice['tax'],
                $invoice['total'],
                $status,
                $invoice['dueDate'],
                $invoice['notice'],
                $invoice['paymentTerms'],
                $id,
            ]);
            $pdo->prepare('DELETE FROM invoice_items WHERE invoice_id = ?')->execute([$id]);
            $itemStmt = $pdo->prepare(
                'INSERT INTO invoice_items
                 (id, invoice_id, part_number, description, quantity, unit, unit_price, line_total, spare_part_id)
                 VALUES (?,?,?,?,?,?,?,?,?)'
            );
            foreach ($invoice['items'] as $item) {
                $itemStmt->execute([
                    uuid(),
                    $id,
                    $item['partNumber'],
                    $item['description'],
                    $item['quantity'],
                    $item['unit'],
                    $item['unitPrice'],
                    $item['lineTotal'],
                    $item['sparePartId'],
                ]);
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        // Recompute both sides if an edit moves this Invoice from one Job Card
        // to another. Without this, the old Job Card can remain stuck at
        // INVOICE_OUTSTANDING/PAID even though it no longer owns the Invoice.
        belm_sync_invoice_job_card((string)$id);
        $newSourceJobCardId = trim((string)($invoice['sourceJobCardId'] ?? ''));
        if ($oldSourceJobCardId !== '' && $oldSourceJobCardId !== $newSourceJobCardId) {
            belm_recompute_job_billing_status($oldSourceJobCardId);
        }
        log_activity($user, 'invoice-edited', 'invoice', $id, [
            'status' => $status,
            'sourceProformaId' => $linkedProformaId !== '' ? $linkedProformaId : null,
            'independentReedit' => $linkedProformaId !== '',
        ]);
        json_out([
            'ok' => true,
            'status' => $status,
            'linkedProformaId' => $linkedProformaId !== '' ? $linkedProformaId : null,
            'message' => $linkedProformaId !== ''
                ? 'Invoice changes saved. The source Proforma remains unchanged.'
                : 'Invoice changes saved.',
        ]);
    }
    // V307: payment rows are the source of truth. A user may cancel an
    // invoice, but cannot manually force a paid/part-paid invoice back to
    // UNPAID/OVERDUE (or vice versa). Those states are always recalculated.
    $allowedStatuses = ['UNPAID', 'OVERDUE', 'CANCELLED'];
    $requestedStatus = strtoupper(trim((string)($b['status'] ?? '')));
    if (!in_array($requestedStatus, $allowedStatuses, true)) json_error('Invalid invoice status.');
    $machineId = trim((string)($b['machineId'] ?? ''));
    if ($machineId !== '') {
        $stmt = db()->prepare(
            'SELECT 1
             FROM invoices i
             JOIN machines m ON m.id = ?
             WHERE i.id = ? AND m.customer_id = i.customer_id
               AND m.deleted_at IS NULL AND i.deleted_at IS NULL'
        );
        $stmt->execute([$machineId, $id]);
        if (!$stmt->fetch()) json_error('Selected machine does not belong to the invoice customer.', 422);
    }
    $dueDate = $b['dueDate'] ?? null;
    $invoiceStmt = db()->prepare('SELECT total,status,source_job_card_id FROM invoices WHERE id=? AND deleted_at IS NULL');
    $invoiceStmt->execute([$id]);
    $invoiceRow = $invoiceStmt->fetch();
    if (!$invoiceRow) json_error('Invoice not found.', 404);
    $invoiceTotal = (float)$invoiceRow['total'];
    if (strtoupper((string)$invoiceRow['status']) === 'CANCELLED' && $requestedStatus !== 'CANCELLED') {
        json_error('A cancelled Invoice is final and cannot be reactivated. Create/use the replacement Invoice instead.',409);
    }
    $paidStmt = db()->prepare('SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id=?');
    $paidStmt->execute([$id]);
    $paidAmount = (float)$paidStmt->fetchColumn();
    if ($requestedStatus === 'CANCELLED') {
        if ($paidAmount > 0.005) {
            json_error('This Invoice has recorded payments. Reverse/delete the related Receipt/payment first before cancelling it.',409);
        }
        $status = 'CANCELLED';
    } else {
        $status = calculated_invoice_status($invoiceTotal, $paidAmount, $dueDate);
    }
    $stmt = db()->prepare('UPDATE invoices SET status=?, due_date=?, machine_id=? WHERE id=? AND deleted_at IS NULL');
    $stmt->execute([$status, $dueDate, $machineId !== '' ? $machineId : null, $id]);
    belm_sync_invoice_job_card((string)$id);
    log_activity($user, 'invoice-status-changed', 'invoice', $id, ['requestedStatus' => $requestedStatus, 'status' => $status]);
    json_out(['ok' => true, 'status' => $status]);
}

if ($method === 'DELETE' && !$action) {
    $stmt = db()->prepare('SELECT invoice_no,source_job_card_id FROM invoices WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    $reason = require_delete_confirmation($user, body());
    send_to_trash('invoice', $id, $row['invoice_no'], $user['id'], $reason);
    soft_delete('invoices', $id);
    if (!empty($row['source_job_card_id'])) {
        belm_recompute_job_billing_status((string)$row['source_job_card_id']);
    }
    json_out(null, 204);
}

if ($method === 'PUT' && $action === 'payment') {
    $b = body();
    $amount = (float)($b['amount'] ?? 0);
    if ($amount <= 0) json_error('Payment amount must be greater than zero.');
    if (!$paymentId) json_error('Payment not found.', 404);
    $bankAccountId = validated_payment_bank_id($b);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'SELECT total, status, due_date
             FROM invoices
             WHERE id = ? AND deleted_at IS NULL
             FOR UPDATE'
        );
        $stmt->execute([$id]);
        $invoice = $stmt->fetch();
        if (!$invoice) {
            $pdo->rollBack();
            json_error('Invoice not found.', 404);
        }
        if ($invoice['status'] === 'CANCELLED') {
            $pdo->rollBack();
            json_error('A cancelled invoice payment cannot be edited.', 422);
        }
        $stmt = $pdo->prepare(
            'SELECT id,receipt_id FROM payments
             WHERE id = ? AND invoice_id = ?
             FOR UPDATE'
        );
        $stmt->execute([$paymentId, $id]);
        $paymentRow = $stmt->fetch();
        if (!$paymentRow) {
            $pdo->rollBack();
            json_error('Payment not found for this invoice.', 404);
        }
        $stmt = $pdo->prepare(
            'SELECT COALESCE(SUM(amount),0)
             FROM payments
             WHERE invoice_id = ? AND id <> ?'
        );
        $stmt->execute([$id, $paymentId]);
        $otherPayments = (float)$stmt->fetchColumn();
        $total = (float)$invoice['total'];
        if ($otherPayments + $amount > $total + 0.005) {
            $pdo->rollBack();
            json_error('Edited payment is greater than the available invoice balance.', 422);
        }
        $paymentMethod = trim((string)($b['method'] ?? '')) ?: null;
        $paymentReference = trim((string)($b['reference'] ?? '')) ?: null;
        $pdo->prepare(
            'UPDATE payments
             SET bank_account_id=?, amount=?, method=?, reference=?
             WHERE id=? AND invoice_id=?'
        )->execute([
            $bankAccountId,
            $amount,
            $paymentMethod,
            $paymentReference,
            $paymentId,
            $id,
        ]);
        if (!empty($paymentRow['receipt_id'])) {
            $pdo->prepare(
                'UPDATE receipts
                 SET amount=?,payment_method=?,payment_reference=?,bank_account_id=?
                 WHERE id=? AND deleted_at IS NULL'
            )->execute([
                $amount,
                strtoupper((string)($paymentMethod ?: 'OTHER')),
                $paymentReference,
                $bankAccountId,
                (string)$paymentRow['receipt_id'],
            ]);
        }
        $paid = $otherPayments + $amount;
        $status = calculated_invoice_status($total, $paid, $invoice['due_date']);
        $pdo->prepare('UPDATE invoices SET status=? WHERE id=?')->execute([$status, $id]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    belm_sync_invoice_job_card((string)$id);
    json_out(['ok' => true, 'status' => $status]);
}

if ($method === 'DELETE' && $action === 'payment') {
    if (!$paymentId) json_error('Payment not found.',404);
    $reason=require_delete_confirmation($user,body());
    $pdo=db();
    $pdo->beginTransaction();
    try {
        $invoiceStmt=$pdo->prepare('SELECT total,due_date,status,source_job_card_id FROM invoices WHERE id=? AND deleted_at IS NULL FOR UPDATE');
        $invoiceStmt->execute([$id]);
        $invoice=$invoiceStmt->fetch();
        if(!$invoice){$pdo->rollBack();json_error('Invoice not found.',404);}
        $paymentStmt=$pdo->prepare('SELECT id,amount,receipt_id FROM payments WHERE id=? AND invoice_id=? FOR UPDATE');
        $paymentStmt->execute([$paymentId,$id]);
        $payment=$paymentStmt->fetch();
        if(!$payment){$pdo->rollBack();json_error('Payment not found for this Invoice.',404);}
        if(!empty($payment['receipt_id'])){
            $pdo->rollBack();
            json_error('This payment belongs to an official Receipt. Delete/reverse the Receipt so both records stay synchronized.',409);
        }
        $pdo->prepare('DELETE FROM payments WHERE id=? AND invoice_id=?')->execute([$paymentId,$id]);
        if(strtoupper((string)$invoice['status'])!=='CANCELLED'){
            $paidStmt=$pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id=?');
            $paidStmt->execute([$id]);
            $status=calculated_invoice_status((float)$invoice['total'],(float)$paidStmt->fetchColumn(),$invoice['due_date']);
            $pdo->prepare('UPDATE invoices SET status=? WHERE id=?')->execute([$status,$id]);
        }
        if(!empty($invoice['source_job_card_id'])) belm_recompute_job_billing_status((string)$invoice['source_job_card_id']);
        $pdo->commit();
    } catch(Throwable $error){
        if($pdo->inTransaction())$pdo->rollBack();
        throw $error;
    }
    log_activity($user,'payment-reversed','invoice',(string)$id,['paymentId'=>$paymentId,'amount'=>(float)$payment['amount'],'reason'=>$reason]);
    json_out(['ok'=>true]);
}

if ($method === 'POST' && $action === 'payment') {
    $b = body();
    $amount = (float)($b['amount'] ?? 0);
    if ($amount <= 0) json_error('Payment amount must be greater than zero.');
    $bankAccountId = validated_payment_bank_id($b);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT total FROM invoices WHERE id = ? AND deleted_at IS NULL FOR UPDATE');
        $stmt->execute([$id]);
        $totalValue = $stmt->fetchColumn();
        if ($totalValue === false) {
            $pdo->rollBack();
            json_error('Invoice not found.', 404);
        }
        $total = (float)$totalValue;
        $stmt = $pdo->prepare('SELECT status FROM invoices WHERE id = ?');
        $stmt->execute([$id]);
        if ($stmt->fetchColumn() === 'CANCELLED') {
            $pdo->rollBack();
            json_error('A cancelled invoice cannot receive a payment.', 422);
        }
        $stmt = $pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id = ?');
        $stmt->execute([$id]);
        $alreadyPaid = (float)$stmt->fetchColumn();
        if ($alreadyPaid + $amount > $total + 0.005) {
            $pdo->rollBack();
            json_error('Payment is greater than the invoice balance.', 422);
        }
        $pdo->prepare('INSERT INTO payments (id, invoice_id, bank_account_id, amount, method, reference, paid_at) VALUES (?,?,?,?,?,?,NOW())')
            ->execute([uuid(), $id, $bankAccountId, $amount, $b['method'] ?? null, $b['reference'] ?? null]);
        $paid = $alreadyPaid + $amount;
        $status = $paid >= $total ? 'PAID' : 'PARTIALLY_PAID';
        $pdo->prepare('UPDATE invoices SET status=? WHERE id=?')->execute([$status, $id]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    belm_sync_invoice_job_card((string)$id);
    log_activity($user, 'payment-recorded', 'invoice', $id, ['amount' => $amount]);
    json_out(['ok' => true], 201);
}

json_error('Unknown request', 404);
