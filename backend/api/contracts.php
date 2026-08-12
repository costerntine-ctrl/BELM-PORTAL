<?php
require_once __DIR__ . '/../config/helpers.php';
$user = require_auth();
require_page_access($user, 'customers');
$method = $_SERVER['REQUEST_METHOD'];
$id = trim((string)($_GET['id'] ?? ''));
$action = trim((string)($_GET['action'] ?? ''));

function contract_row(array $r): array {
    $r['customer'] = ['id'=>$r['customer_id'], 'name'=>$r['customer_name'] ?? null];
    $r['daysRemaining'] = isset($r['end_date']) ? max(0, (int)floor((strtotime($r['end_date']) - time()) / 86400)) : null;
    unset($r['customer_name']);
    return $r;
}
if ($method === 'GET' && $action === 'summary') {
    $sql = "SELECT COUNT(*) FILTER (WHERE status='ACTIVE' AND end_date >= CURRENT_DATE) active_contracts,
                   COUNT(*) FILTER (WHERE status='ACTIVE' AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days') renewals_due,
                   COALESCE(SUM((SELECT COUNT(*) FROM contract_machine_coverage cmc WHERE cmc.contract_id=cc.id)),0) covered_machines
            FROM customer_contracts cc";
    $stats = db()->query($sql)->fetch();
    $sla = db()->query("SELECT COUNT(*) FROM workshop_work_orders wo JOIN customer_contracts cc ON cc.id=wo.contract_id WHERE wo.status NOT IN ('COMPLETED','CANCELLED') AND wo.created_at + (cc.sla_response_hours || ' hours')::interval < NOW()") ->fetchColumn();
    $stats['slaAtRisk'] = (int)$sla;
    json_out($stats);
}
if ($method === 'GET') {
    $customerId = trim((string)($_GET['customerId'] ?? ''));
    $sql = 'SELECT cc.*, c.name customer_name FROM customer_contracts cc JOIN customers c ON c.id=cc.customer_id';
    $params=[];
    if ($customerId!=='') { $sql.=' WHERE cc.customer_id=?'; $params[]=$customerId; }
    $sql.=' ORDER BY cc.end_date ASC';
    $s=db()->prepare($sql); $s->execute($params); json_out(array_map('contract_row',$s->fetchAll()));
}
if ($method === 'POST') {
    $b=body(); $customerId=trim((string)($b['customerId']??'')); $number=trim((string)($b['contractNumber']??''));
    $title=trim((string)($b['title']??'Service & Maintenance Contract')); $start=trim((string)($b['startDate']??'')); $end=trim((string)($b['endDate']??''));
    if(!$customerId||!$number||!$start||!$end) json_error('Customer, contract number, start date and end date are required.');
    if(strtotime($end)<strtotime($start)) json_error('Contract end date must be after start date.');
    $new=uuid();
    db()->prepare('INSERT INTO customer_contracts (id,customer_id,contract_number,title,contract_type,start_date,end_date,status,sla_response_hours,preventive_maintenance_included,labour_included,parts_included,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$new,$customerId,$number,$title,$b['contractType']??'SERVICE_MAINTENANCE',$start,$end,$b['status']??'ACTIVE',(int)($b['slaResponseHours']??24),!empty($b['preventiveMaintenanceIncluded'])?1:0,!empty($b['labourIncluded'])?1:0,!empty($b['partsIncluded'])?1:0,trim((string)($b['notes']??''))?:null]);
    json_out(['id'=>$new],201);
}
if ($method === 'PUT' && $id) {
    $b=body(); $allowed=['ACTIVE','PAUSED','EXPIRED','CANCELLED']; $status=strtoupper((string)($b['status']??'ACTIVE')); if(!in_array($status,$allowed,true)) json_error('Invalid contract status.');
    db()->prepare('UPDATE customer_contracts SET title=COALESCE(?,title), end_date=COALESCE(?,end_date), status=?, sla_response_hours=COALESCE(?,sla_response_hours), notes=COALESCE(?,notes), updated_at=NOW() WHERE id=?')->execute([$b['title']??null,$b['endDate']??null,$status,isset($b['slaResponseHours'])?(int)$b['slaResponseHours']:null,$b['notes']??null,$id]);
    json_out(['ok'=>true]);
}
json_error('Unsupported contract operation.',405);
