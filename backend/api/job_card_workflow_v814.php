<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/table_pdf_helper.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = trim((string)($_GET['action'] ?? 'list'));
$id = trim((string)($_GET['id'] ?? ''));
$payload = current_token_payload();
if (!$payload) json_error('Not authenticated', 401);

function jcv814_ctx(array $payload): array {
    if (($payload['type'] ?? '') === 'customer') {
        $customer = require_customer_auth();
        $role = strtolower(trim((string)($customer['customerRole'] ?? (($customer['actorType'] ?? '') === 'owner' ? 'owner' : ''))));
        return [
            'kind' => 'customer',
            'customerId' => (string)$customer['id'],
            'actorId' => (string)($customer['actorId'] ?? $customer['id']),
            'actorName' => (string)($customer['actorName'] ?? $customer['name'] ?? 'Customer User'),
            'role' => $role,
            'isTechnician' => $role === 'technician',
            'isManager' => ($customer['actorType'] ?? '') === 'owner' || in_array($role, ['owner','admin','customer_admin','workshop_manager'], true),
        ];
    }
    $user = require_auth();
    $roleName = strtolower(trim((string)($user['roleName'] ?? $user['role'] ?? 'staff')));
    $isTechnician = $roleName === 'technician';
    if (!$isTechnician) require_any_page_access($user, ['job-cards','service-requests']);
    return [
        'kind' => 'belm',
        'customerId' => (string)($user['assignedCustomerId'] ?? ''),
        'actorId' => (string)($user['id'] ?? ''),
        'actorName' => (string)($user['name'] ?? 'BELM'),
        'role' => $roleName,
        'isTechnician' => $isTechnician,
        'isManager' => !$isTechnician && belm_user_has_named_role($user, ['Super Admin','Engineer','Workshop Manager']),
    ];
}

function jcv814_job(array $ctx, string $id): array {
    $stmt = db()->prepare(
        "SELECT j.*,bc.customer_id AS case_customer_id,bc.machine_id AS case_machine_id,bc.source_type,bc.source_id,
                bc.status AS case_status,bc.current_stage,bc.current_department,bc.blocker_reason,bc.opened_at,bc.closed_at,
                c.name AS customer_name,c.address AS customer_address,c.is_machinery_admin,
                m.brand,m.model,m.machine_type,m.serial_number,m.reg_number,m.fleet_number
         FROM digital_job_cards j
         JOIN breakdown_cases bc ON bc.id=j.case_id
         JOIN customers c ON c.id=j.customer_id
         JOIN machines m ON m.id=j.machine_id
         WHERE j.id=? AND c.deleted_at IS NULL AND m.deleted_at IS NULL
         LIMIT 1"
    );
    $stmt->execute([$id]);
    $job = $stmt->fetch();
    if (!$job) json_error('Job Card not found.', 404);

    if ($ctx['kind'] === 'customer') {
        if ((string)$job['customer_id'] !== $ctx['customerId']) json_error('Not allowed.', 403);
        if (!empty($ctx['isTechnician']) && (string)($job['technician_id'] ?? '') !== $ctx['actorId']) {
            json_error('This Job Card is not assigned to this Technician.', 403);
        }
    } elseif (!empty($ctx['isTechnician'])) {
        if ((string)($job['technician_id'] ?? '') !== $ctx['actorId']) json_error('This Job Card is not assigned to this Technician.', 403);
    } else {
        $officialSupport = strtoupper((string)($job['source_type'] ?? '')) === 'SERVICE_REQUEST';
        if (!empty($job['is_machinery_admin']) && !$officialSupport) json_error('This customer is using its own maintenance team.', 403);
    }
    return $job;
}

/** Automatic role coordination: a milestone sends a targeted in-portal notice.
 * Deliberately independent of a human System Coordinator account.
 * An unavailable communications table must not interrupt a repair workflow.
 */
