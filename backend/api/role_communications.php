<?php
require_once __DIR__ . '/../config/helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$payload = current_token_payload();
if (!$payload) json_error('Not authenticated', 401);

function rc_staff_role_key(string $name): string {
    $map = [
        'super admin'=>'super_admin','workshop manager'=>'workshop_manager','engineer'=>'workshop_manager',
        'technician'=>'technician','procurement'=>'procurement','store keeper'=>'store_keeper',
        'registration & sales'=>'registration_sales','finance / accounts'=>'finance_accounts',
        'bank controller'=>'bank_controller','system coordinator'=>'system_coordinator'
    ];
    return $map[strtolower(trim($name))] ?? strtolower(preg_replace('/[^a-z0-9]+/i','_',trim($name)));
}
function rc_customer_role_key(string $name): string {
    $key = strtolower(trim($name));
    $map = [
        'owner'=>'customer_admin','admin'=>'customer_admin','customer_admin'=>'customer_admin',
        'workshop_manager'=>'workshop_manager','technician'=>'technician','operator'=>'operator',
        'procurement'=>'procurement','store_keeper'=>'store_keeper','accounts'=>'accounts',
        'finance'=>'accounts','accountant'=>'accounts','viewer'=>'viewer'
    ];
    return $map[$key] ?? $key;
}
function rc_labels(): array {
    return [
        'super_admin'=>'BELM Super Admin','workshop_manager'=>'Workshop Manager','technician'=>'Technician',
        'procurement'=>'Procurement','store_keeper'=>'Store Keeper','registration_sales'=>'Registration & Sales',
        'finance_accounts'=>'Finance / Accounts','bank_controller'=>'Bank Controller','system_coordinator'=>'System Coordinator',
        'customer_admin'=>'Customer Administration','operator'=>'Operator','accounts'=>'Finance / Accounts','viewer'=>'Viewer'
    ];
}
function rc_actor(array $payload): array {
    $type = (string)($payload['type'] ?? '');
    if ($type === 'staff') {
        $live = require_auth();
        $names = is_array($live['roleNames'] ?? null) ? $live['roleNames'] : [(string)($live['roleName'] ?? '')];
        $keys = [];
        foreach ($names as $name) { $k = rc_staff_role_key((string)$name); if ($k !== '') $keys[] = $k; }
        $keys = array_values(array_unique($keys));
        return ['scope'=>'BELM','actorKey'=>'staff:' . (string)$live['id'],'name'=>(string)($live['name'] ?? 'BELM User'),'roleKeys'=>$keys ?: ['super_admin'],'primaryRole'=>$keys[0] ?? 'super_admin','customerId'=>null];
    }
    if ($type === 'customer') {
        $customerId = trim((string)($payload['id'] ?? ''));
        $stmt = db()->prepare('SELECT id,name FROM customers WHERE id=? AND deleted_at IS NULL AND is_active=1');
        $stmt->execute([$customerId]);
        $customer = $stmt->fetch();
        if (!$customer) json_error('Customer account is no longer active.', 401);
        $role = rc_customer_role_key((string)($payload['customerRole'] ?? (($payload['actorType'] ?? '') === 'owner' ? 'owner' : 'viewer')));
        $actorId = trim((string)($payload['actorId'] ?? ''));
        $actorKey = ($payload['actorType'] ?? '') === 'assistant' && $actorId !== '' ? 'customer-user:' . $actorId : 'customer-owner:' . $customerId;
        return ['scope'=>'CUSTOMER','actorKey'=>$actorKey,'name'=>(string)($payload['actorName'] ?? $customer['name']),'roleKeys'=>[$role],'primaryRole'=>$role,'customerId'=>$customerId,'customerName'=>(string)$customer['name']];
    }
    if ($type === 'operator') {
        $id = trim((string)($payload['id'] ?? '')); $customerId = trim((string)($payload['customerId'] ?? ''));
        $stmt = db()->prepare('SELECT o.id,o.name,c.name AS customer_name FROM machine_operators o JOIN customers c ON c.id=o.customer_id WHERE o.id=? AND o.customer_id=? AND c.deleted_at IS NULL AND c.is_active=1');
        $stmt->execute([$id,$customerId]); $operator=$stmt->fetch();
        if (!$operator) json_error('Operator session is no longer active.',401);
        return ['scope'=>'CUSTOMER','actorKey'=>'operator:' . $id,'name'=>(string)$operator['name'],'roleKeys'=>['operator'],'primaryRole'=>'operator','customerId'=>$customerId,'customerName'=>(string)$operator['customer_name']];
    }
    json_error('This account type cannot use Role Communication.',403);
}
function rc_matrix(array $actor): array {
    $belm = [
        'super_admin'=>['super_admin','workshop_manager','technician','procurement','store_keeper','registration_sales','finance_accounts','bank_controller','system_coordinator'],
        'workshop_manager'=>['super_admin','technician','procurement','store_keeper','finance_accounts','registration_sales'],
        'technician'=>['workshop_manager','store_keeper'],
        'procurement'=>['super_admin','workshop_manager','store_keeper','finance_accounts'],
        'store_keeper'=>['workshop_manager','procurement','technician','finance_accounts'],
        'registration_sales'=>['super_admin','workshop_manager','finance_accounts'],
        'finance_accounts'=>['super_admin','registration_sales','procurement','workshop_manager','bank_controller'],
        'bank_controller'=>['super_admin','finance_accounts'],
        'system_coordinator'=>['super_admin','workshop_manager','technician','procurement','store_keeper','registration_sales','finance_accounts','bank_controller']
    ];
    $customer = [
        'customer_admin'=>['customer_admin','workshop_manager','technician','operator','procurement','store_keeper','accounts'],
        'workshop_manager'=>['customer_admin','technician','operator','procurement','store_keeper'],
        'technician'=>['workshop_manager','store_keeper'],
        'operator'=>['customer_admin','workshop_manager','technician'],
        'procurement'=>['customer_admin','workshop_manager','store_keeper','accounts'],
        'store_keeper'=>['customer_admin','workshop_manager','technician','procurement'],
        'accounts'=>['customer_admin','procurement','workshop_manager'],
        'viewer'=>[]
    ];
    $crossCustomerToBelm = [
        'customer_admin'=>['workshop_manager','registration_sales','finance_accounts','procurement'],
        'workshop_manager'=>['workshop_manager'], 'technician'=>['workshop_manager'], 'operator'=>['workshop_manager'],
        'procurement'=>['procurement'], 'store_keeper'=>[], 'accounts'=>['finance_accounts'], 'viewer'=>[]
    ];
    $crossBelmToCustomer = [
        'super_admin'=>['customer_admin','workshop_manager','technician','operator','procurement','store_keeper','accounts'],
        'workshop_manager'=>['customer_admin','workshop_manager','technician','operator'],
        'registration_sales'=>['customer_admin','accounts'],
        'finance_accounts'=>['customer_admin','accounts'],
        'procurement'=>['customer_admin','procurement','store_keeper']
    ];
    $out=[];
    if ($actor['scope']==='BELM') {
        foreach ($actor['roleKeys'] as $role) {
            foreach ($belm[$role] ?? [] as $r) $out['belm:'.$r]=['key'=>'belm:'.$r,'scope'=>'BELM','role'=>$r,'needsCustomer'=>false];
            foreach ($crossBelmToCustomer[$role] ?? [] as $r) $out['customer:'.$r]=['key'=>'customer:'.$r,'scope'=>'CUSTOMER','role'=>$r,'needsCustomer'=>true];
        }
    } else {
        $role=$actor['primaryRole'];
        foreach ($customer[$role] ?? [] as $r) $out['customer:'.$r]=['key'=>'customer:'.$r,'scope'=>'CUSTOMER','role'=>$r,'needsCustomer'=>false];
        foreach ($crossCustomerToBelm[$role] ?? [] as $r) $out['belm:'.$r]=['key'=>'belm:'.$r,'scope'=>'BELM','role'=>$r,'needsCustomer'=>false];
    }
    $labels=rc_labels();
    foreach($out as &$r){$prefix=$r['scope']==='BELM'?'BELM · ':'Customer · ';$r['label']=$prefix.($labels[$r['role']]??ucwords(str_replace('_',' ',$r['role'])));} unset($r);
    return array_values($out);
}
function rc_can_see(array $actor, array $row): bool {
    if ((string)$row['sender_actor_key'] === $actor['actorKey']) return true;
    if ($actor['scope']==='BELM') return (string)$row['recipient_scope']==='BELM' && (in_array((string)$row['recipient_role'],$actor['roleKeys'],true) || (string)$row['recipient_role']==='all_belm');
    return (string)$row['customer_id']===(string)$actor['customerId'] && (string)$row['recipient_scope']==='CUSTOMER' && (in_array((string)$row['recipient_role'],$actor['roleKeys'],true) || (string)$row['recipient_role']==='customer_all');
}

