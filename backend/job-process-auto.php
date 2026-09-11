<?php
require_once __DIR__ . '/config/helpers.php';

$user = require_auth();
require_any_page_access($user, ['roles','job-cards','service-requests','spare-parts']);
if (!belm_can_override_technician_customer($user)) {
    json_error('Only BELM Super Admin or Workshop Manager can view the Job Card process board.', 403);
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('Method not allowed.', 405);
}

$rows = db()->query(
    "SELECT j.id,j.job_card_no,j.status,j.started_at,j.completed_at,j.diagnosis,j.work_done,j.test_result,
            j.completion_note,j.repeat_issue,j.updated_at,j.case_id,
            j.technician_id,COALESCE(NULLIF(TRIM(j.technician_name),''),u.name,'Unassigned') AS technician_name,
            bc.status AS case_status,bc.current_stage,bc.blocker_reason,
            c.name AS company_name,c.address AS company_address,
            COALESCE(NULLIF(TRIM(j.job_location),''),NULLIF(TRIM(c.address),''),'—') AS job_address,
            m.fleet_number,m.brand,m.model,m.machine_type,m.serial_number,m.reg_number,
            (SELECT COUNT(*) FROM breakdown_spare_requests sr
             WHERE sr.job_card_id=j.id
               AND UPPER(COALESCE(sr.status,'')) NOT IN ('REJECTED','PARTS_READY')) AS open_spare_requests,
            (SELECT COUNT(*) FROM breakdown_spare_requests sr
             WHERE sr.job_card_id=j.id
               AND UPPER(COALESCE(sr.status,''))='WAITING_BOSS_APPROVAL') AS pending_spare_approvals,
            (SELECT COUNT(*) FROM breakdown_spare_requests sr
             WHERE sr.job_card_id=j.id
               AND UPPER(COALESCE(sr.status,'')) IN ('APPROVED','STORE_AVAILABLE','PROCUREMENT_REQUIRED','PI_WAITING_ACCOUNTS','ORDERED')) AS approved_spare_requests,
            (SELECT string_agg(sr.spare_name, ', ' ORDER BY sr.requested_at)
             FROM breakdown_spare_requests sr
             WHERE sr.job_card_id=j.id
               AND UPPER(COALESCE(sr.status,'')) NOT IN ('REJECTED','PARTS_READY')) AS active_spares
     FROM digital_job_cards j
     JOIN breakdown_cases bc ON bc.id=j.case_id
     JOIN customers c ON c.id=j.customer_id
     JOIN machines m ON m.id=j.machine_id
     LEFT JOIN users u ON u.id=j.technician_id
     WHERE UPPER(COALESCE(j.status,'')) <> 'CANCELLED'
       AND (c.is_machinery_admin=0 OR bc.source_type='SERVICE_REQUEST')
       AND (j.technician_id IS NOT NULL OR NULLIF(TRIM(COALESCE(j.technician_name,'')),'') IS NOT NULL)
     ORDER BY CASE WHEN UPPER(COALESCE(bc.status,''))='COMPLETED' THEN 1 ELSE 0 END,
              COALESCE(j.updated_at,j.created_at) DESC
     LIMIT 100"
)->fetchAll();

$out = [];
foreach ($rows as $row) {
    $stage = strtoupper(trim((string)($row['current_stage'] ?? '')));
    $jobStatus = strtoupper(trim((string)($row['status'] ?? '')));
    $caseStatus = strtoupper(trim((string)($row['case_status'] ?? '')));
    $openSpares = (int)($row['open_spare_requests'] ?? 0);
    $pendingSpareApprovals = (int)($row['pending_spare_approvals'] ?? 0);
    $approvedSpares = (int)($row['approved_spare_requests'] ?? 0);
    $hasDiagnosis = trim((string)($row['diagnosis'] ?? '')) !== '';
    $hasTest = trim((string)($row['test_result'] ?? '')) !== '';
    $hasOpened = !empty($row['started_at']);

    $code = 'ASSIGNED';
    $label = 'Assigned';
    $detail = 'Waiting Technician to receive';
    $action = null;

    if ($caseStatus === 'COMPLETED' || $stage === 'COMPLETED' || $jobStatus === 'COMPLETED') {
        $code = 'COMPLETE';
        $label = 'Complete';
        $detail = '';
    } elseif ($jobStatus === 'PENDING_APPROVAL' || $stage === 'PENDING_APPROVAL') {
        $code = 'PENDING_APPROVAL';
        $label = 'Pending Approval';
        $detail = 'Technician report submitted';
        $action = $hasDiagnosis ? 'VIEW_REPORT' : null;
    } elseif ($openSpares > 0) {
        if ($pendingSpareApprovals > 0) {
            $code = 'WAITING_SPARE';
            $label = 'Waiting Spare';
            $detail = trim((string)($row['active_spares'] ?? ''));
        } elseif ($approvedSpares > 0) {
            $code = 'SPARE_APPROVED';
            $label = 'Approved';
            $parts = trim((string)($row['active_spares'] ?? ''));
            $detail = 'Waiting Spare' . ($parts !== '' ? ' · ' . $parts : '');
        } else {
            $code = 'WAITING_SPARE';
            $label = 'Waiting Spare';
            $detail = trim((string)($row['active_spares'] ?? ''));
        }
    } elseif ($stage === 'TESTING' || $hasTest) {
        $code = 'ON_TEST';
        $label = 'On Test';
        $detail = $hasTest ? 'Test result recorded' : '';
        $action = $hasDiagnosis ? 'VIEW_REPORT' : null;
    } elseif ($hasDiagnosis) {
        $code = 'VIEW_REPORT';
        $label = 'View Report';
        $detail = !empty($row['repeat_issue']) ? 'Repeated issue: YES' : 'Diagnosis report submitted';
        $action = 'VIEW_REPORT';
    } elseif ($stage === 'DIAGNOSIS' || $hasOpened || $jobStatus === 'IN_PROGRESS') {
        $code = 'ON_PROCESS';
        $label = 'On Process';
        $detail = 'Diagnosis / repair in progress';
    } elseif ($jobStatus === 'RECEIVED') {
        $code = 'RECEIVED';
        $label = 'Received';
        $detail = 'Ready for diagnosis';
    }

    $out[] = [
        'id' => (string)$row['id'],
        'caseId' => (string)$row['case_id'],
        'jobCardNo' => (string)$row['job_card_no'],
        'technicianName' => (string)$row['technician_name'],
        'fleetNumber' => trim((string)($row['fleet_number'] ?? '')) ?: '—',
        'companyName' => (string)$row['company_name'],
        'address' => (string)$row['job_address'],
        'machineLabel' => trim((string)($row['brand'] ?? '') . ' ' . (string)($row['model'] ?? '')) ?: (string)($row['machine_type'] ?? 'Machine'),
        'processCode' => $code,
        'processLabel' => $label,
        'processDetail' => $detail,
        'processAction' => $action,
        'status' => $jobStatus,
        'stage' => $stage,
        'updatedAt' => $row['updated_at'],
    ];
}

json_out($out);
