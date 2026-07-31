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

// Liveness does not touch PostgreSQL. Render can use this endpoint to confirm
// that Apache/PHP is running while /api/health reports database readiness.
if (($segments[0] ?? '') === 'live') {
    $environment = database_environment_summary();
    json_out([
        'ok' => true,
        'api' => 'BELM PHP/PostgreSQL',
        'service' => 'running',
        'schemaVersion' => '19-database-recovery',
        'requestId' => belm_request_id(),
        'databaseUrlConfigured' => $environment['databaseUrlConfigured'],
        'pgsqlDriverAvailable' => $environment['pgsqlDriverAvailable'],
    ]);
}

// Database/schema readiness check. It deliberately exposes no credentials,
// hostnames, usernames or SQL text.
if (($segments[0] ?? '') === 'health' || !isset($segments[0])) {
    $environment = database_environment_summary();

    try {
        $pdo = db();
        $pdo->query('SELECT 1')->fetchColumn();
    } catch (Throwable $error) {
        $classification = belm_classify_exception($error);
        error_log(sprintf(
            'BELM health error requestId=%s code=%s sqlstate=%s message=%s',
            belm_request_id(),
            $classification['code'],
            $classification['sqlState'] ?: 'none',
            preg_replace('/[\r\n]+/', ' ', $error->getMessage())
        ));

        json_out([
            'ok' => false,
            'api' => 'BELM PHP/PostgreSQL',
            'database' => 'not-connected',
            'code' => $classification['code'],
            'message' => $classification['message'],
            'requestId' => belm_request_id(),
            'databaseUrlConfigured' => $environment['databaseUrlConfigured'],
            'pgsqlDriverAvailable' => $environment['pgsqlDriverAvailable'],
        ], 503);
    }

    $databaseVersion = (string)$pdo->query('SHOW server_version')->fetchColumn();
    $requiredTables = [
        'roles',
        'users',
        'customers',
        'customer_users',
        'machines',
        'checklist_templates',
        'checklist_template_items',
        'checklist_template_parts',
        'checklist_reports',
        'checklist_answers',
        'service_requests',
        'service_request_parts',
        'spare_parts',
        'spare_part_requests',
        'invoices',
        'payments',
        'company_expenses',
        'bank_accounts',
        'bank_withdrawals',
        'suppliers',
        'system_settings',
        'customer_applications',
        'user_applications',
    ];

    $tableChecks = [];
    $schemaIssues = [];
    $tableStatement = $pdo->prepare('SELECT to_regclass(?) IS NOT NULL');
    foreach ($requiredTables as $table) {
        $tableStatement->execute(['public.' . $table]);
        $exists = (bool)$tableStatement->fetchColumn();
        $tableChecks[$table] = $exists;
        if (!$exists) {
            $schemaIssues[] = 'Missing table: ' . $table;
        }
    }

    $requiredColumns = [
        'customers.is_active' => 'smallint',
        'customers.recovery_code_hash' => 'character varying',
        'users.is_active' => 'smallint',
        'users.assigned_customer_id' => 'character varying',
        'customer_users.is_active' => 'smallint',
        'machines.service_history' => 'jsonb',
        'machines.updated_at' => 'timestamp with time zone',
        'checklist_templates.service_type' => 'character varying',
        'checklist_templates.is_active' => 'smallint',
        'checklist_template_items.option_safety' => 'jsonb',
        'checklist_template_items.is_required' => 'smallint',
        'service_requests.customer_confirmed' => 'smallint',
        'service_requests.origin' => 'character varying',
        'payments.bank_account_id' => 'character varying',
        'bank_accounts.is_active' => 'smallint',
        'suppliers.verified' => 'smallint',
        'trash_entries.reason' => 'character varying',
        'system_settings.value' => 'jsonb',
    ];

    $columnChecks = [];
    $columnStatement = $pdo->prepare(
        'SELECT data_type
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ? AND column_name = ?'
    );
    foreach ($requiredColumns as $qualifiedColumn => $expectedType) {
        [$table, $column] = explode('.', $qualifiedColumn, 2);
        $columnStatement->execute(['public', $table, $column]);
        $actualType = $columnStatement->fetchColumn();
        $matches = is_string($actualType) && $actualType === $expectedType;
        $columnChecks[$qualifiedColumn] = [
            'ok' => $matches,
            'expected' => $expectedType,
            'actual' => $actualType ?: null,
        ];
        if (!$matches) {
            $schemaIssues[] = sprintf(
                'Column %s expected %s, found %s',
                $qualifiedColumn,
                $expectedType,
                $actualType ?: 'missing'
            );
        }
    }

    $storedSchemaVersion = null;
    if ($tableChecks['system_settings'] ?? false) {
        try {
            $versionStatement = $pdo->prepare(
                'SELECT "value"::text
                 FROM system_settings
                 WHERE "key" = ?
                 LIMIT 1'
            );
            $versionStatement->execute(['schemaVersion']);
            $versionRaw = $versionStatement->fetchColumn();
            $storedSchemaVersion = is_string($versionRaw)
                ? trim($versionRaw, '"')
                : null;
            if ($storedSchemaVersion !== '19-database-recovery') {
                $schemaIssues[] = 'Database migration version is not current.';
            }
        } catch (Throwable $error) {
            $classification = belm_classify_exception($error);
            $schemaIssues[] = 'Could not read schemaVersion (' . $classification['code'] . ').';
        }
    }

    $adminChecks = [
        'exactlyOneAccount' => false,
        'active' => false,
        'superAdminRole' => false,
        'passwordHashStored' => false,
    ];
    try {
        $stmt = $pdo->prepare(
            "SELECT u.id, u.is_active, u.deleted_at, u.password_hash,
                    r.name AS role_name,
                    COUNT(*) OVER () AS matching_accounts
             FROM users u
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE LOWER(u.email) = LOWER(?)
             ORDER BY
               CASE WHEN u.deleted_at IS NULL AND u.is_active = 1 THEN 0 ELSE 1 END,
               u.created_at ASC
             LIMIT 1"
        );
        $stmt->execute(['admin@belmgeneraltech.co.tz']);
        $admin = $stmt->fetch();
        if ($admin) {
            $hash = (string)($admin['password_hash'] ?? '');
            $adminChecks['exactlyOneAccount'] = (int)$admin['matching_accounts'] === 1;
            $adminChecks['active'] =
                (int)$admin['is_active'] === 1 && $admin['deleted_at'] === null;
            $adminChecks['superAdminRole'] = $admin['role_name'] === 'Super Admin';
            $adminChecks['passwordHashStored'] =
                str_starts_with($hash, '$2') || str_starts_with($hash, '$argon2');
        } else {
            $schemaIssues[] = 'Built-in Administrator account is missing.';
        }
    } catch (Throwable $error) {
        $classification = belm_classify_exception($error);
        $schemaIssues[] = 'Administrator readiness check failed (' . $classification['code'] . ').';
    }

    $schemaReady = count($schemaIssues) === 0;
    $adminReady = !in_array(false, $adminChecks, true);
    $ready = $schemaReady && $adminReady;

    json_out([
        'ok' => $ready,
        'api' => 'BELM PHP/PostgreSQL',
        'database' => 'connected',
        'databaseVersion' => $databaseVersion,
        'pdoDriver' => $pdo->getAttribute(PDO::ATTR_DRIVER_NAME),
        'databaseUrlConfigured' => $environment['databaseUrlConfigured'],
        'pgsqlDriverAvailable' => $environment['pgsqlDriverAvailable'],
        'schemaVersion' => '19-database-recovery',
        'databaseSchemaVersion' => $storedSchemaVersion,
        'schemaReady' => $schemaReady,
        'schemaIssues' => $schemaIssues,
        'tables' => $tableChecks,
        'columns' => $columnChecks,
        'adminReady' => $adminReady,
        'adminChecks' => $adminChecks,
        'requestId' => belm_request_id(),
        'loginEndpoints' => [
            'staff' => '/api/auth/login',
            'customer' => '/api/auth/customer-login',
        ],
    ], $ready ? 200 : 503);
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
        // GET/POST /customers            -> list / create
        // GET/PUT/DELETE /customers/:id  -> one / update / delete
        // POST /customers/:id/machines           -> add-machine
        // PUT  /customers/machines/:machineId    -> edit-machine
        // DELETE /customers/machines/:machineId  -> delete-machine
        // POST /customers/:id/users              -> add-user
        // DELETE /customers/users/:subUserId     -> remove-user
        if (($segments[1] ?? '') === 'machines' && isset($segments[2])) {
            dispatch('customers.php', ['action' => $method === 'PUT' ? 'edit-machine' : 'delete-machine', 'machineId' => $segments[2]]);
        }
        if (($segments[1] ?? '') === 'users' && isset($segments[2])) {
            dispatch('customers.php', ['action' => 'remove-user', 'subUserId' => $segments[2]]);
        }
        if (isset($segments[2]) && $segments[2] === 'reset-password') {
            dispatch('customers.php', ['action' => 'reset-password', 'id' => $segments[1]]);
        }
        if (isset($segments[2]) && $segments[2] === 'machines') {
            dispatch('customers.php', ['action' => 'add-machine', 'id' => $segments[1]]);
        }
        if (isset($segments[2]) && $segments[2] === 'users') {
            dispatch('customers.php', ['action' => 'add-user', 'id' => $segments[1]]);
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

    case 'checklist-reports':
        // POST /checklist-reports -> submit
        // PUT /checklist-reports/:id -> update until 00:00 Tanzania time
        // GET /checklist-reports/machine/:machineId -> for-machine
        // GET/POST /checklist-reports/service-status/:machineId[/log-service]
        if (($segments[1] ?? '') === 'machine' && isset($segments[2])) {
            dispatch('checklist_reports.php', ['action' => 'for-machine', 'machineId' => $segments[2]]);
        }
        if (($segments[1] ?? '') === 'service-status' && isset($segments[2])) {
            $action = (isset($segments[3]) && $segments[3] === 'log-service') ? 'log-service' : 'service-status';
            dispatch('checklist_reports.php', ['action' => $action, 'machineId' => $segments[2]]);
        }
        if ($method === 'PUT' && isset($segments[1])) {
            dispatch('checklist_reports.php', ['action' => 'update', 'id' => $segments[1]]);
        }
        dispatch('checklist_reports.php', ['action' => 'submit']);

    case 'service-requests':
        if (($segments[1] ?? '') === 'assignees') dispatch('service_requests.php', ['action' => 'assignees']);
        if (isset($segments[2]) && $segments[2] === 'status') dispatch('service_requests.php', ['action' => 'status', 'id' => $segments[1]]);
        if (isset($segments[2]) && $segments[2] === 'assign') dispatch('service_requests.php', ['action' => 'assign', 'id' => $segments[1]]);
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

    case 'suppliers':
        dispatch('suppliers.php', ['id' => $segments[1] ?? null]);

    case 'reports':
        dispatch('reports.php', ['action' => $segments[1] ?? '']);

    case 'backup':
        dispatch('backup.php');

    case 'announcements':
        dispatch('announcements.php', ['id' => $segments[1] ?? '']);

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
