<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/service_due_helper.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = $_GET['id'] ?? null;

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

// Permanently erases a customer and everything tied only to them —
// bypasses the Recycle Bin entirely so it cannot come back. Mirrors the
// hard-delete used by Danger Zone > Reset Database, exposed here as a
// direct "Forget" action on the Customers & Machines page.
function belm_forget_customer_permanently(PDO $pdo, string $customerId): void {
    $machineIds = $pdo->prepare('SELECT id FROM machines WHERE customer_id = ?');
    $machineIds->execute([$customerId]);
    $machines = $machineIds->fetchAll(PDO::FETCH_COLUMN);

    $requestIds = $pdo->prepare('SELECT id FROM service_requests WHERE customer_id = ?');
    $requestIds->execute([$customerId]);
    $requests = $requestIds->fetchAll(PDO::FETCH_COLUMN);

    $invoiceIds = $pdo->prepare('SELECT id FROM invoices WHERE customer_id = ?');
    $invoiceIds->execute([$customerId]);
    $invoices = $invoiceIds->fetchAll(PDO::FETCH_COLUMN);

    if ($machines) {
        $in = belm_in_clause($machines);
        $pdo->prepare("DELETE FROM checklist_answers WHERE report_id IN (SELECT id FROM checklist_reports WHERE machine_id IN ($in))")->execute($machines);
        $pdo->prepare("DELETE FROM checklist_reports WHERE machine_id IN ($in)")->execute($machines);
        $pdo->prepare("DELETE FROM petty_cash_topups WHERE machine_id IN ($in)")->execute($machines);
        $pdo->prepare("DELETE FROM machine_operator_shifts WHERE machine_id IN ($in)")->execute($machines);
        $pdo->prepare("DELETE FROM machine_operators WHERE machine_id IN ($in)")->execute($machines);
        $pdo->prepare("DELETE FROM operator_reports WHERE machine_id IN ($in)")->execute($machines);
    }

    // V266 - these two tables reference customers(id) directly with no
    // ON DELETE CASCADE and were never being cleared here. Left in place,
    // any customer who ever had a cash Payment/Receipt recorded, or any
    // operator shift sign-in/sign-out history, would make the final
    // DELETE FROM customers below fail on a foreign-key violation - the
    // whole "Forget permanently" transaction would silently roll back,
    // leaving the customer (and everything else) still in the database
    // despite the confirmation message implying it was gone.
    $pdo->prepare('DELETE FROM receipts WHERE customer_id = ?')->execute([$customerId]);

    // V215: Petty Cash is customer-level, so account top-ups can have no machine_id.
    $pdo->prepare('DELETE FROM petty_cash_topups WHERE customer_id = ?')->execute([$customerId]);

    if ($requests) {
        $in = belm_in_clause($requests);
        $pdo->prepare("DELETE FROM service_notes WHERE request_id IN ($in)")->execute($requests);
        $pdo->prepare("DELETE FROM service_request_parts WHERE request_id IN ($in)")->execute($requests);
    }

    if ($machines || $requests) {
        $conditions = [];
        $params = [];
        if ($machines) { $conditions[] = 'machine_id IN (' . belm_in_clause($machines) . ')'; $params = array_merge($params, $machines); }
        if ($requests) { $conditions[] = 'request_id IN (' . belm_in_clause($requests) . ')'; $params = array_merge($params, $requests); }
        $pdo->prepare('DELETE FROM spare_part_requests WHERE ' . implode(' OR ', $conditions))->execute($params);
    }

    $pdo->prepare('DELETE FROM service_requests WHERE customer_id = ?')->execute([$customerId]);

    if ($invoices) {
        $in = belm_in_clause($invoices);
        $pdo->prepare("DELETE FROM invoice_items WHERE invoice_id IN ($in)")->execute($invoices);
        $pdo->prepare("DELETE FROM payments WHERE invoice_id IN ($in)")->execute($invoices);
    }
    $pdo->prepare('DELETE FROM invoices WHERE customer_id = ?')->execute([$customerId]);

    $pdo->prepare('DELETE FROM proforma_invoices WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM usage_logs WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM tasks WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customer_applications WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customer_users WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customer_saved_emails WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM customer_activity_logs WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('DELETE FROM machines WHERE customer_id = ?')->execute([$customerId]);
    $pdo->prepare('UPDATE users SET assigned_customer_id = NULL WHERE assigned_customer_id = ?')->execute([$customerId]);
    // Also purge any Recycle Bin entry so "Restore" can never bring this
    // customer or its machines back after a permanent Forget.
    $pdo->prepare("DELETE FROM trash_entries WHERE entity_type = 'customer' AND entity_id = ?")->execute([$customerId]);
    if ($machines) {
        $in = belm_in_clause($machines);
        $pdo->prepare("DELETE FROM trash_entries WHERE entity_type = 'machine' AND entity_id IN ($in)")->execute($machines);
    }
    $pdo->prepare('DELETE FROM customers WHERE id = ?')->execute([$customerId]);
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
            'SELECT id, name, email, phone, address, tin_number, vrn, is_active, is_machinery_admin
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
    foreach ($customers as &$c) {
        $c['machines'] = fetch_machines($c['id']);
        $c['isMachineryAdmin'] = !empty($c['is_machinery_admin']);
        $c['belmServiceProviderActive'] = empty($c['is_machinery_admin']);
        if (($user['roleName'] ?? '') !== 'Technician') {
            $c['users'] = fetch_customer_users($c['id']);
            $c['userLimit'] = isset($c['user_limit']) ? (int)$c['user_limit'] : null;
        }
    }
    json_out($customers);
}

// ---- Get one ------------------------------------------------------------
if ($method === 'GET' && $action === 'one') {
    require_customer_read_access($user, $id);
    $sql = ($user['roleName'] ?? '') === 'Technician'
        ? 'SELECT id, name, email, phone, address, tin_number, vrn, is_active, is_machinery_admin
           FROM customers
           WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
        : 'SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL';
    $stmt = db()->prepare($sql);
    $stmt->execute([$id]);
    $customer = $stmt->fetch();
    if (!$customer) json_error('Not found', 404);
    $customer['machines'] = fetch_machines($customer['id']);
    $customer['isMachineryAdmin'] = !empty($customer['is_machinery_admin']);
    $customer['belmServiceProviderActive'] = empty($customer['is_machinery_admin']);
    if (($user['roleName'] ?? '') !== 'Technician') {
        $customer['users'] = fetch_customer_users($customer['id']);
    }
    json_out($customer);
}

// ---- BELM <-> Customer communication history -----------------------------
if ($method === 'GET' && $action === 'communications') {
    require_page_access($user, 'customers');
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
    $emailBody = $message;
    if ($machineLabel !== '') $emailBody .= "\n\nMachine: $machineLabel";
    $emailBody .= "\n\nSent by: $sender\nOpen the BELM Customer Portal to keep this message in your communication history.";
    $result = belm_send_customer_alert(
        (string)$id,
        $machineId !== '' ? $machineId : null,
        ['admin'],
        $subject,
        $emailBody,
        'DIRECT_MESSAGE',
        null,
        $sender,
        $message
    );
    json_out([
        'ok' => true,
        'emailDelivered' => (int)($result['sent'] ?? 0) > 0,
        'emailRecipients' => $result['recipients'] ?? [],
        'message' => (int)($result['sent'] ?? 0) > 0
            ? 'Message saved to the customer portal and emailed successfully.'
            : 'Message saved to the customer portal. Email was not delivered; check customer email/SMTP settings.',
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
                    . "BELM's systems - login access, machines, checklist/check-up reports, service requests, job "
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
// The customer uploads these from their own Machine Expenses page; BELM
// Admin/Engineer need to be able to see and download the same receipts
// for bookkeeping — this was previously only reachable from the
// customer's own portal, with no admin-side view at all.
if ($method === 'GET' && $action === 'expense-receipts') {
    require_page_access($user, 'customers');
    $machineId = $_GET['machineId'] ?? '';
    if ($machineId === '') json_error('machineId is required.');
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
        "SELECT receipt_photo_data, receipt_photo_mime, receipt_photo_name
         FROM usage_logs WHERE id = ? AND category = 'SPARE_PART'"
    );
    $stmt->execute([$expenseId]);
    $receipt = $stmt->fetch();
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

    $stmt = db()->prepare('SELECT customer_id FROM machines WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$_GET['machineId']]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine not found.', 404);
    require_customer_read_access($user, $machine['customer_id']);

    db()->prepare('UPDATE machines SET operational_status = ?, operational_status_note = ?, operational_status_updated_at = NOW() WHERE id = ?')
        ->execute([$status, $note !== '' ? $note : null, $_GET['machineId']]);

    json_out(['ok' => true]);
}

if ($method === 'PUT' && $action === 'edit-machine') {
    require_page_access($user, 'customers');
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
    $machineId = $_GET['machineId'];
    $stmt = db()->prepare('SELECT model FROM machines WHERE id = ?');
    $stmt->execute([$machineId]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    $reason = require_delete_confirmation($user, body());
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

    $stmt = db()->prepare('SELECT model FROM machines WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$machineId]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine not found.', 404);

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

    $newId = uuid();
    db()->prepare(
        'INSERT INTO petty_cash_topups (id, machine_id, customer_id, amount, note, added_by, created_at)
         VALUES (?,?,?,?,?,?,NOW())'
    )->execute([$newId, $machineId, $machine['customer_id'], $amount, $note !== '' ? $note : null, $user['id']]);

    json_out(['id' => $newId, 'message' => "Petty cash topped up by TZS " . number_format($amount, 2) . " for {$machine['model']}."], 201);
}
function fetch_machines(string $customerId): array {
    $stmt = db()->prepare('SELECT * FROM machines WHERE customer_id = ? AND deleted_at IS NULL ORDER BY created_at ASC');
    $stmt->execute([$customerId]);
    $machines = $stmt->fetchAll();

    $reasonStmt = db()->prepare(
        "SELECT ca.label, ca.value, ca.safety_level
         FROM checklist_answers ca
         WHERE ca.report_id = (
           SELECT id FROM checklist_reports
           WHERE machine_id = ? ORDER BY created_at DESC LIMIT 1
         )
         AND ca.safety_level IN ('YELLOW', 'RED')
         ORDER BY CASE ca.safety_level WHEN 'RED' THEN 0 ELSE 1 END, ca.label ASC"
    );
    foreach ($machines as &$machine) {
        $reasonStmt->execute([$machine['id']]);
        $flags = $reasonStmt->fetchAll();
        $machine['alertReasons'] = array_map(
            static fn(array $flag): string => trim($flag['label'] . ($flag['value'] !== '' ? ': ' . $flag['value'] : '')),
            $flags
        );
    }
    unset($machine);

    return $machines;
}
function fetch_customer_users(string $customerId): array {
    $stmt = db()->prepare('SELECT id, name, email, phone, role, is_active, created_at FROM customer_users WHERE customer_id = ?');
    $stmt->execute([$customerId]);
    return $stmt->fetchAll();
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
    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE machines SET customer_id = ? WHERE customer_id = ?')->execute([$targetId, $sourceId]);
        $pdo->prepare('UPDATE service_requests SET customer_id = ? WHERE customer_id = ?')->execute([$targetId, $sourceId]);
        $pdo->prepare('UPDATE invoices SET customer_id = ? WHERE customer_id = ?')->execute([$targetId, $sourceId]);
        $pdo->prepare('UPDATE proforma_invoices SET customer_id = ? WHERE customer_id = ?')->execute([$targetId, $sourceId]);
        $pdo->prepare('UPDATE usage_logs SET customer_id = ? WHERE customer_id = ?')->execute([$targetId, $sourceId]);
        $pdo->prepare('UPDATE tasks SET customer_id = ? WHERE customer_id = ?')->execute([$targetId, $sourceId]);
        $pdo->prepare('UPDATE customer_applications SET customer_id = ? WHERE customer_id = ?')->execute([$targetId, $sourceId]);
        $pdo->prepare(
            "UPDATE customer_users SET customer_id = ?
             WHERE customer_id = ?
               AND LOWER(email) NOT IN (SELECT LOWER(email) FROM customer_users WHERE customer_id = ?)"
        )->execute([$targetId, $sourceId, $targetId]);
        $pdo->prepare('DELETE FROM customer_users WHERE customer_id = ?')->execute([$sourceId]);
        $pdo->prepare('UPDATE users SET assigned_customer_id = ? WHERE assigned_customer_id = ?')->execute([$targetId, $sourceId]);
        $pdo->prepare("UPDATE customers SET deleted_at = NOW() WHERE id = ?")->execute([$sourceId]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    send_to_trash('customer', $sourceId, $names[$sourceId], $user['id'], $reason . ' (merged into ' . $names[$targetId] . ')');

    json_out([
        'ok' => true,
        'message' => "\"{$names[$sourceId]}\" has been merged into \"{$names[$targetId]}\". All machines, invoices and reports moved successfully.",
    ]);
}

json_error('Unknown request', 404);
