<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/finance_reconciliation_helper.php';

$user = require_auth();
require_super_admin($user);
$pdo = db();

function vat_finance_amount(PDO $pdo, string $sql, array $params = []): float {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return (float)$stmt->fetchColumn();
}

function vat_table_exists(PDO $pdo, string $table): bool {
    $stmt = $pdo->prepare('SELECT to_regclass(?) IS NOT NULL');
    $stmt->execute(['public.' . $table]);
    return (bool)$stmt->fetchColumn();
}

$invoiceLedger = belm_invoice_reconciliation($pdo);
// Historical API field retained for compatibility. Not an official TRA liability.
$vatPayable = $invoiceLedger['invoice_output_vat'];

$paymentsReceived = vat_finance_amount(
    $pdo,
    'SELECT COALESCE(SUM(amount),0) FROM payments WHERE bank_account_id IS NOT NULL'
);

$margin = belm_provisional_margin_bridge($pdo, $invoiceLedger);
$financeExpenses = $margin['companyExpenseBreakdown']['finance'];
$procurementExpenses = $margin['companyExpenseBreakdown']['procurement'];
$workshopExpenses = $margin['companyExpenseBreakdown']['workshopManager'];
$companyExpenses = $margin['companyExpenses'];

$totalWithdrawals = vat_finance_amount(
    $pdo,
    'SELECT COALESCE(SUM(amount),0) FROM bank_withdrawals WHERE deleted_at IS NULL'
);

// COGS remains an accounting expense for profit/loss. It is separate from
// Inventory Value, which is an asset and must not be deducted from profit merely
// because it is still sitting in the store.
$costOfGoodsSold = $margin['costOfGoodsSold'];

// Live inventory asset value: current physical stock x purchase cost.
// Any Store Keeper stock-in, stock-out, issue or sale that changes stock_qty
// automatically changes this value on the next dashboard refresh.
$inventoryValue = vat_table_exists($pdo, 'spare_parts')
    ? vat_finance_amount(
        $pdo,
        "SELECT COALESCE(SUM(
            GREATEST(COALESCE(stock_qty,0),0) *
            GREATEST(COALESCE(purchase_price,0),0)
         ),0)
         FROM spare_parts
         WHERE deleted_at IS NULL"
      )
    : 0.0;

$inventoryItems = vat_table_exists($pdo, 'spare_parts')
    ? (int)vat_finance_amount(
        $pdo,
        "SELECT COUNT(*)
         FROM spare_parts
         WHERE deleted_at IS NULL
           AND COALESCE(stock_qty,0) > 0"
      )
    : 0;

// Shared provisional margin; withdrawals remain a bank cash movement.
$netAfterVat = $margin['provisionalOperatingResult'];

json_out([
    'ok' => true,
    'vatRate' => 18,
    'vatPayable' => $vatPayable,
    'vatOnPaidInvoices' => $invoiceLedger['paid_share_vat'],
    'customerDebt' => $invoiceLedger['receivable'],
    'grossInvoiced' => $invoiceLedger['invoiced_gross'],
    'salesExVat' => $invoiceLedger['sales_ex_vat'],
    'vatMeaning' => 'Output VAT on invoices; not confirmed TRA net VAT payable',
    'taxLedgerEndpoint' => '/api/belm-vat-ledger',
    'companyExpenses' => $companyExpenses,
    'companyExpenseBreakdown' => [
        'finance' => $financeExpenses,
        'procurement' => $procurementExpenses,
        'workshopManager' => $workshopExpenses,
    ],
    'inventoryValue' => $inventoryValue,
    'inventoryItems' => $inventoryItems,
    'inventoryRule' => 'Inventory Value = current stock quantity x purchase price for active spare parts.',
    'costOfGoodsSold' => $costOfGoodsSold,
    'belmProfit' => max(0, $netAfterVat),
    'loss' => max(0, -$netAfterVat),
    'rule' => 'VAT figures are derived from stored invoice tax. TRA net payable requires input VAT, adjustments and TRA payment reconciliation.',
    'profitMeaning' => $margin['profitMeaning'],
    'provisionalOperatingResult' => $margin['provisionalOperatingResult'],
    'reconciliationRequired' => $margin['reconciliationRequired'],
    'reconciliationWarnings' => $margin['reconciliationWarnings'],
    'expenseRule' => 'Company Expenses = Finance expenses + Procurement consumable costs + Workshop Manager petty cash expenses.',
    'syncedAt' => gmdate('c'),
]);
