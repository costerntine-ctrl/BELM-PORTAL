<?php
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

// Health/setup check. This deliberately exposes no credentials.
if (($segments[0] ?? '') === 'health' || !isset($segments[0])) {
    try {
        $databaseVersion = db()->query('SELECT VERSION()')->fetchColumn();
        $requiredTables = [
            'roles',
            'users',
            'customers',
            'customer_users',
            'machines',
            'customer_applications',
            'user_applications',
            'usage_logs',
            'customer_store_items',
            'customer_store_movements',
            'customer_machine_spare_list_items',
            'customer_store_issue_requests',
            'customer_procurement_requests',
            'checklist_template_parts',
            'service_request_parts',
            'spare_parts',
            'spare_part_requests',
            'bank_accounts',
            'bank_withdrawals',
            'customer_communications',
            'user_preferences',
            'machine_service_parts',
            'service_due_alerts',
            'service_due_alert_items',
            'breakdown_cases',
            'breakdown_case_events',
            'breakdown_spare_requests',
            'digital_job_cards',
            'invoices',
            'payments',
            'proforma_invoices',
        ];
        $tableChecks = [];
        $schemaReady = true;
        $tableStatement = db()->prepare('SELECT to_regclass(?) IS NOT NULL');
        foreach ($requiredTables as $table) {
            $tableStatement->execute(['public.' . $table]);
            $tableChecks[$table] = (bool)$tableStatement->fetchColumn();
            if (!$tableChecks[$table]) $schemaReady = false;
        }
        $requiredColumns = [
            ['digital_job_cards', 'issued_by_name'],
            ['digital_job_cards', 'signed_copy_data'],
            ['digital_job_cards', 'billing_status'],
            ['invoices', 'source_job_card_id'],
            ['proforma_invoices', 'source_job_card_id'],
        ];
        $columnChecks = [];
        $columnStatement = db()->prepare(
            "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=? AND column_name=?)"
        );
        foreach ($requiredColumns as [$table, $column]) {
            $columnStatement->execute([$table, $column]);
            $key = $table . '.' . $column;
            $columnChecks[$key] = (bool)$columnStatement->fetchColumn();
            if (!$columnChecks[$key]) $schemaReady = false;
        }

        $adminChecks = [
            'exactlyOneAccount' => false,
            'active' => false,
            'superAdminRole' => false,
            'passwordHashStored' => false,
        ];
        try {
            $stmt = db()->prepare(
                "SELECT u.id, u.is_active, u.deleted_at, u.password_hash,
                        r.name AS role_name,
                        COUNT(*) OVER () AS matching_accounts
                 FROM users u
                 LEFT JOIN roles r ON r.id = u.role_id
                 WHERE u.id = ?
                 ORDER BY
                   CASE WHEN u.deleted_at IS NULL AND u.is_active = 1 THEN 0 ELSE 1 END,
                   u.created_at ASC
                 LIMIT 1"
            );
            $stmt->execute(['00000000-0000-4000-8000-000000000003']);
            $admin = $stmt->fetch();
            if ($admin) {
                $hash = (string)($admin['password_hash'] ?? '');
                $adminChecks['exactlyOneAccount'] = (int)$admin['matching_accounts'] === 1;
                $adminChecks['active'] =
                    (int)$admin['is_active'] === 1 && $admin['deleted_at'] === null;
                $adminChecks['superAdminRole'] = $admin['role_name'] === 'Super Admin';
                $adminChecks['passwordHashStored'] =
                    str_starts_with($hash, '$2') || str_starts_with($hash, '$argon2');
            }
        } catch (Throwable $ignored) {
            // The database connection works, but schema.sql has not been imported.
        }
        $adminReady = !in_array(false, $adminChecks, true);

        json_out([
            'ok' => true,
            'api' => 'BELM PHP/PostgreSQL',
            'database' => 'connected',
            'databaseVersion' => $databaseVersion,
            'schemaVersion' => '301-customer-job-billing',
            'schemaReady' => $schemaReady,
            'tables' => $tableChecks,
            'columns' => $columnChecks,
            'adminReady' => $adminReady,
            'adminChecks' => $adminChecks,
            'loginEndpoints' => [
                'staff' => '/api/auth/login',
                'customer' => '/api/auth/customer-login',
            ],
        ], $schemaReady ? 200 : 503);
    } catch (Throwable $e) {
        json_out([
            'ok' => false,
            'api' => 'BELM PHP/PostgreSQL',
            'database' => 'not-connected',
            'message' => 'Check DATABASE_URL and the Render Postgres service.',
        ], 503);
    }
}

$resource = $segments[0] ?? '';

