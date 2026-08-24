<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/service_due_helper.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = $_GET['id'] ?? null;

function require_belm_workshop_customer_access(array $user): void {
    // PORTAL-BELM WM is owned by BELM Super Admin / Workshop Manager.
    // A custom BELM role with Customers permission may also use the same customer-linked tools.
    if (belm_user_has_named_role($user, ['Super Admin', 'Engineer', 'Workshop Manager'])) return;
    require_page_access($user, 'customers');
}

function require_customer_read_access(array $user, ?string $customerId = null): void {
    if (($user['roleName'] ?? '') !== 'Technician') {
        require_page_access($user, 'customers');
        return;
    }

    $assigned = $user['assignedCustomerId'] ?? null;
    if (!$assigned) {
        json_error('This Technician account has not been assigned to a customer.', 403);
    }
    if ($customerId && $assigned !== $customerId) {
        json_error('You are not assigned to this customer.', 403);
    }
}

function belm_in_clause(array $ids): string {
    return implode(',', array_fill(0, count($ids), '?'));
}

// V377 - Permanent deletion for ONE machine from BELM Admin > View Customer Machine.
// Mirrors the proven Danger Zone machine hard-delete behavior: machine-owned
// operational history is removed, while independent customer billing/service
// records are detached so the customer and every other machine stay intact.
function belm_forget_machine_permanently(PDO $pdo, string $machineId): void {
    $ids = [$machineId];
    $in = belm_in_clause($ids);

    $pdo->prepare("DELETE FROM checklist_answers WHERE report_id IN (SELECT id FROM checklist_reports WHERE machine_id IN ($in))")->execute($ids);
    $pdo->prepare("DELETE FROM checklist_reports WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM usage_logs WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM petty_cash_topups WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM machine_operator_shifts WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM operator_reports WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM machine_operators WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM spare_part_requests WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("UPDATE service_requests SET machine_id=NULL WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("UPDATE invoices SET machine_id=NULL WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("UPDATE proforma_invoices SET machine_id=NULL WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("UPDATE customer_applications SET machine_id=NULL WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM trash_entries WHERE entity_type='machine' AND entity_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM machines WHERE id IN ($in)")->execute($ids);
}

// Permanently erases a customer and everything tied only to them —
// bypasses the Recycle Bin entirely so it cannot come back. Mirrors the
// hard-delete used by Danger Zone > Reset Database, exposed here as a
// direct "Forget" action on the Customers & Machines page.
function belm_forget_customer_permanently(PDO $pdo, string $customerId): void {
    $machineStmt = $pdo->prepare('SELECT id FROM machines WHERE customer_id=?');
    $machineStmt->execute([$customerId]);
    $machines = $machineStmt->fetchAll(PDO::FETCH_COLUMN);
    $requestStmt = $pdo->prepare('SELECT id FROM service_requests WHERE customer_id=?');
    $requestStmt->execute([$customerId]);
    $requests = $requestStmt->fetchAll(PDO::FETCH_COLUMN);
    $invoiceStmt = $pdo->prepare('SELECT id FROM invoices WHERE customer_id=?');
    $invoiceStmt->execute([$customerId]);
    $invoices = $invoiceStmt->fetchAll(PDO::FETCH_COLUMN);
    $proformaStmt = $pdo->prepare('SELECT id FROM proforma_invoices WHERE customer_id=?');
    $proformaStmt->execute([$customerId]);
    $proformas = $proformaStmt->fetchAll(PDO::FETCH_COLUMN);

    // V307: clear every non-cascading child before the parent. Newer operational
    // tables that declare ON DELETE CASCADE (breakdown/job cards/store etc.) are
    // intentionally left to PostgreSQL so this stays safe as those rows grow.
    if ($machines) {
        $in = belm_in_clause($machines);
        $pdo->prepare("DELETE FROM checklist_answers WHERE report_id IN (SELECT id FROM checklist_reports WHERE machine_id IN ($in))")->execute($machines);
        $pdo->prepare("DELETE FROM checklist_reports WHERE machine_id IN ($in)")->execute($machines);
        // An application can retain a machine FK even if its customer field was
        // never populated by an older build.
        $pdo->prepare("DELETE FROM customer_applications WHERE machine_id IN ($in)")->execute($machines);
    }
    if ($requests) {
        $in = belm_in_clause($requests);
        $pdo->prepare("DELETE FROM service_request_history WHERE request_id IN ($in)")->execute($requests);
        $pdo->prepare("DELETE FROM service_notes WHERE request_id IN ($in)")->execute($requests);
        $pdo->prepare("DELETE FROM service_request_parts WHERE request_id IN ($in)")->execute($requests);
    }
    if ($machines || $requests) {
        $conditions=[]; $params=[];
        if ($machines) { $conditions[]='machine_id IN ('.belm_in_clause($machines).')'; $params=array_merge($params,$machines); }
        if ($requests) { $conditions[]='request_id IN ('.belm_in_clause($requests).')'; $params=array_merge($params,$requests); }
        $pdo->prepare('DELETE FROM spare_part_requests WHERE '.implode(' OR ',$conditions))->execute($params);
    }
    $pdo->prepare('DELETE FROM service_requests WHERE customer_id=?')->execute([$customerId]);

    // Receipts must be removed before their invoices; payments/items before the
    // invoice itself. Proforma items similarly have a non-cascading FK.
    $pdo->prepare('DELETE FROM receipts WHERE customer_id=?')->execute([$customerId]);
    if ($invoices) {
        $in=belm_in_clause($invoices);
        $pdo->prepare("DELETE FROM invoice_items WHERE invoice_id IN ($in)")->execute($invoices);
        $pdo->prepare("DELETE FROM payments WHERE invoice_id IN ($in)")->execute($invoices);
    }
    $pdo->prepare('DELETE FROM invoices WHERE customer_id=?')->execute([$customerId]);
    if ($proformas) {
        $in=belm_in_clause($proformas);
        $pdo->prepare("DELETE FROM proforma_invoice_items WHERE proforma_id IN ($in)")->execute($proformas);
    }
    $pdo->prepare('DELETE FROM proforma_invoices WHERE customer_id=?')->execute([$customerId]);

    // Operator hierarchy must be removed child-first.
    $pdo->prepare('DELETE FROM machine_operator_shifts WHERE customer_id=?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM operator_reports WHERE customer_id=?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM machine_operators WHERE customer_id=?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM petty_cash_topups WHERE customer_id=?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM usage_logs WHERE customer_id=?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM tasks WHERE customer_id=?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customer_applications WHERE customer_id=?')->execute([$customerId]);
    $pdo->prepare('UPDATE user_applications SET assigned_customer_id=NULL WHERE assigned_customer_id=?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customer_saved_emails WHERE customer_id=?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customer_activity_logs WHERE customer_id=?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customer_users WHERE customer_id=?')->execute([$customerId]);

    // All remaining machine/customer-owned workflow/store rows are cascading.
    $pdo->prepare('DELETE FROM machines WHERE customer_id=?')->execute([$customerId]);
    $pdo->prepare('UPDATE users SET assigned_customer_id=NULL WHERE assigned_customer_id=?')->execute([$customerId]);

    $pdo->prepare("DELETE FROM trash_entries WHERE entity_type='customer' AND entity_id=?")->execute([$customerId]);
    if ($machines) {
        $in=belm_in_clause($machines);
        $pdo->prepare("DELETE FROM trash_entries WHERE entity_type='machine' AND entity_id IN ($in)")->execute($machines);
    }
    $pdo->prepare('DELETE FROM customers WHERE id=?')->execute([$customerId]);
}

function validate_customer_details(array $body, ?string $excludeCustomerId = null): array {
    $name = trim((string)($body['name'] ?? ''));
    $email = strtolower(trim((string)($body['email'] ?? '')));
    $phone = trim((string)($body['phone'] ?? ''));
    if ($name === '') json_error('Customer name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid customer email address.');
    if ($phone === '') json_error('Customer phone number is required.');

    $customerSql = 'SELECT 1 FROM customers WHERE LOWER(email) = ? AND deleted_at IS NULL';
    $params = [$email];
    if ($excludeCustomerId !== null) {
        $customerSql .= ' AND id <> ?';
        $params[] = $excludeCustomerId;
    }
    $sql = "$customerSql
            UNION ALL SELECT 1 FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL
            UNION ALL SELECT 1 FROM customer_users WHERE LOWER(email) = ?
            LIMIT 1";
    $params[] = $email;
    $params[] = $email;
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    if ($stmt->fetch()) json_error('This email is already used by another portal account.', 409);

    return ['name' => $name, 'email' => $email, 'phone' => $phone];
}

function normalized_machine_details(array $body): array {
    $machineType = trim((string)($body['machineType'] ?? ''));
    $model = trim((string)($body['model'] ?? ''));
    $serialNumber = trim((string)($body['serialNumber'] ?? ''));
    $regNumber = trim((string)($body['regNumber'] ?? ''));
    $fleetNumber = trim((string)($body['fleetNumber'] ?? ''));
    $brand = trim((string)($body['brand'] ?? ''));
    if ($machineType === '') json_error('Machine type is required.');
    if ($model === '') json_error('Machine model is required.');
    if ($serialNumber === '' && $regNumber === '') {
        json_error('Enter a serial number or machine registration number.');
    }
    return [
        'machineType' => $machineType,
        'model' => $model,
        'serialNumber' => $serialNumber !== '' ? $serialNumber : null,
        'regNumber' => $regNumber !== '' ? $regNumber : null,
        'fleetNumber' => $fleetNumber !== '' ? $fleetNumber : null,
        'brand' => $brand !== '' ? $brand : null,
        'serviceKit' => trim((string)($body['serviceKit'] ?? 'OK')) ?: 'OK',
    ];
}

// ---- Machine type <-> Checklist Template sync audit -------------------
// Existing machines can have their machine_type stored with slightly
// different spelling/casing than the Checklist Template meant for that
// type (e.g. "REACH STAKER" vs the correct "Reach Stacker") - Check Up
// looks up a template by an exact (case-insensitive) match, so a small
// spelling drift silently breaks it for every machine of that type,
// with no obvious error pointing at the real cause. This endpoint finds
// every machine_type currently in use that does NOT exactly match any
// active Checklist Template, and suggests the closest real template
// name using simple string similarity, so Admin can fix the drift in
// bulk instead of one machine at a time.
if ($method === 'GET' && $action === 'machine-type-sync') {
    require_page_access($user, 'customers');
    $machineTypes = db()->query(
        "SELECT machine_type, COUNT(*) AS machine_count
         FROM machines WHERE deleted_at IS NULL AND machine_type IS NOT NULL AND machine_type <> ''
         GROUP BY machine_type ORDER BY machine_type ASC"
    )->fetchAll();
    $templateTypes = db()->query(
        "SELECT DISTINCT machine_type FROM checklist_templates WHERE is_active = 1 AND machine_type IS NOT NULL AND machine_type <> ''"
    )->fetchAll(PDO::FETCH_COLUMN);

    $mismatches = [];
    $matched = 0;
    foreach ($machineTypes as $row) {
        $type = $row['machine_type'];
        $exact = null;
        foreach ($templateTypes as $templateType) {
            if (strcasecmp($templateType, $type) === 0) { $exact = $templateType; break; }
        }
        if ($exact !== null) { $matched += (int)$row['machine_count']; continue; }

        $bestMatch = null;
        $bestScore = 0;
        foreach ($templateTypes as $templateType) {
            similar_text(strtoupper($type), strtoupper($templateType), $percent);
            if ($percent > $bestScore) { $bestScore = $percent; $bestMatch = $templateType; }
        }
        $mismatches[] = [
            'machineType' => $type,
            'machineCount' => (int)$row['machine_count'],
            'suggestedTemplate' => $bestScore >= 55 ? $bestMatch : null,
            'similarity' => round($bestScore, 1),
            'hasAnyTemplate' => count($templateTypes) > 0,
        ];
    }
    json_out([
        'templateTypes' => $templateTypes,
        'matchedMachineCount' => $matched,
        'mismatches' => $mismatches,
    ]);
}

// ---- Apply a machine-type sync fix (bulk rename) ------------------------
if ($method === 'POST' && $action === 'machine-type-sync') {
    require_page_access($user, 'customers');
    $b = body();
    $from = trim((string)($b['from'] ?? ''));
    $to = trim((string)($b['to'] ?? ''));
    if ($from === '' || $to === '') json_error('Both the current and correct machine type are required.');
    $stmt = db()->prepare('UPDATE machines SET machine_type = ?, updated_at = NOW() WHERE machine_type = ? AND deleted_at IS NULL');
    $stmt->execute([$to, $from]);
    $count = $stmt->rowCount();
    log_activity($user, 'machine-type-synced', 'machine', null, ['from' => $from, 'to' => $to, 'count' => $count]);
    json_out(['ok' => true, 'updated' => $count, 'message' => "Updated $count machine(s) from \"$from\" to \"$to\"."]);
}

// ---- Admin-only data visibility diagnostic ----------------------------
// Helps distinguish UI/filter problems from a deployment that is connected
// to an empty/new PostgreSQL database. No database name, URL or credentials
// are returned to the browser.
// V446: PORTAL-CWM ("Customer Workshop Management") — a dedicated overview
// of customers running independently: BELM Service Provider mode OFF
// (is_machinery_admin = 1, i.e. the customer's own Admins/Technicians/
// Operators handle day-to-day maintenance themselves) and/or the paid
// Workshop Module switched ON (Store Ledger + Tool Issue/Return for their
// own Workshop Manager/Store Keeper/Technician staff). Read-only summary;
// the actual ON/OFF switches remain on each customer's own card in this
// same Customers & Machines (TECHNICAL DEP) page.
if ($method === 'GET' && $action === 'cwm-overview') {
    require_belm_workshop_customer_access($user);
    $rows = db()->query(
        "SELECT id, name, email, phone, address, is_active, is_machinery_admin, workshop_module_active
         FROM customers WHERE deleted_at IS NULL ORDER BY name ASC"
    )->fetchAll();

    $staffCounts = db()->query(
        "SELECT customer_id, LOWER(role) AS role_lower, COUNT(*) AS total
         FROM customer_users WHERE is_active = 1
         GROUP BY customer_id, LOWER(role)"
    )->fetchAll();
    $staffByCustomer = [];
    foreach ($staffCounts as $row) {
        $staffByCustomer[$row['customer_id']][$row['role_lower']] = (int)$row['total'];
    }

    // Customer-managed Technicians are real staff users (users table), not
    // customer_users. Count them from the same source used by Customer Workshop.
    $technicianCounts = db()->query(
        "SELECT u.assigned_customer_id AS customer_id, COUNT(*) AS total
         FROM users u
         JOIN roles r ON r.id=u.role_id
         WHERE u.is_customer_managed=1 AND u.is_active=1 AND u.deleted_at IS NULL
           AND r.name='Technician' AND u.assigned_customer_id IS NOT NULL
         GROUP BY u.assigned_customer_id"
    )->fetchAll();
    $techniciansByCustomer = [];
    foreach ($technicianCounts as $row) {
        $techniciansByCustomer[$row['customer_id']] = (int)$row['total'];
    }

    $result = array_map(static function (array $c) use ($staffByCustomer, $techniciansByCustomer): array {
        $staff = $staffByCustomer[$c['id']] ?? [];
        return [
            'id' => $c['id'],
            'name' => $c['name'],
            'email' => $c['email'],
            'phone' => $c['phone'],
            'address' => $c['address'],
            'isActive' => !empty($c['is_active']),
            // "Independent" = self-service (BELM is NOT the Service Provider).
            'selfServiceEnabled' => !empty($c['is_machinery_admin']),
            'workshopModuleActive' => !empty($c['workshop_module_active']),
            'workshopManagerCount' => $staff['workshop_manager'] ?? 0,
            'storeKeeperCount' => $staff['store_keeper'] ?? 0,
            'technicianCount' => $techniciansByCustomer[$c['id']] ?? 0,
            'operatorCount' => $staff['operator'] ?? 0,
        ];
    }, $rows);

    json_out($result);
}

if ($method === 'GET' && $action === 'diagnostics') {
    require_page_access($user, 'customers');

    $counts = db()->query(
        "SELECT
            COUNT(*) FILTER (WHERE deleted_at IS NULL) AS visible_customers,
            COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted_customers,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_active = 1) AS active_customers,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_active <> 1) AS inactive_customers,
            MIN(created_at) FILTER (WHERE deleted_at IS NULL) AS first_customer_created_at,
            MAX(created_at) FILTER (WHERE deleted_at IS NULL) AS latest_customer_created_at
         FROM customers"
    )->fetch();

    $machineCount = (int)db()->query('SELECT COUNT(*) FROM machines WHERE deleted_at IS NULL')->fetchColumn();
    $portalUserCount = (int)db()->query('SELECT COUNT(*) FROM customer_users')->fetchColumn();

    json_out([
        'visibleCustomers' => (int)($counts['visible_customers'] ?? 0),
        'deletedCustomers' => (int)($counts['deleted_customers'] ?? 0),
        'activeCustomers' => (int)($counts['active_customers'] ?? 0),
        'inactiveCustomers' => (int)($counts['inactive_customers'] ?? 0),
        'machines' => $machineCount,
        'portalUsers' => $portalUserCount,
        'firstCustomerCreatedAt' => $counts['first_customer_created_at'] ?? null,
        'latestCustomerCreatedAt' => $counts['latest_customer_created_at'] ?? null,
    ]);
}

