<?php
/**
 * Shared, read-only invoice/payment reconciliation for BELM finance dashboards.
 * Proformas are offers, not receivables. Receipts evidence payments; they must
 * never be added to payment totals a second time.
 */
function belm_invoice_reconciliation(PDO $pdo): array {
    $stmt = $pdo->query("SELECT
        COALESCE(SUM(i.total),0) AS invoiced_gross,
        COALESCE(SUM(GREATEST(i.total - COALESCE(p.paid,0),0)),0) AS receivable,
        COALESCE(SUM(LEAST(GREATEST(COALESCE(p.paid,0),0),GREATEST(i.total,0))),0) AS allocated_paid,
        COALESCE(SUM(GREATEST(COALESCE(i.tax,0),0)),0) AS invoice_output_vat,
        COALESCE(SUM(CASE WHEN i.total > 0 THEN ROUND(
            GREATEST(COALESCE(i.tax,0),0) *
            LEAST(GREATEST(COALESCE(p.paid,0),0),i.total) / i.total, 2)
            ELSE 0 END),0) AS paid_share_vat,
        COALESCE(SUM(GREATEST(i.total - GREATEST(COALESCE(i.tax,0),0),0)),0) AS sales_ex_vat
       FROM invoices i
       LEFT JOIN (SELECT invoice_id,SUM(amount) AS paid FROM payments GROUP BY invoice_id) p
         ON p.invoice_id=i.id
       WHERE i.deleted_at IS NULL AND i.status <> 'CANCELLED'");
    $r = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $out = [];
    foreach ($r as $key => $value) $out[$key] = round((float)$value, 2);
    return $out;
}

/**
 * Read-only control totals for financial records needing manual reconciliation.
 * These are exceptions, not proof of fraud or a tax assessment.
 */
function belm_finance_integrity_checks(PDO $pdo): array {
    $sql = [
        'unlinkedPayments' => "SELECT COUNT(*) FROM payments p LEFT JOIN invoices i ON i.id=p.invoice_id WHERE p.invoice_id IS NULL OR i.id IS NULL OR i.deleted_at IS NOT NULL OR i.status='CANCELLED'",
        'overpaidInvoices' => "SELECT COUNT(*) FROM invoices i JOIN (SELECT invoice_id, SUM(amount) paid FROM payments GROUP BY invoice_id) p ON p.invoice_id=i.id WHERE i.deleted_at IS NULL AND i.status<>'CANCELLED' AND p.paid > i.total + 0.005",
        'negativePayments' => "SELECT COUNT(*) FROM payments WHERE amount < 0",
        'invoiceTaxAnomalies' => "SELECT COUNT(*) FROM invoices WHERE deleted_at IS NULL AND status<>'CANCELLED' AND (total < 0 OR tax < 0 OR tax > total OR subtotal < 0)"
    ];
    $counts=[];
    foreach ($sql as $name=>$query) $counts[$name]=(int)$pdo->query($query)->fetchColumn();
    return [
        'counts'=>$counts,
        'hasExceptions'=>array_sum($counts)>0,
        'meaning'=>'Review flagged records before relying on margin and VAT reporting. This is not a TRA filing or bank reconciliation.',
    ];
}

/**
 * Phase 21: one provisional margin bridge for both finance dashboards.
 * This is NOT audited profit. Expense sources can overlap, and historical
 * spare purchase prices are not a cost-at-sale snapshot.
 */
function belm_provisional_margin_bridge(PDO $pdo, array $invoiceLedger): array {
    $exists = static function(string $table) use ($pdo): bool {
        $st = $pdo->prepare('SELECT to_regclass(?) IS NOT NULL');
        $st->execute(['public.' . $table]);
        return (bool)$st->fetchColumn();
    };
    $sum = static function(string $sql) use ($pdo): float {
        return round((float)$pdo->query($sql)->fetchColumn(), 2);
    };
    $finance = $exists('company_expenses') ? $sum('SELECT COALESCE(SUM(amount),0) FROM company_expenses WHERE deleted_at IS NULL') : 0.0;
    $procurement = $exists('belm_procurement_consumables') ? $sum('SELECT COALESCE(SUM(total_cost),0) FROM belm_procurement_consumables') : 0.0;
    $workshop = $exists('belm_workshop_petty_cash_entries') ? $sum("SELECT COALESCE(SUM(amount),0) FROM belm_workshop_petty_cash_entries WHERE entry_type='EXPENSE'") : 0.0;
    $cogs = ($exists('invoice_items') && $exists('spare_parts') && $exists('invoices')) ? $sum("SELECT COALESCE(SUM(ii.quantity * sp.purchase_price),0) FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id JOIN spare_parts sp ON sp.id=ii.spare_part_id WHERE i.deleted_at IS NULL AND i.status <> 'CANCELLED'") : 0.0;
    $operating = round((float)$invoiceLedger['sales_ex_vat'] - $finance - $procurement - $workshop - $cogs, 2);
    return [
        'companyExpenses' => round($finance + $procurement + $workshop, 2),
        'companyExpenseBreakdown' => ['finance'=>$finance,'procurement'=>$procurement,'workshopManager'=>$workshop],
        'costOfGoodsSold' => $cogs,
        'provisionalOperatingResult' => $operating,
        'belmProfit' => max(0, $operating),
        'loss' => max(0, -$operating),
        'profitMeaning' => 'Provisional invoice-based operating result; NOT audited net profit. Expense sources may overlap; spare costs use current purchase price.',
        'reconciliationRequired' => true,
        'reconciliationWarnings' => [
            'Review whether procurement and workshop expenses are also recorded in company_expenses to prevent duplicate deduction.',
            'Review cost of goods sold against historical purchase costs and sales returns.',
            'Reconcile invoice revenue, outstanding receivables, payroll, depreciation, VAT and income taxes before confirming net profit.'
        ],
    ];
}

/** Phase 22: read-only duplicate candidates. NEVER auto-delete or suppress expenses.
 * Similar dates and amounts are not proof of duplicated accounting entries.
 */
function belm_expense_duplicate_candidates(PDO $pdo): array {
    $query = "SELECT f.id AS finance_id, p.id AS procurement_id,
           f.date AS expense_date, f.amount AS finance_amount, p.total_cost AS procurement_amount,
           f.description AS finance_description, p.description AS procurement_description
        FROM company_expenses f JOIN belm_procurement_consumables p
          ON ABS(f.amount-p.total_cost)<0.01 AND ABS(f.date-p.usage_date)<=1
        WHERE f.deleted_at IS NULL ORDER BY f.date DESC LIMIT 100";
    $exists=$pdo->query("SELECT to_regclass('public.company_expenses') IS NOT NULL AND to_regclass('public.belm_procurement_consumables') IS NOT NULL")->fetchColumn();
    if (!$exists) return ['items'=>[], 'reviewRequired'=>false];
    $rows=$pdo->query($query)->fetchAll(PDO::FETCH_ASSOC);
    return ['items'=>$rows,'reviewRequired'=>count($rows)>0,'meaning'=>'Possible overlaps only; do not automatically remove any entry.'];
}

/** Phase 22: unallocated overhead is excluded from per-job estimates.
 * Linked invoices are the only source of per-job sales; COGS uses current prices.
 */
function belm_job_customer_margin(PDO $pdo): array {
    $rows=$pdo->query("SELECT i.customer_id, c.name AS customer_name, i.source_job_card_id AS job_card_id,
          j.job_card_no, i.id AS invoice_id, i.invoice_no,
          ROUND(i.total-GREATEST(COALESCE(i.tax,0),0),2) AS revenue_ex_vat,
          COALESCE((SELECT SUM(ii.quantity*sp.purchase_price) FROM invoice_items ii
            JOIN spare_parts sp ON sp.id=ii.spare_part_id WHERE ii.invoice_id=i.id),0) AS estimated_spare_cost,
          COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id),0) AS payments_received
        FROM invoices i JOIN customers c ON c.id=i.customer_id
        LEFT JOIN digital_job_cards j ON j.id=i.source_job_card_id
        WHERE i.deleted_at IS NULL AND i.status<>'CANCELLED'
        ORDER BY i.created_at DESC LIMIT 1000")->fetchAll(PDO::FETCH_ASSOC);
    $customers=[]; $jobs=[]; $unlinked=[];
    foreach ($rows as $r) {
        $revenue=(float)$r['revenue_ex_vat']; $cost=(float)$r['estimated_spare_cost'];
        $item=['invoiceId'=>$r['invoice_id'],'invoiceNo'=>$r['invoice_no'],
          'customerId'=>$r['customer_id'],'customerName'=>$r['customer_name'],
          'jobCardId'=>$r['job_card_id'],'jobCardNo'=>$r['job_card_no'],
          'revenueExVat'=>round($revenue,2),'estimatedSpareCost'=>round($cost,2),
          'contributionBeforeLaborAndOverheads'=>round($revenue-$cost,2),
          'paymentsReceived'=>round((float)$r['payments_received'],2)];
        $key=(string)$r['customer_id'];
        if (!isset($customers[$key])) $customers[$key]=['customerId'=>$key,'customerName'=>$r['customer_name'],'revenueExVat'=>0,'estimatedSpareCost'=>0,'contributionBeforeLaborAndOverheads'=>0];
        foreach (['revenueExVat','estimatedSpareCost','contributionBeforeLaborAndOverheads'] as $k) $customers[$key][$k]+=$item[$k];
        if ($r['job_card_id']) $jobs[]=$item; else $unlinked[]=$item;
    }
    return ['customers'=>array_values($customers),'linkedJobInvoices'=>$jobs,'invoicesWithoutJobCard'=>$unlinked,
      'meaning'=>'Contribution estimate only: excludes labor, workshop, overheads, income taxes and historical spare cost corrections; not net profit.',
      'reconciliationRequired'=>true];
}
