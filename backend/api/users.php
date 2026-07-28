<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
require_page_access($user, 'roles');
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$id = $_GET['id'] ?? null;

function assigned_customer_for_role(string $roleId, ?string $assignedCustomerId): ?string {
    $stmt = db()->prepare('SELECT name FROM roles WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$roleId]);
    $roleName = $stmt->fetchColumn();
    if (!$roleName) json_error('Selected role was not found.', 404);

    if ($roleName !== 'Technician') return null;
    if (!$assignedCustomerId) {
        json_error('Select the customer this Technician will serve.', 422);
    }

    $stmt = db()->prepare(
        'SELECT COUNT(*) FROM customers
         WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
    );
    $stmt->execute([$assignedCustomerId]);
    if ((int)$stmt->fetchColumn() === 0) {
        json_error('The selected customer is not active or does not exist.', 422);
    }
    return $assignedCustomerId;
}

// ---- Roles ------------------------------------------------------------
if ($method === 'GET' && $action === 'roles') {
    $roles = db()->query('SELECT * FROM roles WHERE deleted_at IS NULL')->fetchAll();
    foreach ($roles as &$r) $r['allowedPages'] = json_decode($r['allowed_pages'], true);
    json_out($roles);
}

if ($method === 'POST' && $action === 'roles') {
    $b = body();
    $newId = uuid();
    db()->prepare('INSERT INTO roles (id, name, permissions, allowed_pages, created_at) VALUES (?,?,?,?,NOW())')
        ->execute([$newId, $b['name'], json_encode($b['permissions'] ?? new stdClass()), json_encode($b['allowedPages'] ?? [])]);
    json_out(['id' => $newId], 201);
}

if ($method === 'PUT' && $action === 'roles') {
    $b = body();
    db()->prepare('UPDATE roles SET name=?, permissions=?, allowed_pages=? WHERE id=?')
        ->execute([$b['name'], json_encode($b['permissions'] ?? new stdClass()), json_encode($b['allowedPages'] ?? []), $id]);
    json_out(['ok' => true]);
}

if ($method === 'DELETE' && $action === 'roles') {
    $stmt = db()->prepare('SELECT name FROM roles WHERE id = ?');
    $stmt->execute([$id]);
    $role = $stmt->fetch();
    if (!$role) json_error('Not found', 404);
    $stmt = db()->prepare('SELECT COUNT(*) FROM users WHERE role_id = ? AND deleted_at IS NULL');
    $stmt->execute([$id]);
    if ($stmt->fetchColumn() > 0) json_error("Users still have this role. Reassign them first.", 409);
    send_to_trash('role', $id, $role['name'], $user['id']);
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
    foreach ($users as &$row) {
        $row['role'] = ['id' => $row['role_id'], 'name' => $row['role_name']];
        $row['assignedCustomer'] = $row['assigned_customer_id']
            ? ['id' => $row['assigned_customer_id'], 'name' => $row['assigned_customer_name']]
            : null;
        unset($row['role_name'], $row['assigned_customer_name']);
    }
    json_out($users);
}

if ($method === 'POST' && !$action) {
    $b = body();
    $name = trim((string)($b['name'] ?? ''));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $password = (string)($b['password'] ?? '');
    if ($name === '') json_error('User name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid user email address.');
    if (strlen($password) < 8) json_error('Password must contain at least 8 characters.');
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
        $b['roleId'],
        $b['assignedCustomerId'] ?? null
    );
    db()->prepare('INSERT INTO users (id, name, email, password_hash, phone, role_id, assigned_customer_id, created_at) VALUES (?,?,?,?,?,?,?,NOW())')
        ->execute([$newId, $name, $email, password_hash($password, PASSWORD_BCRYPT), $b['phone'] ?? null, $b['roleId'], $assignedCustomerId]);
    json_out(['id' => $newId], 201);
}

if ($method === 'PUT' && !$action) {
    $b = body();
    $assignedCustomerId = assigned_customer_for_role(
        $b['roleId'],
        $b['assignedCustomerId'] ?? null
    );
    db()->prepare('UPDATE users SET name=?, phone=?, role_id=?, is_active=?, assigned_customer_id=? WHERE id=?')
        ->execute([$b['name'], $b['phone'] ?? null, $b['roleId'], $b['isActive'] ?? 1, $assignedCustomerId, $id]);
    json_out(['ok' => true]);
}

if ($method === 'PUT' && $action === 'reset-password') {
    $newPassword = bin2hex(random_bytes(5));
    $stmt = db()->prepare('UPDATE users SET password_hash=? WHERE id=? AND deleted_at IS NULL');
    $stmt->execute([password_hash($newPassword, PASSWORD_BCRYPT), $id]);
    if ($stmt->rowCount() === 0) json_error('User not found.', 404);
    json_out(['newPassword' => $newPassword]);
}

if ($method === 'DELETE' && !$action) {
    $stmt = db()->prepare('SELECT name FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    send_to_trash('user', $id, $row['name'], $user['id']);
    soft_delete('users', $id);
    json_out(null, 204);
}

if ($method === 'GET' && $action === 'activity') {
    $stmt = db()->prepare('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 200');
    $stmt->execute([$id]);
    json_out($stmt->fetchAll());
}

json_error('Unknown request', 404);
