<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/table_pdf_helper.php';

$user = require_auth();
$pdo = db();

function wmr_allowed(array $user): bool {
    return belm_user_has_named_role($user, ['Super Admin','Engineer','Workshop Manager','Technician','Store Keeper','Storekeeper','Procurement','Finance','Accounts']);
}
function wmr_process(array $user): bool {
    return belm_user_has_named_role($user, ['Super Admin','Engineer','Workshop Manager','Store Keeper','Storekeeper','Procurement']);
}
function wmr_role(array $user): string { return trim((string)($user['roleName'] ?? $user['role'] ?? '')); }
function wmr_category(string $value): string {
    $value = strtoupper(trim($value));
    if (!in_array($value, ['OIL','FUEL','SPARE'], true)) json_error('Request type must be Oil, Fuel or Spare Part.', 422);
    return $value;
}
function wmr_no(): string { return 'WR-' . date('Ym') . '-' . strtoupper(substr(str_replace('-', '', uuid()), 0, 6)); }
function wmr_view(array $r): array {
    return [
        'id'=>(string)$r['id'],'requestNo'=>(string)$r['request_no'],'category'=>(string)$r['category'],
        'itemName'=>(string)$r['item_name'],'partNumber'=>(string)($r['part_number']??''),'quantity'=>(float)$r['quantity'],
        'unit'=>(string)$r['unit'],'customerSite'=>(string)($r['customer_site']??''),'machineRef'=>(string)($r['machine_ref']??''),
        'purpose'=>(string)($r['purpose']??''),'status'=>(string)$r['status'],'requestedById'=>(string)($r['requested_by_id']??''),
        'requestedByName'=>(string)$r['requested_by_name'],'requestedByRole'=>(string)($r['requested_by_role']??''),
        'submittedAt'=>$r['submitted_at']??null,'acknowledgedAt'=>$r['acknowledged_at']??null,
        'acknowledgedByName'=>(string)($r['acknowledged_by_name']??''),'fulfilledAt'=>$r['fulfilled_at']??null,
        'fulfilledByName'=>(string)($r['fulfilled_by_name']??''),'statusNote'=>(string)($r['status_note']??''),
        'createdAt'=>$r['created_at'],'updatedAt'=>$r['updated_at']
    ];
}
function wmr_log(array $user,string $action,string $id,array $meta=[]): void {
    try {
        $uid=trim((string)($user['id']??'')); if($uid==='') return;
        db()->prepare('INSERT INTO activity_logs(id,user_id,action,entity,entity_id,metadata,created_at) VALUES(?,?,?,?,?,?::jsonb,NOW())')
            ->execute([uuid(),$uid,$action,'WORKSHOP_MATERIAL_REQUEST',$id,json_encode($meta,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE)]);
    } catch(Throwable $e){ error_log('Workshop request audit: '.$e->getMessage()); }
}
function wmr_ensure(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS workshop_material_requests (
      id VARCHAR(36) PRIMARY KEY,
      request_no VARCHAR(50) NOT NULL UNIQUE,
      category VARCHAR(20) NOT NULL CHECK (category IN ('OIL','FUEL','SPARE')),
      item_name VARCHAR(255) NOT NULL,
      part_number VARCHAR(100), quantity NUMERIC(14,2) NOT NULL DEFAULT 1,
      unit VARCHAR(30) NOT NULL DEFAULT 'pcs', customer_site VARCHAR(255), machine_ref VARCHAR(255), purpose TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','ACKNOWLEDGED','FULFILLED','REJECTED','CANCELLED')),
      requested_by_id VARCHAR(36) NULL REFERENCES users(id), requested_by_name VARCHAR(255) NOT NULL, requested_by_role VARCHAR(100),
      submitted_at TIMESTAMPTZ, acknowledged_at TIMESTAMPTZ, acknowledged_by_name VARCHAR(255),
      fulfilled_at TIMESTAMPTZ, fulfilled_by_name VARCHAR(255), status_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_workshop_material_requests_status ON workshop_material_requests(status,updated_at DESC)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_workshop_material_requests_created ON workshop_material_requests(created_at DESC)');
}
if(!wmr_allowed($user)) json_error('Your role does not have access to Workshop Material Requests.',403);
wmr_ensure($pdo);
$method=strtoupper($_SERVER['REQUEST_METHOD']??'GET');
$action=strtolower(trim((string)($_GET['action']??'list')));
$id=trim((string)($_GET['id']??''));
$uid=trim((string)($user['id']??''));
$name=trim((string)($user['name']??''))?:'BELM User';
$role=wmr_role($user);

if($method==='GET' && $action==='pending'){
    $new=(int)$pdo->query("SELECT COUNT(*) FROM workshop_material_requests WHERE status='SUBMITTED'")->fetchColumn();
    $pending=(int)$pdo->query("SELECT COUNT(*) FROM workshop_material_requests WHERE status IN ('SUBMITTED','ACKNOWLEDGED')")->fetchColumn();
    json_out(['ok'=>true,'blinkCount'=>$new,'pendingCount'=>$pending,'generatedAt'=>date(DATE_ATOM)]);
}
if($method==='GET' && $action==='pdf' && $id!==''){
    $s=$pdo->prepare('SELECT * FROM workshop_material_requests WHERE id=?');$s->execute([$id]);$r=$s->fetch();if(!$r)json_error('Request not found.',404);
    $summary=['Request No: '.$r['request_no'],'Date: '.display_date_billing((string)$r['created_at']),'Type: '.$r['category'],'Status: '.$r['status'],'Requested by: '.$r['requested_by_name']];
    $rows=[['Item',(string)$r['item_name']],['Part No.',(string)($r['part_number']?:'—')],['Quantity',rtrim(rtrim(number_format((float)$r['quantity'],2,'.',''),'0'),'.').' '.$r['unit']],['Customer / Site',(string)($r['customer_site']?:'—')],['Machine / Fleet',(string)($r['machine_ref']?:'—')],['Purpose',(string)($r['purpose']?:'—')],['Status Note',(string)($r['status_note']?:'—')]];
    output_table_pdf('BELM-'.$r['request_no'].'.pdf','WORKSHOP MATERIAL REQUEST',$summary,$rows);
}
if($method==='GET' && $action==='monthly-pdf'){
    $month=trim((string)($_GET['month']??date('Y-m')));if(!preg_match('/^\d{4}-\d{2}$/',$month))json_error('Invalid month.',422);
    $s=$pdo->prepare("SELECT * FROM workshop_material_requests WHERE TO_CHAR(created_at,'YYYY-MM')=? ORDER BY created_at");$s->execute([$month]);$items=$s->fetchAll()?:[];
    $rows=[];foreach($items as $r){$rows[]=[(string)$r['request_no'],display_date_billing((string)$r['created_at']),(string)$r['category'],(string)$r['item_name'],rtrim(rtrim(number_format((float)$r['quantity'],2,'.',''),'0'),'.').' '.$r['unit'],(string)($r['machine_ref']?:$r['customer_site']?:'—'),(string)$r['status'],(string)$r['requested_by_name']];}
    $pending=count(array_filter($items,fn($r)=>in_array($r['status'],['SUBMITTED','ACKNOWLEDGED'],true)));
    $done=count(array_filter($items,fn($r)=>$r['status']==='FULFILLED'));
    output_table_pdf('BELM-Workshop-Requests-'.$month.'.pdf','WORKSHOP MATERIAL REQUESTS - MONTHLY REPORT',['Month: '.$month,'Total: '.count($items),'Pending: '.$pending,'Fulfilled: '.$done],$rows);
}
if($method==='GET'){
    $where=['1=1'];$params=[];$month=trim((string)($_GET['month']??''));$status=strtoupper(trim((string)($_GET['status']??'')));$cat=strtoupper(trim((string)($_GET['category']??'')));
    if($month!==''){if(!preg_match('/^\d{4}-\d{2}$/',$month))json_error('Invalid month.',422);$where[]="TO_CHAR(created_at,'YYYY-MM')=?";$params[]=$month;}
    if($status!==''){$where[]='status=?';$params[]=$status;} if($cat!==''){$cat=wmr_category($cat);$where[]='category=?';$params[]=$cat;}
    $s=$pdo->prepare('SELECT * FROM workshop_material_requests WHERE '.implode(' AND ',$where).' ORDER BY created_at DESC LIMIT 500');$s->execute($params);
    $rows=array_map('wmr_view',$s->fetchAll()?:[]);
    $new=(int)$pdo->query("SELECT COUNT(*) FROM workshop_material_requests WHERE status='SUBMITTED'")->fetchColumn();
    $pending=(int)$pdo->query("SELECT COUNT(*) FROM workshop_material_requests WHERE status IN ('SUBMITTED','ACKNOWLEDGED')")->fetchColumn();
    json_out(['ok'=>true,'requests'=>$rows,'blinkCount'=>$new,'pendingCount'=>$pending,'canProcess'=>wmr_process($user),'currentUserId'=>$uid,'currentUserName'=>$name,'currentUserRole'=>$role,'generatedAt'=>date(DATE_ATOM)]);
}
if($method==='POST' && $action==='save'){
    $b=body();$rid=trim((string)($b['id']??''));$cat=wmr_category((string)($b['category']??''));$item=trim((string)($b['itemName']??''));$part=trim((string)($b['partNumber']??''));$qty=(float)($b['quantity']??0);$unit=trim((string)($b['unit']??''));$site=trim((string)($b['customerSite']??''));$machine=trim((string)($b['machineRef']??''));$purpose=trim((string)($b['purpose']??''));
    if($item==='')json_error('Item / material name is required.',422);if($qty<=0)json_error('Quantity must be greater than zero.',422);if($unit==='')$unit=in_array($cat,['OIL','FUEL'],true)?'litres':'pcs';
    if($rid===''){
        $rid=uuid();$no=wmr_no();
        $pdo->prepare("INSERT INTO workshop_material_requests(id,request_no,category,item_name,part_number,quantity,unit,customer_site,machine_ref,purpose,status,requested_by_id,requested_by_name,requested_by_role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?,NOW(),NOW())")
            ->execute([$rid,$no,$cat,$item,$part?:null,$qty,$unit,$site?:null,$machine?:null,$purpose?:null,$uid?:null,$name,$role]);
    }else{
        $s=$pdo->prepare('SELECT requested_by_id,status FROM workshop_material_requests WHERE id=?');$s->execute([$rid]);$old=$s->fetch();if(!$old)json_error('Request not found.',404);if($old['status']!=='DRAFT')json_error('Only Draft requests can be edited.',409);if(!wmr_process($user)&&$uid!==''&&(string)($old['requested_by_id']??'')!==$uid)json_error('You can edit only your own Draft request.',403);
        $pdo->prepare('UPDATE workshop_material_requests SET category=?,item_name=?,part_number=?,quantity=?,unit=?,customer_site=?,machine_ref=?,purpose=?,updated_at=NOW() WHERE id=?')->execute([$cat,$item,$part?:null,$qty,$unit,$site?:null,$machine?:null,$purpose?:null,$rid]);
    }
    wmr_log($user,'WORKSHOP_REQUEST_SAVED',$rid,['category'=>$cat,'item'=>$item]);$s=$pdo->prepare('SELECT * FROM workshop_material_requests WHERE id=?');$s->execute([$rid]);json_out(['ok'=>true,'request'=>wmr_view($s->fetch())]);
}
if($method==='POST' && $action==='submit'){
    $b=body();$rid=trim((string)($b['id']??''));if($rid==='')json_error('Save the request before submitting it.',422);$s=$pdo->prepare('SELECT * FROM workshop_material_requests WHERE id=?');$s->execute([$rid]);$r=$s->fetch();if(!$r)json_error('Request not found.',404);if($r['status']!=='DRAFT')json_error('This request has already been submitted.',409);if(!wmr_process($user)&&$uid!==''&&(string)($r['requested_by_id']??'')!==$uid)json_error('You can submit only your own Draft request.',403);
    $pdo->prepare("UPDATE workshop_material_requests SET status='SUBMITTED',submitted_at=NOW(),updated_at=NOW() WHERE id=?")->execute([$rid]);wmr_log($user,'WORKSHOP_REQUEST_SUBMITTED',$rid,['requestNo'=>$r['request_no']]);json_out(['ok'=>true,'id'=>$rid,'status'=>'SUBMITTED']);
}
if(in_array($method,['POST','PUT','PATCH'],true)&&$action==='status'&&$id!==''){
    if(!wmr_process($user))json_error('Store, Procurement or Workshop authorization is required.',403);$b=body();$next=strtoupper(trim((string)($b['status']??'')));$note=trim((string)($b['note']??''));if(!in_array($next,['ACKNOWLEDGED','FULFILLED','REJECTED','CANCELLED'],true))json_error('Invalid request status.',422);
    $s=$pdo->prepare('SELECT * FROM workshop_material_requests WHERE id=?');$s->execute([$id]);$r=$s->fetch();if(!$r)json_error('Request not found.',404);if($r['status']==='DRAFT')json_error('Submit the request before processing it.',409);if(in_array($r['status'],['FULFILLED','REJECTED','CANCELLED'],true))json_error('This request is already closed.',409);
    if($next==='ACKNOWLEDGED')$pdo->prepare("UPDATE workshop_material_requests SET status='ACKNOWLEDGED',acknowledged_at=NOW(),acknowledged_by_name=?,status_note=?,updated_at=NOW() WHERE id=?")->execute([$name,$note?:null,$id]);
    elseif($next==='FULFILLED')$pdo->prepare("UPDATE workshop_material_requests SET status='FULFILLED',fulfilled_at=NOW(),fulfilled_by_name=?,status_note=?,updated_at=NOW() WHERE id=?")->execute([$name,$note?:null,$id]);
    else $pdo->prepare('UPDATE workshop_material_requests SET status=?,status_note=?,updated_at=NOW() WHERE id=?')->execute([$next,$note?:null,$id]);
    wmr_log($user,'WORKSHOP_REQUEST_'.$next,$id,['requestNo'=>$r['request_no'],'note'=>$note]);json_out(['ok'=>true,'id'=>$id,'status'=>$next]);
}
json_error('Unsupported Workshop Material Request action.',404);