$actor = rc_actor($payload);
$labels = rc_labels();
$recipients = rc_matrix($actor);

if ($method === 'GET') {
    $params=[];
    if ($actor['scope']==='BELM') {
        $roles=array_values(array_unique(array_merge($actor['roleKeys'],['all_belm']))); $marks=implode(',',array_fill(0,count($roles),'?'));
        $sql="SELECT rc.*,c.name AS customer_name,rr.read_at FROM role_communications rc LEFT JOIN customers c ON c.id=rc.customer_id LEFT JOIN role_communication_reads rr ON rr.communication_id=rc.id AND rr.reader_key=? WHERE ((rc.recipient_scope='BELM' AND rc.recipient_role IN ($marks)) OR rc.sender_actor_key=?) ORDER BY rc.created_at DESC LIMIT 250";
        $params=array_merge([$actor['actorKey']],$roles,[$actor['actorKey']]);
    } else {
        $roles=array_values(array_unique(array_merge($actor['roleKeys'],['customer_all']))); $marks=implode(',',array_fill(0,count($roles),'?'));
        $sql="SELECT rc.*,c.name AS customer_name,rr.read_at FROM role_communications rc LEFT JOIN customers c ON c.id=rc.customer_id LEFT JOIN role_communication_reads rr ON rr.communication_id=rc.id AND rr.reader_key=? WHERE rc.customer_id=? AND ((rc.recipient_scope='CUSTOMER' AND rc.recipient_role IN ($marks)) OR rc.sender_actor_key=?) ORDER BY rc.created_at DESC LIMIT 250";
        $params=array_merge([$actor['actorKey'],$actor['customerId']],$roles,[$actor['actorKey']]);
    }
    $stmt=db()->prepare($sql);$stmt->execute($params);$rows=$stmt->fetchAll();
    $messages=array_map(function($r)use($actor,$labels){return [
        'id'=>$r['id'],'customerId'=>$r['customer_id'],'customerName'=>$r['customer_name'],'senderName'=>$r['sender_name'],'senderRole'=>$r['sender_role'],
        'recipientScope'=>$r['recipient_scope'],'recipientRole'=>$r['recipient_role'],'recipientLabel'=>($r['recipient_scope']==='BELM'?'BELM · ':'Customer · ').($labels[$r['recipient_role']]??ucwords(str_replace('_',' ',$r['recipient_role']))),
        'subject'=>$r['subject'],'message'=>$r['message'],'priority'=>$r['priority'],'relatedType'=>$r['related_type'],'relatedId'=>$r['related_id'],'machineId'=>$r['machine_id'],'actionUrl'=>$r['action_url'],'createdAt'=>$r['created_at'],
        'isSent'=>(string)$r['sender_actor_key']===$actor['actorKey'],'isRead'=>((string)$r['sender_actor_key']===$actor['actorKey'])||!empty($r['read_at'])
    ];},$rows);
    $customers=[];
    if($actor['scope']==='BELM' && array_filter($recipients,fn($r)=>!empty($r['needsCustomer']))){$customers=db()->query("SELECT id,name FROM customers WHERE deleted_at IS NULL AND is_active=1 ORDER BY name")->fetchAll();}
    json_out(['ok'=>true,'actor'=>['scope'=>$actor['scope'],'name'=>$actor['name'],'role'=>$actor['primaryRole'],'roleLabel'=>$labels[$actor['primaryRole']]??ucwords(str_replace('_',' ',$actor['primaryRole'])),'customerId'=>$actor['customerId']],'recipients'=>$recipients,'customers'=>$customers,'messages'=>$messages]);
}

