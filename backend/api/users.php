<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
require_page_access($user, 'roles');
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = $_GET['id'] ?? null;

function assigned_customer_for_role(string $roleId, ?string $assignedCustomerId, ?string $currentAssignedCustomerId = null): ?string {
    $stmt = db()->prepare('SELECT name FROM roles WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$roleId]);
    $roleName = $stmt->fetchColumn();
    if (!$roleName) json_error('Selected role was not found.', 404);

    if ($roleName !== 'Technician') return null;
    if (!$assignedCustomerId) {
        json_error('Select the customer this Technician will serve.', 422);
    }

    $stmt = db()->prepare(
        'SELECT is_active, is_machinery_admin
         FROM customers
         WHERE id = ? AND deleted_at IS NULL'
    );
    $stmt->execute([$assignedCustomerId]);
    $customerRow = $stmt->fetch();
    if (!$customerRow || !$customerRow['is_active']) {
        json_error('The selected customer is not active or does not exist.', 422);
    }
    // Self-Service means the customer normally manages their own Technician
    // accounts. It must NOT hard-block BELM from assigning a Technician when
    // the customer has explicitly asked BELM for technical support. The
    // support/request workflow controls when BELM should get involved.
    return $assignedCustomerId;
}

function role_payload(array $body, ?string $excludeRoleId = null): array {
    $name = trim((string)($body['name'] ?? ''));
    if ($name === '') json_error('Role name is required.');
    if (mb_strlen($name) > 100) json_error('Role name is too long.');

    $checkSql = 'SELECT id FROM roles WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL';
    $params = [$name];
    if ($excludeRoleId !== null) {
        $checkSql .= ' AND id <> ?';
        $params[] = $excludeRoleId;
    }
    $stmt = db()->prepare($checkSql . ' LIMIT 1');
    $stmt->execute($params);
    if ($stmt->fetch()) json_error('A role with this name already exists.', 409);

    $allowedPageKeys = [
        'customers', 'overview', 'roles', 'service-requests', 'spare-parts',
        'billing', 'bank-manager', 'reports', 'settings', 'checklist-templates', 'suppliers',
        'activity-log',
    ];
    $requestedPages = is_array($body['allowedPages'] ?? null) ? $body['allowedPages'] : [];
    $allowedPages = array_values(array_unique(array_filter(
        array_map(static fn($page): string => trim((string)$page), $requestedPages),
        static fn(string $page): bool => in_array($page, $allowedPageKeys, true)
    )));

    return [
        'name' => $name,
        'permissions' => is_array($body['permissions'] ?? null) ? $body['permissions'] : new stdClass(),
        'allowedPages' => $allowedPages,
    ];
}

function role_name(string $roleId): ?string {
    $stmt = db()->prepare('SELECT name FROM roles WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$roleId]);
    $name = $stmt->fetchColumn();
    return $name !== false ? (string)$name : null;
}

function protect_last_super_admin(string $userId, string $nextRoleId, bool $nextActive): void {
    $stmt = db()->prepare(
        'SELECT r.name
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.id = ? AND u.deleted_at IS NULL'
    );
    $stmt->execute([$userId]);
    $currentRole = $stmt->fetchColumn();
    if ($currentRole !== 'Super Admin') return;

    $nextRole = role_name($nextRoleId);
    if ($nextRole === 'Super Admin' && $nextActive) return;

    $remaining = (int)db()->query(
        "SELECT COUNT(*)
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE r.name = 'Super Admin' AND u.deleted_at IS NULL
           AND u.is_active = 1"
    )->fetchColumn();
    if ($remaining <= 1) {
        json_error('Create another active Super Admin before changing or disabling this account.', 409);
    }
}


// V322: Registered-user account actions must work even when the legacy
// Edit/Delete PINs have not been configured on a deployment. These actions
// are already restricted by the Roles page permission; additionally require
// the currently signed-in staff member's own password. Legacy PIN payloads are
// still accepted for backwards compatibility with older cached frontends.
function require_registered_user_admin_confirmation(array $actor, array $body, bool $requireReason = false): ?string {
    $adminPassword = (string)($body['adminPassword'] ?? '');
    $reason = trim((string)($body['reason'] ?? ''));

    if ($adminPassword === '') {
        if ($requireReason) return require_delete_confirmation($actor, $body);
        require_edit_confirmation($actor, $body);
        return null;
    }

    if ($requireReason) {
        if ($reason === '') json_error('Enter a reason for this deletion.');
        if (mb_strlen($reason) > 500) json_error('Reason must be 500 characters or fewer.');
    }

    assert_not_rate_limited('registered-user-admin-password', (string)$actor['id'], 8, 15);
    $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
    $stmt->execute([(string)$actor['id']]);
    $hash = $stmt->fetchColumn();
    if (!$hash || !password_verify($adminPassword, (string)$hash)) {
        record_failed_attempt('registered-user-admin-password', (string)$actor['id']);
        json_error('Incorrect admin password.', 403);
    }
    clear_rate_limit('registered-user-admin-password', (string)$actor['id']);
    return $requireReason ? $reason : null;
}

// ---- Roles ------------------------------------------------------------
if ($method === 'GET' && $action === 'roles') {
    $roles = db()->query('SELECT * FROM roles WHERE deleted_at IS NULL')->fetchAll();
    foreach ($roles as &$r) {
        $r['allowedPages'] = json_decode($r['allowed_pages'], true);
        $r['permissions'] = json_decode($r['permissions'], true);
    }
    json_out($roles);
}

if ($method === 'POST' && $action === 'roles') {
    $role = role_payload(body());
    $newId = uuid();
    db()->prepare('INSERT INTO roles (id, name, permissions, allowed_pages, created_at) VALUES (?,?,?,?,NOW())')
        ->execute([$newId, $role['name'], json_encode($role['permissions']), json_encode($role['allowedPages'])]);
    log_activity($user, 'role-created', 'role', $newId, ['name' => $role['name']]);
    json_out(['id' => $newId, 'message' => 'Role added successfully.'], 201);
}

if ($method === 'PUT' && $action === 'roles') {
    if (!$id) json_error('Role ID is required.');
    $existingName = role_name($id);
    if ($existingName === null) json_error('Role not found.', 404);
    $b = body();
    // Built-in roles (Super Admin, Technician) can't be renamed away from
    // their identity — too much of the app checks for that literal name
    // (e.g. /tech routing, Super Admin bypass checks) — but their
    // allowed-pages CAN still be adjusted (this is how the Engineering
    // page's "Edit role access" for Technician works).
    if (in_array($existingName, ['Super Admin', 'Technician'], true)
        && trim((string)($b['name'] ?? '')) !== $existingName) {
        json_error('Built-in roles cannot be renamed or replaced.', 409);
    }
    require_edit_confirmation($user, $b);
    $role = role_payload($b, $id);
    db()->prepare('UPDATE roles SET name=?, permissions=?, allowed_pages=? WHERE id=?')
        ->execute([$role['name'], json_encode($role['permissions']), json_encode($role['allowedPages']), $id]);
    log_activity($user, 'role-edited', 'role', $id, ['name' => $role['name']]);
    json_out(['ok' => true, 'message' => 'Role updated successfully.']);
}

if ($method === 'DELETE' && $action === 'roles') {
    $stmt = db()->prepare('SELECT name FROM roles WHERE id = ?');
    $stmt->execute([$id]);
    $role = $stmt->fetch();
    if (!$role) json_error('Not found', 404);
    if (in_array($role['name'], ['Super Admin', 'Technician'], true)) {
        json_error('Built-in roles cannot be deleted.', 409);
    }
    $stmt = db()->prepare('SELECT COUNT(*) FROM users WHERE role_id = ? AND deleted_at IS NULL');
    $stmt->execute([$id]);
    if ($stmt->fetchColumn() > 0) json_error("Users still have this role. Reassign them first.", 409);
    $reason = require_delete_confirmation($user, body());
    send_to_trash('role', $id, $role['name'], $user['id'], $reason);
    soft_delete('roles', $id);
    json_out(null, 204);
}

// ---- Users --------------------------------------------------------------
if ($method === 'GET' && !$action) {
    $stmt = db()->query('SELECT u.*, r.name AS role_name, c.name AS assigned_customer_name
                          FROM users u JOIN roles r ON r.id = u.role_id
                          LEFT JOIN customers c ON c.id = u.assigned_customer_id
                          WHERE u.deleted_at IS NULL');
    $users = $stmt->fetchAll();
    $extraStmt = db()->prepare(
        'SELECT r.id, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?'
    );
    foreach ($users as &$row) {
        $row['role'] = ['id' => $row['role_id'], 'name' => $row['role_name']];
        $row['assignedCustomer'] = $row['assigned_customer_id']
            ? ['id' => $row['assigned_customer_id'], 'name' => $row['assigned_customer_name']]
            : null;
        $extraStmt->execute([$row['id']]);
        $extraRoles = $extraStmt->fetchAll();
        $row['roleIds'] = array_merge([$row['role_id']], array_column($extraRoles, 'id'));
        $row['roleNames'] = array_merge([$row['role_name']], array_column($extraRoles, 'name'));
        unset($row['role_name'], $row['assigned_customer_name']);
    }
    json_out($users);
}

function role_ids_from_body(array $body): array {
    $raw = $body['roleIds'] ?? null;
    if (!is_array($raw) || count($raw) === 0) {
        $single = trim((string)($body['roleId'] ?? ''));
        $raw = $single !== '' ? [$single] : [];
    }
    $ids = array_values(array_unique(array_filter(array_map('strval', $raw))));
    foreach ($ids as $roleId) {
        if (role_name($roleId) === null) json_error('One of the selected roles was not found.');
    }
    if (count($ids) === 0) json_error('Select at least one role.');
    return $ids;
}

// Replaces a user's extra roles (everything after the primary role_id) with
// the given set.
function sync_extra_user_roles(string $userId, string $primaryRoleId, array $allRoleIds): void {
    db()->prepare('DELETE FROM user_roles WHERE user_id = ?')->execute([$userId]);
    $extra = array_values(array_diff($allRoleIds, [$primaryRoleId]));
    if ($extra) {
        $stmt = db()->prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?) ON CONFLICT DO NOTHING');
        foreach ($extra as $roleId) $stmt->execute([$userId, $roleId]);
    }
}

if ($method === 'POST' && !$action) {
    $b = body();
    $name = trim((string)($b['name'] ?? ''));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $password = (string)($b['password'] ?? '');
    if ($name === '') json_error('User name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid user email address.');
    if ($password === '') $password = secure_account_secret();
    if (strlen($password) < 8) json_error('Password must contain at least 8 characters.');
    $roleIds = role_ids_from_body($b);
    $roleId = $roleIds[0];
    $emailCheck = db()->prepare(
        'SELECT 1 FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM customers WHERE LOWER(email) = ? AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM customer_users WHERE LOWER(email) = ?
         LIMIT 1'
    );
    $emailCheck->execute([$email, $email, $email]);
    if ($emailCheck->fetch()) json_error('This email is already used by another portal account.', 409);

    $newId = uuid();
    $assignedCustomerId = assigned_customer_for_role(
        $roleId,
        $b['assignedCustomerId'] ?? null
    );
    $recoveryCode = account_recovery_code();
    db()->prepare(
        'INSERT INTO users
         (id, name, email, password_hash, recovery_code_hash, phone, role_id, assigned_customer_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,NOW())'
    )->execute([
        $newId,
        $name,
        $email,
        password_hash($password, PASSWORD_BCRYPT),
        password_hash($recoveryCode, PASSWORD_BCRYPT),
        $b['phone'] ?? null,
        $roleId,
        $assignedCustomerId,
    ]);
    sync_extra_user_roles($newId, $roleId, $roleIds);
    $roleName = role_name($roleId);
    log_activity($user, 'system-user-created', 'user', $newId, ['name' => $name, 'email' => $email]);
    json_out([
        'id' => $newId,
        'temporaryPassword' => $password,
        'recoveryCode' => $recoveryCode,
        'loginUrl' => belm_staff_login_url($name, $roleName),
    ], 201);
}

if ($method === 'PUT' && !$action) {
    $b = body();
    require_registered_user_admin_confirmation($user, $b);
    if (!$id) json_error('User ID is required.');
    $name = trim((string)($b['name'] ?? ''));
    $roleIds = role_ids_from_body($b);
    $roleId = $roleIds[0];
    if ($name === '') json_error('User name is required.');
    $isActive = !isset($b['isActive']) || filter_var($b['isActive'], FILTER_VALIDATE_BOOL);
    protect_last_super_admin($id, $roleId, $isActive);
    $existingUserStmt = db()->prepare('SELECT assigned_customer_id FROM users WHERE id = ?');
    $existingUserStmt->execute([$id]);
    $currentAssignedCustomerId = $existingUserStmt->fetchColumn() ?: null;
    $assignedCustomerId = assigned_customer_for_role(
        $roleId,
        $b['assignedCustomerId'] ?? null,
        $currentAssignedCustomerId
    );
    db()->prepare('UPDATE users SET name=?, phone=?, role_id=?, is_active=?, assigned_customer_id=? WHERE id=?')
        ->execute([$name, $b['phone'] ?? null, $roleId, $isActive ? 1 : 0, $assignedCustomerId, $id]);
    sync_extra_user_roles($id, $roleId, $roleIds);
    log_activity($user, 'system-user-edited', 'user', $id, ['name' => $name]);
    json_out(['ok' => true, 'message' => 'User role and access updated successfully.']);
}

if ($method === 'PUT' && $action === 'reset-password') {
    // V322: account reset is confirmed with the signed-in admin's current
    // password so it works even when legacy action PINs are not configured.
    require_registered_user_admin_confirmation($user, body());
    $newPassword = secure_account_secret();
    $recoveryCode = account_recovery_code();
    $stmt = db()->prepare(
        'UPDATE users
         SET password_hash = ?, recovery_code_hash = ?
         WHERE id = ? AND deleted_at IS NULL
         RETURNING name, email, role_id'
    );
    $stmt->execute([
        password_hash($newPassword, PASSWORD_BCRYPT),
        password_hash($recoveryCode, PASSWORD_BCRYPT),
        $id,
    ]);
    $resetUser = $stmt->fetch();
    if (!$resetUser) json_error('User not found.', 404);
    $roleName = role_name((string)$resetUser['role_id']);
    clear_unified_login_lockout((string)$resetUser['email']);
    log_activity($user, 'system-user-login-reset', 'user', $id);
    json_out([
        'newPassword' => $newPassword,
        'recoveryCode' => $recoveryCode,
        'loginUrl' => belm_staff_login_url((string)$resetUser['name'], $roleName),
    ]);
}

if ($method === 'DELETE' && !$action) {
    if (!$id) json_error('User ID is required.');
    if ((string)$id === (string)$user['id']) json_error('You cannot delete the account you are currently signed in with.', 409);
    $stmt = db()->prepare(
        'SELECT u.name, u.is_active, r.name AS role_name
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.id = ? AND u.deleted_at IS NULL'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    if ($row['role_name'] === 'Super Admin' && (int)$row['is_active'] === 1) {
        $remaining = (int)db()->query(
            "SELECT COUNT(*)
             FROM users u JOIN roles r ON r.id = u.role_id
             WHERE r.name = 'Super Admin' AND u.deleted_at IS NULL
               AND u.is_active = 1"
        )->fetchColumn();
        if ($remaining <= 1) {
            json_error('Create another active Super Admin before deleting this account.', 409);
        }
    }
    $reason = require_registered_user_admin_confirmation($user, body(), true);
    send_to_trash('user', $id, $row['name'], $user['id'], $reason);
    soft_delete('users', $id);
    json_out(null, 204);
}

if ($method === 'GET' && $action === 'activity') {
    $stmt = db()->prepare('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 200');
    $stmt->execute([$id]);
    json_out($stmt->fetchAll());
}

json_error('Unknown request', 404);