function jcv814_auto_coordinate(array $job, array $ctx, string $action, ?string $note): void {
    $routes = [
        'TECHNICIAN REPORT SUBMITTED' => ['workshop_manager', 'Report waiting for approval', 'ATTENTION'],
        'TECHNICIAN REPORT RETURNED' => ['technician', 'Report returned for correction', 'ATTENTION'],
        'WORKSHOP MANAGER APPROVED REPORT / MAINTENANCE / SPARE' => ['store_keeper', 'Approved spare parts require action', 'ATTENTION'],
        'WORKSHOP MANAGER APPROVED REPORT / MAINTENANCE' => ['technician', 'Maintenance approved; continue repair', 'NORMAL'],
        'TEST STARTED' => ['workshop_manager', 'Machine testing started', 'NORMAL'],
        'FINAL RESULT OK - JOB CARD AUTO CLOSED' => ['workshop_manager', 'Job Card completed', 'NORMAL'],
    ];
    if (!isset($routes[$action]) && !str_starts_with($action, 'FINAL RESULT NOT_OK')
        && !str_starts_with($action, 'FINAL RESULT REWORK_REQUIRED')) return;
    [$role, $subject, $priority] = $routes[$action]
        ?? ['workshop_manager', 'Testing failed; review/rework required', 'ATTENTION'];
    $jobId = trim((string)($job['id'] ?? ''));
    $customerId = trim((string)($job['customer_id'] ?? ''));
    if ($jobId === '') return;

    // The work owner and the recipient role determine scope, not merely the
    // account that clicked the last workflow button.  BELM support cases are
    // coordinated by BELM even when the customer initiated the request.
    $isCustomerInternal = !empty($job['is_machinery_admin'])
        && strtoupper(trim((string)($job['source_type'] ?? ''))) !== 'SERVICE_REQUEST';
    $recipientScope = $isCustomerInternal ? 'CUSTOMER' : 'BELM';
    if ($role === 'technician' && !empty($job['technician_id'])) {
        try {
            $assignee = db()->prepare('SELECT is_customer_managed FROM users WHERE id=? AND deleted_at IS NULL');
            $assignee->execute([(string)$job['technician_id']]);
            $isCustomerTech = $assignee->fetchColumn();
            if ($isCustomerTech !== false) $recipientScope = ((int)$isCustomerTech === 1) ? 'CUSTOMER' : 'BELM';
        } catch (Throwable $ignored) {
            error_log('BELM auto coordination: assignee scope lookup failed.');
        }
    }
    $senderScope = $ctx['kind'] === 'customer' ? 'CUSTOMER' : 'BELM';
    try {
        db()->prepare('INSERT INTO role_communications
            (id, customer_id, sender_scope, sender_actor_key, sender_name, sender_role,
             recipient_scope, recipient_role, subject, message, priority, related_type,
             related_id, machine_id, action_url, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())')->execute([
            uuid(), $customerId ?: null, $senderScope, 'system:auto-coordination',
            'BELM Automatic Coordination', 'system', $recipientScope, $role,
            $subject, 'Job Card ' . (string)($job['job_card_no'] ?? $jobId)
                . ': ' . $action . ($note ? ' — ' . $note : ''),
            $priority, 'JOB_CARD', $jobId, $job['machine_id'] ?? null,
            '/job-cards/?module=job-cards',
        ]);
    } catch (Throwable $ignored) {
        // An unavailable communications table never blocks a repair workflow.
        error_log('BELM automatic role coordination notice could not be recorded.');
    }
}

function jcv814_log(array $job, array $ctx, string $stage, string $department, string $action, ?string $note=null): void {
    db()->prepare(
        'INSERT INTO breakdown_case_events(id,case_id,stage,department,action,note,actor_type,actor_id,actor_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,NOW())'
    )->execute([uuid(),$job['case_id'],$stage,$department,$action,$note,$ctx['kind'],$ctx['actorId'] ?: null,$ctx['actorName']]);
    jcv814_auto_coordinate($job, $ctx, $action, $note);
}

function jcv814_set_case(array $job, string $stage, string $department, ?string $blocker, bool $close=false): void {
    db()->prepare(
        "UPDATE breakdown_cases SET current_stage=?,current_department=?,blocker_reason=?,stage_started_at=NOW(),status=?,updated_at=NOW(),closed_at=CASE WHEN ? THEN NOW() ELSE NULL END WHERE id=?"
    )->execute([$stage,$department,$blocker ?: null,$close ? 'COMPLETED' : 'OPEN',$close ? 1 : 0,$job['case_id']]);
}

function jcv814_report_text(array $b): string {
    $parts = [
        'DIAGNOSIS / INSPECTION' => trim((string)($b['diagnosis'] ?? '')),
        'EXPLANATION' => trim((string)($b['explanation'] ?? '')),
        'FINDINGS' => trim((string)($b['findings'] ?? '')),
        'ROOT CAUSE' => trim((string)($b['rootCause'] ?? '')),
        'SOLUTION' => trim((string)($b['solution'] ?? '')),
    ];
    $out=[];
    foreach ($parts as $label=>$value) $out[]=$label.":\n".($value !== '' ? $value : '-');
    return implode("\n\n", $out);
}

