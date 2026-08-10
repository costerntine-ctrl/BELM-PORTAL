<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/table_pdf_helper.php';
require_once __DIR__ . '/invoice_pdf_helper.php';

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
    $stmt = db()->prepare(
        'SELECT p.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
                c.address AS customer_address, c.tin_number AS customer_tin, c.vrn AS customer_vrn
         FROM proforma_invoices p JOIN customers c ON c.id = p.customer_id
         WHERE p.id = ? AND p.deleted_at IS NULL'
    );
    $stmt->execute([$proformaId]);
    $proforma = $stmt->fetch();
    if (!$proforma) json_error('Proforma not found.', 404);

    $itemsStmt = db()->prepare('SELECT section, part_number, description, qty, unit, unit_price FROM proforma_invoice_items WHERE proforma_id = ? ORDER BY "order" ASC');
    $itemsStmt->execute([$proformaId]);
    $items = $itemsStmt->fetchAll();
    $totals = compute_totals($items, (float)$proforma['discount'], (string)$proforma['discount_type'], (string)$proforma['vat_mode'], (float)$proforma['vat_rate']);
    $company = belm_get_company_details();

    $pdfItems = [];
    foreach ($items as $index => $item) {
        $pdfItems[] = [
            'itemNo' => (string)($index + 1),
            'partNumber' => $item['part_number'] ?: '',
            'description' => $item['description'],
            'qty' => (string)$item['qty'],
            'unit' => (string)$item['unit'],
            'unitPrice' => number_format((float)$item['unit_price'], 2),
            'extended' => number_format($item['qty'] * $item['unit_price'], 2),
        ];
    }

    $discountLabel = $proforma['discount_type'] === 'PERCENT'
        ? 'Discount (' . rtrim(rtrim(number_format((float)$proforma['discount'], 2), '0'), '.') . '%)'
        : 'Discount';

    $bank = [];
    if ($company['bankAccountName']) $bank[] = ['ACCOUNT NAME', $company['bankAccountName']];
    if ($company['bankNmbNumber']) $bank[] = ['NMB BANK', $company['bankNmbNumber']];
    if ($company['bankCrdbNumber']) $bank[] = ['CRDB BANK', $company['bankCrdbNumber']];

    $tradingTerms = array_values(array_filter([
        $proforma['payment_terms'] ? 'Term of Payment: ' . $proforma['payment_terms'] : ($company['defaultPaymentTerms'] ? 'Term of Payment: ' . $company['defaultPaymentTerms'] : null),
        $proforma['delivery_time'] ? 'Delivery Time: ' . $proforma['delivery_time'] : ($company['defaultDeliveryTime'] ? 'Delivery Time: ' . $company['defaultDeliveryTime'] : null),
        $proforma['quote_validity']
            ? 'Period of validity for the above quoted price: ' . $proforma['quote_validity']
            : ($company['defaultQuoteValidity'] ? 'Period of validity for the above quoted price: ' . $company['defaultQuoteValidity'] : null),
    ]));

    output_professional_document_pdf(
        'Proforma-Invoice-' . $proforma['invoice_no'] . '-' . $proforma['customer_name'] . '.pdf',
        'Proforma Invoice',
        $company,
        [
            'name' => $proforma['customer_name'],
            'tin' => $proforma['customer_tin'] ?: null,
            'vrn' => $proforma['customer_vrn'] ?: null,
            'address' => $proforma['customer_address'] ?: null,
        ],
        [
            'invoiceNo' => $proforma['invoice_no'],
            'tin' => $company['companyTin'] ?: null,
            'vrn' => $company['companyVrn'] ?: null,
            'date' => display_date_billing((string)$proforma['date']),
        ],
        $pdfItems,
        [
            'subtotal' => number_format($totals['subtotal'], 2),
            'discount' => number_format($totals['discount'], 2),
            'discountLabel' => $discountLabel,
            'vat' => number_format($totals['vat'], 2),
            'vatLabel' => $proforma['vat_mode'] === 'VAT' ? 'VAT ' . rtrim(rtrim(number_format((float)$proforma['vat_rate'], 2), '0'), '.') . '%' : 'VAT (not applicable)',
            'grandTotal' => number_format($totals['grandTotal'], 2),
        ],
        (string)($proforma['notice'] ?? ''),
        $bank,
        $tradingTerms,
        is_array($company['whyChooseUs']) ? $company['whyChooseUs'] : [],
        (string)($company['footerMessage'] ?? 'Thank you for your business')
    );
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

    $subtotal = round(array_sum(array_map(fn($i) => (int)$i['qty'] * (float)$i['unitPrice'], $items)), 2);
    $discountAmount = $discountType === 'PERCENT' ? round($subtotal * ($discount / 100), 2) : $discount;
    if ($discountAmount > $subtotal) json_error('Discount cannot be greater than the subtotal.');

    $newId = uuid();
    $invoiceNo = belm_next_document_number('PI', 'proforma_number_seq');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO proforma_invoices
             (id, customer_id, invoice_no, date, vat_mode, vat_rate, discount, discount_type, notice, payment_terms, delivery_time, quote_validity, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())'
        )->execute([
            $newId, $customerId, $invoiceNo, $date, $vatMode, $vatRate, $discount, $discountType,
            $notice !== '' ? $notice : null, $paymentTerms !== '' ? $paymentTerms : null,
            $deliveryTime !== '' ? $deliveryTime : null, $quoteValidity !== '' ? $quoteValidity : null,
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
    json_out(['id' => $newId, 'invoiceNo' => $invoiceNo], 201);
}

if ($method === 'PUT') {
    $b = body();
    require_edit_confirmation($b);
    $items = $b['items'] ?? [];
    $vatMode = strtoupper(trim((string)($b['vatMode'] ?? '')));
    $vatRate = isset($b['vatRate']) ? (float)$b['vatRate'] : 18.0;
    $discountType = strtoupper(trim((string)($b['discountType'] ?? 'FIXED')));
    $discount = (float)($b['discount'] ?? 0);
    $notice = trim((string)($b['notice'] ?? ''));
    $paymentTerms = trim((string)($b['paymentTerms'] ?? ''));
    $deliveryTime = trim((string)($b['deliveryTime'] ?? ''));
    $quoteValidity = trim((string)($b['quoteValidity'] ?? ''));

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
            'UPDATE proforma_invoices
             SET vat_mode=?, vat_rate=?, discount=?, discount_type=?, notice=?, payment_terms=?, delivery_time=?, quote_validity=?
             WHERE id=? AND deleted_at IS NULL'
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
