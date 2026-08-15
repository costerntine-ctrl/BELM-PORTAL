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
        if (!is_numeric($item['qty'] ?? null) || (float)$item['qty'] <= 0 || floor((float)$item['qty']) !== (float)$item['qty']) {
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

if ($method === 'GET') {
    $stmt = db()->query('SELECT p.*, c.name AS customer_name FROM proforma_invoices p JOIN customers c ON c.id = p.customer_id WHERE p.deleted_at IS NULL ORDER BY p.date DESC');
    $proformas = $stmt->fetchAll();
    foreach ($proformas as &$p) {
        $p['customer'] = ['id' => $p['customer_id'], 'name' => $p['customer_name']];
        unset($p['customer_name']);
        $stmt2 = db()->prepare('SELECT * FROM proforma_invoice_items WHERE proforma_id = ? ORDER BY "order" ASC');
        $stmt2->execute([$p['id']]);
        $p['items'] = $stmt2->fetchAll();
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
    if ($sourceSpareRequestId !== '') {
        $requestCheck = db()->prepare(
            'SELECT spr.machine_id FROM spare_part_requests spr
             JOIN machines m ON m.id = spr.machine_id
             WHERE spr.id = ? AND m.customer_id = ?'
        );
        $requestCheck->execute([$sourceSpareRequestId, $customerId]);
        $requestMachine = $requestCheck->fetchColumn();
        if ($requestMachine === false) json_error('Source spare request was not found for this customer.', 422);
        if ($machineId === '' && $requestMachine) $machineId = (string)$requestMachine;
    }

    $subtotal = round(array_sum(array_map(fn($i) => (int)$i['qty'] * (float)$i['unitPrice'], $items)), 2);
    $discountAmount = $discountType === 'PERCENT' ? round($subtotal * ($discount / 100), 2) : $discount;
    if ($discountAmount > $subtotal) json_error('Discount cannot be greater than the subtotal.');

    $newId = uuid();
    $invoiceNo = belm_next_document_number('PI', 'proforma_number_seq');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            "INSERT INTO proforma_invoices
             (id, customer_id, invoice_no, date, vat_mode, vat_rate, discount, discount_type, notice, payment_terms, delivery_time, quote_validity, machine_id, source_spare_request_id, delivery_status, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',NOW())"
        )->execute([
            $newId, $customerId, $invoiceNo, $date, $vatMode, $vatRate, $discount, $discountType,
            $notice !== '' ? $notice : null, $paymentTerms !== '' ? $paymentTerms : null,
            $deliveryTime !== '' ? $deliveryTime : null, $quoteValidity !== '' ? $quoteValidity : null,
            $machineId !== '' ? $machineId : null, $sourceSpareRequestId !== '' ? $sourceSpareRequestId : null,
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
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    log_activity($user, 'proforma-created', 'proforma', $newId, ['invoiceNo' => $invoiceNo]);
    json_out(['id' => $newId, 'invoiceNo' => $invoiceNo], 201);
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
    $stmt = db()->prepare('SELECT invoice_no FROM proforma_invoices WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    $reason = require_delete_confirmation($user, body());
    send_to_trash('proformaInvoice', $id, $row['invoice_no'], $user['id'], $reason);
    soft_delete('proforma_invoices', $id);
    json_out(null, 204);
}

json_error('Unknown request', 404);