function jcv814_parse_report(?string $text): array {
    $text = trim((string)$text);
    $labels = ['DIAGNOSIS / INSPECTION'=>'diagnosis','EXPLANATION'=>'explanation','FINDINGS'=>'findings','ROOT CAUSE'=>'rootCause','SOLUTION'=>'solution'];
    $out=['diagnosis'=>$text,'explanation'=>'','findings'=>'','rootCause'=>'','solution'=>''];
    if ($text==='') return $out;
    $pattern='/^(DIAGNOSIS \/ INSPECTION|EXPLANATION|FINDINGS|ROOT CAUSE|SOLUTION):\s*$/mi';
    if (!preg_match_all($pattern,$text,$matches,PREG_OFFSET_CAPTURE)) return $out;
    $out=['diagnosis'=>'','explanation'=>'','findings'=>'','rootCause'=>'','solution'=>''];
    $count=count($matches[0]);
    for($i=0;$i<$count;$i++){
        $label=strtoupper(trim($matches[1][$i][0]));
        $start=$matches[0][$i][1]+strlen($matches[0][$i][0]);
        $end=$i+1<$count?$matches[0][$i+1][1]:strlen($text);
        $value=trim(substr($text,$start,$end-$start));
        $key=$labels[$label]??null;
        if($key)$out[$key]=$value==='-'?'':$value;
    }
    return $out;
}

function jcv814_test_text(int $minutes, string $result, string $notes='', ?string $startedAt=null): string {
    $started = $startedAt ?: date('c');
    return "TEST DURATION: {$minutes} MIN\nTEST STARTED: {$started}\nFINAL RESULT: {$result}".($notes!==''?"\nTEST NOTES: {$notes}":'');
}

function jcv814_parse_test(?string $text): array {
    $text=(string)$text;
    $out=['durationMinutes'=>0,'finalResult'=>'','testNotes'=>'','testStarted'=>''];
    if(preg_match('/TEST DURATION:\s*(\d+)\s*MIN/i',$text,$m))$out['durationMinutes']=(int)$m[1];
    if(preg_match('/FINAL RESULT:\s*([^\r\n]+)/i',$text,$m))$out['finalResult']=strtoupper(trim($m[1]));
    if(preg_match('/TEST STARTED:\s*([^\r\n]+)/i',$text,$m))$out['testStarted']=trim($m[1]);
    if(preg_match('/TEST NOTES:\s*([\s\S]*)$/i',$text,$m))$out['testNotes']=trim($m[1]);
    return $out;
}

function jcv814_grounded_days(array $job): float {
    $start = strtotime((string)($job['opened_at'] ?? ''));
    if(!$start)return 0.0;
    $end = !empty($job['closed_at']) ? strtotime((string)$job['closed_at']) : time();
    if(!$end)$end=time();
    return round(max(0,$end-$start)/86400,1);
}

function jcv814_maintenance_approved(array $job): bool {
    return str_starts_with(strtoupper(trim((string)($job['review_note'] ?? ''))),'MAINTENANCE APPROVED');
}

function jcv814_process(array $job, int $openSpares): array {
    $status=strtoupper(trim((string)($job['status']??'')));
    $stage=strtoupper(trim((string)($job['current_stage']??'')));
    $report=jcv814_parse_report($job['diagnosis']??'');
    $test=jcv814_parse_test($job['test_result']??'');
    $approved=jcv814_maintenance_approved($job);
    $step=1;$label='Create & Assign';
    if(!empty($job['technician_id'])){$step=1;$label='Assigned';}
    if(in_array($status,['RECEIVED','IN_PROGRESS','WAITING_FOR_PARTS','REPORT_REVIEW','TESTING','COMPLETED'],true)||!empty($job['started_at'])){$step=2;$label='Technician Received';}
    if($report['diagnosis']!==''||$report['findings']!==''){$step=3;$label='Diagnosis / Inspection';}
    if($status==='REPORT_REVIEW'){$step=4;$label='Manager Review';}
    elseif($approved){$step=5;$label=$openSpares>0||$status==='WAITING_FOR_PARTS'?'Maintenance / Spare':'Maintenance Approved';}
    if($status==='TESTING'||$test['durationMinutes']>0){$step=6;$label='Testing';}
    if($test['finalResult']!==''&&$test['finalResult']!=='PENDING'){$step=7;$label='Final Result: '.$test['finalResult'];}
    if($status==='COMPLETED'||strtoupper((string)($job['case_status']??''))==='COMPLETED'){$step=8;$label='Completed / Report';}
    $pending=trim((string)($job['blocker_reason']??''));
    if($pending===''&&$status!=='COMPLETED')$pending=trim((string)($job['completion_note']??''));
    if($pending===''&&$status==='REPORT_REVIEW')$pending='Waiting Workshop Manager report review';
    return ['step'=>$step,'label'=>$label,'pendingReason'=>$pending,'maintenanceApproved'=>$approved,'test'=>$test,'report'=>$report,'stage'=>$stage];
}

