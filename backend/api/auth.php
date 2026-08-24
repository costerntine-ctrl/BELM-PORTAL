<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/../config/mailer.php';

// V349: verify the stored credential without ever changing the user's
// plaintext password. Successful logins transparently re-hash older bcrypt
// hashes using the current policy, so legacy accounts become stronger without
// forcing a password reset or breaking a password that already works.
function verify_portal_password(string $plainPassword, ?string $storedHash, string $accountType, string $accountId): bool {
    $storedHash = (string)$storedHash;
    if ($storedHash === '' || !password_verify($plainPassword, $storedHash)) return false;

    if (password_needs_rehash($storedHash, PASSWORD_BCRYPT, ['cost' => 12])) {
        $freshHash = password_hash($plainPassword, PASSWORD_BCRYPT, ['cost' => 12]);
        try {
            if ($accountType === 'staff') {
                db()->prepare('UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?')
                    ->execute([$freshHash, $accountId, $storedHash]);
            } elseif ($accountType === 'customer') {
                db()->prepare('UPDATE customers SET password = ? WHERE id = ? AND password = ?')
                    ->execute([$freshHash, $accountId, $storedHash]);
            } elseif ($accountType === 'assistant') {
                db()->prepare('UPDATE customer_users SET password = ? WHERE id = ? AND password = ?')
                    ->execute([$freshHash, $accountId, $storedHash]);
            }
        } catch (Throwable $ignored) {
            // A re-hash is maintenance only. A correct password must still be
            // allowed even if the optional hash upgrade cannot be persisted.
        }
    }
    return true;
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// V299: rolling authenticated sessions. A valid session can be renewed without
// asking the user to log in again. Every refresh re-checks the live account in
// the database, so disabled/deleted accounts still stop immediately.
if ($action === 'refresh' && $method === 'POST') {
    $current = current_token_payload();
    if (!$current) json_error('Session expired. Please sign in again.', 401);

    $type = (string)($current['type'] ?? '');
    $freshPayload = null;

    if ($type === 'staff') {
        $stmt = db()->prepare(
            "SELECT u.id, u.name, u.email, u.assigned_customer_id, u.is_customer_managed,
                    r.id AS role_id, r.name AS role_name, r.allowed_pages,
                    c.name AS assigned_customer_name, c.portal_link AS assigned_customer_portal_link,
                    c.deleted_at AS customer_deleted_at, c.is_active AS customer_active
             FROM users u
             JOIN roles r ON r.id = u.role_id
             LEFT JOIN customers c ON c.id = u.assigned_customer_id
             WHERE u.id = ? AND u.deleted_at IS NULL AND u.is_active = 1"
        );
        $stmt->execute([(string)($current['id'] ?? '')]);
        $user = $stmt->fetch();
        if (!$user) json_error('This staff account is no longer active.', 401);

        if ($user['role_name'] === 'Technician' && $user['assigned_customer_id']) {
            if (!$user['assigned_customer_name'] || $user['customer_deleted_at'] !== null || empty($user['customer_active'])) {
                json_error('The customer assigned to this Technician account is no longer available.', 401);
            }
        }

        $allowedPages = merged_allowed_pages_for_user($user['id'], $user['role_name'], $user['allowed_pages']);
        $freshPayload = [
            'type' => 'staff',
            'id' => $user['id'],
            'email' => $user['email'],
            'name' => $user['name'],
            'roleId' => $user['role_id'],
            'roleName' => $user['role_name'],
            'allowedPages' => $allowedPages,
            'assignedCustomerId' => $user['assigned_customer_id'],
            'assignedCustomerPortalLink' => $user['assigned_customer_portal_link'] ?? null,
            'isCustomerManaged' => !empty($user['is_customer_managed']),
        ];
    } elseif ($type === 'customer') {
        $customerId = (string)($current['id'] ?? '');
        $stmt = db()->prepare(
            'SELECT id, name, email, portal_link FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
        );
        $stmt->execute([$customerId]);
        $customer = $stmt->fetch();
        if (!$customer) json_error('Customer account is no longer active.', 401);

        $actorType = (string)($current['actorType'] ?? 'owner');
        $actorId = $current['actorId'] ?? null;
        $actorName = $current['actorName'] ?? $customer['name'];
        $customerRole = $current['customerRole'] ?? 'owner';
        $permissions = $current['permissions'] ?? null;

        if ($actorType === 'assistant') {
            $stmt = db()->prepare(
                'SELECT id, name, email, role, permissions FROM customer_users WHERE id = ? AND customer_id = ? AND is_active = 1'
            );
            $stmt->execute([(string)$actorId, $customerId]);
            $assistant = $stmt->fetch();
            if (!$assistant) json_error('This customer user is no longer active.', 401);
            $actorId = $assistant['id'];
            $actorName = $assistant['name'];
            $customerRole = $assistant['role'];
            $permissions = $assistant['permissions'] !== null
                ? (json_decode((string)$assistant['permissions'], true) ?: [])
                : null;
        } else {
            $actorType = 'owner';
            $actorId = null;
            $actorName = $customer['name'];
            $customerRole = 'owner';
            $permissions = null;
        }

        $freshPayload = [
            'type' => 'customer',
            'id' => $customer['id'],
            'name' => $customer['name'],
            'portalLink' => $customer['portal_link'],
            'actorType' => $actorType,
            'actorId' => $actorId,
            'actorName' => $actorName,
            'customerRole' => $customerRole,
            'permissions' => $permissions,
        ];
    } elseif ($type === 'operator') {
        $stmt = db()->prepare(
            'SELECT o.id, o.name, o.customer_id, o.machine_id
             FROM machine_operators o
             JOIN machines m ON m.id = o.machine_id
             JOIN customers c ON c.id = o.customer_id
             WHERE o.id = ? AND m.id = ?
               AND m.deleted_at IS NULL AND c.deleted_at IS NULL AND c.is_active = 1'
        );
        $stmt->execute([(string)($current['id'] ?? ''), (string)($current['machineId'] ?? '')]);
        $operator = $stmt->fetch();
        if (!$operator) json_error('This Operator session is no longer active.', 401);
        $freshPayload = [
            'type' => 'operator',
            'id' => $operator['id'],
            'name' => $operator['name'],
            'machineId' => $operator['machine_id'],
            'customerId' => $operator['customer_id'],
        ];
    } else {
        json_error('Session type is not supported.', 401);
    }

    json_out([
        'ok' => true,
        'token' => jwt_encode($freshPayload, 30 * 24 * 3600),
        'expiresIn' => 30 * 24 * 3600,
    ]);
}

// GET /api/auth/customer-context?customer=company-slug
// Public, minimal context used only to brand the friendly /app/{customer} login.
if ($action === 'customer-context' && $method === 'GET') {
    $slug = strtolower(trim((string)($_GET['customer'] ?? '')));
    if ($slug === '' || !preg_match('/^[a-z0-9][a-z0-9-]{0,35}$/', $slug)) {
        json_error('Customer app link is invalid.', 404);
    }
    $stmt = db()->prepare('SELECT name, portal_link FROM customers WHERE portal_link = ? AND deleted_at IS NULL AND is_active = 1');
    $stmt->execute([$slug]);
    $row = $stmt->fetch();
    if (!$row) json_error('Customer app link was not found.', 404);
    json_out([
        'name' => $row['name'],
        'slug' => $row['portal_link'],
        'appUrl' => customer_portal_url($row['portal_link']),
    ]);
}

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

    // Limit reset-email generation whether or not the address exists, so this
    // endpoint cannot be used to spam a known BELM user or probe at high rate.
    assert_not_rate_limited('forgot-password', $email, 5, 15);
    record_failed_attempt('forgot-password', $email);

    $accountType = null;
    $accountId = null;
    // The unified login requires one globally unique active portal email. New
    // account creation already enforces that rule; for legacy data, refuse to
    // guess if the same email still belongs to more than one active account.
    $stmt = db()->prepare(
        "SELECT account_type,account_id FROM (
            SELECT 'staff' AS account_type,id AS account_id FROM users
             WHERE LOWER(email)=? AND deleted_at IS NULL AND is_active=1
            UNION ALL
            SELECT 'customer' AS account_type,id AS account_id FROM customers
             WHERE LOWER(email)=? AND deleted_at IS NULL AND is_active=1
            UNION ALL
            SELECT 'customer-assistant' AS account_type,cu.id AS account_id
             FROM customer_users cu JOIN customers c ON c.id=cu.customer_id
             WHERE LOWER(cu.email)=? AND cu.is_active=1
               AND c.deleted_at IS NULL AND c.is_active=1
        ) matches LIMIT 2"
    );
    $stmt->execute([$email, $email, $email]);
    $matches = $stmt->fetchAll();
    if (count($matches) === 1) {
        $accountType = (string)$matches[0]['account_type'];
        $accountId = (string)$matches[0]['account_id'];
    }

    // Same response either way — do not reveal whether the email exists or is
    // an ambiguous legacy address.
    $genericResponse = ['ok' => true, 'message' => "If $email has a BELM account, a verification code has been sent to it."];

    if (!$accountType || !$accountId) json_out($genericResponse);

    db()->prepare('DELETE FROM password_reset_codes WHERE LOWER(email) = ?')->execute([$email]);

    $code = (string)random_int(100000, 999999);
    db()->prepare(
        'INSERT INTO password_reset_codes (id, email, code_hash, account_type, account_id, expires_at, created_at)
         VALUES (?,?,?,?,?, NOW() + INTERVAL \'10 minutes\', NOW())'
    )->execute([uuid(), $email, password_hash($code, PASSWORD_BCRYPT), $accountType, $accountId]);

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
    $accountType = (string)$entry['account_type'];
    $accountId = trim((string)($entry['account_id'] ?? ''));
    if ($accountId === '') {
        db()->prepare('DELETE FROM password_reset_codes WHERE id = ?')->execute([$entry['id']]);
        json_error('This reset code was issued by an older portal version. Request a new verification code.', 409);
    }

    if ($accountType === 'staff') {
        $update = db()->prepare('UPDATE users SET password_hash = ? WHERE id = ? AND LOWER(email) = ? AND deleted_at IS NULL AND is_active = 1');
    } elseif ($accountType === 'customer') {
        $update = db()->prepare('UPDATE customers SET password = ? WHERE id = ? AND LOWER(email) = ? AND deleted_at IS NULL AND is_active = 1');
    } elseif ($accountType === 'customer-assistant') {
        $update = db()->prepare('UPDATE customer_users SET password = ? WHERE id = ? AND LOWER(email) = ? AND is_active = 1');
    } else {
        json_error('Unknown account type.', 500);
    }
    $update->execute([$newHash, $accountId, $email]);
    if ($update->rowCount() !== 1) {
        db()->prepare('DELETE FROM password_reset_codes WHERE id = ?')->execute([$entry['id']]);
        json_error('This account is no longer active. Request a new code or contact the administrator.', 409);
    }

    db()->prepare('DELETE FROM password_reset_codes WHERE id = ?')->execute([$entry['id']]);
    clear_unified_login_lockout($email);

    // V444: password reset is anonymous (verified only by the emailed OTP,
    // no logged-in $user), so this writes directly to the matching audit
    // table per account type instead of going through log_activity().
    try {
        if ($accountType === 'staff') {
            db()->prepare('INSERT INTO activity_logs (id, user_id, action, created_at) VALUES (?,?,?,NOW())')
                ->execute([uuid(), $accountId, 'password-reset-via-otp']);
        } elseif ($accountType === 'customer') {
            db()->prepare('INSERT INTO customer_activity_logs (id, customer_id, actor_name, action, created_at) VALUES (?,?,?,?,NOW())')
                ->execute([uuid(), $accountId, 'Customer', 'Password reset via emailed verification code.']);
        } elseif ($accountType === 'customer-assistant') {
            $ownerStmt = db()->prepare('SELECT customer_id, name FROM customer_users WHERE id = ?');
            $ownerStmt->execute([$accountId]);
            $ownerRow = $ownerStmt->fetch();
            if ($ownerRow) {
                db()->prepare('INSERT INTO customer_activity_logs (id, customer_id, actor_name, action, created_at) VALUES (?,?,?,?,NOW())')
                    ->execute([uuid(), $ownerRow['customer_id'], $ownerRow['name'] ?: 'Assistant', 'Password reset via emailed verification code.']);
            }
        }
    } catch (Throwable $ignored) { /* the audit log must never break the actual reset */ }

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
    $candidates = [];

    $stmt = db()->prepare(
        "SELECT 'staff' AS account_type,id,recovery_code_hash FROM users
         WHERE LOWER(email)=? AND deleted_at IS NULL AND is_active=1
         UNION ALL
         SELECT 'customer' AS account_type,id,recovery_code_hash FROM customers
         WHERE LOWER(email)=? AND deleted_at IS NULL AND is_active=1
         UNION ALL
         SELECT 'assistant' AS account_type,cu.id,cu.recovery_code_hash
         FROM customer_users cu JOIN customers c ON c.id=cu.customer_id
         WHERE LOWER(cu.email)=? AND cu.is_active=1
           AND c.deleted_at IS NULL AND c.is_active=1"
    );
    $stmt->execute([$email, $email, $email]);
    foreach ($stmt->fetchAll() as $candidate) {
        if (!empty($candidate['recovery_code_hash'])
            && password_verify($recoveryCode, (string)$candidate['recovery_code_hash'])) {
            $candidates[] = $candidate;
        }
    }
    if (count($candidates) === 1) {
        $account = $candidates[0];
        $accountType = (string)$account['account_type'];
    }

    if (!$account) {
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

    clear_unified_login_lockout($email);

    // V444: same reasoning as reset-with-code above — no logged-in $user
    // here, write directly to the matching audit table per account type.
    try {
        if ($accountType === 'staff') {
            db()->prepare('INSERT INTO activity_logs (id, user_id, action, created_at) VALUES (?,?,?,NOW())')
                ->execute([uuid(), $account['id'], 'password-reset-via-recovery-code']);
        } elseif ($accountType === 'customer') {
            db()->prepare('INSERT INTO customer_activity_logs (id, customer_id, actor_name, action, created_at) VALUES (?,?,?,?,NOW())')
                ->execute([uuid(), $account['id'], 'Customer', 'Password reset via recovery code.']);
        } else {
            $ownerStmt = db()->prepare('SELECT customer_id, name FROM customer_users WHERE id = ?');
            $ownerStmt->execute([$account['id']]);
            $ownerRow = $ownerStmt->fetch();
            if ($ownerRow) {
                db()->prepare('INSERT INTO customer_activity_logs (id, customer_id, actor_name, action, created_at) VALUES (?,?,?,?,NOW())')
                    ->execute([uuid(), $ownerRow['customer_id'], $ownerRow['name'] ?: 'Assistant', 'Password reset via recovery code.']);
            }
        }
    } catch (Throwable $ignored) { /* the audit log must never break the actual reset */ }

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
    $contextSlug = strtolower(trim((string)($b['customerSlug'] ?? $b['customer'] ?? '')));
    $isBelmContext = $contextSlug === 'belm' || (bool)preg_match('/^[a-z0-9][a-z0-9-]{0,24}@belm$/', $contextSlug);
    if ($contextSlug !== '' && !$isBelmContext && !preg_match('/^[a-z0-9][a-z0-9-]{0,35}$/', $contextSlug)) {
        json_error('Customer app link is invalid.', 400);
    }

    if ($rawLoginId === '' || $password === '') {
        json_error('Enter your email or Customer Portal ID and password.');
    }

    assert_not_rate_limited('unified-login', $rawLoginId, 10, 15);

    // V307: one-login must fail closed for legacy duplicate emails. New
    // registrations already enforce global uniqueness, but older databases may
    // contain the same email in staff/customer/assistant tables. Resolve by the
    // password against every active identity and require exactly one match.
    $resolvedEmailIdentity = null;
    $isEmailLogin = filter_var($rawLoginId, FILTER_VALIDATE_EMAIL) !== false;
    if ($isEmailLogin) {
        $identityStmt = db()->prepare(
            "SELECT 'staff' AS account_type,u.id,u.password_hash AS secret
             FROM users u WHERE LOWER(u.email)=LOWER(?) AND u.deleted_at IS NULL AND u.is_active=1
             UNION ALL
             SELECT 'customer' AS account_type,c.id,c.password AS secret
             FROM customers c WHERE LOWER(c.email)=LOWER(?) AND c.deleted_at IS NULL AND c.is_active=1
             UNION ALL
             SELECT 'assistant' AS account_type,cu.id,cu.password AS secret
             FROM customer_users cu JOIN customers c ON c.id=cu.customer_id
             WHERE LOWER(cu.email)=LOWER(?) AND cu.is_active=1
               AND c.deleted_at IS NULL AND c.is_active=1"
        );
        $identityStmt->execute([$rawLoginId,$rawLoginId,$rawLoginId]);
        $identityMatches=[];
        foreach ($identityStmt->fetchAll() as $identity) {
            if (!empty($identity['secret']) && password_verify($password,(string)$identity['secret'])) {
                $identityMatches[]=$identity;
            }
        }
        if (count($identityMatches) > 1) {
            record_failed_attempt('unified-login',$rawLoginId);
            json_error('This legacy email is linked to more than one portal account. Ask the administrator to merge or rename the duplicate account before login.',409);
        }
        if (count($identityMatches) === 1) $resolvedEmailIdentity=$identityMatches[0];
    }

    // Staff accounts use an email address. Technician accounts are staff
    // accounts with a required customer assignment.
    if ($isEmailLogin && ($resolvedEmailIdentity['account_type'] ?? '') === 'staff') {
        $stmt = db()->prepare(
            'SELECT u.*, r.name AS role_name, r.allowed_pages,
                    c.name AS assigned_customer_name,
                    c.portal_link AS assigned_customer_portal_link,
                    c.is_machinery_admin AS assigned_customer_self_service
             FROM users u
             JOIN roles r ON r.id = u.role_id
             LEFT JOIN customers c ON c.id = u.assigned_customer_id
                  AND c.deleted_at IS NULL AND c.is_active = 1
             WHERE u.id = ? AND u.deleted_at IS NULL AND u.is_active = 1'
        );
        $stmt->execute([$resolvedEmailIdentity['id']]);
        $user = $stmt->fetch();

        if ($user && verify_portal_password($password, $user['password_hash'] ?? null, 'staff', (string)$user['id'])) {
            if ($contextSlug !== '' && !$isBelmContext) {
                if ($user['role_name'] !== 'Technician') {
                    json_error('This customer app link is for the customer team. BELM staff should use their @BELM app link.', 403);
                }
                if (strtolower((string)($user['assigned_customer_portal_link'] ?? '')) !== $contextSlug) {
                    json_error('This Technician account is assigned to a different customer.', 403);
                }
            }
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
                'assignedCustomerPortalLink' => $user['assigned_customer_portal_link'] ?? null,
                'isCustomerManaged' => !empty($user['is_customer_managed']),
            ]);

            try {
                db()->prepare('INSERT INTO activity_logs (id, user_id, action, created_at) VALUES (?,?,?,NOW())')
                    ->execute([uuid(), $user['id'], 'LOGIN']);
            } catch (Throwable $e) {}

            $isTechnician = $user['role_name'] === 'Technician';
            $staffRoleLower = strtolower(trim((string)$user['role_name']));
            $staffDestination = $isTechnician ? '/tech'
                : ($staffRoleLower === 'procurement' ? '/belm-workshop/#procurement' : '/overview-manager/');
            clear_rate_limit('unified-login', $rawLoginId);
            json_out([
                'token' => $token,
                'accountType' => $isTechnician ? 'technician' : 'admin',
                'destination' => $staffDestination,
                'user' => [
                    'id' => $user['id'],
                    'name' => $user['name'],
                    'email' => $user['email'],
                    'role' => $user['role_name'],
                    'allowedPages' => $allowedPages,
                    'assignedCustomerId' => $user['assigned_customer_id'],
                    'assignedCustomerName' => $user['assigned_customer_name'],
                    'assignedCustomerPortalLink' => $user['assigned_customer_portal_link'] ?? null,
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
        if ($portalId === '') {
            $path = (string)(parse_url($rawLoginId, PHP_URL_PATH) ?: '');
            if (preg_match('#/app/([a-zA-Z0-9@-]+)/?$#', $path, $match)) $portalId = strtolower($match[1]);
        }
    }

    $customer = null;
    if ($isEmailLogin && ($resolvedEmailIdentity['account_type'] ?? '') === 'customer') {
        $stmt = db()->prepare('SELECT * FROM customers WHERE id=? AND deleted_at IS NULL AND is_active=1');
        $stmt->execute([$resolvedEmailIdentity['id']]);
        $candidateCustomer=$stmt->fetch();
        if ($candidateCustomer && $contextSlug !== '' && !$isBelmContext
            && strtolower((string)$candidateCustomer['portal_link']) !== $contextSlug) {
            json_error('This customer app link belongs to a different company.',403);
        }
        $customer=$candidateCustomer ?: null;
    } elseif (!$isEmailLogin) {
        if ($contextSlug !== '' && !$isBelmContext) {
            $stmt = db()->prepare(
                'SELECT * FROM customers
                 WHERE portal_link = ? AND portal_link = ?
                   AND deleted_at IS NULL AND is_active = 1'
            );
            $stmt->execute([$contextSlug, $portalId]);
        } else {
            $stmt = db()->prepare(
                'SELECT * FROM customers
                 WHERE portal_link = ? AND deleted_at IS NULL AND is_active = 1'
            );
            $stmt->execute([$portalId]);
        }
        $candidateCustomer=$stmt->fetch();
        if ($candidateCustomer && verify_portal_password($password, $candidateCustomer['password'] ?? null, 'customer', (string)$candidateCustomer['id'])) $customer=$candidateCustomer;
    }
    $loggedInAs = null;
    $actorType = null;
    $actorId = null;
    $customerRole = null;
    $permissions = null;

    if ($customer && verify_portal_password($password, $customer['password'] ?? null, 'customer', (string)$customer['id'])) {
        $loggedInAs = $customer['name'];
        $actorType = 'owner';
        $actorId = $customer['id'];
        $customerRole = 'owner';
    } else {
        $customer = null;
        if ($isEmailLogin && ($resolvedEmailIdentity['account_type'] ?? '') === 'assistant') {
            $stmt = db()->prepare(
                'SELECT cu.*,c.name AS customer_name,c.portal_link,c.is_machinery_admin AS customer_self_service
                 FROM customer_users cu JOIN customers c ON c.id=cu.customer_id
                 WHERE cu.id=? AND cu.is_active=1 AND c.deleted_at IS NULL AND c.is_active=1'
            );
            $stmt->execute([$resolvedEmailIdentity['id']]);
            $subUser = $stmt->fetch();
            if ($subUser && $contextSlug !== '' && !$isBelmContext
                && strtolower((string)$subUser['portal_link']) !== $contextSlug) {
                json_error('This customer app link belongs to a different company.',403);
            }
            if ($subUser && verify_portal_password($password, $subUser['password'] ?? null, 'assistant', (string)$subUser['id'])) {
                if (strtolower((string)($subUser['role'] ?? '')) === 'technician' && empty($subUser['customer_self_service'])) {
                    json_error('BELM Service is ON. Customer Technician login is locked while BELM handles maintenance.', 403);
                }
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
        'address' => $customer['address'] ?? null,
        'portalLink' => $customer['portal_link'],
        'actorType' => $actorType,
        'actorId' => $actorId,
        'actorName' => $loggedInAs,
        'customerRole' => $customerRole,
        'permissions' => $permissions,
    ], 30 * 24 * 3600);

    // V491: Customer Owner/Admin/Workshop Manager always land on the same
    // PORTAL-CWM home. BELM Service ON/OFF changes responsibility, not the
    // customer's home. workshop_module_active remains a feature gate for the
    // customer-owned Store / Tool module inside CWM; it no longer changes the
    // entire dashboard destination.
    $workshopModuleActive = !empty($customer['workshop_module_active']);
    $cwmHomeRoles = ['owner', 'admin', 'workshop_manager'];
    $customerDestination = in_array((string)$customerRole, $cwmHomeRoles, true)
        ? '/customer-workshop/?actor=customer'
        : '/portal/dashboard';

    json_out([
        'token' => $token,
        'accountType' => 'customer',
        'destination' => $customerDestination,
        'customer' => [
            'id' => $customer['id'],
            'name' => $customer['name'],
            'loggedInAs' => $loggedInAs,
            'actorType' => $actorType,
            'role' => $customerRole,
            'workshopModuleActive' => $workshopModuleActive,
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
    $staffMatches = [];
    foreach ($stmt->fetchAll() as $candidateUser) {
        if (!empty($candidateUser['password_hash']) && verify_portal_password($password, (string)$candidateUser['password_hash'], 'staff', (string)$candidateUser['id'])) {
            $staffMatches[] = $candidateUser;
        }
    }
    if (count($staffMatches) > 1) {
        record_failed_attempt('staff-login', $email);
        json_error('This legacy email is linked to more than one BELM staff account. Use the unified /login page or ask the administrator to resolve the duplicate account.', 409);
    }
    $user = count($staffMatches) === 1 ? $staffMatches[0] : null;

    if (!$user) {
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
// Legacy compatibility endpoint. The canonical UI uses unified-login, but this
// endpoint still fails closed when old data contains duplicate email identities.
if ($action === 'customer-login' && $method === 'POST') {
    $b = body();
    $rawLoginId = trim((string)($b['email'] ?? $b['portalLink'] ?? ''));
    $loginId = strtolower($rawLoginId);
    $portalId = $rawLoginId;
    if (filter_var($rawLoginId, FILTER_VALIDATE_URL)) {
        $query = [];
        parse_str(parse_url($rawLoginId, PHP_URL_QUERY) ?: '', $query);
        $portalId = trim((string)($query['customer'] ?? ''));
        if ($portalId === '') {
            $path = (string)(parse_url($rawLoginId, PHP_URL_PATH) ?: '');
            if (preg_match('#/app/([a-zA-Z0-9@-]+)/?$#', $path, $match)) $portalId = strtolower($match[1]);
        }
    }
    $password = $b['password'] ?? '';
    $isEmailLogin = filter_var($rawLoginId, FILTER_VALIDATE_EMAIL) !== false;

    assert_not_rate_limited('customer-login', $rawLoginId, 10, 15);

    $identityMatches = [];
    if ($isEmailLogin) {
        $stmt = db()->prepare('SELECT * FROM customers WHERE LOWER(email) = ? AND deleted_at IS NULL AND is_active = 1');
        $stmt->execute([$loginId]);
        foreach ($stmt->fetchAll() as $candidateCustomer) {
            if (!empty($candidateCustomer['password']) && verify_portal_password($password, (string)$candidateCustomer['password'], 'customer', (string)$candidateCustomer['id'])) {
                $identityMatches[] = ['type' => 'owner', 'row' => $candidateCustomer];
            }
        }

        $stmt = db()->prepare(
            'SELECT cu.* FROM customer_users cu
             JOIN customers c ON c.id=cu.customer_id
             WHERE LOWER(cu.email)=? AND cu.is_active=1
               AND c.deleted_at IS NULL AND c.is_active=1'
        );
        $stmt->execute([$loginId]);
        foreach ($stmt->fetchAll() as $candidateSubUser) {
            if (!empty($candidateSubUser['password']) && verify_portal_password($password, (string)$candidateSubUser['password'], 'assistant', (string)$candidateSubUser['id'])) {
                $identityMatches[] = ['type' => 'assistant', 'row' => $candidateSubUser];
            }
        }
    } else {
        $stmt = db()->prepare('SELECT * FROM customers WHERE portal_link = ? AND deleted_at IS NULL AND is_active = 1');
        $stmt->execute([$portalId]);
        foreach ($stmt->fetchAll() as $candidateCustomer) {
            if (!empty($candidateCustomer['password']) && verify_portal_password($password, (string)$candidateCustomer['password'], 'customer', (string)$candidateCustomer['id'])) {
                $identityMatches[] = ['type' => 'owner', 'row' => $candidateCustomer];
            }
        }
    }

    if (count($identityMatches) > 1) {
        record_failed_attempt('customer-login', $rawLoginId);
        json_error('This legacy email is linked to more than one customer portal account. Use the unified /login page or ask the administrator to resolve the duplicate account.', 409);
    }
    if (count($identityMatches) !== 1) {
        record_failed_attempt('customer-login', $rawLoginId);
        json_error('Invalid credentials', 401);
    }

    $identity = $identityMatches[0];
    $customer = null;
    $loggedInAs = null;
    $actorType = null;
    $actorId = null;
    $customerRole = null;
    $permissions = null;

    if ($identity['type'] === 'owner') {
        $customer = $identity['row'];
        $loggedInAs = $customer['name'];
        $actorType = 'owner';
        $actorId = $customer['id'];
        $customerRole = 'owner';
    } else {
        $subUser = $identity['row'];
        $stmt = db()->prepare('SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
        $stmt->execute([$subUser['customer_id']]);
        $customer = $stmt->fetch();
        if ($customer) {
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
    if ($actorType === 'assistant' && strtolower((string)$customerRole) === 'technician' && empty($customer['is_machinery_admin'])) {
        json_error('BELM Service is ON. Customer Technician login is locked while BELM handles maintenance.', 403);
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
