<?php
require_once __DIR__ . '/config/helpers.php';

$user = require_auth();
require_page_access($user, 'billing');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('Method not allowed.', 405);
}

belm_ensure_invoice_proforma_schema();

function belm_proforma_invoice_totals(array $proforma, array $items): array {
    $subtotal = 0.0;
    foreach ($items as $item) {
        $subtotal += (float)$item['qty'] * (float)$item['unit_price'];
    }
    $subtotal = round($subtotal, 2);
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

$payload = body();
$proformaId = trim((string)($payload['proformaId'] ?? ''));
if ($proformaId === '') json_error('Select a Proforma to generate the Invoice.', 422);

$paymentReceived = !empty($payload['paymentReceived']);
$paymentMethod = strtoupper(trim((string)($payload['paymentMethod'] ?? '')));
$paymentReference = trim((string)($payload['paymentReference'] ?? ''));
$paymentAmountInput = $payload['paymentAmount'] ?? null;
$allowedMethods = ['BANK', 'CASH', 'MOBILE_MONEY', 'MOBILE MONEY', 'CHEQUE', 'OTHER'];
if ($paymentReceived && $paymentMethod === '') $paymentMethod = 'BANK';
if ($paymentReceived && !in_array($paymentMethod, $allowedMethods, true)) {
    json_error('Invalid payment method.', 422);
}
if ($paymentMethod === 'MOBILE MONEY') $paymentMethod = 'MOBILE_MONEY';

$pdo = db();
$pdo->beginTransaction();
try {
    $stmt = $pdo->prepare('SELECT * FROM proforma_invoices WHERE id=? AND deleted_at IS NULL FOR UPDATE');
    $stmt->execute([$proformaId]);
    $proforma = $stmt->fetch();
    if (!$proforma) {
        $pdo->rollBack();
        json_error('Proforma not found.', 404);
    }
    if (strtoupper((string)($proforma['customer_response'] ?? '')) === 'CHANGE_REQUESTED') {
        $pdo->rollBack();
        json_error('Customer requested changes to this Proforma. Edit and resend it before generating the Invoice.', 409);
    }

    $existing = $pdo->prepare("SELECT invoice_no FROM invoices WHERE source_proforma_id=? AND deleted_at IS NULL AND status<>'CANCELLED' ORDER BY created_at DESC LIMIT 1");
    $existing->execute([$proformaId]);
    $existingNo = $existing->fetchColumn();
    if ($existingNo) {
        $pdo->rollBack();
        json_error('Invoice already exists for this Proforma: ' . $existingNo . '.', 409);
    }

    $sourceJobCardId = trim((string)($proforma['source_job_card_id'] ?? ''));
    if ($sourceJobCardId !== '') {
        $jobInvoice = $pdo->prepare("SELECT invoice_no FROM invoices WHERE source_job_card_id=? AND deleted_at IS NULL AND status<>'CANCELLED' ORDER BY created_at DESC LIMIT 1");
        $jobInvoice->execute([$sourceJobCardId]);
        $jobInvoiceNo = $jobInvoice->fetchColumn();
        if ($jobInvoiceNo) {
            $pdo->rollBack();
            json_error('An active Invoice already exists for this Job Card: ' . $jobInvoiceNo . '.', 409);
        }
    }

    $itemsStmt = $pdo->prepare('SELECT part_number, description, qty, unit, unit_price FROM proforma_invoice_items WHERE proforma_id=? ORDER BY "order" ASC');
    $itemsStmt->execute([$proformaId]);
    $items = $itemsStmt->fetchAll();
    if (!$items) {
        $pdo->rollBack();
        json_error('This Proforma has no items to copy.', 409);
    }

    $totals = belm_proforma_invoice_totals($proforma, $items);
    $paymentAmount = 0.0;
    if ($paymentReceived) {
        $paymentAmount = $paymentAmountInput === null || $paymentAmountInput === ''
            ? (float)$totals['total']
            : (float)$paymentAmountInput;
        if ($paymentAmount <= 0) {
            $pdo->rollBack();
            json_error('Payment amount must be greater than zero.', 422);
        }
        if ($paymentAmount > (float)$totals['total'] + 0.005) {
            $pdo->rollBack();
            json_error('Payment cannot be greater than the Invoice total.', 422);
        }
    }

    $invoiceNo = belm_invoice_number_from_proforma((string)$proforma['invoice_no']);
    $invoiceId = uuid();
    $pdo->prepare(
        "INSERT INTO invoices
         (id, customer_id, machine_id, source_job_card_id, source_proforma_id, invoice_no,
          subtotal, discount, discount_type, vat_rate, tax, total, status, due_date, notice, payment_terms, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'UNPAID',?,?,?,NOW())"
    )->execute([
        $invoiceId,
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
    foreach ($items as $item) {
        $partNumber = trim((string)($item['part_number'] ?? ''));
        $sparePartId = null;
        if ($partNumber !== '') {
            $partLookup->execute([$partNumber]);
            $sparePartId = $partLookup->fetchColumn() ?: null;
        }
        $qty = (int)$item['qty'];
        $unitPrice = (float)$item['unit_price'];
        $itemInsert->execute([
            uuid(),
            $invoiceId,
            $partNumber !== '' ? $partNumber : null,
            (string)$item['description'],
            $qty,
            (string)($item['unit'] ?: 'PC'),
            $unitPrice,
            round($qty * $unitPrice, 2),
            $sparePartId,
        ]);
    }

    $status = 'UNPAID';
    $paymentId = null;
    if ($paymentReceived) {
        $paymentId = uuid();
        $pdo->prepare('INSERT INTO payments (id, invoice_id, bank_account_id, amount, method, reference, paid_at) VALUES (?,?,?,?,?,?,NOW())')
            ->execute([
                $paymentId,
                $invoiceId,
                null,
                $paymentAmount,
                $paymentMethod,
                $paymentReference !== '' ? $paymentReference : null,
            ]);
        $status = calculated_invoice_status((float)$totals['total'], $paymentAmount, null);
        $pdo->prepare('UPDATE invoices SET status=? WHERE id=?')->execute([$status, $invoiceId]);
    }

    $pdo->commit();

    if ($sourceJobCardId !== '') {
        belm_recompute_job_billing_status($sourceJobCardId);
    }
    log_activity($user, 'invoice-generated-from-proforma', 'invoice', $invoiceId, [
        'invoiceNo' => $invoiceNo,
        'proformaId' => $proformaId,
        'proformaNo' => $proforma['invoice_no'],
        'total' => $totals['total'],
        'paymentReceived' => $paymentReceived,
        'paymentAmount' => $paymentAmount,
        'paymentMethod' => $paymentReceived ? $paymentMethod : null,
        'paymentReference' => $paymentReceived && $paymentReference !== '' ? $paymentReference : null,
        'status' => $status,
    ]);

    json_out([
        'id' => $invoiceId,
        'invoiceNo' => $invoiceNo,
        'proformaNo' => $proforma['invoice_no'],
        'status' => $status,
        'paymentRecorded' => $paymentReceived,
        'paymentId' => $paymentId,
        'paymentAmount' => $paymentAmount,
    ], 201);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $error;
}