$ctx=jcv814_ctx($payload);

if($method==='GET'&&$action==='list'){
    $params=[];$where=["UPPER(COALESCE(j.status,''))<>'CANCELLED'"];
    if($ctx['kind']==='customer'){
        $where[]='j.customer_id=?';$params[]=$ctx['customerId'];
        if(!empty($ctx['isTechnician'])){$where[]='j.technician_id=?';$params[]=$ctx['actorId'];}
    }elseif(!empty($ctx['isTechnician'])){
        $where[]='j.technician_id=?';$params[]=$ctx['actorId'];
    }else{
        $where[]="(c.is_machinery_admin=0 OR bc.source_type='SERVICE_REQUEST')";
    }
    $machineId=trim((string)($_GET['machineId']??''));
    if($machineId!==''){$where[]='j.machine_id=?';$params[]=$machineId;}
    $stmt=db()->prepare(
        "SELECT j.*,bc.status AS case_status,bc.current_stage,bc.current_department,bc.blocker_reason,bc.opened_at,bc.closed_at,bc.source_type,
                c.name AS customer_name,c.address AS customer_address,m.brand,m.model,m.machine_type,m.serial_number,m.reg_number,m.fleet_number,
                (SELECT COUNT(*) FROM breakdown_spare_requests s WHERE s.job_card_id=j.id AND UPPER(COALESCE(s.status,'')) NOT IN ('REJECTED','PARTS_READY')) AS open_spares,
                (SELECT string_agg(s.spare_name, ', ' ORDER BY s.requested_at) FROM breakdown_spare_requests s WHERE s.job_card_id=j.id AND UPPER(COALESCE(s.status,'')) NOT IN ('REJECTED','PARTS_READY')) AS spare_names
         FROM digital_job_cards j JOIN breakdown_cases bc ON bc.id=j.case_id JOIN customers c ON c.id=j.customer_id JOIN machines m ON m.id=j.machine_id
         WHERE ".implode(' AND ',$where)." ORDER BY CASE WHEN UPPER(COALESCE(j.status,''))='COMPLETED' THEN 1 ELSE 0 END,COALESCE(j.updated_at,j.created_at) DESC LIMIT 150"
    );
    $stmt->execute($params);$rows=[];
    foreach($stmt->fetchAll() as $row){
        $openSpares=(int)($row['open_spares']??0);$process=jcv814_process($row,$openSpares);
        $rows[]=[
            'id'=>$row['id'],'caseId'=>$row['case_id'],'customerId'=>$row['customer_id'],'machineId'=>$row['machine_id'],
            'jobCardNo'=>$row['job_card_no'],'title'=>$row['title'],'faultDescription'=>$row['fault_description'],'status'=>$row['status'],
            'technicianId'=>$row['technician_id'],'technicianName'=>$row['technician_name']?:'Unassigned','customerName'=>$row['customer_name'],
            'machineLabel'=>trim((string)($row['brand']??'').' '.(string)($row['model']??''))?:($row['machine_type']??'Machine'),
            'fleetNumber'=>$row['fleet_number']?:'—','serialNumber'=>$row['serial_number']?:($row['reg_number']?:'—'),'address'=>$row['job_location']?:($row['customer_address']?:'—'),
            'repeatIssue'=>!empty($row['repeat_issue']),'caseType'=>!empty($row['repeat_issue'])?'REPEATED ISSUE':'NEW CASE',
            'diagnosis'=>$process['report']['diagnosis'],'explanation'=>$process['report']['explanation'],'findings'=>$process['report']['findings'],'rootCause'=>$process['report']['rootCause'],'solution'=>$process['report']['solution'],
            'workDone'=>$row['work_done']??'','maintenanceApproved'=>$process['maintenanceApproved'],'managerReview'=>$row['review_note']??'','reviewedBy'=>$row['reviewed_by_name']??'','reviewedAt'=>$row['reviewed_at']??null,
            'testDurationMinutes'=>$process['test']['durationMinutes'],'finalResult'=>$process['test']['finalResult'],'testNotes'=>$process['test']['testNotes'],
            'pendingReason'=>$process['pendingReason'],'groundedDays'=>jcv814_grounded_days($row),'processStep'=>$process['step'],'processLabel'=>$process['label'],
            'currentStage'=>$row['current_stage'],'currentDepartment'=>$row['current_department'],'openSpareRequests'=>$openSpares,'requiredSpare'=>trim((string)($row['spare_names']??'')),
            'receivedAt'=>$row['received_at'],'startedAt'=>$row['started_at'],'submittedAt'=>$row['technician_submitted_at'],'completedAt'=>$row['completed_at'],'updatedAt'=>$row['updated_at'],'openedAt'=>$row['opened_at'],
        ];
    }
    json_out(['items'=>$rows,'actor'=>['kind'=>$ctx['kind'],'role'=>$ctx['role'],'isTechnician'=>$ctx['isTechnician'],'isManager'=>$ctx['isManager']]]);
}

