<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
require_super_admin($user);
$pdo = db();

function vat_finance_amount(PDO $pdo, string $sql, array $params = []): float {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return (float)$stmt->fetchColumn();
}

// BELM VAT rule:
// VAT belongs to TRA, not BELM. Liability is recognized only when invoice
// money has actually been received. For partial payments, recognize the same
// proportion of the invoice VAT; for a fully paid invoice, recognize 100% of
// its VAT. This also respects NO-VAT invoices because their stored tax is zero.
$vatPayable = vat_finance_amount(
    $pdo,
    "SELECT COALESCE(SUM(
        CASE
          WHEN i.total > 0 AND COALESCE(i.tax,0) > 0 THEN
            ROUND(
              LEAST(COALESCE(p.paid,0), i.total) / i.total *
              ROUND(GREATEST(COALESCE(i.subtotal,0) - COALESCE(i.discount,0),0) * 0.18, 2),
              2
            )
          ELSE 0
        END
      ),0)
     FROM invoices i
     LEFT JOIN (
       SELECT invoice_id, SUM(amount) AS paid
       FROM payments
       GROUP BY invoice_id
     ) p ON p.invoice_id=i.id
     WHERE i.deleted_at IS NULL
       AND i.status <> 'CANCELLED'
       AND COALESCE(p.paid,0) > 0"
);

$paymentsReceived = vat_finance_amount(
    $pdo,
    'SELECT COALESCE(SUM(amount),0) FROM payments WHERE bank_account_id IS NOT NULL'
);
$companyExpenses = vat_finance_amount(
    $pdo,
    'SELECT COALESCE(SUM(amount),0) FROM company_expenses WHERE bank_account_id IS NOT NULL AND deleted_at IS NULL'
);
$totalWithdrawals = vat_finance_amount(
    $pdo,
    'SELECT COALESCE(SUM(amount),0) FROM bank_withdrawals WHERE deleted_at IS NULL'
);
$costOfGoodsSold = vat_finance_amount(
    $pdo,
    "SELECT COALESCE(SUM(ii.quantity * sp.purchase_price),0)
     FROM invoice_items ii
     JOIN invoices i ON i.id=ii.invoice_id
     JOIN spare_parts sp ON sp.id=ii.spare_part_id
     WHERE i.deleted_at IS NULL AND i.status <> 'CANCELLED'"
);

$netAfterVat = $paymentsReceived - $companyExpenses - $totalWithdrawals - $vatPayable - $costOfGoodsSold;

json_out([
    'ok' => true,
    'vatRate' => 18,
    'vatPayable' => $vatPayable,
    'belmProfit' => max(0, $netAfterVat),
    'loss' => max(0, -$netAfterVat),
    'rule' => 'VAT is recognized from actual invoice payments and deducted from BELM net funds as money payable to TRA.',
    'syncedAt' => gmdate('c'),
]);
