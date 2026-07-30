<?php
require_once __DIR__ . '/../config/helpers.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// POST /api/auth/recover
// Self-service password recovery for staff, customers and customer assistants.
// The recovery code is issued once with the account credentials and is rotated
// after every successful reset.
if ($action === 'recover' && $method === 'POST') {
    $b = body();
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $recoveryCode = strtoupper(trim((string)($b['recoveryCode'] ?? '')));
    $newPassword = (string)($b['newPassword'] ?? '');

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_error('Enter the email address used for your BELM account.');
    }
    if ($recoveryCode === '') json_error('Enter your BELM recovery code.');
    if (strlen($newPassword) < 8) {
        json_error('New password must contain at least 8 characters.');
    }

    $account = null;
    $accountType = null;

    $stmt = db()->prepare(
        'SELECT id, recovery_code_hash
         FROM users
         WHERE LOWER(email) = ? AND deleted_at IS NULL AND is_active = 1'
    );
    $stmt->execute([$email]);
    if ($row = $stmt->fetch()) {
        $account = $row;
        $accountType = 'staff';
    }

    if (!$account) {
        $stmt = db()->prepare(
            'SELECT id, recovery_code_hash
             FROM customers
             WHERE LOWER(email) = ? AND deleted_at IS NULL AND is_active = 1'
        );
        $stmt->execute([$email]);
        if ($row = $stmt->fetch()) {
            $account = $row;
            $accountType = 'customer';
        }
    }

    if (!$account) {
        $stmt = db()->prepare(
            'SELECT cu.id, cu.recovery_code_hash
             FROM customer_users cu
             JOIN customers c ON c.id = cu.customer_id
             WHERE LOWER(cu.email) = ? AND cu.is_active = 1
               AND c.deleted_at IS NULL AND c.is_active = 1'
        );
        $stmt->execute([$email]);
        if ($row = $stmt->fetch()) {
            $account = $row;
            $accountType = 'assistant';
        }
    }

    if (
        !$account
        || !$account['recovery_code_hash']
        || !password_verify($recoveryCode, $account['recovery_code_hash'])
    ) {
        json_error('Email or recovery code is incorrect. Ask the account administrator for a new recovery code.', 401);
    }

    $nextRecoveryCode = account_recovery_code();
    $passwordHash = password_hash($newPassword, PASSWORD_BCRYPT);
    $recoveryHash = password_hash($nextRecoveryCode, PASSWORD_BCRYPT);

    if ($accountType === 'staff') {
        db()->prepare(
            'UPDATE users SET password_hash = ?, recovery_code_hash = ? WHERE id = ?'
        )->execute([$passwordHash, $recoveryHash, $account['id']]);
    } elseif ($accountType === 'customer') {
        db()->prepare(
            'UPDATE customers SET password = ?, recovery_code_hash = ? WHERE id = ?'
        )->execute([$passwordHash, $recoveryHash, $account['id']]);
    } else {
        db()->prepare(
            'UPDATE customer_users SET password = ?, recovery_code_hash = ? WHERE id = ?'
        )->execute([$passwordHash, $recoveryHash, $account['id']]);
    }

    json_out([
        'ok' => true,
        'message' => 'Password changed successfully. Save the new recovery code.',
        'newRecoveryCode' => $nextRecoveryCode,
    ]);
}