// ---- List / search ----------------------------------------------------
if ($method === 'GET' && !$action) {
    require_customer_read_access($user);
    $q = $_GET['q'] ?? '';
    $assigned = ($user['roleName'] ?? '') === 'Technician'
        ? ($user['assignedCustomerId'] ?? null)
        : null;
    if (($user['roleName'] ?? '') === 'Technician') {
        $stmt = db()->prepare(
            'SELECT id, name, email, phone, address, tin_number, vrn, is_active, is_machinery_admin, privacy_preferences
             FROM customers
             WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
        );
        $stmt->execute([$assigned]);
    } elseif ($q) {
        $stmt = db()->prepare('SELECT * FROM customers WHERE deleted_at IS NULL AND (name LIKE ? OR email LIKE ? OR phone LIKE ?) ORDER BY created_at DESC');
        $like = "%$q%";
        $stmt->execute([$like, $like, $like]);
    } else {
        $stmt = db()->query('SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY created_at DESC');
    }
    $customers = $stmt->fetchAll();

    // V284 performance: load related data in batches instead of doing one
    // machines query per customer + one checklist query per machine + one
    // users query per customer.  The Customers Overview now needs a fixed
    // handful of queries regardless of how many customer cards are shown.
    $customerIds = array_values(array_filter(array_map(
        static fn(array $customer): string => (string)($customer['id'] ?? ''),
        $customers
    )));
    $machinesByCustomer = fetch_machines_for_customers($customerIds);
    $portalUserCountsByCustomer = [];
    if ($customerIds && ($user['roleName'] ?? '') !== 'Technician') {
        $inPortalUsers = belm_in_clause($customerIds);
        $inManagedTechs = belm_in_clause($customerIds);
        $portalUserCountStmt = db()->prepare(
            "SELECT customer_id, SUM(total_count) AS total_count
             FROM (
               SELECT customer_id, COUNT(*) AS total_count
               FROM customer_users
               WHERE customer_id IN ($inPortalUsers) AND is_active = 1
               GROUP BY customer_id
               UNION ALL
               SELECT u.assigned_customer_id AS customer_id, COUNT(*) AS total_count
               FROM users u JOIN roles r ON r.id = u.role_id
               WHERE u.assigned_customer_id IN ($inManagedTechs)
                 AND u.is_customer_managed = 1 AND u.is_active = 1
                 AND u.deleted_at IS NULL AND r.name = 'Technician'
               GROUP BY u.assigned_customer_id
             ) counted
             GROUP BY customer_id"
        );
        $portalUserCountStmt->execute(array_merge($customerIds, $customerIds));
        foreach ($portalUserCountStmt->fetchAll() as $countRow) {
            $portalUserCountsByCustomer[(string)$countRow['customer_id']] = (int)$countRow['total_count'];
        }
    }
    $isCustomerManagedTechnician = (($user['roleName'] ?? '') === 'Technician' && !empty($user['isCustomerManaged']));
    $teamVisibleCustomerIds = [];
    if (($user['roleName'] ?? '') !== 'Technician') {
        foreach ($customers as $row) {
            $prefs = belm_customer_privacy_normalize($row['privacy_preferences'] ?? null);
            if (!empty($prefs['teamDirectory'])) $teamVisibleCustomerIds[] = (string)$row['id'];
        }
    }
    $usersByCustomer = $teamVisibleCustomerIds ? fetch_customer_users_for_customers($teamVisibleCustomerIds) : [];
    $developmentExpenseAccess = belm_development_customer_expense_access_enabled();

    foreach ($customers as &$c) {
        $customerId = (string)$c['id'];
        $prefs = belm_customer_privacy_normalize($c['privacy_preferences'] ?? null);
        $providerActive = empty($c['is_machinery_admin']);
        $maintenanceVisible = $isCustomerManagedTechnician || $providerActive || !empty($prefs['maintenanceRecords']);
        $partsVisible = $isCustomerManagedTechnician || $providerActive || !empty($prefs['storeAndParts']);
        $expenseVisible = $developmentExpenseAccess || $isCustomerManagedTechnician || !empty($prefs['expenseReceipts']);
        $teamVisible = $isCustomerManagedTechnician || !empty($prefs['teamDirectory']);
        $c['machines'] = $machinesByCustomer[$customerId] ?? [];
        foreach ($c['machines'] as &$privacyMachine) {
            $machineSupportAccess = !empty($privacyMachine['supportAccessActive']);
            $privacyMachine['privacyMaintenanceAccess'] = $maintenanceVisible || $machineSupportAccess;
            $privacyMachine['privacyPartsAccess'] = $partsVisible || $machineSupportAccess;
            $privacyMachine['privacyExpenseAccess'] = $expenseVisible;
            if (!$privacyMachine['privacyMaintenanceAccess']) {
                $privacyMachine['alertReasons'] = [];
                unset(
                    $privacyMachine['last_checked_at'],
                    $privacyMachine['last_service_hours'],
                    $privacyMachine['service_history'],
                    $privacyMachine['service_interval_hours'],
                    $privacyMachine['service_schedule_baseline_hours'],
                    $privacyMachine['service_kit']
                );
            }
        }
        unset($privacyMachine);
        $c['isMachineryAdmin'] = !empty($c['is_machinery_admin']);
        $c['belmServiceProviderActive'] = $providerActive;
        $c['isWorkshopModuleActive'] = !empty($c['workshop_module_active']);
        $c['privacyPreferences'] = $prefs;
        $c['privacyAccess'] = [
            'maintenanceRecords' => $maintenanceVisible,
            'expenseReceipts' => $expenseVisible,
            'teamDirectory' => $teamVisible,
            'storeAndParts' => $partsVisible,
        ];
        if (($user['roleName'] ?? '') !== 'Technician') {
            $c['users'] = $teamVisible ? ($usersByCustomer[$customerId] ?? []) : [];
            $c['portalUserCount'] = $portalUserCountsByCustomer[$customerId] ?? 0;
            $c['userLimit'] = isset($c['user_limit']) ? (int)$c['user_limit'] : null;
        }
        unset($c['privacy_preferences'], $c['password'], $c['recovery_code_hash']);
    }
    unset($c);
    json_out($customers);
}