if($method==='PUT'&&$action==='submit-report'&&$id!==''){
    if(empty($ctx['isTechnician']))json_error('Technician login required.',403);
    $job=jcv814_job($ctx,$id);$status=strtoupper((string)$job['status']);
    if(in_array($status,['REPORT_REVIEW','COMPLETED','CANCELLED'],true))json_error($status==='REPORT_REVIEW'?'This Technician Report is already waiting for Workshop Manager review.':'This Job Card is closed.',409);
    if(empty($job['received_at']))json_error('Receive / acknowledge this Job Card before submitting diagnosis.',409);
    $b=body();
    foreach(['diagnosis'=>'Diagnosis / Inspection','explanation'=>'Explanation','findings'=>'Findings','rootCause'=>'Root Cause','solution'=>'Solution'] as $key=>$label){if(trim((string)($b[$key]??''))==='')json_error($label.' is required.',422);}
    $requiredSpare=trim((string)($b['requiredSpare']??''));$qty=(float)($b['requiredSpareQty']??1);
    if($requiredSpare!==''&&$qty<=0)json_error('Required Spare quantity must be above zero.',422);
    $repeat=!empty($b['repeatIssue']);$report=jcv814_report_text($b);
    db()->prepare("UPDATE digital_job_cards SET diagnosis=?,repeat_issue=?,status='REPORT_REVIEW',technician_id=?,technician_name=?,started_at=COALESCE(started_at,NOW()),technician_submitted_at=NOW(),reviewed_at=NULL,reviewed_by_name=NULL,review_note=NULL,completion_note='Waiting Workshop Manager report review',updated_at=NOW() WHERE id=?")
        ->execute([$report,$repeat?1:0,$ctx['actorId'],$ctx['actorName'],$id]);
    if($requiredSpare!==''){
        $exists=db()->prepare("SELECT id FROM breakdown_spare_requests WHERE job_card_id=? AND LOWER(TRIM(spare_name))=LOWER(TRIM(?)) AND UPPER(COALESCE(status,'')) NOT IN ('REJECTED','PARTS_READY') LIMIT 1");
        $exists->execute([$id,$requiredSpare]);
        if(!$exists->fetchColumn()){
            db()->prepare("INSERT INTO breakdown_spare_requests(id,case_id,job_card_id,spare_name,quantity,unit,reason,status,requested_by_name,requested_at,updated_at) VALUES(?,?,?,?,?,'pcs','Required from Technician Diagnosis / Inspection','WAITING_BOSS_APPROVAL',?,NOW(),NOW())")
                ->execute([uuid(),$job['case_id'],$id,$requiredSpare,$qty,$ctx['actorName']]);
        }
    }
    jcv814_set_case($job,'BOSS_APPROVAL','Workshop Manager','Waiting Workshop Manager report review');
    jcv814_log($job,$ctx,'BOSS_APPROVAL','Workshop Manager','TECHNICIAN REPORT SUBMITTED',($repeat?'Repeated issue':'New case').($requiredSpare!==''?'; Required spare: '.$requiredSpare.' x '.$qty:''));
    json_out(['ok'=>true,'status'=>'REPORT_REVIEW','message'=>'Technician Report submitted to Workshop Manager for review.']);
}

