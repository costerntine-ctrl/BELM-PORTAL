<?php
// Included only after the Job Card endpoint authenticates and establishes $ctx.
require_once __DIR__.'/weekly_maintenance_helpers.php';
if(empty($ctx['isTechnician'])&&empty($ctx['isManager']))json_error('Workshop reporting access required.',403);
function weekly_filters(): array {
    $b=$_SERVER['REQUEST_METHOD']==='POST'?body():$_GET;
    $out=[];
    foreach(['from','to'] as $key){$value=trim((string)($b[$key]??''));$d=DateTimeImmutable::createFromFormat('!Y-m-d',$value);if(!$d||$d->format('Y-m-d')!==$value)json_error('Choose a valid reporting period.',422);$out[$key]=$value;}
    if($out['from']>$out['to']||strtotime($out['to'])-strtotime($out['from'])>93*86400)json_error('Choose an ordered period of up to 94 days.',422);
    foreach(['machine','technician','status','verification','search'] as $key)$out[$key]=mb_substr(trim((string)($b[$key]??'')),0,180);
    return $out;
}
function weekly_collect(array $ctx,array $filters): array {
    $params=[];$scope=weekly_scope($ctx,$params);
    $where=[$scope,"UPPER(COALESCE(j.status,''))<>'CANCELLED'","COALESCE(j.completed_at,j.updated_at,j.created_at)>=?::date","COALESCE(j.completed_at,j.updated_at,j.created_at)<(?::date + INTERVAL '1 day')"];
    $params[]=$filters['from'];$params[]=$filters['to'];
    foreach(['machine'=>"CONCAT_WS(' ',m.brand,m.model,m.fleet_number,m.serial_number)",'technician'=>'j.technician_name','search'=>"CONCAT_WS(' ',j.job_card_no,j.title,j.fault_description,j.work_done,m.brand,m.model,m.fleet_number,c.name)"] as $key=>$column){if($filters[$key]!==''){$where[]=$column.' ILIKE ?';$params[]='%'.$filters[$key].'%';}}
    $stmt=db()->prepare("SELECT j.*,bc.source_type,bc.source_id,bc.blocker_reason,c.name AS customer_name,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number FROM digital_job_cards j JOIN breakdown_cases bc ON bc.id=j.case_id JOIN customers c ON c.id=j.customer_id JOIN machines m ON m.id=j.machine_id WHERE ".implode(' AND ',$where)." ORDER BY COALESCE(j.completed_at,j.updated_at,j.created_at) DESC,j.id LIMIT 1001");
    $stmt->execute($params);$jobs=$stmt->fetchAll();if(count($jobs)>1000)json_error('More than 1,000 jobs match. Shorten the period or add a machine/technician filter.',422);
    $items=[];$checks=db()->prepare("SELECT id,filled_by,overall_status,created_at FROM checklist_reports WHERE machine_id=? AND (id=? OR (created_at>=?::date AND created_at<(?::date + INTERVAL '1 day'))) ORDER BY created_at DESC");
    $parts=db()->prepare('SELECT id,spare_name,quantity,unit,status FROM breakdown_spare_requests WHERE job_card_id=? ORDER BY requested_at');
    foreach($jobs as $job){$checks->execute([$job['machine_id'],$job['source_type']==='CHECKLIST_REPORT'?$job['source_id']:'',$filters['from'],$filters['to']]);$parts->execute([$job['id']]);$item=weekly_project_job($job,$checks->fetchAll(),$parts->fetchAll());if($filters['status']!==''&&$item['status']!==$filters['status'])continue;if($filters['verification']==='verified'&&!$item['verified']||$filters['verification']==='unconfirmed'&&$item['verified'])continue;$items[]=$item;}
    return ['title'=>'Weekly maintenance accomplishment report','from'=>$filters['from'],'to'=>$filters['to'],'generatedAt'=>date('c'),'preparedBy'=>$ctx['actorName'],'filters'=>$filters,'summary'=>weekly_summary($items),'items'=>$items,'scope'=>$ctx['kind']==='customer'?'Customer workshop':($ctx['isTechnician']?'Assigned technician jobs':'BELM workshop'),'verificationRule'=>'Verified means completed, diagnosis and work recorded, manager approval with reviewer/date, and passed final test. Same-machine checklists are contextual unless explicitly linked as the originating checklist.'];
}
function weekly_snapshot_scope(array $ctx,array &$params): string {
    $params[]=$ctx['kind'];$scope='actor_kind=?';
    if($ctx['kind']==='customer'){$scope.=' AND customer_id=?';$params[]=$ctx['customerId'];}
    if(!$ctx['isManager']){$scope.=' AND actor_id=?';$params[]=$ctx['actorId'];}
    return $scope;
}
function weekly_load_snapshot(array $ctx,string $id): array {
    $params=[];$scope=weekly_snapshot_scope($ctx,$params);$params[]=$id;
    $stmt=db()->prepare('SELECT payload,created_at FROM weekly_maintenance_snapshots WHERE '.$scope.' AND id=?');$stmt->execute($params);$r=$stmt->fetch();if(!$r)json_error('Report is unavailable for this account.',404);
    $report=json_decode($r['payload'],true);$report['snapshotId']=$id;$report['archivedAt']=$r['created_at'];return $report;
}
if($method==='GET'&&$action==='weekly-pdf'){
    $report=$id!==''?weekly_load_snapshot($ctx,$id):weekly_collect($ctx,weekly_filters());
    require __DIR__.'/weekly_maintenance_pdf.php';weekly_output_pdf($report);exit;
}
if($method==='GET'&&$action==='weekly-history'){
    $params=[];$scope=weekly_snapshot_scope($ctx,$params);$offset=max(0,(int)($_GET['offset']??0));$stmt=db()->prepare('SELECT id,actor_name,report_from,report_to,created_at FROM weekly_maintenance_snapshots WHERE '.$scope.' ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET '.$offset);$stmt->execute($params);$rows=$stmt->fetchAll();$more=count($rows)>20;json_out(['items'=>array_slice($rows,0,20),'hasMore'=>$more]);
}
if($method==='GET'&&$action==='weekly-snapshot'){
    json_out(weekly_load_snapshot($ctx,$id));
}
if($method==='GET'&&$action==='weekly-live'){json_out(weekly_collect($ctx,weekly_filters()));}
if($method==='POST'&&$action==='weekly-archive'){
    $report=weekly_collect($ctx,weekly_filters());$snapshotId=uuid();db()->prepare('INSERT INTO weekly_maintenance_snapshots(id,actor_kind,actor_id,customer_id,actor_name,report_from,report_to,payload) VALUES(?,?,?,?,?,?,?,?::jsonb)')->execute([$snapshotId,$ctx['kind'],$ctx['actorId'],$ctx['kind']==='customer'?$ctx['customerId']:null,$ctx['actorName'],$report['from'],$report['to'],json_encode($report,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]);json_out(['id'=>$snapshotId,'message'=>'Weekly snapshot archived. Original workshop records are unchanged.']);
}
json_error('Unsupported weekly report action.',405);