switch ($resource) {
    case 'auth':
        // Original role login endpoints: /auth/login and /auth/customer-login.
        // /auth/unified-login remains backward-compatible for older clients.
        dispatch('auth.php', ['action' => $segments[1] ?? '']);

    case 'applications':
        // POST /applications                         -> public application
        // GET  /applications                         -> admin list
        // PUT  /applications/:id/approve|cancel      -> admin decision
        dispatch('applications.php', [
            'id' => $segments[1] ?? null,
            'action' => $segments[2] ?? '',
        ]);

    case 'customers':
        // GET /customers/diagnostics     -> non-sensitive customer data counts for troubleshooting
        // GET/POST /customers            -> list / create
        // GET/PUT/DELETE /customers/:id  -> one / update / delete
        // POST /customers/:id/machines           -> add-machine
        // PUT  /customers/machines/:machineId    -> edit-machine
        // PUT  /customers/machines/:machineId/status -> operational-status
        // DELETE /customers/machines/:machineId  -> delete-machine
        // POST /customers/:id/users              -> add-user
        // DELETE /customers/users/:subUserId     -> remove-user
        if (($segments[1] ?? '') === 'diagnostics') {
            dispatch('customers.php', ['action' => 'diagnostics']);
        }
        if (($segments[1] ?? '') === 'communication-feed') {
            dispatch('customers.php', ['action' => 'communication-feed']);
        }
        if (($segments[1] ?? '') === 'machines' && isset($segments[2]) && ($segments[3] ?? '') === 'service-parts') {
            dispatch('customers.php', ['action' => 'service-parts', 'machineId' => $segments[2]]);
        }
        if (($segments[1] ?? '') === 'machines' && isset($segments[2]) && ($segments[3] ?? '') === 'status') {
            dispatch('customers.php', ['action' => 'operational-status', 'machineId' => $segments[2]]);
        }
        if (($segments[1] ?? '') === 'machines' && isset($segments[2]) && ($segments[3] ?? '') === 'expense-receipts') {
            dispatch('customers.php', ['action' => 'expense-receipts', 'machineId' => $segments[2]]);
        }
        if (($segments[1] ?? '') === 'expense-receipt' && isset($segments[2])) {
            dispatch('customers.php', ['action' => 'expense-receipt', 'expenseId' => $segments[2]]);
        }
        if (($segments[1] ?? '') === 'machines' && isset($segments[2]) && ($segments[3] ?? '') === 'petty-cash-topup') {
            dispatch('customers.php', ['action' => 'petty-cash-topup', 'machineId' => $segments[2]]);
        }
        if (($segments[1] ?? '') === 'machines' && isset($segments[2]) && ($segments[3] ?? '') === 'settle-petty-cash-debt') {
            dispatch('customers.php', ['action' => 'settle-petty-cash-debt', 'machineId' => $segments[2]]);
        }
        if (($segments[1] ?? '') === 'machines' && isset($segments[2])) {
            dispatch('customers.php', ['action' => $method === 'PUT' ? 'edit-machine' : 'delete-machine', 'machineId' => $segments[2]]);
        }
        if (($segments[1] ?? '') === 'users' && isset($segments[2])) {
            dispatch('customers.php', ['action' => 'remove-user', 'subUserId' => $segments[2]]);
        }
        if (isset($segments[2]) && $segments[2] === 'reset-password') {
            dispatch('customers.php', ['action' => 'reset-password', 'id' => $segments[1]]);
        }
        if (isset($segments[2]) && $segments[2] === 'user-limit') {
            dispatch('customers.php', ['action' => 'user-limit', 'id' => $segments[1]]);
        }
        if (isset($segments[2]) && $segments[2] === 'machinery-admin') {
            dispatch('customers.php', ['action' => 'machinery-admin', 'id' => $segments[1]]);
        }
        if (isset($segments[2]) && $segments[2] === 'portal-access') {
            dispatch('customers.php', ['action' => 'portal-access', 'id' => $segments[1]]);
        }
        if (isset($segments[2]) && $segments[2] === 'message') {
            dispatch('customers.php', ['action' => 'send-message', 'id' => $segments[1]]);
        }
        if (isset($segments[2]) && $segments[2] === 'communications' && isset($segments[3]) && ($segments[4] ?? '') === 'read') {
            dispatch('customers.php', ['action' => 'communication-read', 'id' => $segments[1], 'communicationId' => $segments[3]]);
        }
        if (isset($segments[2]) && $segments[2] === 'communications') {
            dispatch('customers.php', ['action' => 'communications', 'id' => $segments[1]]);
        }
        if (isset($segments[2]) && $segments[2] === 'machines') {
            dispatch('customers.php', ['action' => 'add-machine', 'id' => $segments[1]]);
        }
        if (isset($segments[2]) && $segments[2] === 'users') {
            dispatch('customers.php', ['action' => 'add-user', 'id' => $segments[1]]);
        }
        if (($segments[1] ?? '') === 'merge') {
            dispatch('customers.php', ['action' => 'merge']);
        }
        if (isset($segments[1])) dispatch('customers.php', ['action' => $method === 'GET' ? 'one' : '', 'id' => $segments[1]]);
        dispatch('customers.php');

    case 'users':
        // GET/POST /users, PUT/DELETE /users/:id, PUT /users/:id/reset-password
        // GET/POST /users/roles, PUT/DELETE /users/roles/:id
        // GET /users/:id/activity
        if (($segments[1] ?? '') === 'roles') {
            dispatch('users.php', ['action' => 'roles', 'id' => $segments[2] ?? null]);
        }
        if (isset($segments[2]) && $segments[2] === 'reset-password') {
            dispatch('users.php', ['action' => 'reset-password', 'id' => $segments[1]]);
        }
        if (isset($segments[2]) && $segments[2] === 'activity') {
            dispatch('users.php', ['action' => 'activity', 'id' => $segments[1]]);
        }
        if (isset($segments[1])) dispatch('users.php', ['id' => $segments[1]]);
        dispatch('users.php');

    case 'checklist-templates':
        if (isset($segments[2]) && $segments[2] === 'items') {
            dispatch('checklist_templates.php', ['action' => 'add-item', 'id' => $segments[1]]);
        }
        if (($segments[1] ?? '') === 'items' && isset($segments[2])) {
            dispatch('checklist_templates.php', ['action' => $method === 'PUT' ? 'edit-item' : 'delete-item', 'itemId' => $segments[2]]);
        }
        if (isset($segments[1])) dispatch('checklist_templates.php', ['action' => $method === 'GET' ? 'one' : '', 'id' => $segments[1]]);
        dispatch('checklist_templates.php');

    case 'controller-pinouts':
        // GET/POST /controller-pinouts, GET/PUT/DELETE /controller-pinouts/:id
        // GET /controller-pinouts/:id/pdf -> download one controller record as PDF
        // GET /controller-pinouts/photo?photoId=X, DELETE /controller-pinouts/photo?photoId=X
        if (($segments[1] ?? '') === 'photo') {
            dispatch('controller_pinouts.php', ['action' => 'photo']);
        }
        if ($method === 'GET' && isset($segments[1]) && ($segments[2] ?? '') === 'pdf') {
            dispatch('controller_pinouts.php', ['action' => 'pdf', 'id' => $segments[1]]);
        }
        if (isset($segments[1])) dispatch('controller_pinouts.php', ['action' => $method === 'GET' ? 'one' : '', 'id' => $segments[1]]);
        dispatch('controller_pinouts.php');

    case 'checklist-reports':
        // POST /checklist-reports -> submit
        // PUT /checklist-reports/:id -> update until 00:00 Tanzania time
        // GET /checklist-reports/machine/:machineId -> for-machine
        // GET/POST /checklist-reports/service-status/:machineId[/log-service]
        if (($segments[1] ?? '') === 'machine' && isset($segments[2]) && ($segments[3] ?? '') === 'history-pdf') {
            dispatch('checklist_reports.php', ['action' => 'machine-history-pdf', 'machineId' => $segments[2]]);
        }
        if (($segments[1] ?? '') === 'machine' && isset($segments[2])) {
            dispatch('checklist_reports.php', ['action' => 'for-machine', 'machineId' => $segments[2]]);
        }
        if (($segments[1] ?? '') === 'service-status' && isset($segments[2])) {
            $action = (isset($segments[3]) && $segments[3] === 'log-service') ? 'log-service' : 'service-status';
            dispatch('checklist_reports.php', ['action' => $action, 'machineId' => $segments[2]]);
        }
        if ($method === 'GET' && isset($segments[1]) && ($segments[2] ?? '') === 'pdf') {
            dispatch('checklist_reports.php', ['action' => 'pdf', 'id' => $segments[1]]);
        }
        if ($method === 'PUT' && isset($segments[1])) {
            dispatch('checklist_reports.php', ['action' => 'update', 'id' => $segments[1]]);
        }
        dispatch('checklist_reports.php', ['action' => 'submit']);

    case 'breakdown-workflow':
        dispatch('breakdown_workflow.php', ['action' => $segments[1] ?? '', 'id' => $segments[2] ?? '']);

    case 'engineering':
        dispatch('engineering.php');

    case 'operator':
        dispatch('operator.php');

    case 'service-requests':
        if (($segments[1] ?? '') === 'assignees') dispatch('service_requests.php', ['action' => 'assignees']);
        if (isset($segments[2]) && $segments[2] === 'status') dispatch('service_requests.php', ['action' => 'status', 'id' => $segments[1]]);
        if (isset($segments[2]) && $segments[2] === 'assign') dispatch('service_requests.php', ['action' => 'assign', 'id' => $segments[1]]);
        if (isset($segments[2]) && $segments[2] === 'hide') dispatch('service_requests.php', ['action' => 'hide', 'id' => $segments[1]]);
        if (isset($segments[2]) && $segments[2] === 'unhide') dispatch('service_requests.php', ['action' => 'unhide', 'id' => $segments[1]]);
        if (isset($segments[2]) && $segments[2] === 'notes') dispatch('service_requests.php', ['action' => 'notes', 'id' => $segments[1]]);
        dispatch('service_requests.php');

    case 'spare-parts':
        if (($segments[1] ?? '') === 'requests') {
            dispatch('spare_part_requests.php', ['id' => $segments[2] ?? null]);
        }
        dispatch('spare_parts.php', ['id' => $segments[1] ?? null]);

    case 'spare-recommendations':
        dispatch('spare_recommendations.php', ['id' => $segments[1] ?? '']);

    case 'billing':
        // GET/POST /billing/invoices, GET/PUT/DELETE /billing/invoices/:id
        // POST /billing/invoices/:id/payments
        // PUT  /billing/invoices/:id/payments/:paymentId
        if (($segments[1] ?? '') === 'invoices') {
            if (isset($segments[3]) && $segments[3] === 'payments') {
                dispatch('billing.php', [
                    'action' => 'payment',
                    'id' => $segments[2],
                    'paymentId' => $segments[4] ?? null,
                ]);
            }
            dispatch('billing.php', ['id' => $segments[2] ?? null]);
        }
        dispatch('billing.php');

    case 'company-expenses':
        dispatch('company_expenses.php', ['id' => $segments[1] ?? null]);

    case 'bank-manager':
        // GET  /bank-manager
        // POST /bank-manager/accounts
        // PUT  /bank-manager/accounts/:id
        // POST /bank-manager/withdrawals
        // PUT  /bank-manager/withdrawals/:id
        if (($segments[1] ?? '') === 'accounts') {
            dispatch('bank_manager.php', ['action' => 'account', 'id' => $segments[2] ?? null]);
        }
        if (($segments[1] ?? '') === 'withdrawals') {
            dispatch('bank_manager.php', ['action' => 'withdrawal', 'id' => $segments[2] ?? null]);
        }
        dispatch('bank_manager.php');

    case 'proforma-invoices':
        dispatch('proforma_invoices.php', ['id' => $segments[1] ?? null]);

    case 'receipts':
        dispatch('receipts.php', ['id' => $segments[1] ?? null]);

    case 'suppliers':
        dispatch('suppliers.php', ['id' => $segments[1] ?? null]);

    case 'reports':
        dispatch('reports.php', ['action' => $segments[1] ?? '']);

    case 'backup':
        dispatch('backup.php');

    case 'announcements':
        dispatch('announcements.php', ['id' => $segments[1] ?? '']);

    case 'preferences':
        // GET/PUT /preferences -> personal light/dark preference for the current login.
        // Available to staff, customer owners/assistants, technicians and operators.
        dispatch('preferences.php');

    case 'settings':
        // GET/PUT /settings, PUT /settings/:key
        // POST /settings/verify-admin-pin, PUT /settings/admin-pin/change
        if (($segments[1] ?? '') === 'verify-admin-pin') dispatch('settings.php', ['action' => 'verify-pin']);
        if (($segments[1] ?? '') === 'admin-pin' && ($segments[2] ?? '') === 'change') dispatch('settings.php', ['action' => 'change-pin']);
        if (isset($segments[1])) dispatch('settings.php', ['key' => $segments[1]]);
        dispatch('settings.php');

    case 'trash':
        // GET /trash, POST /trash/:id/restore, DELETE /trash/:id
        if (isset($segments[2]) && $segments[2] === 'restore') dispatch('trash.php', ['id' => $segments[1]]);
        if (isset($segments[1])) dispatch('trash.php', ['id' => $segments[1]]);
        dispatch('trash.php');

    case 'tasks':
        // GET /tasks/user/:userId, POST /tasks, PUT /tasks/:id/done, DELETE /tasks/:id
        if (($segments[1] ?? '') === 'user' && isset($segments[2])) dispatch('tasks.php', ['userId' => $segments[2]]);
        if (isset($segments[2]) && $segments[2] === 'done') dispatch('tasks.php', ['id' => $segments[1]]);
        if (isset($segments[1])) dispatch('tasks.php', ['id' => $segments[1]]);
        dispatch('tasks.php');

    case 'customer-portal':
        dispatch('customer_portal.php', ['sub' => $segments[1] ?? '', 'sub2' => $segments[2] ?? '', 'sub3' => $segments[3] ?? '']);

    default:
        json_error('Not found', 404);
}
