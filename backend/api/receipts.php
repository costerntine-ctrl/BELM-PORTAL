<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/table_pdf_helper.php';
require_once __DIR__ . '/invoice_pdf_helper.php';

$user = require_auth();
require_page_access($user, 'billing');
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;
$action = $_GET['action'] ?? '';

const PAYMENT_METHODS = ['CASH', 'BANK', 'MOBILE', 'CHEQUE', 'OTHER'];

function receipt_invoice_summary(?string $invoiceId): array {
    if (!$invoiceId) return ['invoiceTotal' => null, 'previousPayments' => 0.0, 'invoiceNo' => null];
    $stmt = db()->prepare('SELECT invoice_no, total FROM invoices WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$invoiceId]);
    $invoice = $stmt->fetch();
    if (!$invoice) json_error('Selected invoice was not found.', 404);
    // Every Receipt linked to an invoice also inserts a matching row into
    // `payments` (see the POST handler below), so `payments` alone is the
    // single source of truth for how much has been paid — reading both
    // tables here would double-count.
    $stmt = db()->prepare('SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id = ?');
    $stmt->execute([$invoiceId]);
    $previousPayments = (float)$stmt->fetchColumn();
    return ['invoiceTotal' => (float)$invoice['total'], 'previousPayments' => $previousPayments, 'invoiceNo' => $invoice['invoice_no']];
}

if ($method === 'GET' && $action === 'export-one') {
    $receiptId = trim((string)($_GET['receiptId'] ?? ''));
    $stmt = db()->prepare(
        'SELECT r.*, c.name AS customer_name, c.address AS customer_address,
                c.tin_number AS customer_tin, c.vrn AS customer_vrn,
                i.invoice_no, i.total AS invoice_total,
                b.bank_name, u.name AS received_by_name
         FROM receipts r
         JOIN customers c ON c.id = r.customer_id
         LEFT JOIN invoices i ON i.id = r.invoice_id
         LEFT JOIN bank_accounts b ON b.id = r.bank_account_id
         LEFT JOIN users u ON u.id = r.received_by
         WHERE r.id = ? AND r.deleted_at IS NULL'
    );
    $stmt->execute([$receiptId]);
    $receipt = $stmt->fetch();
    if (!$receipt) json_error('Receipt not found.', 404);
    $company = belm_get_company_details();

    $summary = receipt_invoice_summary($receipt['invoice_id']);
    // "Previous payments" for the printed receipt means payments made
    // BEFORE this one, so subtract this receipt's own amount back out.
    $previousBeforeThis = max(0, $summary['previousPayments'] - (float)$receipt['amount']);
    $amountPaidTotal = $previousBeforeThis + (float)$receipt['amount'];
    $balance = $summary['invoiceTotal'] !== null ? max(0, $summary['invoiceTotal'] - $amountPaidTotal) : null;

    $pdfItems = [[
        'itemNo' => '1',
        'partNumber' => '',
        'description' => $receipt['invoice_no'] ? 'Payment for Invoice ' . $receipt['invoice_no'] : 'Payment received' . ($receipt['notes'] ? ' — ' . $receipt['notes'] : ''),
        'qty' => '1',
        'unit' => '',
        'unitPrice' => number_format((float)$receipt['amount'], 2),
        'extended' => number_format((float)$receipt['amount'], 2),
    ]];

    $paymentSummary = [];
    if ($summary['invoiceTotal'] !== null) {
        $paymentSummary[] = ['Invoice Total', 'TZS ' . number_format($summary['invoiceTotal'], 2)];
        $paymentSummary[] = ['Previous Payments', 'TZS ' . number_format($previousBeforeThis, 2)];
    }
    $paymentSummary[] = ['AMOUNT PAID (this receipt)', 'TZS ' . number_format((float)$receipt['amount'], 2)];
    if ($balance !== null) {
        $paymentSummary[] = [$balance <= 0.005 ? 'Status' : 'BALANCE DUE', $balance <= 0.005 ? 'PAID IN FULL' : 'TZS ' . number_format($balance, 2)];
    }

    $meta = [
        'receiptNo' => $receipt['receipt_no'],
        'date' => display_date_billing((string)$receipt['paid_at']),
    ];
    if ($receipt['invoice_no']) $meta['relatedInvoice'] = $receipt['invoice_no'];
    $meta['paymentMethod'] = ucfirst(strtolower((string)$receipt['payment_method']));
    if ($receipt['bank_name']) $meta['bank'] = $receipt['bank_name'];
    if ($receipt['payment_reference']) $meta['reference'] = $receipt['payment_reference'];
    if ($receipt['received_by_name']) $meta['receivedBy'] = $receipt['received_by_name'];

    $bank = [];
    if ($company['bankAccountName']) $bank[] = ['ACCOUNT NAME', $company['bankAccountName']];
    if ($company['bankNmbNumber']) $bank[] = ['NMB BANK', $company['bankNmbNumber']];
    if ($company['bankCrdbNumber']) $bank[] = ['CRDB BANK', $company['bankCrdbNumber']];

    output_professional_document_pdf(
        'Receipt-' . $receipt['receipt_no'] . '-' . $receipt['customer_name'] . '.pdf',
        'Official Receipt',
        $company,
        [
            'name' => $receipt['customer_name'],
            'tin' => $receipt['customer_tin'] ?: null,
            'vrn' => $receipt['customer_vrn'] ?: null,
            'address' => $receipt['customer_address'] ?: null,
        ],
        $meta,
        $pdfItems,
        [], // no Subtotal/Discount/VAT/Grand Total block on a receipt — payment summary covers it
        '',
        $bank,
        [],
        [],
        (string)($company['footerMessage'] ?? 'Thank you for your business'),
        $paymentSummary
    );
}

if ($method === 'GET' && !$action) {
    $invoiceId = $_GET['invoiceId'] ?? null;
    $customerId = $_GET['customerId'] ?? null;
    $sql = 'SELECT r.*, c.name AS customer_name, i.invoice_no
            FROM receipts r JOIN customers c ON c.id = r.customer_id
            LEFT JOIN invoices i ON i.id = r.invoice_id
            WHERE r.deleted_at IS NULL';
    $params = [];
    if ($invoiceId) { $sql .= ' AND r.invoice_id = ?'; $params[] = $invoiceId; }
    if ($customerId) { $sql .= ' AND r.customer_id = ?'; $params[] = $customerId; }
    $sql .= ' ORDER BY r.paid_at DESC, r.created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $receipts = $stmt->fetchAll();
    foreach ($receipts as &$r) {
        $r['customer'] = ['id' => $r['customer_id'], 'name' => $r['customer_name']];
        unset($r['customer_name']);
    }
    json_out($receipts);
}

if ($method === 'GET' && $action === 'summary') {
    $invoiceId = trim((string)($_GET['invoiceId'] ?? ''));
    if ($invoiceId === '') json_error('invoiceId is required.', 422);
    json_out(receipt_invoice_summary($invoiceId));
}

if ($method === 'POST' && !$action) {
    $b = body();
    $customerId = trim((string)($b['customerId'] ?? ''));
    $invoiceId = trim((string)($b['invoiceId'] ?? '')) ?: null;
    $amount = (float)($b['amount'] ?? 0);
    $paymentMethod = strtoupper(trim((string)($b['paymentMethod'] ?? 'CASH')));
    $paymentReference = trim((string)($b['paymentReference'] ?? ''));
    $bankAccountId = trim((string)($b['bankAccountId'] ?? '')) ?: null;
    $notes = trim((string)($b['notes'] ?? ''));
    $paidAt = trim((string)($b['paidAt'] ?? date('Y-m-d')));

    if ($customerId === '') json_error('Select a customer.', 422);
    $stmt = db()->prepare('SELECT 1 FROM customers WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$customerId]);
    if (!$stmt->fetch()) json_error('Select a valid customer.', 422);

    if ($amount <= 0) json_error('Amount received must be greater than zero.');
    if (!in_array($paymentMethod, PAYMENT_METHODS, true)) json_error('Invalid payment method.');
    if (DateTime::createFromFormat('Y-m-d', $paidAt) === false) json_error('Select a valid payment date.');

    if ($bankAccountId !== null) {
        $stmt = db()->prepare('SELECT 1 FROM bank_accounts WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
        $stmt->execute([$bankAccountId]);
        if (!$stmt->fetch()) json_error('Selected bank account is not active.', 422);
    }

    if ($invoiceId !== null) {
        $summary = receipt_invoice_summary($invoiceId);
        if ($summary['invoiceTotal'] !== null) {
            $balance = $summary['invoiceTotal'] - $summary['previousPayments'];
            $allowOverpayment = !empty($b['allowOverpayment']);
            if (!$allowOverpayment && $amount > $balance + 0.005) {
                json_error(
                    'Amount received (TZS ' . number_format($amount, 2) . ') exceeds the outstanding balance '
                    . '(TZS ' . number_format(max(0, $balance), 2) . ') for invoice ' . $summary['invoiceNo'] . '.',
                    422
                );
            }
        }
    }

    $newId = uuid();
    $receiptNo = belm_next_document_number('RCPT', 'receipt_number_seq');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO receipts
             (id, receipt_no, customer_id, invoice_id, amount, payment_method, payment_reference, bank_account_id, received_by, notes, paid_at, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())'
        )->execute([
            $newId, $receiptNo, $customerId, $invoiceId, $amount, $paymentMethod,
            $paymentReference !== '' ? $paymentReference : null, $bankAccountId, $user['id'],
            $notes !== '' ? $notes : null, $paidAt,
        ]);

        // A Receipt linked to an invoice IS a recorded payment — insert
        // into the same `payments` table the rest of Billing already
        // reads, so the invoice's balance/status (PAID / PARTIALLY_PAID)
        // stays correct everywhere it's shown, not just on the receipt
        // itself.
        if ($invoiceId !== null) {
            $pdo->prepare(
                'INSERT INTO payments (id, invoice_id, bank_account_id, amount, method, reference, paid_at)
                 VALUES (?,?,?,?,?,?,?)'
            )->execute([
                uuid(), $invoiceId, $bankAccountId, $amount, $paymentMethod,
                $paymentReference !== '' ? $paymentReference : ('Receipt ' . $receiptNo), $paidAt,
            ]);

            $stmt = $pdo->prepare('SELECT total, due_date, status, source_job_card_id FROM invoices WHERE id = ? FOR UPDATE');
            $stmt->execute([$invoiceId]);
            $invoiceRow = $stmt->fetch();
            if ($invoiceRow && $invoiceRow['status'] !== 'CANCELLED') {
                $stmt = $pdo->prepare('SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id = ?');
                $stmt->execute([$invoiceId]);
                $totalPaid = (float)$stmt->fetchColumn();
                $newStatus = calculated_invoice_status((float)$invoiceRow['total'], $totalPaid, $invoiceRow['due_date']);
                $pdo->prepare('UPDATE invoices SET status = ? WHERE id = ?')->execute([$newStatus, $invoiceId]);
                // V301: Receipts are one of BELM's payment entry points. Keep the
                // service Job Card billing state in the same transaction so the
                // Customer Procurement view and BELM Job Card never disagree.
                if (!empty($invoiceRow['source_job_card_id'])) {
                    $jobBillingStatus = $newStatus === 'PAID' ? 'PAID' : 'INVOICE_OUTSTANDING';
                    $pdo->prepare('UPDATE digital_job_cards SET billing_status=?,updated_at=NOW() WHERE id=?')
                        ->execute([$jobBillingStatus, (string)$invoiceRow['source_job_card_id']]);
                }
            }
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    json_out(['id' => $newId, 'receiptNo' => $receiptNo], 201);
}

if ($method === 'DELETE') {
    $stmt = db()->prepare('SELECT receipt_no FROM receipts WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    $reason = require_delete_confirmation($user, body());
    send_to_trash('receipt', $id, $row['receipt_no'], $user['id'], $reason);
    soft_delete('receipts', $id);
    json_out(null, 204);
}

json_error('Unknown request', 404);