if($method==='PUT'&&$action==='review-report'&&$id!==''){
    if(empty($ctx['isManager']))json_error('Workshop Manager / Administration approval required.',403);
    $job=jcv814_job($ctx,$id);
    // Approval belongs to the workshop responsible for the repair, not merely
    // any administrator of the customer whose machine is being serviced.
    $customerWorkshop = !empty($job['is_machinery_admin'])
        && strtoupper((string)($job['source_type'] ?? '')) !== 'SERVICE_REQUEST';
    if (($ctx['kind'] === 'customer') !== $customerWorkshop) {
        json_error('Only the Workshop Manager responsible for this Job Card may review this report.', 403);
    }
    $status=strtoupper((string)$job['status']);
    if($status!=='REPORT_REVIEW')json_error('Only a Technician Report waiting for review can be approved or returned.',409);
    $b=body();$approve=!empty($b['approve']);$note=trim((string)($b['note']??''));
    if(!$approve&&$note==='')json_error('Enter why the report is being returned to the Technician.',422);
    if($approve){
        $managerNote='MAINTENANCE APPROVED'.($note!==''?': '.$note:'');
        db()->prepare("UPDATE digital_job_cards SET reviewed_at=NOW(),reviewed_by_name=?,review_note=?,completion_note=NULL,updated_at=NOW() WHERE id=?")
            ->execute([$ctx['actorName'],$managerNote,$id]);
        db()->prepare("UPDATE breakdown_spare_requests SET status='APPROVED',approved_by_name=?,approved_at=NOW(),approval_note=COALESCE(NULLIF(?,''),approval_note),updated_at=NOW() WHERE job_card_id=? AND UPPER(COALESCE(status,''))='WAITING_BOSS_APPROVAL'")
            ->execute([$ctx['actorName'],$note,$id]);
        $sp=db()->prepare("SELECT COUNT(*) FROM breakdown_spare_requests WHERE job_card_id=? AND UPPER(COALESCE(status,'')) NOT IN ('REJECTED','PARTS_READY')");$sp->execute([$id]);$open=(int)$sp->fetchColumn();
        if($open>0){
            db()->prepare("UPDATE digital_job_cards SET status='WAITING_FOR_PARTS',completion_note='Maintenance approved - waiting approved spare / parts',updated_at=NOW() WHERE id=?")->execute([$id]);
            jcv814_set_case($job,'STORE_CHECK','Store Keeper','Maintenance approved; approved spare waiting Store / Procurement');
            jcv814_log($job,$ctx,'STORE_CHECK','Store Keeper','WORKSHOP MANAGER APPROVED REPORT / MAINTENANCE / SPARE',$note?:'Approved; Store / Procurement action required.');
            json_out(['ok'=>true,'status'=>'WAITING_FOR_PARTS','message'=>'Report and maintenance approved. Spare approved; waiting Store / Procurement.']);
        }
        db()->prepare("UPDATE digital_job_cards SET status='IN_PROGRESS',completion_note=NULL,updated_at=NOW() WHERE id=?")->execute([$id]);
        jcv814_set_case($job,'REPAIR','Technician',null);
        jcv814_log($job,$ctx,'REPAIR','Technician','WORKSHOP MANAGER APPROVED REPORT / MAINTENANCE',$note?:'Maintenance approved; Technician can continue repair and testing.');
        json_out(['ok'=>true,'status'=>'IN_PROGRESS','message'=>'Technician Report approved. Maintenance and testing can continue.']);
    }
    $managerNote='REPORT RETURNED: '.$note;
    db()->prepare("UPDATE digital_job_cards SET status='IN_PROGRESS',reviewed_at=NOW(),reviewed_by_name=?,review_note=?,completion_note=?,technician_submitted_at=NULL,updated_at=NOW() WHERE id=?")
        ->execute([$ctx['actorName'],$managerNote,$note,$id]);
    jcv814_set_case($job,'DIAGNOSIS','Technician',$note);
    jcv814_log($job,$ctx,'DIAGNOSIS','Technician','TECHNICIAN REPORT RETURNED',$note);
    json_out(['ok'=>true,'status'=>'IN_PROGRESS','message'=>'Report returned to Technician for correction.']);
}

if($method==='PUT'&&$action==='start-test'&&$id!==''){
    if(empty($ctx['isTechnician']))json_error('Technician login required.',403);
    $job=jcv814_job($ctx,$id);
    if(empty($job['received_at']))json_error('Receive / acknowledge this Job Card before starting testing.',409);
    if(strtoupper((string)($job['status'] ?? ''))!=='IN_PROGRESS')json_error('Testing can start only while the approved repair is in progress.',409);
    if(!jcv814_maintenance_approved($job))json_error('Workshop Manager must approve the Technician Report / maintenance before testing.',409);
    $sp=db()->prepare("SELECT COUNT(*) FROM breakdown_spare_requests WHERE job_card_id=? AND UPPER(COALESCE(status,'')) NOT IN ('REJECTED','PARTS_READY')");$sp->execute([$id]);
    if((int)$sp->fetchColumn()>0)json_error('Required spare is still pending. Testing can start only after Parts Ready.',409);
    $b=body();$minutes=(int)($b['durationMinutes']??0);$allowed=[30,60,120,240,480,720,1440];
    if(!in_array($minutes,$allowed,true))json_error('Select a valid test time.',422);
    $work=trim((string)($b['workDone']??''));if($work==='')json_error('Record Work Done / maintenance performed before starting the test.',422);
    if(strtoupper((string)($job['status'] ?? ''))==='TESTING') json_error('Testing already started. Complete the current test before starting another.',409);
    $test=jcv814_test_text($minutes,'PENDING');
    db()->prepare("UPDATE digital_job_cards SET work_done=?,test_result=?,status='TESTING',completion_note=?,updated_at=NOW() WHERE id=?")
        ->execute([$work,$test,'Testing in progress - final result pending',$id]);
    $label=$minutes>=60?($minutes/60).' hr test':'30 min test';
    jcv814_set_case($job,'TESTING','Technician','Testing in progress: '.$label.'; final result pending');
    jcv814_log($job,$ctx,'TESTING','Technician','TEST STARTED',$label);
    json_out(['ok'=>true,'status'=>'TESTING','durationMinutes'=>$minutes,'message'=>'Testing started. Select the final result when testing is complete.']);
}

