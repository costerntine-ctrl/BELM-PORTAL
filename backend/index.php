<?php
// Regression schema baselines only: 'schemaVersion' => '337-proforma-generate-sync' | 'schemaVersion' => '344-proforma-direct-generate' | 'schemaVersion' => '345-commercial-master-templates' | 'schemaVersion' => '346-commercial-number-link'
// V355: keep every API response byte inside PHP/output buffering so source comments,
// notices or accidental debug text can never be emitted before JSON headers.
if (ob_get_level() === 0) ob_start();
// Regression baseline: 307-second-pass-hardening; ['payments', 'receipt_id']; 'receipts'
// Front controller — translates the same REST-style URLs the React
// frontend already calls (e.g. GET /api/customers, PUT /api/spare-parts/123)
// into the ?action=&id= style each api/*.php file expects, so neither the
// frontend nor the individual endpoint files need to change.
//
// Render setup: Docker places this backend in /var/www/html/api.

require_once __DIR__ . '/config/helpers.php';

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^/api#', '', $path); // tolerate an /api prefix too
$segments = array_values(array_filter(explode('/', $path)));
$method = $_SERVER['REQUEST_METHOD'];

function dispatch(string $file, array $getOverrides = []): void {
    foreach ($getOverrides as $k => $v) $_GET[$k] = $v;
    require __DIR__ . "/api/$file";
    exit;
}

if (($segments[0] ?? '') === 'reset-database') {
    require __DIR__ . '/scripts/reset.php';
    exit;
}

