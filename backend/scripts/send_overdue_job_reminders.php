<?php
/**
 * Daily Job Card overdue reminders, designed for a scheduled CLI invocation.
 * Usage: php backend/scripts/send_overdue_job_reminders.php --dry-run
 *        php backend/scripts/send_overdue_job_reminders.php
 * Never run in a web request or on every dashboard refresh.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('CLI only');
}
require_once __DIR__ . '/../config/helpers.php';

$dryRun = in_array('--dry-run', $argv, true);
$pdo = db();
$rows = $pdo->query(<<<'SQL'
SELECT j.id, j.job_card_no, j.customer_id, j.machine_id, j.title, j.status,
       j.due_date, c.is_machinery_admin, bc.source_type,
       (CURRENT_DATE - j.due_date) AS days_overdue
FROM digital_job_cards j
JOIN customers c ON c.id=j.customer_id AND c.deleted_at IS NULL
JOIN breakdown_cases bc ON bc.id=j.case_id
WHERE j.due_date < CURRENT_DATE
  AND UPPER(COALESCE(j.status,'')) NOT IN ('COMPLETED','CANCELLED')
ORDER BY j.due_date ASC, j.id ASC
SQL)->fetchAll(PDO::FETCH_ASSOC);

// Use the database clock for both overdue selection and the deduplication day.
// PHP/cron may run in UTC while the database has a different timezone.
$today = (string)$pdo->query('SELECT CURRENT_DATE')->fetchColumn();
$sent=0; $already=0; $failed=0;
foreach ($rows as $job) {
    $customerInternal = !empty($job['is_machinery_admin'])
        && strtoupper((string)$job['source_type']) !== 'SERVICE_REQUEST';
    $scope = $customerInternal ? 'CUSTOMER' : 'BELM';
    $jobId = (string)$job['id'];
    // A stable key that matches the exact date used by PostgreSQL.
    $senderKey = 'system:overdue:' . $today;
    $subject = 'OVERDUE JOB CARD - ' . (string)$job['job_card_no'];
    $message = sprintf('Job Card %s (%s) is %d day(s) overdue. Current status: %s. Workshop Manager: review and follow up.',
        $job['job_card_no'], $job['title'], (int)$job['days_overdue'], $job['status']);
    if ($dryRun) {
        echo json_encode(['jobCard'=>$job['job_card_no'],'scope'=>$scope,'daysOverdue'=>(int)$job['days_overdue']], JSON_UNESCAPED_SLASHES) . "\n";
        continue;
    }
    try {
        $pdo->beginTransaction();
        // One writer per Job Card/day even if two scheduler instances run concurrently.
        $pdo->prepare('SELECT pg_advisory_xact_lock(hashtext(?), hashtext(?))')
            ->execute(['belm-overdue-job', $today . ':' . $jobId]);
        // Check again in the transaction because the job might have been closed meanwhile.
        // Lock the Job Card so closing it and sending its reminder cannot race.
        $check=$pdo->prepare("SELECT 1 FROM digital_job_cards WHERE id=? AND due_date<CURRENT_DATE AND UPPER(COALESCE(status,'')) NOT IN ('COMPLETED','CANCELLED') FOR UPDATE");
        $check->execute([$jobId]);
        if (!$check->fetchColumn()) { $pdo->commit(); continue; }
        $exists=$pdo->prepare("SELECT 1 FROM role_communications WHERE sender_actor_key=? AND related_type='JOB_CARD_OVERDUE' AND related_id=? AND recipient_scope=? AND recipient_role='workshop_manager' LIMIT 1");
        $exists->execute([$senderKey,$jobId,$scope]);
        if ($exists->fetchColumn()) { $already++; $pdo->commit(); continue; }
        $pdo->prepare('INSERT INTO role_communications (id,customer_id,sender_scope,sender_actor_key,sender_name,sender_role,recipient_scope,recipient_role,subject,message,priority,related_type,related_id,machine_id,action_url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())')
            ->execute([uuid(),$job['customer_id'],$scope,$senderKey,'BELM Automatic Coordination','system',$scope,'workshop_manager',mb_substr($subject,0,180),mb_substr($message,0,2500),'ATTENTION','JOB_CARD_OVERDUE',$jobId,$job['machine_id'],'/job-cards/?module=job-cards']);
        $pdo->commit();
        $sent++;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $failed++;
        error_log('Overdue reminder failed for job ' . $jobId . ': ' . $error->getMessage());
    }
}
echo json_encode(['dryRun'=>$dryRun,'overdueFound'=>count($rows),'sent'=>$sent,'alreadySentToday'=>$already,'failed'=>$failed],JSON_UNESCAPED_SLASHES) . "\n";
if ($failed) exit(1);
