<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/invoice_pdf_helper.php';

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
            'description' => $item['description'],
            'qty' => (string)$item['qty'],
            'unit' => (string)$item['unit'],
            'unitPrice' => number_format((float)$item['unit_price'], 2),
            'extended' => number_format((float)$item['qty'] * (float)$item['unit_price'], 2),
        ];
    }

    $discountLabel = ($proforma['discount_type'] ?? 'FIXED') === 'PERCENT'
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
            'vatLabel' => ($proforma['vat_mode'] ?? 'VAT') === 'VAT' ? 'VAT ' . rtrim(rtrim(number_format((float)$proforma['vat_rate'], 2), '0'), '.') . '%' : 'VAT (not applicable)',
            'grandTotal' => number_format($totals['grandTotal'], 2),
        ],
        (string)($proforma['notice'] ?? ''),
        $bank,
        $tradingTerms,
        is_array($company['whyChooseUs']) ? $company['whyChooseUs'] : [],
        (string)($company['footerMessage'] ?? 'Thank you for your business')
    );
}
