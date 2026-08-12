<?php
require_once __DIR__ . '/../config/helpers.php';

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
        $pdo->prepare("DELETE FROM machine_operators WHERE machine_id IN ($in)")->execute($machines);
        $pdo->prepare("DELETE FROM operator_reports WHERE machine_id IN ($in)")->execute($machines);
    }

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

// ---- List / search ----------------------------------------------------
if ($method === 'GET' && !$action) {
    require_customer_read_access($user);
    $q = $_GET['q'] ?? '';
    $assigned = ($user['roleName'] ?? '') === 'Technician'
        ? ($user['assignedCustomerId'] ?? null)
        : null;
    if (($user['roleName'] ?? '') === 'Technician') {
        $stmt = db()->prepare(
            'SELECT id, name, email, phone, address, tin_number, vrn, is_active
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
        if (($user['roleName'] ?? '') !== 'Technician') {
            $c['users'] = fetch_customer_users($c['id']);
        }
    }
    json_out($customers);
}

// ---- Get one ------------------------------------------------------------
if ($method === 'GET' && $action === 'one') {
    require_customer_read_access($user, $id);
    $sql = ($user['roleName'] ?? '') === 'Technician'
        ? 'SELECT id, name, email, phone, address, tin_number, vrn, is_active
           FROM customers
           WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
        : 'SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL';
    $stmt = db()->prepare($sql);
    $stmt->execute([$id]);
    $customer = $stmt->fetch();
    if (!$customer) json_error('Not found', 404);
    $customer['machines'] = fetch_machines($customer['id']);
    if (($user['roleName'] ?? '') !== 'Technician') {
        $customer['users'] = fetch_customer_users($customer['id']);
    }
    json_out($customer);
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
    json_out([
        'temporaryPassword' => $temporaryPassword,
        'recoveryCode' => $recoveryCode,
        'loginUrl' => customer_portal_url($resetCustomer['portal_link'], $resetCustomer['email']),
    ]);
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
    json_out([
        'ok' => true,
        'portalLink' => $portalLink,
        'portalUrl' => customer_portal_url($portalLink),
    ]);
}

// ---- Delete (soft, -> Recycle Bin, OR permanent "Forget") ------------------
if ($method === 'DELETE' && !$action) {
    require_page_access($user, 'customers');
    $stmt = db()->prepare('SELECT name FROM customers WHERE id = ?');
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
        json_out(['ok' => true, 'message' => "\"{$row['name']}\" has been permanently forgotten — it will not appear in the Recycle Bin and cannot be restored."]);
    }

    send_to_trash('customer', $id, $row['name'], $user['id'], $reason);
    soft_delete('customers', $id);
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
    json_out(['id' => $newId], 201);
}

const MACHINE_OPERATIONAL_STATUSES = ['NORMAL', 'SERVICE_IN_PROGRESS', 'CHECKUP_IN_PROGRESS', 'MAINTENANCE_IN_PROGRESS', 'GROUNDED'];

// Quick activity-status flip for BELM Admin, Engineer or Technician —
// deliberately lighter than edit-machine (no Edit PIN) since this is
// meant to be updated in the moment work starts/stops, not a formal
// record edit. Requires only normal page access to the customer/machine.
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
