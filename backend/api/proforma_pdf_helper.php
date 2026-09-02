<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/invoice_pdf_helper.php';
require_once __DIR__ . '/commercial_master_pdf_helper.php';

function belm_load_proforma_document(string $proformaId, ?string $customerId = null): array {
    $sql = 'SELECT p.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
                   c.address AS customer_address, c.tin_number AS customer_tin, c.vrn AS customer_vrn
            FROM proforma_invoices p JOIN customers c ON c.id = p.customer_id
            WHERE p.id = ? AND p.deleted_at IS NULL';
    $params = [$proformaId];
    if ($customerId !== null) {
        $sql .= ' AND p.customer_id = ?';
        $params[] = $customerId;
    }
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $proforma = $stmt->fetch();
    if (!$proforma) json_error('Proforma not found.', 404);

    $itemsStmt = db()->prepare('SELECT section, part_number, description, qty, unit, unit_price FROM proforma_invoice_items WHERE proforma_id = ? ORDER BY "order" ASC');
    $itemsStmt->execute([$proformaId]);
    $items = $itemsStmt->fetchAll();
    return [$proforma, $items];
}

function belm_proforma_totals(array $proforma, array $items): array {
    $subtotal = round(array_sum(array_map(static fn($i) => (float)$i['qty'] * (float)$i['unit_price'], $items)), 2);
    $discount = (float)($proforma['discount'] ?? 0);
    $discountType = (string)($proforma['discount_type'] ?? 'FIXED');
    $discountAmount = $discountType === 'PERCENT'
        ? round($subtotal * (max(0, min(100, $discount)) / 100), 2)
        : round($discount, 2);
    $discountAmount = max(0, min($discountAmount, $subtotal));
    $vatRate = (float)($proforma['vat_rate'] ?? 18);
    $vat = ($proforma['vat_mode'] ?? 'VAT') === 'VAT' ? round(($subtotal - $discountAmount) * ($vatRate / 100), 2) : 0.0;
    return [
        'subtotal' => $subtotal,
        'discount' => $discountAmount,
        'vat' => $vat,
        'grandTotal' => round($subtotal - $discountAmount + $vat, 2),
    ];
}

function belm_output_proforma_document_pdf(string $proformaId, ?string $customerId = null): void {
    [$proforma, $items] = belm_load_proforma_document($proformaId, $customerId);
    $totals = belm_proforma_totals($proforma, $items);
    $company = belm_get_company_details();

    $pdfItems = [];
    foreach ($items as $index => $item) {
        $pdfItems[] = [
            'itemNo' => (string)($index + 1),
            'partNumber' => $item['part_number'] ?: '',
            'description' => (string)$item['description'],
            'qty' => rtrim(rtrim(number_format((float)$item['qty'], 2, '.', ''), '0'), '.'),
            'unit' => (string)($item['unit'] ?: 'PC'),
            'unitPrice' => number_format((float)$item['unit_price'], 2),
            'extended' => number_format((float)$item['qty'] * (float)$item['unit_price'], 2),
        ];
    }

    $validityText = trim((string)($proforma['quote_validity'] ?? ''));
    $validityDays = belm_master_days_from_validity($validityText ?: (string)($company['defaultQuoteValidity'] ?? '7 days'));
    $issueDateRaw = (string)$proforma['date'];
    $issueTs = strtotime($issueDateRaw) ?: time();
    $validUntil = date('Y-m-d', strtotime('+' . $validityDays . ' days', $issueTs));

    $bank = [
        ['ACCOUNT NAME', (string)($company['bankAccountName'] ?: BELM_MASTER_ACCOUNT_NAME)],
        ['NMB BANK', (string)($company['bankNmbNumber'] ?: BELM_MASTER_NMB)],
        ['CRDB BANK', (string)($company['bankCrdbNumber'] ?: BELM_MASTER_CRDB)],
    ];
    $terms = array_values(array_filter([
        $proforma['payment_terms'] ? 'Payment: ' . $proforma['payment_terms'] : ($company['defaultPaymentTerms'] ? 'Payment: ' . $company['defaultPaymentTerms'] : null),
        $proforma['delivery_time'] ? 'Delivery: ' . $proforma['delivery_time'] : ($company['defaultDeliveryTime'] ? 'Delivery: ' . $company['defaultDeliveryTime'] : null),
    ]));

    belm_output_commercial_master_pdf(
        'Proforma-' . $proforma['invoice_no'] . '-' . $proforma['customer_name'] . '.pdf',
        'PROFORMA',
        [
            'name' => $proforma['customer_name'],
            'tin' => $proforma['customer_tin'] ?: null,
            'vrn' => $proforma['customer_vrn'] ?: null,
            'customerRef' => $proforma['customer_name'],
        ],
        [
            'number' => $proforma['invoice_no'],
            'issueDate' => belm_master_date_display($issueDateRaw),
            'validUntil' => belm_master_date_display($validUntil),
            'validityDays' => $validityDays,
            'currency' => 'TZS',
        ],
        $pdfItems,
        [
            'subtotal' => $totals['subtotal'],
            'discount' => $totals['discount'],
            'vat' => $totals['vat'],
            'vatLabel' => ($proforma['vat_mode'] ?? 'VAT') === 'VAT'
                ? 'VAT ' . rtrim(rtrim(number_format((float)$proforma['vat_rate'], 2), '0'), '.') . '%'
                : 'VAT 0%',
            'grandTotal' => $totals['grandTotal'],
        ],
        (string)($proforma['notice'] ?? ''),
        $bank,
        $terms
    );
}