if($method==='PUT'&&$action==='final-result'&&$id!==''){
    if(empty($ctx['isTechnician']))json_error('Technician login required.',403);
    $job=jcv814_job($ctx,$id);
    if(!jcv814_maintenance_approved($job))json_error('Workshop Manager approval is required before final testing.',409);
    $sp=db()->prepare("SELECT COUNT(*) FROM breakdown_spare_requests WHERE job_card_id=? AND UPPER(COALESCE(status,'')) NOT IN ('REJECTED','PARTS_READY')");$sp->execute([$id]);
    if((int)$sp->fetchColumn()>0)json_error('Required spare is still pending. Final result cannot be submitted.',409);
    $b=body();$result=strtoupper(trim((string)($b['finalResult']??'')));$allowed=['OK','NOT_OK','REWORK_REQUIRED'];
    if(!in_array($result,$allowed,true))json_error('Select Final Result: OK, NOT OK or REWORK REQUIRED.',422);
    $pending=trim((string)($b['pendingReason']??''));$notes=trim((string)($b['testNotes']??''));
    if($result!=='OK'&&$pending==='')json_error('Enter why the Job Card is pending / why the test did not pass.',422);
    if(strtoupper((string)($job['status'] ?? ''))!=='TESTING') json_error('Start testing before submitting the final result.',409);
    $currentTest=jcv814_parse_test($job['test_result']??'');
    $minutes=(int)$currentTest['durationMinutes'];
    $startedAt=trim((string)$currentTest['testStarted']);
    $startedTimestamp=$startedAt!==''?strtotime($startedAt):false;
    if($minutes<=0 || !$startedTimestamp) json_error('Testing start or required duration is missing. Contact the Workshop Manager.',409);
    // Validate against the server clock; never trust a duration submitted by the browser.
    if($result==='OK' && time() - $startedTimestamp < $minutes * 60) {
        json_error('Testing duration has not elapsed. Wait until the required test time is complete.',409);
    }
    $test=jcv814_test_text($minutes,$result,$notes,$startedAt);
    if($result==='OK'){
        $grounded=jcv814_grounded_days($job);
        $finalNote='FINAL RESULT OK - machine returned to service. Grounded days: '.$grounded;
        db()->prepare("UPDATE digital_job_cards SET test_result=?,status='COMPLETED',completion_note=?,completed_at=NOW(),updated_at=NOW() WHERE id=?")
            ->execute([$test,$finalNote,$id]);
        jcv814_set_case($job,'COMPLETED','Completed',null,true);
        jcv814_log($job,$ctx,'COMPLETED','Completed','FINAL RESULT OK - JOB CARD AUTO CLOSED','Grounded days: '.$grounded.'. Final report generated from complete process history.');
        try{
            if(strtoupper((string)($job['source_type']??''))==='SERVICE_REQUEST'&&!empty($job['source_id'])){
                db()->prepare("UPDATE service_requests SET status='COMPLETED',completed_at=COALESCE(completed_at,NOW()),updated_at=NOW() WHERE id=? AND status<>'CANCELLED'")->execute([$job['source_id']]);
            }elseif(strtoupper((string)($job['source_type']??''))==='OPERATOR_REPORT'&&!empty($job['source_id'])){
                db()->prepare("UPDATE operator_reports SET status='RESOLVED',resolved_at=COALESCE(resolved_at,NOW()) WHERE id=? AND status='OPEN'")->execute([$job['source_id']]);
            }
        }catch(Throwable $ignored){}
        json_out(['ok'=>true,'status'=>'COMPLETED','groundedDays'=>$grounded,'reportUrl'=>'/api/job-card-workflow-v814?action=report&id='.rawurlencode($id),'message'=>'Final Result OK. Job Card closed and removed from the active queue.']);
    }
    $note='FINAL RESULT '.$result.' - '.$pending;
    db()->prepare("UPDATE digital_job_cards SET test_result=?,status='IN_PROGRESS',completion_note=?,completed_at=NULL,updated_at=NOW() WHERE id=?")
        ->execute([$test,$pending,$id]);
    jcv814_set_case($job,'REPAIR','Technician',$pending);
    jcv814_log($job,$ctx,'REPAIR','Technician',$note,$notes?:$pending);
    json_out(['ok'=>true,'status'=>'IN_PROGRESS','pendingReason'=>$pending,'message'=>'Final Result '.$result.'. Job Card remains pending / grounded.']);
}