// POST /api/auth.php?action=login  { email, password }
if ($action === 'login' && $method === 'POST') {
    $b = body();
    $email = trim($b['email'] ?? '');
    $password = $b['password'] ?? '';

    $stmt = db()->prepare(
        'SELECT u.*, r.name AS role_name, r.allowed_pages,
                c.name AS assigned_customer_name
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN customers c ON c.id = u.assigned_customer_id
              AND c.deleted_at IS NULL AND c.is_active = 1
         WHERE LOWER(u.email) = LOWER(?) AND u.deleted_at IS NULL AND u.is_active = 1'
    );
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        json_error('Invalid email or password', 401);
    }

    if ($user['role_name'] === 'Technician') {
        if (!$user['assigned_customer_id']) {
            json_error('This Technician account has not been assigned to a customer. Contact the administrator.', 403);
        }
        if (!$user['assigned_customer_name']) {
            json_error('The customer assigned to this Technician account is not available.', 403);
        }
    }

    $allowedPages = $user['role_name'] === 'Super Admin' ? null : json_decode($user['allowed_pages'] ?? '[]', true);

    $token = jwt_encode([
        'type' => 'staff',
        'id' => $user['id'],
        'email' => $user['email'],
        'name' => $user['name'],
        'roleId' => $user['role_id'],
        'roleName' => $user['role_name'],
        'allowedPages' => $allowedPages,
        'assignedCustomerId' => $user['assigned_customer_id'],
    ]);

    // Log the login (best-effort — don't fail login if this errors)
    try {
        db()->prepare('INSERT INTO activity_logs (id, user_id, action, created_at) VALUES (?,?,?,NOW())')
            ->execute([uuid(), $user['id'], 'LOGIN']);
    } catch (Throwable $e) {}

    json_out([
        'token' => $token,
        'user' => [
            'id' => $user['id'], 'name' => $user['name'], 'email' => $user['email'],
            'role' => $user['role_name'], 'allowedPages' => $allowedPages,
            'assignedCustomerId' => $user['assigned_customer_id'],
            'assignedCustomerName' => $user['assigned_customer_name'],
        ],
    ]);
}

// POST /api/auth.php?action=customer-login  { email or portalLink, password }
if ($action === 'customer-login' && $method === 'POST') {
    $b = body();
    $rawLoginId = trim((string)($b['email'] ?? $b['portalLink'] ?? ''));
    $loginId = strtolower($rawLoginId);
    $portalId = $rawLoginId;
    if (filter_var($rawLoginId, FILTER_VALIDATE_URL)) {
        $query = [];
        parse_str(parse_url($rawLoginId, PHP_URL_QUERY) ?: '', $query);
        $portalId = trim((string)($query['customer'] ?? ''));
    }
    $password = $b['password'] ?? '';

    $stmt = db()->prepare('SELECT * FROM customers WHERE (LOWER(email) = ? OR portal_link = ?) AND deleted_at IS NULL');
    $stmt->execute([$loginId, $portalId]);
    $customer = $stmt->fetch();
    $loggedInAs = null;

    $actorType = null;
    $actorId = null;
    $customerRole = null;

    if ($customer && password_verify($password, $customer['password'])) {
        $loggedInAs = $customer['name'];
        $actorType = 'owner';
        $actorId = $customer['id'];
        $customerRole = 'owner';
    } else {
        $customer = null;
        // Try a sub-user (CustomerUser) — their own email + password.
        $stmt = db()->prepare('SELECT * FROM customer_users WHERE LOWER(email) = ? AND is_active = 1');
        $stmt->execute([$loginId]);
        $subUser = $stmt->fetch();
        if ($subUser && password_verify($password, $subUser['password'])) {
            $stmt = db()->prepare('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL');
            $stmt->execute([$subUser['customer_id']]);
            $customer = $stmt->fetch();
            $loggedInAs = $subUser['name'];
            $actorType = 'assistant';
            $actorId = $subUser['id'];
            $customerRole = $subUser['role'];
        }
    }

    if (!$customer || !$customer['is_active']) json_error('Invalid credentials', 401);

    $token = jwt_encode([
        'type' => 'customer',
        'id' => $customer['id'],
        'name' => $customer['name'],
        'portalLink' => $customer['portal_link'],
        'actorType' => $actorType,
        'actorId' => $actorId,
        'actorName' => $loggedInAs,
        'customerRole' => $customerRole,
    ], 30 * 24 * 3600);

    json_out([
        'token' => $token,
        'customer' => [
            'id' => $customer['id'],
            'name' => $customer['name'],
            'loggedInAs' => $loggedInAs,
            'actorType' => $actorType,
            'role' => $customerRole,
            'canManageAssistants' => $actorType === 'owner',
        ],
    ]);
}

json_error('Unknown auth action', 404);
