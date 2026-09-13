<?php
require_once __DIR__ . '/config/helpers.php';

$section = strtolower(trim((string)($_GET['section'] ?? 'reports')));
$reportType = strtolower(trim((string)($_GET['reportType'] ?? 'maintenance')));

// V746 upgrades only Breakdown Case Report. Keep the proven V737 implementation
// for Maintenance, Lube and Workshop Petty Cash unchanged.
if ($section !== 'reports' || $reportType !== 'breakdown') {
    require __DIR__ . '/workshop-service-maintenance-v737.php';
    exit;
}

require_once __DIR__ . '/api/table_pdf_helper.php';
$user = require_auth();
if (!belm_user_has_named_role($user, ['Super Admin', 'Engineer', 'Workshop Manager'])) {
    require_any_page_access($user, ['customers', 'reports', 'service-requests']);
}

$pdo = db();
$action = strtolower(trim((string)($_GET['action'] ?? '')));
$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET') json_error('Breakdown reporting is read-only.', 405);

function wsm746_table_exists(PDO $pdo, string $table): bool {
    $s=$pdo->prepare('SELECT to_regclass(?) IS NOT NULL');
    $s->execute(['public.'.$table]);
    return (bool)$s->fetchColumn();
}
function wsm746_valid_date(string $value, string $label): ?string {
    $value=trim($value); if($value==='') return null;
    if(!preg_match('/^\d{4}-\d{2}-\d{2}$/',$value)) json_error($label.' must use YYYY-MM-DD.',422);
    $d=DateTimeImmutable::createFromFormat('!Y-m-d',$value);
    if(!$d||$d->format('Y-m-d')!==$value) json_error($label.' is invalid.',422);
    return $value;
}
function wsm746_customers(PDO $pdo): array {
    $permanent=[];
    if(wsm746_table_exists($pdo,'customer_contracts')){
        $q=$pdo->query("SELECT DISTINCT customer_id FROM customer_contracts WHERE status='ACTIVE' AND start_date<=CURRENT_DATE AND end_date>=CURRENT_DATE");
        foreach($q->fetchAll(PDO::FETCH_COLUMN) as $id) $permanent[(string)$id]=true;
    }
    $rows=$pdo->query('SELECT id,name,is_active FROM customers WHERE deleted_at IS NULL ORDER BY name')->fetchAll();
    return array_map(static function($r)use($permanent){$id=(string)$r['id'];return ['id'=>$id,'name'=>(string)$r['name'],'isActive'=>!empty($r['is_active']),'customerType'=>isset($permanent[$id])?'PERMANENT':'NON_PERMANENT'];},$rows);
}
function wsm746_customer_map(array $customers): array { $m=[]; foreach($customers as $c)$m[(string)$c['id']]=$c; return $m; }
function wsm746_selected_ids(array $customers): array {
    $id=trim((string)($_GET['customerId']??''));
    $type=strtoupper(trim((string)($_GET['customerType']??'ALL')));
    if(!in_array($type,['ALL','PERMANENT','NON_PERMANENT'],true))$type='ALL';
    $out=[]; foreach($customers as $c){if($id!==''&&(string)$c['id']!==$id)continue;if($type!=='ALL'&&$c['customerType']!==$type)continue;$out[]=(string)$c['id'];} return $out;
}
function wsm746_in(array $ids,array &$params,string $column): string { if(!$ids)return ' AND 1=0';$marks=implode(',',array_fill(0,count($ids),'?'));foreach($ids as $id)$params[]=$id;return " AND {$column} IN ({$marks})"; }
function wsm746_machine(array $r): string { $v=trim((string)($r['brand']??'').' '.(string)($r['model']??''));return $v!==''?$v:(string)($r['machine_type']??'Machine'); }
function wsm746_csv($v): string { return '"'.str_replace('"','""',(string)($v??'')).'"'; }

function wsm746_ensure(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS workshop_breakdown_daily_snapshots (
      id VARCHAR(36) PRIMARY KEY,
      snapshot_date DATE NOT NULL,
      case_id VARCHAR(36) NOT NULL REFERENCES breakdown_cases(id) ON DELETE CASCADE,
      customer_id VARCHAR(36) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      machine_id VARCHAR(36) NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
      job_card_id VARCHAR(36) NULL,
      job_card_no VARCHAR(60) NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(snapshot_date,case_id)
    )");
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_workshop_breakdown_snapshots_date ON workshop_breakdown_daily_snapshots(snapshot_date DESC)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_workshop_breakdown_snapshots_case ON workshop_breakdown_daily_snapshots(case_id,snapshot_date DESC)');
}

