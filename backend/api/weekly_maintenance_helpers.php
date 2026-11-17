<?php
/** Pure report projection; does not write to any workshop source record. */
function weekly_project_job(array $row, array $checklists=[], array $spares=[]): array {
    $report=jcv814_parse_report($row['diagnosis']??'');
    $test=jcv814_parse_test($row['test_result']??'');
    $completed=strtoupper((string)($row['status']??''))==='COMPLETED'||!empty($row['completed_at']);
    $missing=[];
    foreach(['diagnosis'=>'Diagnosis / inspection','work_done'=>'Work performed','technician_name'=>'Responsible technician'] as $key=>$label){
        if(trim((string)($row[$key]??''))==='')$missing[]=$label;
    }
    if(empty($row['reviewed_at'])||empty($row['reviewed_by_name'])||!jcv814_maintenance_approved($row))$missing[]='Manager approval';
    if($test['finalResult']!=='OK')$missing[]='Passed final test';
    if(($row['source_type']??'')==='CHECKLIST_REPORT'&&!array_filter($checklists,fn($r)=>(string)$r['id']===(string)($row['source_id']??'')))$missing[]='Originating checklist';
    $open=array_values(array_filter($spares,fn($r)=>!in_array(strtoupper((string)$r['status']),['REJECTED','PARTS_READY'],true)));
    $follow=[];
    if(!$completed)$follow[]=trim((string)($row['blocker_reason']??''))?:'Complete repair / testing and close the Job Card';
    if($open)$follow[]='Follow up '.count($open).' outstanding spare request(s)';
    $sources=[['type'=>'Job card','reference'=>$row['job_card_no'],'id'=>$row['id']],['type'=>'Machine record','reference'=>trim(($row['brand']??'').' '.($row['model']??'')),'id'=>$row['machine_id']]];
    if(trim((string)($row['diagnosis']??''))!=='')$sources[]=['type'=>'Technician maintenance report','reference'=>$row['technician_name']??'Technician','id'=>$row['id']];
    foreach($checklists as $r)$sources[]=['type'=>'Machine checklist','id'=>$r['id'],'reference'=>($r['filled_by']??'').' · '.substr($r['created_at'],0,10),'relationship'=>(string)$r['id']===(string)($row['source_id']??'')?'Originating checklist':'Same machine / reporting period','status'=>$r['overall_status']];
    foreach($spares as $r)$sources[]=['type'=>'Spare request','id'=>$r['id'],'reference'=>$r['spare_name'].' × '.$r['quantity'].' '.$r['unit'],'status'=>$r['status']];
    return ['id'=>$row['id'],'jobCardNo'=>$row['job_card_no'],'caseId'=>$row['case_id'],'customer'=>$row['customer_name'],'machineId'=>$row['machine_id'],'machine'=>trim(($row['brand']??'').' '.($row['model']??''))?:($row['machine_type']??'Machine'),'fleet'=>$row['fleet_number']??'','serial'=>$row['serial_number']??'','title'=>$row['title'],'fault'=>$row['fault_description'],'technician'=>$row['technician_name']?:'Unassigned','date'=>substr((string)($row['completed_at']??$row['updated_at']??$row['created_at']),0,10),'status'=>$completed?'Completed':str_replace('_',' ',ucwords(strtolower((string)$row['status']),'_')),'sourceStatus'=>$row['status'],'completed'=>$completed,'verified'=>$completed&&!$missing,'diagnosis'=>$report['diagnosis'],'findings'=>$report['findings'],'solution'=>$report['solution'],'workDone'=>$row['work_done']??'','reviewer'=>$row['reviewed_by_name']??'','reviewedAt'=>$row['reviewed_at']??null,'testResult'=>$test['finalResult'],'testNotes'=>$test['testNotes'],'missing'=>$missing,'followups'=>$follow,'sources'=>$sources];
}
function weekly_scope(array $ctx, array &$params, string $alias='j'): string {
    if($ctx['kind']==='customer'){
        $params[]=$ctx['customerId'];$scope="$alias.customer_id=?";
        if($ctx['isTechnician']){$scope.=" AND $alias.technician_id=?";$params[]=$ctx['actorId'];}
        return $scope;
    }
    if($ctx['isTechnician']){$params[]=$ctx['actorId'];return "$alias.technician_id=?";}
    return "(c.is_machinery_admin=0 OR bc.source_type='SERVICE_REQUEST')";
}
function weekly_summary(array $items): array {
    $done=array_filter($items,fn($r)=>$r['completed']);
    return ['records'=>count($items),'completed'=>count($done),'machines'=>count(array_unique(array_column($done,'machineId'))),'verified'=>count(array_filter($items,fn($r)=>$r['verified'])),'unconfirmed'=>count(array_filter($items,fn($r)=>!$r['verified'])),'documentationGaps'=>count(array_filter($items,fn($r)=>count($r['missing'])>0)),'followups'=>count(array_filter($items,fn($r)=>count($r['followups'])>0))];
}