// ---- Get one ------------------------------------------------------------
if ($method === 'GET' && $action === 'one') {
    require_customer_read_access($user, $id);
    $sql = ($user['roleName'] ?? '') === 'Technician'
        ? 'SELECT id, name, email, phone, address, tin_number, vrn, is_active, is_machinery_admin, privacy_preferences
           FROM customers
           WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
        : 'SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL';
    $stmt = db()->prepare($sql);
    $stmt->execute([$id]);
    $customer = $stmt->fetch();
    if (!$customer) json_error('Not found', 404);
    $customer['machines'] = fetch_machines($customer['id']);
    $prefs = belm_customer_privacy_normalize($customer['privacy_preferences'] ?? null);
    $providerActive = empty($customer['is_machinery_admin']);
    $isCustomerManagedTechnician = (($user['roleName'] ?? '') === 'Technician' && !empty($user['isCustomerManaged']));
    $maintenanceVisible = $isCustomerManagedTechnician || $providerActive || !empty($prefs['maintenanceRecords']);
    $developmentExpenseAccess = belm_development_customer_expense_access_enabled();
    foreach ($customer['machines'] as &$privacyMachine) {
        $machineSupportAccess = !empty($privacyMachine['supportAccessActive']);
        $privacyMachine['privacyMaintenanceAccess'] = $maintenanceVisible || $machineSupportAccess;
        $privacyMachine['privacyPartsAccess'] = $isCustomerManagedTechnician || $providerActive || !empty($prefs['storeAndParts']) || $machineSupportAccess;
        $privacyMachine['privacyExpenseAccess'] = $developmentExpenseAccess || $isCustomerManagedTechnician || !empty($prefs['expenseReceipts']);
        if (!$privacyMachine['privacyMaintenanceAccess']) {
            $privacyMachine['alertReasons'] = [];
            unset(
                $privacyMachine['last_checked_at'],
                $privacyMachine['last_service_hours'],
                $privacyMachine['service_history'],
                $privacyMachine['service_interval_hours'],
                $privacyMachine['service_schedule_baseline_hours'],
                $privacyMachine['service_kit']
            );
        }
    }
    unset($privacyMachine);
    $customer['isMachineryAdmin'] = !empty($customer['is_machinery_admin']);
    $customer['belmServiceProviderActive'] = $providerActive;
    $customer['isWorkshopModuleActive'] = !empty($customer['workshop_module_active']);
    $customer['privacyPreferences'] = $prefs;
    $customer['privacyAccess'] = [
        'maintenanceRecords' => $maintenanceVisible,
        'expenseReceipts' => $developmentExpenseAccess || $isCustomerManagedTechnician || !empty($prefs['expenseReceipts']),
        'teamDirectory' => $isCustomerManagedTechnician || !empty($prefs['teamDirectory']),
        'storeAndParts' => $isCustomerManagedTechnician || $providerActive || !empty($prefs['storeAndParts']),
    ];
    if (($user['roleName'] ?? '') !== 'Technician') {
        $customer['users'] = !empty($prefs['teamDirectory']) ? fetch_customer_users($customer['id']) : [];
    }
    unset($customer['privacy_preferences'], $customer['password'], $customer['recovery_code_hash']);
    json_out($customer);
}

// ---- Customers Overview communication feed (batched) ----------------------
// V284: the card grid only needs the newest three UNREAD items per customer.
// Previously the browser made one /communications request per card, each of
// which could also perform extra status lookups.  This endpoint returns all
// visible-card feeds in one request and resolves action status with joins.
if ($method === 'GET' && $action === 'communication-feed') {
    require_page_access($user, 'customers');

    $requestedIds = array_values(array_filter(array_unique(array_map(
        'trim',
        explode(',', (string)($_GET['ids'] ?? ''))
    ))));
    // Keep the endpoint bounded even if a malformed client sends thousands.
    if (count($requestedIds) > 250) $requestedIds = array_slice($requestedIds, 0, 250);
    if (!$requestedIds) json_out([]);

    $in = belm_in_clause($requestedIds);
    $sql = "
        SELECT *
        FROM (
            SELECT
                cc.id,
                cc.customer_id,
                cc.direction,
                cc.channel,
                cc.subject,
                cc.message,
                cc.status AS delivery_status,
                cc.created_by_name,
                cc.created_at,
                cc.machine_id,
                cc.related_type,
                cc.related_id,
                m.model AS machine_model,
                m.machine_type,
                sr.status AS service_request_status,
                opr.status AS operator_report_status,
                ROW_NUMBER() OVER (
                    PARTITION BY cc.customer_id
                    ORDER BY cc.created_at DESC, cc.id DESC
                ) AS feed_rank
            FROM customer_communications cc
            JOIN customers c
              ON c.id = cc.customer_id AND c.deleted_at IS NULL
            LEFT JOIN machines m ON m.id = cc.machine_id
            LEFT JOIN customer_communication_reads ccr
              ON ccr.communication_id = cc.id AND ccr.user_id = ?
            LEFT JOIN service_requests sr
              ON cc.related_type = 'SERVICE_REQUEST' AND sr.id = cc.related_id
            LEFT JOIN operator_reports opr
              ON cc.related_type = 'OPERATOR_REPORT' AND opr.id = cc.related_id
            WHERE cc.customer_id IN ($in)
              AND ccr.communication_id IS NULL
        ) feed
        WHERE feed_rank <= 3
        ORDER BY customer_id, created_at DESC, id DESC";

    $stmt = db()->prepare($sql);
    $stmt->execute(array_merge([(string)$user['id']], $requestedIds));
    $rows = $stmt->fetchAll();

    $grouped = [];
    foreach ($requestedIds as $customerId) $grouped[$customerId] = [];
    foreach ($rows as $row) {
        $customerId = (string)$row['customer_id'];
        $relatedType = (string)($row['related_type'] ?? '');
        $relatedId = (string)($row['related_id'] ?? '');
        $actionType = null;
        $actionStatus = null;
        $actionable = false;

        if ($relatedType === 'SERVICE_REQUEST' && $relatedId !== '') {
            $actionType = 'service-request';
            $actionStatus = $row['service_request_status'] ?? null;
            $actionable = $actionStatus !== null
                && !in_array($actionStatus, ['COMPLETED', 'CANCELLED'], true);
        } elseif ($relatedType === 'OPERATOR_REPORT' && $relatedId !== '') {
            $actionType = 'operator-report';
            $actionStatus = $row['operator_report_status'] ?? null;
            $actionable = $actionStatus === 'OPEN';
        }

        $grouped[$customerId][] = [
            'id' => $row['id'],
            'direction' => $row['direction'],
            'channel' => $row['channel'],
            'subject' => $row['subject'],
            'message' => $row['message'],
            'deliveryStatus' => $row['delivery_status'],
            'createdByName' => $row['created_by_name'],
            'createdAt' => $row['created_at'],
            'machineId' => $row['machine_id'],
            'machineLabel' => trim((string)($row['machine_model'] ?? '') . ' ' . (string)($row['machine_type'] ?? '')),
            'relatedType' => $relatedType,
            'relatedId' => $relatedId ?: null,
            'actionType' => $actionType,
            'actionStatus' => $actionStatus,
            'actionable' => $actionable,
            'isRead' => false,
            'readAt' => null,
        ];
    }

    json_out($grouped);
}