function wsm746_current_snapshot(PDO $pdo,array $case): array {
    $job=null;
    if(wsm746_table_exists($pdo,'digital_job_cards')){
        $q=$pdo->prepare("SELECT id,job_card_no,title,fault_description,technician_id,technician_name,status,diagnosis,work_done,test_result,completion_note,repeat_issue,started_at,completed_at,generated_by_name,created_at,updated_at,technician_submitted_at,reviewed_at,reviewed_by_name,review_note FROM digital_job_cards WHERE case_id=? ORDER BY created_at DESC LIMIT 1");
        $q->execute([(string)$case['id']]); $job=$q->fetch()?:null;
    }
    $spares=[];
    if(wsm746_table_exists($pdo,'breakdown_spare_requests')){
        $q=$pdo->prepare("SELECT id,job_card_id,spare_name,part_number,quantity,unit,reason,status,requested_by_name,requested_at,approved_by_name,approved_at,fulfilled_at FROM breakdown_spare_requests WHERE case_id=? ORDER BY requested_at ASC");
        try{$q->execute([(string)$case['id']]);$spares=$q->fetchAll();}catch(Throwable $e){
            $q=$pdo->prepare("SELECT id,job_card_id,spare_name,part_number,quantity,unit,reason,status,requested_by_name,requested_at FROM breakdown_spare_requests WHERE case_id=? ORDER BY requested_at ASC");$q->execute([(string)$case['id']]);$spares=$q->fetchAll();
        }
    }
    $events=[];
    if(wsm746_table_exists($pdo,'breakdown_case_events')){
        $q=$pdo->prepare('SELECT id,stage,department,action,note,actor_type,actor_id,actor_name,created_at FROM breakdown_case_events WHERE case_id=? ORDER BY created_at ASC');
        $q->execute([(string)$case['id']]);$events=$q->fetchAll();
    }
    return [
      'caseId'=>(string)$case['id'],'snapshotDate'=>date('Y-m-d'),'capturedAt'=>gmdate('c'),
      'customerId'=>(string)$case['customer_id'],'customer'=>(string)$case['customer_name'],
      'machineId'=>(string)$case['machine_id'],'machine'=>wsm746_machine($case),'fleetNumber'=>(string)($case['fleet_number']??''),'serialNumber'=>(string)($case['serial_number']??''),'regNumber'=>(string)($case['reg_number']??''),
      'sourceType'=>(string)($case['source_type']??'MANUAL'),'sourceId'=>$case['source_id']??null,
      'title'=>(string)($case['title']??''),'problemDescription'=>(string)($case['description']??''),
      'caseStatus'=>(string)($case['status']??'OPEN'),'currentStage'=>(string)($case['current_stage']??'WORKSHOP_REVIEW'),'currentDepartment'=>(string)($case['current_department']??'Workshop'),'blockerReason'=>(string)($case['blocker_reason']??''),
      'openedAt'=>$case['opened_at']??null,'closedAt'=>$case['closed_at']??null,'caseUpdatedAt'=>$case['updated_at']??null,
      'job'=>$job?:null,'spares'=>$spares,'events'=>$events,
    ];
}

