<?php
/** Phase 18 VAT supporting ledger (provisional, not a TRA return). */
require_once __DIR__ . '/../config/helpers.php';
$user = require_auth();
require_super_admin($user);
$pdo=db();
$method=$_SERVER['REQUEST_METHOD'];
// Read-only compatible additive migration for installations predating Phase 20.
$pdo->exec('ALTER TABLE belm_vat_ledger ADD COLUMN IF NOT EXISTS bank_withdrawal_id VARCHAR(36) NULL REFERENCES bank_withdrawals(id)');
$pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_belm_vat_tra_bank_withdrawal ON belm_vat_ledger(bank_withdrawal_id) WHERE bank_withdrawal_id IS NOT NULL AND voided_at IS NULL');
if ($method==='POST') {
    $b=body();
    $type=strtoupper(trim((string)($b['type']??'')));
    $allowed=['INPUT_VAT','TRA_PAYMENT','ADJUSTMENT'];
    if (!in_array($type,$allowed,true)) json_error('Invalid VAT entry type.',422);
    $amountString=trim((string)($b['amount']??''));
    if (!preg_match('/^\d{1,12}(?:\.\d{1,2})?$/',$amountString) || (float)$amountString<=0) json_error('Valid positive monetary amount required.',422);
    $month=trim((string)($b['taxMonth']??''));
    $date=trim((string)($b['entryDate']??''));
    foreach (['taxMonth'=>$month,'entryDate'=>$date] as $label=>$value) {
        $format=($label==='taxMonth')?'!Y-m':'!Y-m-d';
        $d=DateTimeImmutable::createFromFormat($format,$value);
        if (!$d || $d->format($label==='taxMonth'?'Y-m':'Y-m-d')!==$value) json_error('Invalid '.$label,422);
    }
    $direction=$type==='ADJUSTMENT'?strtoupper(trim((string)($b['direction']??''))):null;
    if ($type==='ADJUSTMENT' && !in_array($direction,['INCREASE','DECREASE'],true)) json_error('Adjustment direction required.',422);
    $reference=trim((string)($b['reference']??''));
    $description=trim((string)($b['description']??''));
    if ($reference==='' || strlen($reference)>120 || $description==='' || mb_strlen($description)>2000) json_error('Reference and description required.',422);
    $withdrawalId=trim((string)($b['bankWithdrawalId']??''));
    if ($withdrawalId!=='' && $type!=='TRA_PAYMENT') json_error('Bank reconciliation applies only to TRA payments.',422);
    if ($type==='TRA_PAYMENT' && $withdrawalId!=='') {
        $w=$pdo->prepare('SELECT amount,date FROM bank_withdrawals WHERE id=? AND deleted_at IS NULL');
        $w->execute([$withdrawalId]);$withdrawal=$w->fetch(PDO::FETCH_ASSOC);
        if (!$withdrawal) json_error('Selected bank withdrawal does not exist.',422);
        if (abs((float)$withdrawal['amount']-(float)$amountString)>0.005) json_error('TRA amount must equal selected withdrawal amount.',422);
        if ((string)$withdrawal['date']!==$date) json_error('TRA payment date must match selected withdrawal date.',422);
    }
    try {
        $pdo->prepare('INSERT INTO belm_vat_ledger(id,tax_month,entry_date,entry_type,amount,adjustment_direction,reference,description,recorded_by,bank_withdrawal_id) VALUES (?,CAST(? AS DATE),CAST(? AS DATE),?,?,?,?,?,?,?)')
            ->execute([uuid(),$month.'-01',$date,$type,$amountString,$direction,$reference,$description,(string)$user['id'],$withdrawalId?:null]);
    } catch (PDOException $e) {
        if ($e->getCode()==='23505') json_error('This reference or bank withdrawal is already linked to a VAT entry.',409);
        throw $e;
    }
    json_out(['ok'=>true,'message'=>'VAT supporting record saved. Reconcile against TRA evidence.'],201);
}
if ($method!=='GET') json_error('Unsupported method',405);
$reconciliation=$pdo->query("SELECT l.id,l.reference,l.amount,l.entry_date::text AS entry_date,l.bank_withdrawal_id,
CASE WHEN l.bank_withdrawal_id IS NULL THEN 'UNLINKED' WHEN w.id IS NULL THEN 'INVALID' ELSE 'LINKED' END AS reconciliation_status
FROM belm_vat_ledger l LEFT JOIN bank_withdrawals w ON w.id=l.bank_withdrawal_id AND w.deleted_at IS NULL
WHERE l.entry_type='TRA_PAYMENT' AND l.voided_at IS NULL ORDER BY l.entry_date DESC LIMIT 200")->fetchAll(PDO::FETCH_ASSOC);
$rows=$pdo->query("SELECT tax_month::text AS tax_month,entry_type,adjustment_direction,SUM(amount) AS amount
  FROM belm_vat_ledger WHERE voided_at IS NULL GROUP BY tax_month,entry_type,adjustment_direction ORDER BY tax_month DESC")->fetchAll(PDO::FETCH_ASSOC);
$months=[];
foreach($rows as $r){
    $m=substr($r['tax_month'],0,7);
    if(!isset($months[$m]))$months[$m]=['inputVat'=>0.0,'traPayments'=>0.0,'adjustmentIncrease'=>0.0,'adjustmentDecrease'=>0.0];
    $amount=(float)$r['amount'];
    if($r['entry_type']==='INPUT_VAT')$months[$m]['inputVat']+=$amount;
    elseif($r['entry_type']==='TRA_PAYMENT')$months[$m]['traPayments']+=$amount;
    elseif($r['adjustment_direction']==='INCREASE')$months[$m]['adjustmentIncrease']+=$amount;
    else $months[$m]['adjustmentDecrease']+=$amount;
}
// Invoice created_at is only a reporting approximation, NOT the legal tax point.
$invoiceMonths=$pdo->query("SELECT TO_CHAR(created_at AT TIME ZONE 'Africa/Dar_es_Salaam','YYYY-MM') AS month, SUM(GREATEST(tax,0)) AS amount FROM invoices WHERE deleted_at IS NULL AND status<>'CANCELLED' GROUP BY 1")->fetchAll(PDO::FETCH_ASSOC);
foreach($invoiceMonths as $r){$m=$r['month'];if(!isset($months[$m]))$months[$m]=['inputVat'=>0.0,'traPayments'=>0.0,'adjustmentIncrease'=>0.0,'adjustmentDecrease'=>0.0];$months[$m]['outputVat']=(float)$r['amount'];}
$running=0.0;ksort($months);
foreach($months as $m=>&$v){$v['outputVat']=$v['outputVat']??0.0;$v['periodMovement']=round($v['outputVat']-$v['inputVat']+$v['adjustmentIncrease']-$v['adjustmentDecrease']-$v['traPayments'],2);$running=round($running+$v['periodMovement'],2);$v['cumulativeEstimatedBalance']=$running;$v['month']=$m;}unset($v);
json_out(['ok'=>true,'traPaymentReconciliation'=>$reconciliation,'unlinkedTraPayments'=>count(array_filter($reconciliation,static fn($r)=>$r['reconciliation_status']!=='LINKED')),'months'=>array_reverse(array_values($months)),'estimatedCumulativeBalance'=>$running,'warning'=>'Provisional tracking only. Input VAT eligibility, carryforwards, tax-point dates, credit notes, payments and TRA returns need accountant verification. LINKED means matching recorded withdrawal evidence, not proof of TRA acceptance. A negative balance is not automatically a TRA refund.']);
