<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/../config/mailer.php';

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// POST /api/auth/forgot-password  { email }
// Sends a 6-digit verification code to the account's email, valid for 10
// minutes. Always responds the same way whether or not the email exists,
// so this cannot be used to discover which emails have BELM accounts.
if ($action === 'forgot-password' && $method === 'POST') {
    $b = body();
    $email = strtolower(trim((string)($b['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_error('Enter the email address used for your BELM account.');
    }

    $accountType = null;
    $stmt = db()->prepare('SELECT id FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL AND is_active = 1');
    $stmt->execute([$email]);
    if ($stmt->fetch()) $accountType = 'staff';

    if (!$accountType) {
        $stmt = db()->prepare('SELECT id FROM customers WHERE LOWER(email) = ? AND deleted_at IS NULL AND is_active = 1');
        $stmt->execute([$email]);
        if ($stmt->fetch()) $accountType = 'customer';
    }

    if (!$accountType) {
        $stmt = db()->prepare('SELECT id FROM customer_users WHERE LOWER(email) = ? AND is_active = 1');
        $stmt->execute([$email]);
        if ($stmt->fetch()) $accountType = 'customer-assistant';
    }

    // Same response either way — do not reveal whether the email exists.
    $genericResponse = ['ok' => true, 'message' => "If $email has a BELM account, a verification code has been sent to it."];

    if (!$accountType) json_out($genericResponse);

    db()->prepare('DELETE FROM password_reset_codes WHERE LOWER(email) = ?')->execute([$email]);

    $code = (string)random_int(100000, 999999);
    db()->prepare(
        'INSERT INTO password_reset_codes (id, email, code_hash, account_type, expires_at, created_at)
         VALUES (?,?,?,?, NOW() + INTERVAL \'10 minutes\', NOW())'
    )->execute([uuid(), $email, password_hash($code, PASSWORD_BCRYPT), $accountType]);

    try {
        send_email(
            $email,
            'Your BELM Portal verification code',
            "Your BELM Portal password reset code is: $code\n\nThis code expires in 10 minutes. If you did not request this, ignore this email — your password will not change."
        );
    } catch (Throwable $error) {
        error_log('BELM mail error: ' . $error->getMessage());
        json_error('Could not send the verification email right now. Please try again shortly or contact your administrator.', 500);
    }

    json_out($genericResponse);
}

// POST /api/auth/reset-with-code  { email, code, newPassword }
// Verifies the 6-digit code and sets a new password. Max 5 attempts per code.
if ($action === 'reset-with-code' && $method === 'POST') {
    $b = body();
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $code = trim((string)($b['code'] ?? ''));
    $newPassword = (string)($b['newPassword'] ?? '');

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid email address.');
    if ($code === '') json_error('Enter the verification code sent to your email.');
    if (strlen($newPassword) < 8) json_error('New password must contain at least 8 characters.');

    $stmt = db()->prepare(
        'SELECT * FROM password_reset_codes WHERE LOWER(email) = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1'
    );
    $stmt->execute([$email]);
    $entry = $stmt->fetch();
    if (!$entry) json_error('That code has expired or was not found. Request a new one.', 400);

    if ((int)$entry['attempts'] >= 5) {
        db()->prepare('DELETE FROM password_reset_codes WHERE id = ?')->execute([$entry['id']]);
        json_error('Too many incorrect attempts. Request a new code.', 429);
    }

    if (!password_verify($code, $entry['code_hash'])) {
        db()->prepare('UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = ?')->execute([$entry['id']]);
        json_error('Incorrect verification code.', 400);
    }

    $newHash = password_hash($newPassword, PASSWORD_BCRYPT);
    $accountType = $entry['account_type'];

    if ($accountType === 'staff') {
        db()->prepare('UPDATE users SET password_hash = ? WHERE LOWER(email) = ?')->execute([$newHash, $email]);
    } elseif ($accountType === 'customer') {
        db()->prepare('UPDATE customers SET password = ? WHERE LOWER(email) = ?')->execute([$newHash, $email]);
    } elseif ($accountType === 'customer-assistant') {
        db()->prepare('UPDATE customer_users SET password = ? WHERE LOWER(email) = ?')->execute([$newHash, $email]);
    } else {
        json_error('Unknown account type.', 500);
    }

    db()->prepare('DELETE FROM password_reset_codes WHERE id = ?')->execute([$entry['id']]);

    json_out(['ok' => true, 'message' => 'Password reset successfully. You can now log in with your new password.']);
}

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

    assert_not_rate_limited('recovery-code', $email, 8, 15);

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
        record_failed_attempt('recovery-code', $email);
        json_error('Email or recovery code is incorrect. Ask the account administrator for a new recovery code.', 401);
    }
    clear_rate_limit('recovery-code', $email);

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

// POST /api/auth/unified-login
// One secure entry point for administrators, Technicians, customers and
// customer assistants. The verified account type determines the destination.
if ($action === 'unified-login' && $method === 'POST') {
    $b = body();
    $rawLoginId = trim((string)($b['email'] ?? $b['loginId'] ?? $b['portalLink'] ?? ''));
    $password = (string)($b['password'] ?? '');

    if ($rawLoginId === '' || $password === '') {
        json_error('Enter your email or Customer Portal ID and password.');
    }

    assert_not_rate_limited('unified-login', $rawLoginId, 10, 15);

    // Staff accounts use an email address. Technician accounts are staff
    // accounts with a required customer assignment.
    if (filter_var($rawLoginId, FILTER_VALIDATE_EMAIL)) {
        $stmt = db()->prepare(
            'SELECT u.*, r.name AS role_name, r.allowed_pages,
                    c.name AS assigned_customer_name,
                    c.is_machinery_admin AS assigned_customer_self_service
             FROM users u
             JOIN roles r ON r.id = u.role_id
             LEFT JOIN customers c ON c.id = u.assigned_customer_id
                  AND c.deleted_at IS NULL AND c.is_active = 1
             WHERE LOWER(u.email) = LOWER(?)
               AND u.deleted_at IS NULL AND u.is_active = 1'
        );
        $stmt->execute([$rawLoginId]);
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password_hash'])) {
            if ($user['role_name'] === 'Technician') {
                if (!$user['assigned_customer_id']) {
                    json_error('This Technician account has not been assigned to a customer. Contact the administrator.', 403);
                }
                if (!$user['assigned_customer_name']) {
                    json_error('The customer assigned to this Technician account is not available.', 403);
                }
                if (!empty($user['is_customer_managed']) && empty($user['assigned_customer_self_service'])) {
                    json_error('BELM Service Provider is active for this customer. Customer Technician access is paused while BELM handles maintenance. Other customer portal roles remain active.', 403);
                }
            }

            $allowedPages = merged_allowed_pages_for_user($user['id'], $user['role_name'], $user['allowed_pages']);
            $token = jwt_encode([
                'type' => 'staff',
                'id' => $user['id'],
                'email' => $user['email'],
                'name' => $user['name'],
                'roleId' => $user['role_id'],
                'roleName' => $user['role_name'],
                'allowedPages' => $allowedPages,
                'assignedCustomerId' => $user['assigned_customer_id'],
                'isCustomerManaged' => !empty($user['is_customer_managed']),
            ]);

            try {
                db()->prepare('INSERT INTO activity_logs (id, user_id, action, created_at) VALUES (?,?,?,NOW())')
                    ->execute([uuid(), $user['id'], 'LOGIN']);
            } catch (Throwable $e) {}

            $isTechnician = $user['role_name'] === 'Technician';
            clear_rate_limit('unified-login', $rawLoginId);
            json_out([
                'token' => $token,
                'accountType' => $isTechnician ? 'technician' : 'admin',
                'destination' => $isTechnician ? '/tech' : '/overview-manager/',
                'user' => [
                    'id' => $user['id'],
                    'name' => $user['name'],
                    'email' => $user['email'],
                    'role' => $user['role_name'],
                    'allowedPages' => $allowedPages,
                    'assignedCustomerId' => $user['assigned_customer_id'],
                    'assignedCustomerName' => $user['assigned_customer_name'],
                    'isCustomerManaged' => !empty($user['is_customer_managed']),
                ],
            ]);
        }
    }

    // Customers may enter either their email, Portal ID, or a full generated
    // portal URL. Customer assistants use their own email and password.
    $loginId = strtolower($rawLoginId);
    $portalId = $rawLoginId;
    if (filter_var($rawLoginId, FILTER_VALIDATE_URL)) {
        $query = [];
        parse_str(parse_url($rawLoginId, PHP_URL_QUERY) ?: '', $query);
        $portalId = trim((string)($query['customer'] ?? ''));
    }

    $stmt = db()->prepare(
        'SELECT * FROM customers
         WHERE (LOWER(email) = ? OR portal_link = ?)
           AND deleted_at IS NULL AND is_active = 1'
    );
    $stmt->execute([$loginId, $portalId]);
    $customer = $stmt->fetch();
    $loggedInAs = null;
    $actorType = null;
    $actorId = null;
    $customerRole = null;
    $permissions = null;

    if ($customer && password_verify($password, $customer['password'])) {
        $loggedInAs = $customer['name'];
        $actorType = 'owner';
        $actorId = $customer['id'];
        $customerRole = 'owner';
    } else {
        $customer = null;
        if (filter_var($rawLoginId, FILTER_VALIDATE_EMAIL)) {
            $stmt = db()->prepare(
                'SELECT cu.*, c.name AS customer_name, c.portal_link
                 FROM customer_users cu
                 JOIN customers c ON c.id = cu.customer_id
                 WHERE LOWER(cu.email) = ? AND cu.is_active = 1
                   AND c.deleted_at IS NULL AND c.is_active = 1'
            );
            $stmt->execute([$loginId]);
            $subUser = $stmt->fetch();
            if ($subUser && password_verify($password, $subUser['password'])) {
                $stmt = db()->prepare(
                    'SELECT * FROM customers
                     WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
                );
                $stmt->execute([$subUser['customer_id']]);
                $customer = $stmt->fetch();
                $loggedInAs = $subUser['name'];
                $actorType = 'assistant';
                $actorId = $subUser['id'];
                $customerRole = $subUser['role'];
                $permissions = $subUser['permissions'] ? json_decode($subUser['permissions'], true) : null;
            }
        }
    }

    if (!$customer) {
        record_failed_attempt('unified-login', $rawLoginId);
        json_error('Email, Customer Portal ID or password is incorrect.', 401);
    }

    clear_rate_limit('unified-login', $rawLoginId);
    $token = jwt_encode([
        'type' => 'customer',
        'id' => $customer['id'],
        'name' => $customer['name'],
        'portalLink' => $customer['portal_link'],
        'actorType' => $actorType,
        'actorId' => $actorId,
        'actorName' => $loggedInAs,
        'customerRole' => $customerRole,
        'permissions' => $permissions,
    ], 30 * 24 * 3600);

    json_out([
        'token' => $token,
        'accountType' => 'customer',
        'destination' => '/portal/dashboard',
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

// POST /api/auth.php?action=login  { email, password }
if ($action === 'login' && $method === 'POST') {
    $b = body();
    $email = trim($b['email'] ?? '');
    $password = $b['password'] ?? '';

    assert_not_rate_limited('staff-login', $email, 10, 15);

    $stmt = db()->prepare(
        'SELECT u.*, r.name AS role_name, r.allowed_pages,
                c.name AS assigned_customer_name,
                c.is_machinery_admin AS assigned_customer_self_service
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN customers c ON c.id = u.assigned_customer_id
              AND c.deleted_at IS NULL AND c.is_active = 1
         WHERE LOWER(u.email) = LOWER(?) AND u.deleted_at IS NULL AND u.is_active = 1'
    );
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        record_failed_attempt('staff-login', $email);
        json_error('Invalid email or password', 401);
    }
    clear_rate_limit('staff-login', $email);

    if ($user['role_name'] === 'Technician') {
        if (!$user['assigned_customer_id']) {
            json_error('This Technician account has not been assigned to a customer. Contact the administrator.', 403);
        }
        if (!$user['assigned_customer_name']) {
            json_error('The customer assigned to this Technician account is not available.', 403);
        }
        if (!empty($user['is_customer_managed']) && empty($user['assigned_customer_self_service'])) {
            json_error('BELM Service Provider is active for this customer. Customer Technician access is paused while BELM handles maintenance. Other customer portal roles remain active.', 403);
        }
    }

    $allowedPages = merged_allowed_pages_for_user($user['id'], $user['role_name'], $user['allowed_pages']);

    $token = jwt_encode([
        'type' => 'staff',
        'id' => $user['id'],
        'email' => $user['email'],
        'name' => $user['name'],
        'roleId' => $user['role_id'],
        'roleName' => $user['role_name'],
        'allowedPages' => $allowedPages,
        'assignedCustomerId' => $user['assigned_customer_id'],
        'isCustomerManaged' => !empty($user['is_customer_managed']),
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
            'isCustomerManaged' => !empty($user['is_customer_managed']),
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

    assert_not_rate_limited('customer-login', $rawLoginId, 10, 15);

    $stmt = db()->prepare('SELECT * FROM customers WHERE (LOWER(email) = ? OR portal_link = ?) AND deleted_at IS NULL');
    $stmt->execute([$loginId, $portalId]);
    $customer = $stmt->fetch();
    $loggedInAs = null;

    $actorType = null;
    $actorId = null;
    $customerRole = null;
    $permissions = null;

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
            $permissions = $subUser['permissions'] ? json_decode($subUser['permissions'], true) : null;
        }
    }

    if (!$customer || !$customer['is_active']) {
        record_failed_attempt('customer-login', $rawLoginId);
        json_error('Invalid credentials', 401);
    }
    clear_rate_limit('customer-login', $rawLoginId);

    $token = jwt_encode([
        'type' => 'customer',
        'id' => $customer['id'],
        'name' => $customer['name'],
        'portalLink' => $customer['portal_link'],
        'actorType' => $actorType,
        'actorId' => $actorId,
        'actorName' => $loggedInAs,
        'customerRole' => $customerRole,
        'permissions' => $permissions,
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