// ---- BELM <-> Customer communication history -----------------------------
if ($method === 'GET' && $action === 'communications') {
    if (($user['roleName'] ?? '') === 'Technician') {
        require_customer_read_access($user, $id);
    } else {
        require_page_access($user, 'customers');
    }
    $stmt = db()->prepare('SELECT id, name FROM customers WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$id]);
    $target = $stmt->fetch();
    if (!$target) json_error('Customer not found.', 404);

    $commStmt = db()->prepare(
        'SELECT cc.*, m.model AS machine_model, m.machine_type,
                CASE WHEN ccr.communication_id IS NULL THEN 0 ELSE 1 END AS is_read,
                ccr.read_at
         FROM customer_communications cc
         LEFT JOIN machines m ON m.id = cc.machine_id
         LEFT JOIN customer_communication_reads ccr
           ON ccr.communication_id = cc.id AND ccr.user_id = ?
         WHERE cc.customer_id = ?
         ORDER BY cc.created_at DESC
         LIMIT 100'
    );
    $commStmt->execute([$user['id'], $id]);
    $rows = $commStmt->fetchAll();

    $serviceIds = [];
    $operatorIds = [];
    foreach ($rows as $row) {
        if (($row['related_type'] ?? '') === 'SERVICE_REQUEST' && !empty($row['related_id'])) $serviceIds[] = $row['related_id'];
        if (($row['related_type'] ?? '') === 'OPERATOR_REPORT' && !empty($row['related_id'])) $operatorIds[] = $row['related_id'];
    }
    $serviceStatus = [];
    if ($serviceIds) {
        $serviceIds = array_values(array_unique($serviceIds));
        $in = belm_in_clause($serviceIds);
        $q = db()->prepare("SELECT id, status FROM service_requests WHERE id IN ($in)");
        $q->execute($serviceIds);
        foreach ($q->fetchAll() as $row) $serviceStatus[$row['id']] = $row['status'];
    }
    $operatorStatus = [];
    if ($operatorIds) {
        $operatorIds = array_values(array_unique($operatorIds));
        $in = belm_in_clause($operatorIds);
        $q = db()->prepare("SELECT id, status FROM operator_reports WHERE id IN ($in)");
        $q->execute($operatorIds);
        foreach ($q->fetchAll() as $row) $operatorStatus[$row['id']] = $row['status'];
    }

    $out = array_map(static function ($row) use ($serviceStatus, $operatorStatus) {
        $relatedType = (string)($row['related_type'] ?? '');
        $relatedId = (string)($row['related_id'] ?? '');
        $actionType = null;
        $actionStatus = null;
        $actionable = false;
        if ($relatedType === 'SERVICE_REQUEST' && $relatedId !== '') {
            $actionType = 'service-request';
            $actionStatus = $serviceStatus[$relatedId] ?? null;
            $actionable = $actionStatus !== null && !in_array($actionStatus, ['COMPLETED', 'CANCELLED'], true);
        } elseif ($relatedType === 'OPERATOR_REPORT' && $relatedId !== '') {
            $actionType = 'operator-report';
            $actionStatus = $operatorStatus[$relatedId] ?? null;
            $actionable = $actionStatus === 'OPEN';
        }
        return [
            'id' => $row['id'],
            'direction' => $row['direction'],
            'channel' => $row['channel'],
            'subject' => $row['subject'],
            'message' => $row['message'],
            'deliveryStatus' => $row['status'],
            'createdByName' => $row['created_by_name'],
            'createdAt' => $row['created_at'],
            'machineId' => $row['machine_id'],
            'machineLabel' => trim((string)($row['machine_model'] ?? '') . ' ' . (string)($row['machine_type'] ?? '')),
            'relatedType' => $relatedType,
            'relatedId' => $relatedId ?: null,
            'actionType' => $actionType,
            'actionStatus' => $actionStatus,
            'actionable' => $actionable,
            'isRead' => !empty($row['is_read']),
            'readAt' => $row['read_at'] ?? null,
        ];
    }, $rows);
    json_out($out);
}

// ---- Mark one communication as viewed by the logged-in BELM user ----------
if (($method === 'PUT' || $method === 'POST') && $action === 'communication-read') {
    require_page_access($user, 'customers');
    $communicationId = trim((string)($_GET['communicationId'] ?? ''));
    if (!$id || $communicationId === '') json_error('Communication not found.', 404);

    $check = db()->prepare(
        'SELECT id FROM customer_communications WHERE id = ? AND customer_id = ?'
    );
    $check->execute([$communicationId, $id]);
    if (!$check->fetch()) json_error('Communication not found for this customer.', 404);

    db()->prepare(
        'INSERT INTO customer_communication_reads (communication_id, user_id, read_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (communication_id, user_id)
         DO UPDATE SET read_at = EXCLUDED.read_at'
    )->execute([$communicationId, $user['id']]);

    json_out(['ok' => true, 'communicationId' => $communicationId]);
}

// ---- Direct BELM message to one customer ----------------------------------
if ($method === 'POST' && $action === 'send-message') {
    require_page_access($user, 'customers');
    $stmt = db()->prepare('SELECT id, name, email, is_active FROM customers WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$id]);
    $target = $stmt->fetch();
    if (!$target) json_error('Customer not found.', 404);
    if (!(int)$target['is_active']) json_error('This customer portal is inactive. Restore portal access before sending a portal message.', 409);

    $b = body();
    $subject = trim((string)($b['subject'] ?? 'Message from BELM'));
    $message = trim((string)($b['message'] ?? ''));
    $machineId = trim((string)($b['machineId'] ?? ''));
    if ($subject === '') $subject = 'Message from BELM';
    if (mb_strlen($subject) > 160) json_error('Subject must be 160 characters or fewer.');
    if ($message === '') json_error('Write a message for the customer.');
    if (mb_strlen($message) > 2000) json_error('Message must be 2000 characters or fewer.');

    $machineLabel = '';
    if ($machineId !== '') {
        $machineStmt = db()->prepare('SELECT model, machine_type, brand FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL');
        $machineStmt->execute([$machineId, $id]);
        $machine = $machineStmt->fetch();
        if (!$machine) json_error('Selected machine does not belong to this customer.', 400);
        $machineLabel = trim((string)($machine['brand'] ?? '') . ' ' . (string)($machine['model'] ?? '')) ?: (string)($machine['machine_type'] ?? 'Machine');
    }

    $sender = trim((string)($user['name'] ?? 'BELM')) ?: 'BELM';
    $sendEmail = filter_var($b['sendEmail'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $emailBody = $message;
    if ($machineLabel !== '') $emailBody .= "\n\nMachine: $machineLabel";
    $emailBody .= "\n\nAction requested by: $sender\nOpen the BELM Customer Portal to review this message in Communication History.";

    if ($sendEmail) {
        // Empty role filter = customer owner + every active customer portal user.
        $result = belm_send_customer_alert(
            (string)$id,
            $machineId !== '' ? $machineId : null,
            [],
            $subject,
            $emailBody,
            'DIRECT_MESSAGE',
            null,
            $sender,
            $message
        );
        $delivered = (int)($result['sent'] ?? 0) > 0;
        json_out([
            'ok' => true,
            'emailRequested' => true,
            'emailDelivered' => $delivered,
            'emailRecipients' => $result['recipients'] ?? [],
            'message' => $delivered
                ? 'Message saved and emailed to the active customer group for action.'
                : 'Message saved in the customer portal. Group email was requested but delivery needs attention.',
        ]);
    }

    belm_log_customer_communication(
        (string)$id,
        $machineId !== '' ? $machineId : null,
        'BELM_TO_CUSTOMER',
        'PORTAL',
        $subject,
        $message,
        'DIRECT_MESSAGE',
        null,
        $sender,
        'PORTAL_ONLY'
    );
    json_out([
        'ok' => true,
        'emailRequested' => false,
        'emailDelivered' => false,
        'emailRecipients' => [],
        'message' => 'Message saved in the customer portal. No email was sent.',
    ]);
}

// ---- Create customer ------------------------------------------------------
if ($method === 'POST' && !$action) {
    require_page_access($user, 'customers');
    $b = body();
    $details = validate_customer_details($b);
    $tempPassword = secure_account_secret();
    $recoveryCode = account_recovery_code();
    $newId = uuid();
    $portalLink = customer_portal_slug($details['name']);
    db()->prepare('INSERT INTO customers (id, name, tin_number, vrn, email, phone, address, portal_link, password, recovery_code_hash, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,NOW())')
        ->execute([
            $newId,
            $details['name'],
            trim((string)($b['tinNumber'] ?? '')) ?: null,
            trim((string)($b['vrn'] ?? '')) ?: null,
            $details['email'],
            $details['phone'],
            trim((string)($b['address'] ?? '')) ?: null,
            $portalLink,
            password_hash($tempPassword, PASSWORD_BCRYPT),
            password_hash($recoveryCode, PASSWORD_BCRYPT),
        ]);

    log_activity($user, 'customer-created', 'customer', $newId, ['name' => $details['name']]);
    json_out([
        'id' => $newId,
        'portalLoginInfo' => [
            'portalLink' => customer_portal_url($portalLink, $details['email']),
            'portalId' => $portalLink,
            'portalUrl' => customer_portal_url($portalLink, $details['email']),
            'temporaryPassword' => $tempPassword,
            'recoveryCode' => $recoveryCode,
        ],
    ], 201);
}

if ($method === 'PUT' && $action === 'reset-password') {
    require_page_access($user, 'customers');
    // Resetting a customer's portal login is reversible (it can simply
    // be reset again) and doesn't touch or delete any business data, so
    // it only needs the lighter Edit PIN confirmation — not the delete
    // PIN + the admin's own account password + a written reason.
    require_edit_confirmation($user, body());
    $temporaryPassword = secure_account_secret();
    $recoveryCode = account_recovery_code();
    $stmt = db()->prepare(
        'UPDATE customers
         SET password = ?, recovery_code_hash = ?
         WHERE id = ? AND deleted_at IS NULL
         RETURNING email, portal_link'
    );
    $stmt->execute([
        password_hash($temporaryPassword, PASSWORD_BCRYPT),
        password_hash($recoveryCode, PASSWORD_BCRYPT),
        $id,
    ]);
    $resetCustomer = $stmt->fetch();
    if (!$resetCustomer) json_error('Customer not found.', 404);
    clear_unified_login_lockout((string)$resetCustomer['email'], (string)$resetCustomer['portal_link']);
    log_activity($user, 'customer-login-reset', 'customer', $id);
    json_out([
        'temporaryPassword' => $temporaryPassword,
        'recoveryCode' => $recoveryCode,
        'loginUrl' => customer_portal_url($resetCustomer['portal_link'], $resetCustomer['email']),
    ]);
}

if ($method === 'PUT' && $action === 'user-limit') {
    require_page_access($user, 'customers');
    $b = body();
    require_edit_confirmation($user, $b);
    $limit = $b['userLimit'] ?? null;
    if ($limit !== null) {
        $limit = (int)$limit;
        if ($limit < 0) json_error('User limit cannot be negative.');
        $usedStmt = db()->prepare(
            "SELECT
               (SELECT COUNT(*) FROM customer_users WHERE customer_id = ? AND is_active = 1)
               +
               (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id
                WHERE u.assigned_customer_id = ? AND u.is_customer_managed = 1
                  AND u.is_active = 1 AND u.deleted_at IS NULL AND r.name = 'Technician') AS total"
        );
        $usedStmt->execute([$id, $id]);
        $used = (int)$usedStmt->fetchColumn();
        if ($limit < $used) json_error("User limit cannot be lower than the $used active portal user(s) already in use.", 422);
    }
    $stmt = db()->prepare('UPDATE customers SET user_limit = ? WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$limit, $id]);
    if ($stmt->rowCount() === 0) json_error('Customer not found.', 404);
    log_activity($user, 'customer-user-limit-changed', 'customer', $id, ['userLimit' => $limit]);
    json_out(['ok' => true, 'userLimit' => $limit]);
}

// BELM Service Provider mode. The database keeps the historical
// is_machinery_admin flag where 1 = customer-managed maintenance and 0 = BELM
// service-provider maintenance. Provider mode ONLY takes over maintenance /
// machine-problem workflows. The customer's Accounts, Fuel Consumption,
// Operators, Workshop, Store, Procurement and other portal roles stay active.
// Customer-managed Technician access is paused automatically while provider
// mode is active; no Technician account is deleted.
if ($method === 'PUT' && $action === 'machinery-admin') {
    require_page_access($user, 'customers');
    $b = body();
    require_edit_confirmation($user, $b);

    if (array_key_exists('serviceProviderEnabled', $b)) {
        $providerEnabled = !empty($b['serviceProviderEnabled']);
        $selfServiceEnabled = $providerEnabled ? 0 : 1;
    } else {
        // Backward compatibility for older clients using enabled=self-service.
        $selfServiceEnabled = !empty($b['enabled']) ? 1 : 0;
        $providerEnabled = !$selfServiceEnabled;
    }

    $stmt = db()->prepare('UPDATE customers SET is_machinery_admin = ? WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$selfServiceEnabled, $id]);
    if ($stmt->rowCount() === 0) json_error('Customer not found.', 404);
    log_activity($user, 'belm-service-provider-mode-changed', 'customer', $id, [
        'serviceProviderEnabled' => (bool)$providerEnabled,
        'customerTechnicianAccessPaused' => (bool)$providerEnabled,
        'customerBusinessRolesRemainActive' => true,
    ]);
    json_out([
        'ok' => true,
        'isMachineryAdmin' => (bool)$selfServiceEnabled,
        'belmServiceProviderActive' => (bool)$providerEnabled,
        'customerTechnicianAccessPaused' => (bool)$providerEnabled,
    ]);
}

// V444: Workshop Module paid add-on toggle. Separate from is_active
// ("Stop portal service" — kills the whole account) and separate from the
// customer's own 'store' Role Manager permission (which only decides which
// of the customer's own staff can use Store/Workshop once this is ON).
// Turning this OFF immediately blocks Store Ledger + Tool Issue/Return
// Documents for the customer's whole team, regardless of their internal
// Role Manager settings, without touching any other part of their account.
if ($method === 'PUT' && $action === 'workshop-module') {
    require_page_access($user, 'customers');
    $b = body();
    require_edit_confirmation($user, $b);
    $enabled = !empty($b['enabled']) ? 1 : 0;
    $stmt = db()->prepare('UPDATE customers SET workshop_module_active = ? WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$enabled, $id]);
    if ($stmt->rowCount() === 0) json_error('Customer not found.', 404);
    log_activity($user, 'customer-workshop-module-changed', 'customer', $id, ['enabled' => (bool)$enabled]);
    json_out(['ok' => true, 'workshopModuleActive' => (bool)$enabled]);
}

// V472 - BELM Workshop Petty Cash bridge. The Workshop Manager uses an
// admin token, while the Customer Petty Cash page uses a customer token. This
// endpoint reads/writes the SAME petty_cash_topups + usage_logs records, so the
// two portals stay synchronized without sharing/impersonating login tokens.
if ($action === 'workshop-petty-cash' || $action === 'workshop-petty-cash-topup' || $action === 'workshop-petty-cash-receipt') {
    require_belm_workshop_customer_access($user);
    $pettyCashReady = db()->query("SELECT to_regclass('public.petty_cash_topups') IS NOT NULL")->fetchColumn();
    if (!$pettyCashReady) json_error('Petty Cash database update is still being applied. Refresh in a few seconds.', 503);
    $customerId = trim((string)$id);
    if ($customerId === '') json_error('Customer was not specified.');

    $customerStmt = db()->prepare('SELECT id,name,email,is_active,is_machinery_admin,workshop_module_active FROM customers WHERE id=? AND deleted_at IS NULL LIMIT 1');
    $customerStmt->execute([$customerId]);
    $customerRow = $customerStmt->fetch();
    if (!$customerRow) json_error('Customer not found.', 404);
    require_belm_customer_privacy($customerId, 'expenseReceipts', 'Customer Petty Cash records');

    if ($method === 'GET' && $action === 'workshop-petty-cash-receipt') {
        $expenseId = trim((string)($_GET['expenseId'] ?? ''));
        if ($expenseId === '') json_error('Petty Cash receipt was not specified.');
        $receiptStmt = db()->prepare("SELECT receipt_photo_data,receipt_photo_mime,receipt_photo_name FROM usage_logs WHERE id=? AND customer_id=? AND category='PETTY_CASH' LIMIT 1");
        $receiptStmt->execute([$expenseId,$customerId]);
        $receipt = $receiptStmt->fetch();
        if (!$receipt || empty($receipt['receipt_photo_data'])) json_error('Receipt photo was not found.',404);
        $binary = base64_decode((string)$receipt['receipt_photo_data'], true);
        if ($binary === false) json_error('Receipt photo is damaged.',500);
        $mime = in_array($receipt['receipt_photo_mime'], ['image/jpeg','image/png','image/webp','application/pdf'], true) ? $receipt['receipt_photo_mime'] : 'image/jpeg';
        header('Content-Type: '.$mime);
        header('Content-Length: '.strlen($binary));
        header('Content-Disposition: inline; filename="'.preg_replace('/[^A-Za-z0-9._-]+/','-',(string)($receipt['receipt_photo_name'] ?: 'petty-cash-receipt')).'"');
        echo $binary; exit;
    }

    if ($method === 'POST' && $action === 'workshop-petty-cash-topup') {
        $b = body();
        require_edit_confirmation($user, $b);
        $amount = (float)($b['amount'] ?? 0);
        $note = trim((string)($b['note'] ?? ''));
        if ($amount <= 0) json_error('Top-up amount must be greater than zero.');
        if (strlen($note) > 255) json_error('Top-up note is too long.');
        $topupId = uuid();
        db()->prepare('INSERT INTO petty_cash_topups (id,machine_id,customer_id,amount,note,added_by,added_by_name,created_at) VALUES (?,NULL,?,?,?,?,?,NOW())')
            ->execute([$topupId,$customerId,round($amount,2),$note !== '' ? $note : null,$user['id'] ?? null,$user['name'] ?? 'BELM Workshop Manager']);
        log_activity($user,'workshop-petty-cash-topup','customer',$customerId,['amount'=>round($amount,2),'note'=>$note]);
        json_out(['ok'=>true,'id'=>$topupId,'message'=>'Petty Cash funds added. Customer Portal reads the same balance.'],201);
    }

    if ($method === 'GET' && $action === 'workshop-petty-cash') {
        $topupStmt = db()->prepare("SELECT pct.id,pct.amount,pct.note,pct.created_at,COALESCE(NULLIF(TRIM(pct.added_by_name),''),u.name,'Administration') AS added_by_name FROM petty_cash_topups pct LEFT JOIN users u ON u.id=pct.added_by WHERE pct.customer_id=? ORDER BY pct.created_at DESC LIMIT 250");
        $topupStmt->execute([$customerId]);
        $topups = $topupStmt->fetchAll();
        $topupTotalStmt = db()->prepare('SELECT COALESCE(SUM(amount),0) FROM petty_cash_topups WHERE customer_id=?');
        $topupTotalStmt->execute([$customerId]);
        $totalToppedUp = (float)$topupTotalStmt->fetchColumn();
        $usedStmt = db()->prepare("SELECT COALESCE(SUM(cost),0),COUNT(*) FROM usage_logs WHERE customer_id=? AND category='PETTY_CASH'");
        $usedStmt->execute([$customerId]);
        $usedRow = $usedStmt->fetch(PDO::FETCH_NUM) ?: [0,0];
        $totalUsed = (float)$usedRow[0];
        $recordCount = (int)$usedRow[1];

        $entryStmt = db()->prepare(
            "SELECT ul.id,ul.machine_id,ul.date,ul.description,ul.cost,ul.logged_by,ul.created_at,ul.part_number,ul.quantity,ul.unit,ul.petty_cash_items_json,\n                    CASE WHEN COALESCE(ul.receipt_photo_data,'')<>'' THEN 1 ELSE 0 END AS has_receipt,\n                    m.brand,m.model,m.machine_type,m.fleet_number\n             FROM usage_logs ul\n             JOIN machines m ON m.id=ul.machine_id\n             WHERE ul.customer_id=? AND ul.category='PETTY_CASH'\n             ORDER BY ul.date DESC,ul.created_at DESC LIMIT 250"
        );
        $entryStmt->execute([$customerId]);
        $entries = array_map(static function(array $e): array {
            $items=[];
            if (!empty($e['petty_cash_items_json'])) {
                $decoded=json_decode((string)$e['petty_cash_items_json'],true);
                if (is_array($decoded)) $items=$decoded;
            }
            if (!$items && (!empty($e['part_number']) || !empty($e['quantity']) || !empty($e['unit']))) {
                $items[]=['partNumber'=>$e['part_number'],'quantity'=>$e['quantity'] !== null ? (float)$e['quantity'] : null,'unit'=>$e['unit']];
            }
            return [
                'id'=>$e['id'],'machineId'=>$e['machine_id'],
                'machineName'=>trim((string)($e['brand'] ?? '').' '.(string)($e['model'] ?? '')) ?: ($e['machine_type'] ?? 'Machine'),
                'fleetNumber'=>$e['fleet_number'] ?? null,'date'=>$e['date'],'description'=>$e['description'],
                'cost'=>(float)$e['cost'],'loggedBy'=>$e['logged_by'],'createdAt'=>$e['created_at'],
                'hasReceipt'=>!empty($e['has_receipt']),'spareItems'=>$items,
            ];
        },$entryStmt->fetchAll());

        json_out([
            'customer'=>[
                'id'=>$customerRow['id'],'name'=>$customerRow['name'],'email'=>$customerRow['email'],
                'isActive'=>!empty($customerRow['is_active']),
                'belmServiceProviderActive'=>empty($customerRow['is_machinery_admin']),
                'workshopModuleActive'=>!empty($customerRow['workshop_module_active']),
            ],
            'account'=>[
                'totalToppedUp'=>round($totalToppedUp,2),'totalUsed'=>round($totalUsed,2),
                'balance'=>round($totalToppedUp-$totalUsed,2),'recordCount'=>$recordCount,
                'topups'=>array_map(static fn(array $t): array => ['id'=>$t['id'],'amount'=>(float)$t['amount'],'note'=>$t['note'],'addedBy'=>$t['added_by_name'],'createdAt'=>$t['created_at']],$topups),
            ],
            'entries'=>$entries,
        ]);
    }
}

// Quick "Stop portal service" toggle — for a customer who hasn't paid,
// this blocks their login (and their assistants'/operators'/technicians'
// too, since it's the same is_active flag the login query already
// checks) without needing to open the full Edit Customer form.
if ($method === 'PUT' && $action === 'portal-access') {
    require_page_access($user, 'customers');
    $b = body();
    require_edit_confirmation($user, $b);
    $enabled = !empty($b['enabled']) ? 1 : 0;
    $stmt = db()->prepare('UPDATE customers SET is_active = ? WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$enabled, $id]);
    if ($stmt->rowCount() === 0) json_error('Customer not found.', 404);
    log_activity($user, 'customer-portal-access-changed', 'customer', $id, ['enabled' => (bool)$enabled]);
    json_out(['ok' => true, 'isActive' => (bool)$enabled]);
}

// ---- Update customer --------------------------------------------------------
if ($method === 'PUT' && !$action) {
    require_page_access($user, 'customers');
    $b = body();
    require_edit_confirmation($user, $b);
    $stmt = db()->prepare('SELECT is_active FROM customers WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$id]);
    $existingCustomer = $stmt->fetch();
    if (!$existingCustomer) json_error('Customer not found.', 404);
    $details = validate_customer_details($b, $id);
    $portalLink = customer_portal_slug($details['name'], $id);
    $isActive = array_key_exists('isActive', $b)
        ? ((bool)$b['isActive'] ? 1 : 0)
        : (int)$existingCustomer['is_active'];
    db()->prepare('UPDATE customers SET name=?, tin_number=?, vrn=?, email=?, phone=?, address=?, portal_link=?, is_active=? WHERE id=?')
        ->execute([
            $details['name'],
            trim((string)($b['tinNumber'] ?? '')) ?: null,
            trim((string)($b['vrn'] ?? '')) ?: null,
            $details['email'],
            $details['phone'],
            trim((string)($b['address'] ?? '')) ?: null,
            $portalLink,
            $isActive,
            $id,
        ]);
    log_activity($user, 'customer-edited', 'customer', $id, ['name' => $details['name']]);
    json_out([
        'ok' => true,
        'portalLink' => $portalLink,
        'portalUrl' => customer_portal_url($portalLink),
    ]);
}

// ---- Delete (soft, -> Recycle Bin, OR permanent "Forget") ------------------
if ($method === 'DELETE' && !$action) {
    require_page_access($user, 'customers');
    $stmt = db()->prepare('SELECT name, email FROM customers WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    $reason = require_delete_confirmation($user, body());

    $permanent = ($_GET['permanent'] ?? '') === '1';
    if ($permanent) {
        require_super_admin($user);
        $pdo = db();
        $pdo->beginTransaction();
        try {
            belm_forget_customer_permanently($pdo, $id);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        log_activity($user, 'customer-forgotten-permanently', 'customer', $id, ['name' => $row['name'], 'reason' => $reason]);
        // V266 - the customer requested confirmation that a permanent
        // deletion actually happened, in writing, once it's truly done.
        // This can only be a plain email (not an in-portal message) since
        // the customer's account, login, and every record about it -
        // including customer_communications - no longer exist by this
        // point. Sent best-effort; a delivery failure here must never
        // undo or block the deletion that already completed successfully.
        if (!empty($row['email'])) {
            try {
                send_email(
                    $row['email'],
                    'Your BELM Portal account has been permanently deleted',
                    "This confirms that the BELM Portal account for \"{$row['name']}\" has been permanently deleted, "
                    . "as requested.\n\nEverything associated with this account has been completely removed from "
                    . "BELM's systems - login access, machines, checklist/check-up reports, Job Cards, job "
                    . "cards, invoices, receipts, proforma invoices, petty cash records, operator and shift history, "
                    . "and saved communications. Nothing was kept as a backup and none of it can be recovered or "
                    . "restored.\n\nIf you did not request this, or believe this was done in error, please contact "
                    . "BELM General Tech Service Limited immediately."
                );
            } catch (Throwable $ignored) { /* deletion already succeeded; email delivery is best-effort */ }
        }
        json_out(['ok' => true, 'message' => "\"{$row['name']}\" has been permanently forgotten — it will not appear in the Recycle Bin and cannot be restored."]);
    }

    send_to_trash('customer', $id, $row['name'], $user['id'], $reason);
    soft_delete('customers', $id);
    log_activity($user, 'customer-deleted', 'customer', $id, ['name' => $row['name'], 'reason' => $reason]);
    json_out(null, 204);
}

// ---- Sub-users ("+ Add user") ----------------------------------------------
if ($method === 'POST' && $action === 'add-user') {
    require_page_access($user, 'customers');
    require_belm_customer_privacy((string)$id, 'teamDirectory', 'the Customer team/user directory');
    $b = body();
    $name = trim((string)($b['name'] ?? ''));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $role = strtolower(trim((string)($b['role'] ?? 'operator')));
    if ($name === '') json_error('Assistant name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid assistant email.');
    if (!in_array($role, ['operator', 'viewer'], true)) $role = 'operator';
    $emailCheck = db()->prepare(
        'SELECT 1 FROM customers WHERE LOWER(email) = ? AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM customer_users WHERE LOWER(email) = ?
         LIMIT 1'
    );
    $emailCheck->execute([$email, $email, $email]);
    if ($emailCheck->fetch()) json_error('This email is already used by another portal account.', 409);
    $tempPassword = secure_account_secret();
    $recoveryCode = account_recovery_code();
    $newId = uuid();
    db()->prepare('INSERT INTO customer_users (id, customer_id, name, email, password, recovery_code_hash, phone, role, created_at) VALUES (?,?,?,?,?,?,?,?,NOW())')
        ->execute([
            $newId,
            $id,
            $name,
            $email,
            password_hash($tempPassword, PASSWORD_BCRYPT),
            password_hash($recoveryCode, PASSWORD_BCRYPT),
            $b['phone'] ?? null,
            $role,
        ]);
    json_out([
        'id' => $newId,
        'temporaryPassword' => $tempPassword,
        'recoveryCode' => $recoveryCode,
    ], 201);
}

if ($method === 'DELETE' && $action === 'remove-user') {
    require_page_access($user, 'customers');
    $privacyUserStmt = db()->prepare('SELECT customer_id FROM customer_users WHERE id = ?');
    $privacyUserStmt->execute([$_GET['subUserId']]);
    $privacyCustomerId = (string)($privacyUserStmt->fetchColumn() ?: '');
    if ($privacyCustomerId === '') json_error('Assistant not found.', 404);
    require_belm_customer_privacy($privacyCustomerId, 'teamDirectory', 'the Customer team/user directory');
    $stmt = db()->prepare('DELETE FROM customer_users WHERE id = ?');
    $stmt->execute([$_GET['subUserId']]);
    if ($stmt->rowCount() === 0) json_error('Assistant not found.', 404);
    json_out(null, 204);
}

// ---- Machines ---------------------------------------------------------------
if ($method === 'POST' && $action === 'add-machine') {
    require_page_access($user, 'customers');
    $b = body();
    $stmt = db()->prepare('SELECT 1 FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
    $stmt->execute([$id]);
    if (!$stmt->fetch()) json_error('Select an active customer.', 422);
    $machine = normalized_machine_details($b);
    $newId = uuid();
    db()->prepare('INSERT INTO machines (id, customer_id, machine_type, model, serial_number, reg_number, fleet_number, brand, service_kit, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,NOW())')
        ->execute([
            $newId,
            $id,
            $machine['machineType'],
            $machine['model'],
            $machine['serialNumber'],
            $machine['regNumber'],
            $machine['fleetNumber'],
            $machine['brand'],
            $machine['serviceKit'],
            'NOT_CHECKED',
        ]);
    // If matching 250/500/1000/2000-hour templates already contain service
    // parts, seed this machine with its own editable service-kit copy. BELM can
    // then fine-tune part numbers for the exact model/serial without changing
    // every other machine of the same type.
    $seededServiceParts = belm_seed_machine_service_parts_from_templates($newId, $machine['machineType']);
    log_activity($user, 'machine-added', 'machine', $newId, [
        'model' => $machine['model'],
        'customerId' => $id,
        'servicePartsSeeded' => $seededServiceParts,
    ]);
    json_out(['id' => $newId, 'servicePartsSeeded' => $seededServiceParts], 201);
}


// ---- Machine-specific preventive-service parts -----------------------------
// GET  /customers/machines/:machineId/service-parts
// PUT  /customers/machines/:machineId/service-parts { intervalHours, parts[] }
// BELM maintains exact service kits per registered machine. The checklist
// template is only a seed/fallback; this machine-specific list wins at alert
// time and is silently matched against BELM Spare Parts Inventory.
if ($action === 'service-parts') {
    require_page_access($user, 'customers');
    $machineId = trim((string)($_GET['machineId'] ?? ''));
    if ($machineId === '') json_error('Machine ID is required.');
    $machineStmt = db()->prepare(
        'SELECT m.id, m.customer_id, m.machine_type, m.model, m.brand, c.name AS customer_name
         FROM machines m JOIN customers c ON c.id = m.customer_id
         WHERE m.id = ? AND m.deleted_at IS NULL AND c.deleted_at IS NULL'
    );
    $machineStmt->execute([$machineId]);
    $serviceMachine = $machineStmt->fetch();
    if (!$serviceMachine) json_error('Machine not found.', 404);
    $isCustomerManagedTechnician = (($user['roleName'] ?? '') === 'Technician' && !empty($user['isCustomerManaged']));
    if (!$isCustomerManagedTechnician) {
        require_belm_customer_privacy((string)$serviceMachine['customer_id'], 'storeAndParts', 'internal service-parts/store records', $machineId);
    }

    if ($method === 'GET') {
        $rows = db()->prepare(
            'SELECT msp.id, msp.service_interval_hours, msp.spare_part_id, msp.spare_name,
                    msp.part_number, msp.quantity, msp.unit,
                    sp.name AS inventory_name, sp.stock_qty, sp.selling_price
             FROM machine_service_parts msp
             LEFT JOIN spare_parts sp ON sp.id = msp.spare_part_id AND sp.deleted_at IS NULL
             WHERE msp.machine_id = ?
             ORDER BY msp.service_interval_hours ASC, msp.spare_name ASC'
        );
        $rows->execute([$machineId]);
        $parts = $rows->fetchAll();
        foreach ($parts as &$part) {
            // Re-match old rows whose inventory link was not known at setup.
            if (empty($part['spare_part_id'])) {
                $matched = belm_inventory_match_for_service_part(null, (string)$part['part_number']);
                if ($matched) {
                    $part['spare_part_id'] = $matched['id'];
                    $part['inventory_name'] = $matched['name'];
                    $part['stock_qty'] = $matched['stock_qty'];
                    $part['selling_price'] = $matched['selling_price'];
                }
            }
        }
        unset($part);
        $templateParts = [];
        foreach ([250, 500, 1000, 2000] as $interval) {
            $templateParts[(string)$interval] = belm_template_service_parts((string)$serviceMachine['machine_type'], $interval);
        }
        json_out([
            'machine' => [
                'id' => $serviceMachine['id'],
                'customerId' => $serviceMachine['customer_id'],
                'customerName' => $serviceMachine['customer_name'],
                'machineType' => $serviceMachine['machine_type'],
                'brand' => $serviceMachine['brand'],
                'model' => $serviceMachine['model'],
            ],
            'parts' => $parts,
            'templateParts' => $templateParts,
        ]);
    }

    if ($method === 'PUT') {
        $b = body();
        $interval = (int)($b['intervalHours'] ?? 0);
        if (!in_array($interval, [250, 500, 1000, 2000], true)) {
            json_error('Service interval must be 250, 500, 1000 or 2000 hours.');
        }
        $parts = $b['parts'] ?? [];
        if (!is_array($parts)) json_error('Service parts must be a list.');
        $normalized = [];
        $seen = [];
        foreach ($parts as $part) {
            if (!is_array($part)) continue;
            $name = trim((string)($part['spareName'] ?? $part['name'] ?? ''));
            $number = strtoupper(trim((string)($part['partNumber'] ?? '')));
            $qty = (float)($part['quantity'] ?? 0);
            $unit = strtoupper(trim((string)($part['unit'] ?? 'PC'))) ?: 'PC';
            if ($name === '' && $number === '') continue;
            if ($name === '') json_error('Every service spare needs a name.');
            if ($number === '') json_error('Every service spare needs a part number/reference.');
            if ($qty <= 0) json_error("Quantity for $name must be greater than zero.");
            $key = strtolower($number);
            if (isset($seen[$key])) json_error("Part number $number is duplicated in this service kit.");
            $seen[$key] = true;
            $inventory = belm_inventory_match_for_service_part(
                trim((string)($part['sparePartId'] ?? '')) ?: null,
                $number
            );
            $normalized[] = [
                'sparePartId' => $inventory['id'] ?? null,
                'spareName' => $name,
                'partNumber' => $number,
                'quantity' => $qty,
                'unit' => mb_substr($unit, 0, 20),
            ];
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM machine_service_parts WHERE machine_id = ? AND service_interval_hours = ?')
                ->execute([$machineId, $interval]);
            $ins = $pdo->prepare(
                'INSERT INTO machine_service_parts
                 (id, machine_id, service_interval_hours, spare_part_id, spare_name, part_number, quantity, unit, created_at, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())'
            );
            foreach ($normalized as $part) {
                $ins->execute([
                    uuid(), $machineId, $interval, $part['sparePartId'], $part['spareName'],
                    $part['partNumber'], $part['quantity'], $part['unit'],
                ]);
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        log_activity($user, 'machine-service-parts-updated', 'machine', $machineId, [
            'serviceIntervalHours' => $interval,
            'partsCount' => count($normalized),
        ]);
        json_out(['ok' => true, 'partsCount' => count($normalized)]);
    }

    json_error('Unsupported service-parts request.', 405);
}

const MACHINE_OPERATIONAL_STATUSES = ['NORMAL', 'SERVICE_IN_PROGRESS', 'CHECKUP_IN_PROGRESS', 'MAINTENANCE_IN_PROGRESS', 'GROUNDED'];

// Quick activity-status flip for BELM Admin, Engineer or Technician —
// deliberately lighter than edit-machine (no Edit PIN) since this is
// meant to be updated in the moment work starts/stops, not a formal
// record edit. Requires only normal page access to the customer/machine.
// ---- Admin visibility into customer-uploaded expense receipts -------------
// The customer uploads these from their own Procurement page; BELM
// Admin/Engineer need to be able to see and download the same receipts
// for bookkeeping — this was previously only reachable from the
// customer's own portal, with no admin-side view at all.
if ($method === 'GET' && $action === 'expense-receipts') {
    require_page_access($user, 'customers');
    $machineId = $_GET['machineId'] ?? '';
    if ($machineId === '') json_error('machineId is required.');
    $privacyMachineStmt = db()->prepare('SELECT customer_id FROM machines WHERE id = ? AND deleted_at IS NULL');
    $privacyMachineStmt->execute([$machineId]);
    $privacyCustomerId = (string)($privacyMachineStmt->fetchColumn() ?: '');
    if ($privacyCustomerId === '') json_error('Machine not found.', 404);
    require_belm_customer_privacy($privacyCustomerId, 'expenseReceipts', 'machine procurement records and receipt photos', $machineId);
    $stmt = db()->prepare(
        "SELECT id, date, description, part_number, quantity, unit, cost,
                receipt_photo_name, receipt_photo_mime, recorded_by
         FROM usage_logs
         WHERE machine_id = ? AND category = 'SPARE_PART'
           AND receipt_photo_data IS NOT NULL AND receipt_photo_data <> ''
         ORDER BY date DESC"
    );
    $stmt->execute([$machineId]);
    json_out(array_map(fn($row) => [
        'id' => $row['id'],
        'date' => $row['date'],
        'description' => $row['description'],
        'partNumber' => $row['part_number'],
        'quantity' => $row['quantity'],
        'unit' => $row['unit'],
        'cost' => $row['cost'],
        'receiptName' => $row['receipt_photo_name'],
        'receiptMime' => $row['receipt_photo_mime'],
        'recordedBy' => $row['recorded_by'],
    ], $stmt->fetchAll()));
}

if ($method === 'GET' && $action === 'expense-receipt') {
    require_page_access($user, 'customers');
    $expenseId = $_GET['expenseId'] ?? '';
    if ($expenseId === '') json_error('expenseId is required.');
    $stmt = db()->prepare(
        "SELECT customer_id, machine_id, receipt_photo_data, receipt_photo_mime, receipt_photo_name
         FROM usage_logs WHERE id = ? AND category = 'SPARE_PART'"
    );
    $stmt->execute([$expenseId]);
    $receipt = $stmt->fetch();
    if ($receipt) require_belm_customer_privacy((string)$receipt['customer_id'], 'expenseReceipts', 'machine procurement records and receipt photos', (string)$receipt['machine_id']);
    if (!$receipt || !$receipt['receipt_photo_data']) json_error('Receipt photo was not found.', 404);
    $binary = base64_decode((string)$receipt['receipt_photo_data'], true);
    if ($binary === false) json_error('Receipt photo is damaged.', 500);
    $mime = in_array(
        $receipt['receipt_photo_mime'],
        ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
        true
    ) ? $receipt['receipt_photo_mime'] : 'image/jpeg';
    header('Content-Type: ' . $mime);
    header('Content-Length: ' . strlen($binary));
    $disposition = !empty($_GET['download']) ? 'attachment' : 'inline';
    header('Content-Disposition: ' . $disposition . '; filename="' .
        preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)($receipt['receipt_photo_name'] ?: 'receipt-photo')) .
        '"');
    echo $binary;
    exit;
}

if ($method === 'PUT' && $action === 'operational-status') {
    $b = body();
    $status = strtoupper(trim((string)($b['operationalStatus'] ?? '')));
    $note = trim((string)($b['note'] ?? ''));
    if (!in_array($status, MACHINE_OPERATIONAL_STATUSES, true)) json_error('Invalid operational status.', 422);

    $stmt = db()->prepare(
        'SELECT m.customer_id, m.machine_type, m.brand, m.model, m.serial_number, m.reg_number,
                c.name AS customer_name
         FROM machines m
         JOIN customers c ON c.id = m.customer_id
         WHERE m.id = ? AND m.deleted_at IS NULL AND c.deleted_at IS NULL'
    );
    $stmt->execute([$_GET['machineId']]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine not found.', 404);
    require_customer_read_access($user, $machine['customer_id']);
    $isCustomerManagedTechnician = (($user['roleName'] ?? '') === 'Technician' && !empty($user['isCustomerManaged']));
    if (!$isCustomerManagedTechnician) {
        require_belm_customer_privacy((string)$machine['customer_id'], 'maintenanceRecords', 'internal machine maintenance/activity updates', (string)$_GET['machineId']);
    }

    db()->prepare('UPDATE machines SET operational_status = ?, operational_status_note = ?, operational_status_updated_at = NOW() WHERE id = ?')
        ->execute([$status, $note !== '' ? $note : null, $_GET['machineId']]);

    $delivery = [
        'customer' => ['portalRecorded' => true, 'emailsSent' => 0, 'emailFailures' => 0],
        'belm' => ['required' => false, 'workflowSynced' => true, 'emailsSent' => 0, 'emailFailures' => 0],
    ];
    if (($user['roleName'] ?? '') === 'Technician') {
        $actorName = trim((string)($user['name'] ?? 'Technician'));
        $machineLabel = trim((string)($machine['brand'] ?? '') . ' ' . (string)($machine['model'] ?? ''))
            ?: ((string)($machine['machine_type'] ?? '') ?: 'Machine');
        $statusText = 'Technician ' . $actorName . ' updated machine activity status.'
            . "
Customer: " . ($machine['customer_name'] ?? 'Customer')
            . "
Machine: " . $machineLabel
            . (!empty($machine['serial_number']) ? "
Serial: " . $machine['serial_number'] : '')
            . "
Activity status: " . $status
            . ($note !== '' ? "
Note: " . $note : '');
        $communicationId = belm_log_customer_communication(
            (string)$machine['customer_id'],
            (string)$_GET['machineId'],
            'BELM_TO_CUSTOMER',
            'PORTAL',
            'Technician Machine Activity Status - ' . $machineLabel,
            $statusText,
            'MACHINE_STATUS',
            (string)$_GET['machineId'],
            $actorName,
            'SENT'
        );
        $delivery['customer']['portalCommunicationId'] = $communicationId;
        $customerDelivery = ['sent' => 0, 'failed' => 0];
        try {
            $customerDelivery = customer_send_team_alert(
                (string)$machine['customer_id'],
                ['workflow', 'check-up'],
                'MACHINE ACTIVITY STATUS - ' . $machineLabel . ' - ' . $status,
                $statusText,
                true
            );
        } catch (Throwable $ignored) {}
        $delivery['customer']['emailsSent'] = (int)($customerDelivery['sent'] ?? 0);
        $delivery['customer']['emailFailures'] = (int)($customerDelivery['failed'] ?? 0);

        $isBelmTechnician = empty($user['isCustomerManaged']);
        $delivery['belm']['required'] = $isBelmTechnician;
        if ($isBelmTechnician) {
            $belmDelivery = ['sent' => 0, 'failed' => 0];
            try {
                $belmDelivery = belm_send_customer_to_belm_alert(
                    ['job-cards','service-requests'],
                    'BELM TECHNICIAN MACHINE STATUS - ' . $machineLabel . ' - ' . $status,
                    $statusText
                );
            } catch (Throwable $ignored) {}
            $delivery['belm']['emailsSent'] = (int)($belmDelivery['sent'] ?? 0);
            $delivery['belm']['emailFailures'] = (int)($belmDelivery['failed'] ?? 0);
        }
    }

    json_out(['ok' => true, 'delivery' => $delivery]);
}

// V444: Edit/Delete/Forget Machine must never be reachable by a BELM staff
// account whose role is Technician — not even if their allowedPages was
// misconfigured to include "customers". Technicians only ever need read
// access to their assigned customer (see the Technician-scoped SELECT
// branches above); machine administration stays Admin/Assistant-only. This
// is deliberately independent of require_page_access() so a Role Manager
// misconfiguration cannot expose these destructive actions.
function require_not_technician_role(array $user): void {
    if (($user['roleName'] ?? '') === 'Technician') {
        json_error('Technician accounts cannot edit, delete or forget machines.', 403);
    }
}

if ($method === 'PUT' && $action === 'edit-machine') {
    require_page_access($user, 'customers');
    require_not_technician_role($user);
    $b = body();
    require_edit_confirmation($user, $b);
    $stmt = db()->prepare('SELECT customer_id FROM machines WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$_GET['machineId']]);
    $existingMachine = $stmt->fetch();
    if (!$existingMachine) json_error('Machine not found.', 404);
    $machine = normalized_machine_details($b);

    $newCustomerId = trim((string)($b['customerId'] ?? ''));
    $targetCustomerId = $existingMachine['customer_id'];
    if ($newCustomerId !== '' && $newCustomerId !== $existingMachine['customer_id']) {
        $customerCheck = db()->prepare('SELECT 1 FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
        $customerCheck->execute([$newCustomerId]);
        if (!$customerCheck->fetch()) json_error('Select an active customer to move this machine to.', 422);
        $targetCustomerId = $newCustomerId;
    }

    db()->prepare('UPDATE machines SET customer_id=?, machine_type=?, model=?, serial_number=?, reg_number=?, fleet_number=?, brand=?, service_kit=? WHERE id=?')
        ->execute([
            $targetCustomerId,
            $machine['machineType'],
            $machine['model'],
            $machine['serialNumber'],
            $machine['regNumber'],
            $machine['fleetNumber'],
            $machine['brand'],
            $machine['serviceKit'],
            $_GET['machineId'],
        ]);
    log_activity($user, 'machine-edited', 'machine', $_GET['machineId'], ['model' => $machine['model']]);
    json_out(['ok' => true, 'movedToCustomerId' => $targetCustomerId !== $existingMachine['customer_id'] ? $targetCustomerId : null]);
}

if ($method === 'DELETE' && $action === 'delete-machine') {
    require_page_access($user, 'customers');
    require_not_technician_role($user);
    $machineId = $_GET['machineId'];
    $stmt = db()->prepare('SELECT model, customer_id FROM machines WHERE id = ?');
    $stmt->execute([$machineId]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    $reason = require_delete_confirmation($user, body());

    if (($_GET['permanent'] ?? '') === '1') {
        require_super_admin($user);
        $pdo = db();
        $pdo->beginTransaction();
        try {
            belm_forget_machine_permanently($pdo, $machineId);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        log_activity($user, 'machine-forgotten-permanently', 'machine', $machineId, [
            'model' => $row['model'],
            'customerId' => $row['customer_id'],
            'reason' => $reason,
        ]);
        json_out([
            'ok' => true,
            'message' => "Machine \"{$row['model']}\" has been permanently forgotten. The customer and all other machines remain intact.",
        ]);
    }

    send_to_trash('machine', $machineId, $row['model'], $user['id'], $reason);
    soft_delete('machines', $machineId);
    json_out(null, 204);
}

// ---- Clear Petty Cash Deposits for ONE machine (keeps spending history) ---
// ---- Settle Petty Cash Debt (top up exactly enough to zero the balance) ---
if ($method === 'POST' && $action === 'settle-petty-cash-debt') {
    require_page_access($user, 'customers');
    $machineId = trim((string)($_GET['machineId'] ?? ''));

    $stmt = db()->prepare('SELECT model, customer_id FROM machines WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$machineId]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine not found.', 404);
    require_belm_customer_privacy((string)$machine['customer_id'], 'expenseReceipts', 'Customer financial/expense records', $machineId);

    $toppedUpStmt = db()->prepare('SELECT COALESCE(SUM(amount), 0) FROM petty_cash_topups WHERE machine_id = ?');
    $toppedUpStmt->execute([$machineId]);
    $totalToppedUp = (float)$toppedUpStmt->fetchColumn();

    $usedStmt = db()->prepare("SELECT COALESCE(SUM(cost), 0) FROM usage_logs WHERE machine_id = ? AND category = 'PETTY_CASH'");
    $usedStmt->execute([$machineId]);
    $totalUsed = (float)$usedStmt->fetchColumn();

    $balance = $totalToppedUp - $totalUsed;
    if ($balance >= 0) {
        json_out(['ok' => true, 'settledAmount' => 0, 'message' => 'There is no petty cash debt to settle for this machine.']);
    }

    $settleAmount = abs($balance);
    $newId = uuid();
    db()->prepare(
        'INSERT INTO petty_cash_topups (id, machine_id, customer_id, amount, note, added_by, created_at)
         VALUES (?,?,?,?,?,?,NOW())'
    )->execute([
        $newId, $machineId, $machine['customer_id'] ?? null, $settleAmount,
        'Debt settlement — brings balance to TZS 0 (spending history kept)', $user['id'],
    ]);

    json_out([
        'ok' => true,
        'settledAmount' => $settleAmount,
        'message' => "Debt settled — TZS " . number_format($settleAmount, 2) . " deposited to bring {$machine['model']}'s balance to zero.",
    ]);
}

if ($method === 'DELETE' && $action === 'petty-cash-topup') {
    require_page_access($user, 'customers');
    $machineId = trim((string)($_GET['machineId'] ?? ''));
    $b = body();
    $reason = require_delete_confirmation($user, $b);

    $stmt = db()->prepare('SELECT model, customer_id FROM machines WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$machineId]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine not found.', 404);
    require_belm_customer_privacy((string)$machine['customer_id'], 'expenseReceipts', 'Customer financial/expense records', $machineId);

    db()->prepare('DELETE FROM petty_cash_topups WHERE machine_id = ?')->execute([$machineId]);

    json_out(['ok' => true, 'message' => "Petty cash deposits cleared for {$machine['model']}. Spending history was kept."]);
}

// ---- Petty Cash Top-Up (admin adds funds to a machine's petty cash account) -
if ($method === 'POST' && $action === 'petty-cash-topup') {
    require_page_access($user, 'customers');
    $machineId = trim((string)($_GET['machineId'] ?? ''));
    $b = body();
    $amount = (float)($b['amount'] ?? 0);
    $note = trim((string)($b['note'] ?? ''));
    if ($amount <= 0) json_error('Enter a top-up amount greater than zero.');

    $stmt = db()->prepare('SELECT customer_id, model FROM machines WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$machineId]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine not found.', 404);
    require_belm_customer_privacy((string)$machine['customer_id'], 'expenseReceipts', 'Customer financial/expense records', $machineId);

    $newId = uuid();
    db()->prepare(
        'INSERT INTO petty_cash_topups (id, machine_id, customer_id, amount, note, added_by, created_at)
         VALUES (?,?,?,?,?,?,NOW())'
    )->execute([$newId, $machineId, $machine['customer_id'], $amount, $note !== '' ? $note : null, $user['id']]);

    json_out(['id' => $newId, 'message' => "Petty cash topped up by TZS " . number_format($amount, 2) . " for {$machine['model']}."], 201);
}
function fetch_machines_for_customers(array $customerIds): array {
    $customerIds = array_values(array_filter(array_unique(array_map('strval', $customerIds))));
    $grouped = [];
    foreach ($customerIds as $customerId) $grouped[$customerId] = [];
    if (!$customerIds) return $grouped;

    $in = belm_in_clause($customerIds);
    $stmt = db()->prepare(
        "SELECT * FROM machines
         WHERE customer_id IN ($in) AND deleted_at IS NULL
         ORDER BY customer_id ASC, created_at ASC"
    );
    $stmt->execute($customerIds);
    $machines = $stmt->fetchAll();
    if (!$machines) return $grouped;

    $machineIds = array_values(array_map(
        static fn(array $machine): string => (string)$machine['id'],
        $machines
    ));
    $machineIn = belm_in_clause($machineIds);

    // V288: one batched lookup marks machines with an open official BELM
    // support request. That request grants temporary machine-scoped access to
    // maintenance/service-kit records even if the Customer's general sharing
    // switch is OFF. Keeping this batched preserves the V284 performance fix.
    $supportStmt = db()->prepare(
        "SELECT DISTINCT machine_id FROM service_requests
         WHERE machine_id IN ($machineIn) AND status NOT IN ('COMPLETED','CANCELLED')"
    );
    $supportStmt->execute($machineIds);
    $supportMachines = array_fill_keys(array_map('strval', $supportStmt->fetchAll(PDO::FETCH_COLUMN)), true);

    // One query gets warning/critical reasons for the latest checklist of
    // every machine. DISTINCT ON is supported by PostgreSQL (the portal DB).
    $reasonStmt = db()->prepare(
        "SELECT latest.machine_id, ca.label, ca.value, ca.safety_level
         FROM (
           SELECT DISTINCT ON (machine_id) id, machine_id
           FROM checklist_reports
           WHERE machine_id IN ($machineIn)
           ORDER BY machine_id, created_at DESC, id DESC
         ) latest
         JOIN checklist_answers ca ON ca.report_id = latest.id
         WHERE ca.safety_level IN ('YELLOW', 'RED')
         ORDER BY latest.machine_id,
                  CASE ca.safety_level WHEN 'RED' THEN 0 ELSE 1 END,
                  ca.label ASC"
    );
    $reasonStmt->execute($machineIds);
    $reasonsByMachine = [];
    foreach ($reasonStmt->fetchAll() as $flag) {
        $machineId = (string)$flag['machine_id'];
        $reasonsByMachine[$machineId][] = trim(
            (string)$flag['label'] . ((string)$flag['value'] !== '' ? ': ' . (string)$flag['value'] : '')
        );
    }

    // V397: preload the latest Operator message per machine in one query so
    // Technician cards can show it directly in the large message panel. The
    // existing 30-second Technician profile refresh keeps it live without an
    // N+1 request for every card.
    $operatorStmt = db()->prepare(
        "SELECT DISTINCT ON (machine_id) machine_id, id, operator_name, operator_contact, message, status, created_at
         FROM operator_reports
         WHERE machine_id IN ($machineIn)
         ORDER BY machine_id, created_at DESC, id DESC"
    );
    $operatorStmt->execute($machineIds);
    $operatorByMachine = [];
    foreach ($operatorStmt->fetchAll() as $report) {
        $operatorByMachine[(string)$report['machine_id']] = [
            'id' => (string)$report['id'],
            'operatorName' => (string)$report['operator_name'],
            'operatorContact' => (string)($report['operator_contact'] ?? ''),
            'message' => (string)$report['message'],
            'status' => (string)$report['status'],
            'createdAt' => (string)$report['created_at'],
        ];
    }

    foreach ($machines as $machine) {
        $machineId = (string)$machine['id'];
        $customerId = (string)$machine['customer_id'];
        $machine['alertReasons'] = $reasonsByMachine[$machineId] ?? [];
        $machine['supportAccessActive'] = !empty($supportMachines[$machineId]);
        $machine['latestOperatorMessage'] = $operatorByMachine[$machineId] ?? null;
        $grouped[$customerId][] = $machine;
    }
    return $grouped;
}

function fetch_machines(string $customerId): array {
    $grouped = fetch_machines_for_customers([$customerId]);
    return $grouped[$customerId] ?? [];
}

function fetch_customer_users_for_customers(array $customerIds): array {
    $customerIds = array_values(array_filter(array_unique(array_map('strval', $customerIds))));
    $grouped = [];
    foreach ($customerIds as $customerId) $grouped[$customerId] = [];
    if (!$customerIds) return $grouped;

    $in = belm_in_clause($customerIds);
    $stmt = db()->prepare(
        "SELECT id, customer_id, name, email, phone, role, is_active, created_at
         FROM customer_users
         WHERE customer_id IN ($in)
         ORDER BY customer_id ASC, created_at ASC"
    );
    $stmt->execute($customerIds);
    foreach ($stmt->fetchAll() as $portalUser) {
        $customerId = (string)$portalUser['customer_id'];
        unset($portalUser['customer_id']);
        $grouped[$customerId][] = $portalUser;
    }
    return $grouped;
}

function fetch_customer_users(string $customerId): array {
    $grouped = fetch_customer_users_for_customers([$customerId]);
    return $grouped[$customerId] ?? [];
}

// ---- Merge two customer records into one -----------------------------------
// Moves every machine, invoice, checklist report, service request, spare
// part request, proforma, expense log, task and portal user from the
// "source" customer onto the "target" customer, then permanently removes
// the now-empty source record. Use this when the same real company was
// accidentally registered twice (e.g. duplicate email conflict).
if ($method === 'POST' && $action === 'merge') {
    require_page_access($user, 'customers');
    $b = body();
    $sourceId = trim((string)($b['sourceCustomerId'] ?? ''));
    $targetId = trim((string)($b['targetCustomerId'] ?? ''));
    if ($sourceId === '' || $targetId === '') json_error('Select both the duplicate and the customer to keep.');
    if ($sourceId === $targetId) json_error('Select two different customers to merge.');

    $reason = require_delete_confirmation($user, $b);

    $stmt = db()->prepare('SELECT id, name, email FROM customers WHERE id IN (?, ?) AND deleted_at IS NULL');
    $stmt->execute([$sourceId, $targetId]);
    $rows = $stmt->fetchAll();
    if (count($rows) !== 2) json_error('One of the selected customers was not found.', 404);
    $names = [];
    foreach ($rows as $row) $names[$row['id']] = $row['name'];

    $pdo = db();

    // V307: Customer Store part numbers are unique per customer. Refuse a
    // merge that would silently combine two physically different stock cards;
    // the Store Keeper must reconcile those few duplicate part numbers first.
    $storeConflict = $pdo->prepare(
        "SELECT s.part_number
         FROM customer_store_items s
         JOIN customer_store_items t
           ON t.customer_id=? AND UPPER(TRIM(t.part_number))=UPPER(TRIM(s.part_number))
         WHERE s.customer_id=? LIMIT 1"
    );
    $storeConflict->execute([$targetId,$sourceId]);
    if ($conflictPart = $storeConflict->fetchColumn()) {
        json_error('Merge blocked: both customers have Customer Store stock for part '.$conflictPart.'. Reconcile that Store item first, then merge again.',409);
    }

    $pdo->beginTransaction();
    try {
        // Move every current customer-owned table, including newer Store,
        // Procurement, Breakdown and Job Card modules. Keeping redundant
        // customer_id columns aligned with the moved machine is important for
        // privacy checks and reporting.
        foreach ([
            'machines','service_requests','invoices','proforma_invoices','receipts','usage_logs',
            'customer_activity_logs','machine_operators','machine_operator_shifts','operator_reports',
            'petty_cash_topups','customer_saved_emails','tasks','customer_applications',
            'customer_communications','customer_store_items','customer_store_movements',
            'customer_machine_spare_list_items','customer_store_issue_requests',
            'machine_service_owner_notifications','service_due_alerts','breakdown_cases',
            'customer_procurement_requests','digital_job_cards'
        ] as $table) {
            $pdo->prepare("UPDATE \"$table\" SET customer_id=? WHERE customer_id=?")->execute([$targetId,$sourceId]);
        }
        $pdo->prepare('UPDATE user_applications SET assigned_customer_id=? WHERE assigned_customer_id=?')->execute([$targetId,$sourceId]);
        $pdo->prepare(
            "UPDATE customer_users SET customer_id=?
             WHERE customer_id=?
               AND LOWER(email) NOT IN (
                   SELECT LOWER(email) FROM customer_users WHERE customer_id=?
                   UNION SELECT LOWER(email) FROM customers WHERE id=?
               )"
        )->execute([$targetId,$sourceId,$targetId,$targetId]);
        // Duplicate assistant emails are already represented on the kept
        // customer, so only the redundant source login is discarded.
        $pdo->prepare('DELETE FROM customer_users WHERE customer_id=?')->execute([$sourceId]);
        $pdo->prepare('UPDATE users SET assigned_customer_id=? WHERE assigned_customer_id=?')->execute([$targetId,$sourceId]);

        // Merge is documented as permanent. Hard-delete the now-empty source
        // rather than placing a restorable empty shell in Recycle Bin.
        belm_forget_customer_permanently($pdo,$sourceId);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    log_activity($user,'customer-merged','customer',$targetId,[
        'sourceCustomerId'=>$sourceId,
        'sourceName'=>$names[$sourceId],
        'targetName'=>$names[$targetId],
        'reason'=>$reason,
    ]);
    json_out([
        'ok' => true,
        'message' => "\"{$names[$sourceId]}\" has been permanently merged into \"{$names[$targetId]}\". Machines, workflow, Store, Procurement, billing and reports now belong to the kept customer.",
    ]);
}

json_error('Unknown request', 404);