if($method==='GET'&&$action==='report'&&$id!==''){
    $job=jcv814_job($ctx,$id);$report=jcv814_parse_report($job['diagnosis']??'');$test=jcv814_parse_test($job['test_result']??'');
    $events=db()->prepare('SELECT stage,department,action,note,actor_name,created_at FROM breakdown_case_events WHERE case_id=? ORDER BY created_at ASC');$events->execute([$job['case_id']]);$eventRows=$events->fetchAll();
    $spares=db()->prepare('SELECT spare_name,part_number,quantity,unit,status,approved_by_name,requested_at,fulfilled_at FROM breakdown_spare_requests WHERE job_card_id=? ORDER BY requested_at ASC');$spares->execute([$id]);$spareRows=$spares->fetchAll();
    $grounded=jcv814_grounded_days($job);$process=jcv814_process($job,count(array_filter($spareRows,fn($s)=>!in_array(strtoupper((string)$s['status']),['REJECTED','PARTS_READY'],true))));
    $rows=[
        ['Job Card',$job['job_card_no']],['Customer',$job['customer_name']],['Machine',trim((string)$job['brand'].' '.(string)$job['model'])],['Fleet / Serial',($job['fleet_number']?:'—').' / '.($job['serial_number']?:($job['reg_number']?:'—'))],
        ['Technician',$job['technician_name']?:'Unassigned'],['Case Type',!empty($job['repeat_issue'])?'REPEATED ISSUE / REWORK':'NEW CASE'],['Grounded Days',(string)$grounded],['Current Status',$job['status']],['Pending Reason',$process['pendingReason']?:'-'],
        ['',''],['DIAGNOSIS / INSPECTION',$report['diagnosis']?:'-'],['EXPLANATION',$report['explanation']?:'-'],['FINDINGS',$report['findings']?:'-'],['ROOT CAUSE',$report['rootCause']?:'-'],['SOLUTION',$report['solution']?:'-'],
        ['Workshop Manager Review',$job['review_note']?:'-'],['Reviewed By',$job['reviewed_by_name']?:'-'],['Maintenance / Work Done',$job['work_done']?:'-'],['Test Duration',$test['durationMinutes']?($test['durationMinutes'].' minutes'):'-'],['Final Result',$test['finalResult']?:'-'],['Test Notes',$test['testNotes']?:'-'],['Completion Note',$job['completion_note']?:'-'],
    ];
    if($spareRows){$rows[]=['',''];$rows[]=['SPARE / PART PROCESS',''];foreach($spareRows as $s){$rows[]=[trim((string)$s['spare_name']).' x '.(string)$s['quantity'].' '.(string)$s['unit'],strtoupper((string)$s['status']).(!empty($s['part_number'])?' · Ref '.$s['part_number']:'')];}}
    $rows[]=['',''];$rows[]=['COMPLETE PROCESS / ACTIVITY HISTORY',''];
    foreach($eventRows as $e){$rows[]=[display_date_billing($e['created_at']).' · '.($e['department']?:$e['stage']),($e['action']?:'Activity').(!empty($e['note'])?' — '.$e['note']:'').' · '.($e['actor_name']?:'System')];}
    $internal=!empty($job['is_machinery_admin'])&&strtoupper((string)($job['source_type']??''))!=='SERVICE_REQUEST';
    $watermark=$internal&&function_exists('pdf_customer_watermark')?pdf_customer_watermark((string)$job['customer_id']):null;
    output_table_pdf('BELM-'.$job['job_card_no'].'-FINAL-REPORT.pdf','DIGITAL JOB CARD - FINAL PROCESS REPORT',[
        'Generated: '.date('d/m/Y H:i'),'Process: Create/Assign -> Receive -> Diagnosis/Inspection -> Manager Review -> Maintenance/Spare -> Testing -> Final Result -> Report','Grounded days: '.$grounded
    ],$rows,$watermark);
}

json_error('Unsupported Job Card workflow action.',405);
