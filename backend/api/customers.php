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
        $stmt = db()->prepare('SELECT id, name FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
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
        ? 'SELECT id, name FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
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
            'portalLink' => customer_portal_url($portalLink),
            'portalId' => $portalLink,
            'portalUrl' => customer_portal_url($portalLink),
            'temporaryPassword' => $tempPassword,
            'recoveryCode' => $recoveryCode,
        ],
    ], 201);
}

if ($method === 'PUT' && $action === 'reset-password') {
    require_page_access($user, 'customers');
    $temporaryPassword = secure_account_secret();
    $recoveryCode = account_recovery_code();
    $stmt = db()->prepare(
        'UPDATE customers
         SET password = ?, recovery_code_hash = ?
         WHERE id = ? AND deleted_at IS NULL'
    );
    $stmt->execute([
        password_hash($temporaryPassword, PASSWORD_BCRYPT),
        password_hash($recoveryCode, PASSWORD_BCRYPT),
        $id,
    ]);
    if ($stmt->rowCount() === 0) json_error('Customer not found.', 404);
    json_out([
        'temporaryPassword' => $temporaryPassword,
        'recoveryCode' => $recoveryCode,
    ]);
}

// ---- Update customer --------------------------------------------------------
if ($method === 'PUT' && !$action) {
    require_page_access($user, 'customers');
    $b = body();
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

// ---- Delete (soft, -> Recycle Bin) -----------------------------------------
if ($method === 'DELETE' && !$action) {
    require_page_access($user, 'customers');
    $stmt = db()->prepare('SELECT name FROM customers WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    send_to_trash('customer', $id, $row['name'], $user['id']);
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
    db()->prepare('INSERT INTO machines (id, customer_id, machine_type, model, serial_number, reg_number, brand, service_kit, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,NOW())')
        ->execute([
            $newId,
            $id,
            $machine['machineType'],
            $machine['model'],
            $machine['serialNumber'],
            $machine['regNumber'],
            $machine['brand'],
            $machine['serviceKit'],
            'NOT_CHECKED',
        ]);
    json_out(['id' => $newId], 201);
}

if ($method === 'PUT' && $action === 'edit-machine') {
    require_page_access($user, 'customers');
    $b = body();
    $stmt = db()->prepare('SELECT 1 FROM machines WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$_GET['machineId']]);
    if (!$stmt->fetch()) json_error('Machine not found.', 404);
    $machine = normalized_machine_details($b);
    db()->prepare('UPDATE machines SET machine_type=?, model=?, serial_number=?, reg_number=?, brand=?, service_kit=? WHERE id=?')
        ->execute([
            $machine['machineType'],
            $machine['model'],
            $machine['serialNumber'],
            $machine['regNumber'],
            $machine['brand'],
            $machine['serviceKit'],
            $_GET['machineId'],
        ]);
    json_out(['ok' => true]);
}

if ($method === 'DELETE' && $action === 'delete-machine') {
    require_page_access($user, 'customers');
    $machineId = $_GET['machineId'];
    $stmt = db()->prepare('SELECT model FROM machines WHERE id = ?');
    $stmt->execute([$machineId]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    send_to_trash('machine', $machineId, $row['model'], $user['id']);
    soft_delete('machines', $machineId);
    json_out(null, 204);
}

// ---- Helpers ------------------------------------------------------------
function fetch_machines(string $customerId): array {
    $stmt = db()->prepare('SELECT * FROM machines WHERE customer_id = ? AND deleted_at IS NULL ORDER BY created_at ASC');
    $stmt->execute([$customerId]);
    return $stmt->fetchAll();
}
function fetch_customer_users(string $customerId): array {
    $stmt = db()->prepare('SELECT id, name, email, phone, role, is_active, created_at FROM customer_users WHERE customer_id = ?');
    $stmt->execute([$customerId]);
    return $stmt->fetchAll();
}

json_error('Unknown request', 404);