if ($method === 'POST' && empty($_GET['id'])) {
    $b=body();$recipientKey=strtolower(trim((string)($b['recipient']??'')));$allowed=null;
    foreach($recipients as $r){if($r['key']===$recipientKey){$allowed=$r;break;}}
    if(!$allowed)json_error('That role is not an allowed communication recipient for your current role.',403);
    $subject=trim((string)($b['subject']??''));$message=trim((string)($b['message']??''));$priority=strtoupper(trim((string)($b['priority']??'NORMAL')));
    if($subject==='')$subject='Operational message'; if(strlen($subject)>180)json_error('Subject must be 180 characters or fewer.',422);
    if($message==='')json_error('Message is required.',422); if(strlen($message)>2500)json_error('Message must be 2500 characters or fewer.',422);
    if(!in_array($priority,['NORMAL','ATTENTION','URGENT'],true))$priority='NORMAL';
    $customerId=$actor['scope']==='CUSTOMER'?$actor['customerId']:null;
    if($actor['scope']==='BELM'&&$allowed['scope']==='CUSTOMER'){$customerId=trim((string)($b['customerId']??''));if($customerId==='')json_error('Select the customer company for this message.',422);$s=db()->prepare('SELECT 1 FROM customers WHERE id=? AND deleted_at IS NULL AND is_active=1');$s->execute([$customerId]);if(!$s->fetchColumn())json_error('Customer was not found.',404);}
    $machineId=trim((string)($b['machineId']??''))?:null;
    if($machineId){$s=db()->prepare('SELECT customer_id FROM machines WHERE id=? AND deleted_at IS NULL');$s->execute([$machineId]);$machineCustomer=$s->fetchColumn();if(!$machineCustomer)json_error('Machine was not found.',404);if($customerId&&$machineCustomer!==$customerId)json_error('That machine does not belong to the selected customer.',403);}
    $actionUrl=trim((string)($b['actionUrl']??''));if($actionUrl!==''&&!str_starts_with($actionUrl,'/'))$actionUrl='';
    $id=uuid();
    db()->prepare('INSERT INTO role_communications (id,customer_id,sender_scope,sender_actor_key,sender_name,sender_role,recipient_scope,recipient_role,subject,message,priority,related_type,related_id,machine_id,action_url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())')->execute([
        $id,$customerId,$actor['scope'],$actor['actorKey'],$actor['name'],$actor['primaryRole'],$allowed['scope'],$allowed['role'],$subject,$message,$priority,trim((string)($b['relatedType']??''))?:null,trim((string)($b['relatedId']??''))?:null,$machineId,$actionUrl?:null
    ]);
    json_out(['ok'=>true,'id'=>$id,'message'=>'Role message sent.'],201);
}

$id=trim((string)($_GET['id']??''));$action=trim((string)($_GET['action']??''));
if($method==='PUT'&&$id!==''&&$action==='read'){
    $stmt=db()->prepare('SELECT * FROM role_communications WHERE id=?');$stmt->execute([$id]);$row=$stmt->fetch();if(!$row)json_error('Message was not found.',404);if(!rc_can_see($actor,$row))json_error('You do not have access to this message.',403);
    db()->prepare('INSERT INTO role_communication_reads (communication_id,reader_key,read_at) VALUES (?,?,NOW()) ON CONFLICT (communication_id,reader_key) DO UPDATE SET read_at=EXCLUDED.read_at')->execute([$id,$actor['actorKey']]);
    json_out(['ok'=>true]);
}
json_error('Unknown request',404);