if (($segments[0] ?? '') === 'live') {
    json_out(['ok'=>true,'api'=>'BELM PHP web service','schemaVersion'=>'481-render-health-liveness','databaseReadiness'=>'/api/readiness'],200);
}
if (($segments[0] ?? '') === 'health') {
    json_out(['ok'=>true,'api'=>'BELM PHP web service','status'=>'live','schemaVersion'=>'481-render-health-liveness','databaseReadiness'=>'/api/readiness'],200);
}
if (($segments[0] ?? '') === 'readiness' || !isset($segments[0])) {
    try {
        $databaseVersion = db()->query('SELECT VERSION()')->fetchColumn();
        $requiredTables = ['roles','users','customers','customer_users','machines','customer_applications','user_applications','usage_logs','customer_store_items','customer_store_movements','customer_machine_spare_list_items','customer_store_issue_requests','belm_workshop_tool_issues','delivery_notes','delivery_note_items','customer_procurement_requests','customer_department_settings','customer_sales_documents','checklist_template_parts','service_request_parts','spare_parts','spare_part_requests','bank_accounts','bank_withdrawals','company_expenses','customer_communications','notification_logs','system_settings','machine_service_owner_notifications','user_preferences','machine_service_parts','service_due_alerts','service_due_alert_items','breakdown_cases','breakdown_case_events','breakdown_spare_requests','digital_job_cards','invoices','invoice_items','payments','receipts','proforma_invoices','proforma_invoice_items','belm_installation_meta','belm_schema_migrations','belm_deployment_audits'];
        $tableChecks=[];$schemaReady=true;$tableStatement=db()->prepare('SELECT to_regclass(?) IS NOT NULL');
        foreach($requiredTables as $table){$tableStatement->execute(['public.'.$table]);$tableChecks[$table]=(bool)$tableStatement->fetchColumn();if(!$tableChecks[$table])$schemaReady=false;}
        $requiredColumns=[['digital_job_cards','issued_by_name'],['digital_job_cards','signed_copy_data'],['digital_job_cards','billing_status'],['digital_job_cards','priority'],['digital_job_cards','due_date'],['invoices','source_job_card_id'],['proforma_invoices','source_job_card_id'],['password_reset_codes','account_id'],['payments','receipt_id'],['bank_accounts','is_test'],['spare_part_requests','procurement_order_status'],['breakdown_spare_requests','procurement_supplier_id'],['customers','coordinator_features'],['customers','is_machinery_admin'],['customer_department_settings','department_key'],['customer_department_settings','access_state'],['customer_sales_documents','document_type'],['customer_sales_documents','document_no']];
        $columnChecks=[];$columnStatement=db()->prepare("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=? AND column_name=?)");
        foreach($requiredColumns as [$table,$column]){$columnStatement->execute([$table,$column]);$key=$table.'.'.$column;$columnChecks[$key]=(bool)$columnStatement->fetchColumn();if(!$columnChecks[$key])$schemaReady=false;}
        $adminChecks=['exactlyOneAccount'=>false,'active'=>false,'superAdminRole'=>false,'passwordHashStored'=>false];
        try{$stmt=db()->prepare("SELECT u.id,u.is_active,u.deleted_at,u.password_hash,r.name AS role_name,COUNT(*) OVER () AS matching_accounts FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.id=? ORDER BY CASE WHEN u.deleted_at IS NULL AND u.is_active=1 THEN 0 ELSE 1 END,u.created_at ASC LIMIT 1");$stmt->execute(['00000000-0000-4000-8000-000000000003']);$admin=$stmt->fetch();if($admin){$hash=(string)($admin['password_hash']??'');$adminChecks['exactlyOneAccount']=(int)$admin['matching_accounts']===1;$adminChecks['active']=(int)$admin['is_active']===1&&$admin['deleted_at']===null;$adminChecks['superAdminRole']=$admin['role_name']==='Super Admin';$adminChecks['passwordHashStored']=str_starts_with($hash,'$2')||str_starts_with($hash,'$argon2');}}catch(Throwable $ignored){}
        $adminReady=!in_array(false,$adminChecks,true);$dataSafety=['storage'=>'PostgreSQL','installationId'=>null,'lastDeploymentRelease'=>null,'lastDeploymentAt'=>null,'fullResetProtected'=>strtolower((string)(getenv('APP_ENV')?:''))==='production'&&trim((string)(getenv('ALLOW_FULL_DATABASE_RESET')?:''))==='YES-I-UNDERSTAND','webStartupIndependentOfMigration'=>true];
        try{$dataSafety['installationId']=db()->query('SELECT installation_id FROM belm_installation_meta WHERE singleton=1')->fetchColumn()?:null;$lastDeploy=db()->query('SELECT release,applied_at FROM belm_deployment_audits ORDER BY applied_at DESC LIMIT 1')->fetch();if($lastDeploy){$dataSafety['lastDeploymentRelease']=$lastDeploy['release'];$dataSafety['lastDeploymentAt']=$lastDeploy['applied_at'];}}catch(Throwable $ignored){}
        $healthReady=$schemaReady&&$adminReady;json_out(['ok'=>$healthReady,'api'=>'BELM PHP/PostgreSQL','database'=>'connected','databaseVersion'=>$databaseVersion,'schemaVersion'=>'510-coordinator-db-readiness','schemaReady'=>$schemaReady,'tables'=>$tableChecks,'columns'=>$columnChecks,'adminReady'=>$adminReady,'adminChecks'=>$adminChecks,'dataSafety'=>$dataSafety,'loginEndpoints'=>['unified'=>'/api/auth/unified-login','legacyStaff'=>'/api/auth/login','legacyCustomer'=>'/api/auth/customer-login']],$healthReady?200:503);
    }catch(Throwable $e){json_out(['ok'=>false,'api'=>'BELM PHP/PostgreSQL','database'=>'not-connected','message'=>'Check DATABASE_URL and the Render Postgres service.'],503);}
}