function wsm746_capture_today(PDO $pdo,array $cases): void {
    $sql="INSERT INTO workshop_breakdown_daily_snapshots(id,snapshot_date,case_id,customer_id,machine_id,job_card_id,job_card_no,payload,captured_at,updated_at)
          VALUES(?,CURRENT_DATE,?,?,?,?,?,?::jsonb,NOW(),NOW())
          ON CONFLICT(snapshot_date,case_id) DO UPDATE SET job_card_id=EXCLUDED.job_card_id,job_card_no=EXCLUDED.job_card_no,payload=EXCLUDED.payload,updated_at=NOW()";
    $stmt=$pdo->prepare($sql);
    foreach($cases as $case){
        $snap=wsm746_current_snapshot($pdo,$case);$job=$snap['job']??[];
        $stmt->execute([uuid(),(string)$case['id'],(string)$case['customer_id'],(string)$case['machine_id'],$job['id']??null,$job['job_card_no']??null,json_encode($snap,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]);
    }
}

function wsm746_case_rows(PDO $pdo,array $ids): array {
    $params=[];
    $sql="SELECT bc.id,bc.customer_id,bc.machine_id,bc.source_type,bc.source_id,bc.title,bc.description,bc.status,bc.current_stage,bc.current_department,bc.blocker_reason,bc.opened_at,bc.closed_at,bc.updated_at,c.name AS customer_name,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number,m.reg_number FROM breakdown_cases bc JOIN customers c ON c.id=bc.customer_id JOIN machines m ON m.id=bc.machine_id WHERE c.deleted_at IS NULL AND m.deleted_at IS NULL";
    $sql.=wsm746_in($ids,$params,'bc.customer_id').' ORDER BY bc.opened_at DESC';
    $q=$pdo->prepare($sql);$q->execute($params);return $q->fetchAll();
}

function wsm746_payload(PDO $pdo): array {
    wsm746_ensure($pdo);
    $from=wsm746_valid_date((string)($_GET['from']??''),'From date');$to=wsm746_valid_date((string)($_GET['to']??''),'To date');if($from&&$to&&$from>$to)json_error('From date cannot be after To date.',422);
    $customers=wsm746_customers($pdo);$map=wsm746_customer_map($customers);$ids=wsm746_selected_ids($customers);$cases=wsm746_case_rows($pdo,$ids);
    // Capture the live end-of-current-day state every time Workshop Report is read.
    // The unique key lets today's state evolve, while yesterday and earlier rows are immutable.
    wsm746_capture_today($pdo,$cases);

    $params=[];$sql="SELECT s.* FROM workshop_breakdown_daily_snapshots s WHERE 1=1".$ids?'' : '';
    $sql='SELECT s.* FROM workshop_breakdown_daily_snapshots s WHERE 1=1';
    $sql.=wsm746_in($ids,$params,'s.customer_id');
    if($from){$sql.=' AND s.snapshot_date>=?';$params[]=$from;}if($to){$sql.=' AND s.snapshot_date<=?';$params[]=$to;}
    $sql.=' ORDER BY s.snapshot_date DESC,s.updated_at DESC';$q=$pdo->prepare($sql);$q->execute($params);$snapRows=$q->fetchAll();
    $rows=[];$seenOpened=[];
    foreach($snapRows as $s){$p=json_decode((string)$s['payload'],true)?:[];$customer=$map[(string)$s['customer_id']]??['name'=>$p['customer']??'Unknown','customerType'=>'NON_PERMANENT'];$job=$p['job']??[];$rows[]=[
      'id'=>(string)$s['id'],'snapshotId'=>(string)$s['id'],'caseId'=>(string)$s['case_id'],'date'=>(string)$s['snapshot_date'],'customerId'=>(string)$s['customer_id'],'customer'=>(string)$customer['name'],'customerType'=>(string)$customer['customerType'],'machineId'=>(string)$s['machine_id'],'machine'=>(string)($p['machine']??'Machine'),'fleetNumber'=>(string)($p['fleetNumber']??''),'serialNumber'=>(string)($p['serialNumber']??''),'serviceType'=>(string)($p['sourceType']??'BREAKDOWN_CASE'),'jobCardId'=>$s['job_card_id']??null,'jobCardNo'=>$s['job_card_no']??null,'recordedBy'=>(string)($job['technician_name']??$p['currentDepartment']??'Workshop'),'details'=>(string)($p['currentStage']??'').(($p['blockerReason']??'')!==''?' · '.$p['blockerReason']:''),'status'=>(string)($p['caseStatus']??'OPEN'),'cost'=>null,'viewable'=>true,'dailySnapshot'=>true
    ];$seenOpened[(string)$s['case_id'].'|'.(string)$s['snapshot_date']]=true;}
    // Keep the original opened-date record visible for pre-V746 history. It is labelled as
    // the opening record and never overwrites a later daily snapshot.
    foreach($cases as $c){$day=substr((string)$c['opened_at'],0,10);if($from&&$day<$from)continue;if($to&&$day>$to)continue;if(isset($seenOpened[(string)$c['id'].'|'.$day]))continue;$customer=$map[(string)$c['customer_id']]??['name'=>$c['customer_name'],'customerType'=>'NON_PERMANENT'];$rows[]=[
      'id'=>'OPEN-'.(string)$c['id'],'snapshotId'=>null,'caseId'=>(string)$c['id'],'date'=>$day,'customerId'=>(string)$c['customer_id'],'customer'=>(string)$customer['name'],'customerType'=>(string)$customer['customerType'],'machineId'=>(string)$c['machine_id'],'machine'=>wsm746_machine($c),'fleetNumber'=>(string)($c['fleet_number']??''),'serialNumber'=>(string)($c['serial_number']??''),'serviceType'=>(string)($c['source_type']??'BREAKDOWN_CASE'),'recordedBy'=>'Workshop','details'=>'CASE OPENED · '.(string)($c['title']??''),'status'=>'OPENED','cost'=>null,'viewable'=>true,'dailySnapshot'=>false
    ];}
    usort($rows,static fn($a,$b)=>strcmp((string)$b['date'],(string)$a['date']));
    $type=strtoupper(trim((string)($_GET['customerType']??'ALL')));if(!in_array($type,['ALL','PERMANENT','NON_PERMANENT'],true))$type='ALL';
    return ['ok'=>true,'reportType'=>'breakdown','from'=>$from,'to'=>$to,'customerId'=>trim((string)($_GET['customerId']??'')),'customerType'=>$type,'customers'=>$customers,'rows'=>$rows,'total'=>count($rows),'generatedAt'=>gmdate('c'),'dailySnapshotMode'=>true];
}

function wsm746_detail(PDO $pdo,string $id,string $caseId=''): array {
    wsm746_ensure($pdo);
    if($id!==''){$q=$pdo->prepare('SELECT * FROM workshop_breakdown_daily_snapshots WHERE id=? LIMIT 1');$q->execute([$id]);$s=$q->fetch();if($s){$p=json_decode((string)$s['payload'],true)?:[];$p['snapshotId']=(string)$s['id'];$p['snapshotDate']=(string)$s['snapshot_date'];$p['historicalSnapshot']=((string)$s['snapshot_date']<date('Y-m-d'));return $p;}}
    if($caseId==='')json_error('Breakdown report record not found.',404);
    $q=$pdo->prepare("SELECT bc.id,bc.customer_id,bc.machine_id,bc.source_type,bc.source_id,bc.title,bc.description,bc.status,bc.current_stage,bc.current_department,bc.blocker_reason,bc.opened_at,bc.closed_at,bc.updated_at,c.name AS customer_name,m.brand,m.model,m.machine_type,m.fleet_number,m.serial_number,m.reg_number FROM breakdown_cases bc JOIN customers c ON c.id=bc.customer_id JOIN machines m ON m.id=bc.machine_id WHERE bc.id=? LIMIT 1");$q->execute([$caseId]);$c=$q->fetch();if(!$c)json_error('Breakdown case not found.',404);$p=wsm746_current_snapshot($pdo,$c);$p['historicalSnapshot']=false;return $p;
}
function wsm746_detail_csv(array $d): void {
    header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="BELM-breakdown-detail-'.preg_replace('/[^A-Za-z0-9_-]/','-',(string)($d['snapshotDate']??date('Y-m-d'))).'.csv"');
    echo "SECTION,FIELD,VALUE\r\n";$base=['Report date'=>$d['snapshotDate']??'','Customer'=>$d['customer']??'','Machine'=>$d['machine']??'','Fleet No.'=>$d['fleetNumber']??'','Serial No.'=>$d['serialNumber']??'','Problem'=>$d['problemDescription']??'','Job Card No.'=>$d['job']['job_card_no']??'','Technician'=>$d['job']['technician_name']??'','Diagnosis'=>$d['job']['diagnosis']??'','Work Done'=>$d['job']['work_done']??'','Test Result'=>$d['job']['test_result']??'','Completion Note'=>$d['job']['completion_note']??'','Stage'=>$d['currentStage']??'','Status'=>$d['caseStatus']??'','Approved By'=>$d['job']['reviewed_by_name']??''];foreach($base as $k=>$v)echo implode(',',array_map('wsm746_csv',['REPORT',$k,$v]))."\r\n";
    foreach(($d['spares']??[]) as $s)echo implode(',',array_map('wsm746_csv',['SPARE',(string)($s['spare_name']??''),trim((string)($s['part_number']??'').' · '.(string)($s['quantity']??'').' '.(string)($s['unit']??'').' · '.(string)($s['status']??''))]))."\r\n";
    foreach(($d['events']??[]) as $e)echo implode(',',array_map('wsm746_csv',['PROCEDURE',(string)($e['created_at']??''),trim((string)($e['action']??'').' · '.(string)($e['stage']??'').' · '.(string)($e['note']??''))]))."\r\n";exit;
}
function wsm746_detail_pdf(array $d): void {
    $rows=[['SECTION','ITEM','DETAIL']];$rows[]=['PROBLEM','Description',(string)($d['problemDescription']??'—')];$j=$d['job']??[];$rows[]=['JOB CARD',(string)($j['job_card_no']??'—'),'Technician: '.(string)($j['technician_name']??'—')];if(!empty($j['diagnosis']))$rows[]=['TECHNICIAN','Diagnosis',(string)$j['diagnosis']];if(!empty($j['work_done']))$rows[]=['TECHNICIAN','Work / Repair',(string)$j['work_done']];if(!empty($j['test_result']))$rows[]=['TECHNICIAN','Testing',(string)$j['test_result']];
    foreach(($d['spares']??[]) as $s)$rows[]=['SPARE',(string)($s['spare_name']??'Spare'),trim((string)($s['part_number']??'').' · '.(string)($s['quantity']??'').' '.(string)($s['unit']??'').' · '.(string)($s['status']??''))];foreach(($d['events']??[]) as $e)$rows[]=['PROCEDURE',substr((string)($e['created_at']??''),0,16),trim((string)($e['action']??'').' · '.(string)($e['stage']??'').' · '.(string)($e['note']??''))];
    output_table_pdf('BELM-breakdown-detail.pdf','BELM Breakdown Case Daily Report',['Report date: '.(string)($d['snapshotDate']??date('Y-m-d')),'Customer: '.(string)($d['customer']??'—'),'Machine: '.(string)($d['machine']??'—').' · Fleet '.(string)($d['fleetNumber']??'—'),'Status: '.(string)($d['caseStatus']??'OPEN')],$rows);
}

$data=wsm746_payload($pdo);
if($action==='detail'||$action==='detail-export'){
    $detail=wsm746_detail($pdo,trim((string)($_GET['snapshotId']??'')),trim((string)($_GET['caseId']??'')));
    if($action==='detail-export'){$format=strtolower(trim((string)($_GET['format']??'csv')));if($format==='pdf')wsm746_detail_pdf($detail);wsm746_detail_csv($detail);}json_out($detail);
}
if($action==='export'){
    $format=strtolower(trim((string)($_GET['format']??'csv')));
    if($format==='csv'){header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="BELM-breakdown-daily-report.csv"');echo implode(',',array_map('wsm746_csv',['Date','Customer','Customer Type','Machine','Fleet No.','Job Card No.','Type','Stage / Details','Status','Recorded By']))."\r\n";foreach($data['rows'] as $r)echo implode(',',array_map('wsm746_csv',[$r['date']??'',$r['customer']??'',$r['customerType']??'',$r['machine']??'',$r['fleetNumber']??'',$r['jobCardNo']??'',$r['serviceType']??'',$r['details']??'',$r['status']??'',$r['recordedBy']??'']))."\r\n";exit;}
    $rows=[['DATE','CUSTOMER','MACHINE / FLEET','JOB / STAGE','STATUS']];foreach($data['rows'] as $r)$rows[]=[(string)($r['date']??'—'),(string)($r['customer']??'—'),trim((string)($r['machine']??'—').' #'.(string)($r['fleetNumber']??'')),trim((string)($r['jobCardNo']??'').' · '.(string)($r['details']??'')),(string)($r['status']??'—')];output_table_pdf('BELM-breakdown-daily-report.pdf','BELM Breakdown Case Report',['Daily snapshots preserve unfinished work by date.','Records: '.count($data['rows']),'Generated: '.date('d/m/Y H:i')],$rows);
}
json_out($data);
