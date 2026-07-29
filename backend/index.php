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

// Health/setup check. This deliberately exposes no credentials.
if (($segments[0] ?? '') === 'health' || !isset($segments[0])) {
    try {
        $databaseVersion = db()->query('SELECT VERSION()')->fetchColumn();
        $adminReady = false;
        try {
            $stmt = db()->prepare(
                "SELECT COUNT(*) FROM users WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL"
            );
            $stmt->execute(['admin@belmgeneraltech.co.tz']);
            $adminReady = (int)$stmt->fetchColumn() > 0;
        } catch (Throwable $ignored) {
            // The database connection works, but schema.sql has not been imported.
        }

        json_out([
            'ok' => true,
            'api' => 'BELM PHP/PostgreSQL',
            'database' => 'connected',
            'databaseVersion' => $databaseVersion,
            'adminReady' => $adminReady,
        ]);
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
        // /auth/unified-login, plus legacy /auth/login and /auth/customer-login
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
        // GET /checklist-reports/machine/:machineId -> for-machine
        // GET/POST /checklist-reports/service-status/:machineId[/log-service]
        if (($segments[1] ?? '') === 'machine' && isset($segments[2])) {
            dispatch('checklist_reports.php', ['action' => 'for-machine', 'machineId' => $segments[2]]);
        }
        if (($segments[1] ?? '') === 'service-status' && isset($segments[2])) {
            $action = (isset($segments[3]) && $segments[3] === 'log-service') ? 'log-service' : 'service-status';
            dispatch('checklist_reports.php', ['action' => $action, 'machineId' => $segments[2]]);
        }
        dispatch('checklist_reports.php', ['action' => 'submit']);

    case 'service-requests':
        if (($segments[1] ?? '') === 'assignees') dispatch('service_requests.php', ['action' => 'assignees']);
        if (isset($segments[2]) && $segments[2] === 'status') dispatch('service_requests.php', ['action' => 'status', 'id' => $segments[1]]);
        if (isset($segments[2]) && $segments[2] === 'assign') dispatch('service_requests.php', ['action' => 'assign', 'id' => $segments[1]]);
        if (isset($segments[2]) && $segments[2] === 'notes') dispatch('service_requests.php', ['action' => 'notes', 'id' => $segments[1]]);
        dispatch('service_requests.php');

    case 'spare-parts':
        dispatch('spare_parts.php', ['id' => $segments[1] ?? null]);

    case 'billing':
        // GET/POST /billing/invoices, GET/PUT/DELETE /billing/invoices/:id
        // POST /billing/invoices/:id/payments
        if (($segments[1] ?? '') === 'invoices') {
            if (isset($segments[3]) && $segments[3] === 'payments') {
                dispatch('billing.php', ['action' => 'payment', 'id' => $segments[2]]);
            }
            dispatch('billing.php', ['id' => $segments[2] ?? null]);
        }
        dispatch('billing.php');

    case 'company-expenses':
        dispatch('company_expenses.php', ['id' => $segments[1] ?? null]);

    case 'proforma-invoices':
        dispatch('proforma_invoices.php', ['id' => $segments[1] ?? null]);

    case 'suppliers':
        dispatch('suppliers.php', ['id' => $segments[1] ?? null]);

    case 'reports':
        dispatch('reports.php', ['action' => $segments[1] ?? '']);

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