$resource=$segments[0]??'';
switch($resource){
    case 'auth': dispatch('auth.php',['action'=>$segments[1]??'']);
    case 'applications': dispatch('applications.php',['id'=>$segments[1]??null,'action'=>$segments[2]??'']);
    case 'customer-checkup':
    case 'customer_checkup.php': dispatch('customer_checkup.php');
    case 'customer-portal': dispatch('customer_portal.php',['sub'=>$segments[1]??'','sub2'=>$segments[2]??'','sub3'=>$segments[3]??'']);
    case 'checklist-templates':
        if(isset($segments[2])&&$segments[2]==='items')dispatch('checklist_templates.php',['action'=>'add-item','id'=>$segments[1]]);
        if(($segments[1]??'')==='items'&&isset($segments[2]))dispatch('checklist_templates.php',['action'=>$method==='PUT'?'edit-item':'delete-item','itemId'=>$segments[2]]);
        if(isset($segments[1]))dispatch('checklist_templates.php',['action'=>$method==='GET'?'one':'','id'=>$segments[1]]);
        dispatch('checklist_templates.php');
    case 'customers':
        if(($segments[1]??'')==='diagnostics')dispatch('customers.php',['action'=>'diagnostics']);
        if(($segments[1]??'')==='communication-feed')dispatch('customers.php',['action'=>'communication-feed']);
        if(($segments[1]??'')==='cwm-overview')dispatch('customers.php',['action'=>'cwm-overview']);
<<<<<<< HEAD
        // Customer communication history is used by both Customers Manager and
        // the Technician dashboard. Specific routes must precede /customers/{id}.
        if(isset($segments[1])&&($segments[2]??'')==='communications'&&isset($segments[3])&&($segments[4]??'')==='read')dispatch('customers.php',['action'=>'communication-read','id'=>$segments[1],'communicationId'=>$segments[3]]);
        if(isset($segments[1])&&($segments[2]??'')==='communications')dispatch('customers.php',['action'=>'communications','id'=>$segments[1]]);
=======
>>>>>>> c3ed62997e0e381ce8491d78b5e18dae047acfdd
        if(($segments[1]??'')==='machines'&&isset($segments[2])&&($segments[3]??'')==='service-parts')dispatch('customers.php',['action'=>'service-parts','machineId'=>$segments[2]]);
        if(($segments[1]??'')==='machines'&&isset($segments[2])&&($segments[3]??'')==='status')dispatch('customers.php',['action'=>'operational-status','machineId'=>$segments[2]]);
        if(($segments[1]??'')==='machines'&&isset($segments[2]))dispatch('customers.php',['action'=>$method==='PUT'?'edit-machine':'delete-machine','machineId'=>$segments[2]]);
        if(($segments[1]??'')==='users'&&isset($segments[2]))dispatch('customers.php',['action'=>'remove-user','subUserId'=>$segments[2]]);
        if(isset($segments[2])&&$segments[2]==='registration-sync')dispatch('customers.php',['action'=>'registration-sync','id'=>$segments[1]]);
        if(isset($segments[2])&&$segments[2]==='reset-password')dispatch('customers.php',['action'=>'reset-password','id'=>$segments[1]]);
        if(isset($segments[2])&&$segments[2]==='user-limit')dispatch('customers.php',['action'=>'user-limit','id'=>$segments[1]]);
        if(isset($segments[2])&&$segments[2]==='machinery-admin')dispatch('customers.php',['action'=>'machinery-admin','id'=>$segments[1]]);
        if(isset($segments[2])&&$segments[2]==='portal-access')dispatch('customers.php',['action'=>'portal-access','id'=>$segments[1]]);
        if(isset($segments[2])&&$segments[2]==='workshop-module')dispatch('customers.php',['action'=>'workshop-module','id'=>$segments[1]]);
        if(isset($segments[2])&&$segments[2]==='coordinator-features')dispatch('customers.php',['action'=>'coordinator-features','id'=>$segments[1]]);
        if(isset($segments[2])&&$segments[2]==='message')dispatch('customers.php',['action'=>'send-message','id'=>$segments[1]]);
        if(isset($segments[2])&&$segments[2]==='machines')dispatch('customers.php',['action'=>'add-machine','id'=>$segments[1]]);
        if(isset($segments[2])&&$segments[2]==='users')dispatch('customers.php',['action'=>'add-user','id'=>$segments[1]]);
        if(($segments[1]??'')==='merge')dispatch('customers.php',['action'=>'merge']);
        if(isset($segments[1]))dispatch('customers.php',['action'=>$method==='GET'?'one':'','id'=>$segments[1]]);
        dispatch('customers.php');
    case 'users':
        if(($segments[1]??'')==='roles')dispatch('users.php',['action'=>'roles','id'=>$segments[2]??null]);
        if(isset($segments[2])&&$segments[2]==='reset-password')dispatch('users.php',['action'=>'reset-password','id'=>$segments[1]]);
        if(isset($segments[2])&&$segments[2]==='activity')dispatch('users.php',['action'=>'activity','id'=>$segments[1]]);
        if(isset($segments[1]))dispatch('users.php',['id'=>$segments[1]]);
        dispatch('users.php');
    case 'controller-pinouts': dispatch('controller_pinouts.php',['id'=>$segments[1]??null]);
    case 'checklist-reports':
<<<<<<< HEAD
        // Explicit REST mapping for Technician / Machine Report Center.
        // Query-style actions are still accepted for older frontend modules.
        if(($segments[1]??'')==='technician-general'&&($segments[2]??'')==='pdf')dispatch('checklist_reports.php',['action'=>'technician-general-report-pdf']);
        if(($segments[1]??'')==='technician-general')dispatch('checklist_reports.php',['action'=>'technician-general-report']);
=======
        // V643: explicit REST mapping for Machine Report Center.
>>>>>>> c3ed62997e0e381ce8491d78b5e18dae047acfdd
        if(($segments[1]??'')==='machine'&&isset($segments[2])&&($segments[3]??'')==='history-pdf')dispatch('checklist_reports.php',['action'=>'machine-history-pdf','machineId'=>$segments[2]]);
        if(($segments[1]??'')==='machine'&&isset($segments[2]))dispatch('checklist_reports.php',['action'=>'for-machine','machineId'=>$segments[2]]);
        if(($segments[1]??'')==='operator-reports'&&isset($segments[2])&&($segments[3]??'')==='pdf')dispatch('checklist_reports.php',['action'=>'operator-reports-pdf','machineId'=>$segments[2]]);
        if(($segments[1]??'')==='operator-reports'&&isset($segments[2]))dispatch('checklist_reports.php',['action'=>'operator-reports','machineId'=>$segments[2]]);
        if(isset($segments[1])&&($segments[2]??'')==='pdf')dispatch('checklist_reports.php',['action'=>'pdf','id'=>$segments[1]]);
<<<<<<< HEAD
        if($method==='PUT'&&isset($segments[1])&&!isset($segments[2]))dispatch('checklist_reports.php',['action'=>'update','id'=>$segments[1]]);
        $queryAction=trim((string)($_GET['action']??''));
        if($queryAction!=='')dispatch('checklist_reports.php',['action'=>$queryAction]);
        if($method==='POST')dispatch('checklist_reports.php',['action'=>'submit']);
        dispatch('checklist_reports.php');
=======
        dispatch('checklist_reports.php',['action'=>'submit']);
>>>>>>> c3ed62997e0e381ce8491d78b5e18dae047acfdd
    case 'breakdown-workflow': dispatch('breakdown_workflow.php',['action'=>$segments[1]??'','id'=>$segments[2]??'']);
    case 'belm-procurement': dispatch('belm_procurement.php',['id'=>$segments[1]??'']);
    case 'engineering': dispatch('engineering.php');
    case 'operator': dispatch('operator.php',['action'=>$segments[1]??($_GET['action']??'')]);
    case 'job-cards': dispatch('service_requests.php');
    case 'service-requests': dispatch('service_requests.php');
<<<<<<< HEAD
    case 'spare-parts':
        // /spare-parts/requests is the Technician/Inventory Request workflow.
        if(($segments[1]??'')==='requests')dispatch('spare_part_requests.php',['id'=>$segments[2]??null]);
        dispatch('spare_parts.php',['id'=>$segments[1]??null]);
=======
    case 'spare-parts': dispatch('spare_parts.php',['id'=>$segments[1]??null]);
>>>>>>> c3ed62997e0e381ce8491d78b5e18dae047acfdd
    case 'spare-recommendations': dispatch('spare_recommendations.php',['id'=>$segments[1]??'']);
    case 'announcements': dispatch('announcements.php',['id'=>$segments[1]??'']);
    case 'preferences': dispatch('preferences.php');
    case 'notification-config': if(($segments[1]??'')==='status')dispatch('notification_config.php');json_error('Unknown notification configuration request',404);
    case 'settings': if(isset($segments[1]))dispatch('settings.php',['key'=>$segments[1]]);dispatch('settings.php');
    case 'trash': if(isset($segments[1]))dispatch('trash.php',['id'=>$segments[1]]);dispatch('trash.php');
    case 'delivery-notes': if(($segments[1]??'')==='meta')dispatch('delivery_notes.php',['action'=>'meta']);if(isset($segments[1]))dispatch('delivery_notes.php',['id'=>$segments[1]]);dispatch('delivery_notes.php');
<<<<<<< HEAD
    case 'tasks':
        if(($segments[1]??'')==='user'&&isset($segments[2]))dispatch('tasks.php',['userId'=>$segments[2]]);
        if(isset($segments[1]))dispatch('tasks.php',['id'=>$segments[1]]);
        dispatch('tasks.php');
=======
    case 'tasks': dispatch('tasks.php',['id'=>$segments[1]??null]);
>>>>>>> c3ed62997e0e381ce8491d78b5e18dae047acfdd
    default: json_error('Not found',404);
}
