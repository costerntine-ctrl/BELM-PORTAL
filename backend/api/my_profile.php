<?php
require_once __DIR__ . '/../config/helpers.php';

$payload = current_token_payload();
if (!$payload) json_error('Not authenticated', 401);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') json_error('Method not allowed', 405);

$type = (string)($payload['type'] ?? '');

if ($type === 'staff') {
    $user = require_auth();
    $stmt = db()->prepare(
        "SELECT u.id,u.name,u.email,u.phone,u.is_active,u.created_at,u.is_customer_managed,
                r.name AS role_name,
                c.id AS customer_id,c.name AS customer_name,c.email AS customer_email,
                c.phone AS customer_phone,c.address AS customer_address
         FROM users u
         JOIN roles r ON r.id=u.role_id
         LEFT JOIN customers c ON c.id=u.assigned_customer_id AND c.deleted_at IS NULL
         WHERE u.id=? AND u.deleted_at IS NULL
         LIMIT 1"
    );
    $stmt->execute([(string)$user['id']]);
    $row = $stmt->fetch();
    if (!$row) json_error('Registered user record was not found.', 404);

    $assignedCustomer = null;
    if (!empty($row['customer_id'])) {
        $assignedCustomer = [
            'id' => (string)$row['customer_id'],
            'name' => (string)$row['customer_name'],
            'email' => (string)($row['customer_email'] ?? ''),
            'phone' => (string)($row['customer_phone'] ?? ''),
            'address' => (string)($row['customer_address'] ?? ''),
        ];
    }

    json_out([
        'profile' => [
            'id' => (string)$row['id'],
            'name' => (string)$row['name'],
            'email' => (string)$row['email'],
            'phone' => (string)($row['phone'] ?? ''),
            'role' => (string)$row['role_name'],
            'accountType' => !empty($row['is_customer_managed']) ? 'Customer-managed BELM User' : 'BELM Staff',
            'companyName' => 'BELM GENERAL TECH SERVICE',
            'status' => !empty($row['is_active']) ? 'Active' : 'Inactive',
            'registeredAt' => $row['created_at'],
            'assignedCustomer' => $assignedCustomer,
            'source' => 'USER REGISTRATION',
            'readOnly' => true,
        ],
    ]);
}

if ($type === 'customer') {
    $customer = require_customer_auth();
    $customerId = (string)$customer['id'];
    $actorType = strtolower((string)($customer['actorType'] ?? 'owner'));
    $actorId = trim((string)($customer['actorId'] ?? ''));

    if ($actorType === 'assistant' && $actorId !== '') {
        $stmt = db()->prepare(
            "SELECT cu.id,cu.name,cu.email,cu.phone,cu.role,cu.is_active,cu.created_at,
                    c.name AS company_name,c.email AS company_email,c.phone AS company_phone,c.address AS company_address
             FROM customer_users cu
             JOIN customers c ON c.id=cu.customer_id
             WHERE cu.id=? AND cu.customer_id=? AND c.deleted_at IS NULL
             LIMIT 1"
        );
        $stmt->execute([$actorId,$customerId]);
        $row = $stmt->fetch();
        if (!$row) json_error('Registered customer user record was not found.', 404);

        json_out([
            'profile' => [
                'id' => (string)$row['id'],
                'name' => (string)$row['name'],
                'email' => (string)$row['email'],
                'phone' => (string)($row['phone'] ?? ''),
                'role' => (string)($row['role'] ?: 'Customer User'),
                'accountType' => 'Customer User',
                'companyName' => (string)$row['company_name'],
                'status' => !empty($row['is_active']) ? 'Active' : 'Inactive',
                'registeredAt' => $row['created_at'],
                'company' => [
                    'name' => (string)$row['company_name'],
                    'email' => (string)($row['company_email'] ?? ''),
                    'phone' => (string)($row['company_phone'] ?? ''),
                    'address' => (string)($row['company_address'] ?? ''),
                ],
                'source' => 'USER REGISTRATION',
                'readOnly' => true,
            ],
        ]);
    }

    $stmt = db()->prepare(
        "SELECT id,name,email,phone,address,tin_number,vrn,is_active,created_at
         FROM customers
         WHERE id=? AND deleted_at IS NULL
         LIMIT 1"
    );
    $stmt->execute([$customerId]);
    $row = $stmt->fetch();
    if (!$row) json_error('Customer registration record was not found.', 404);

    json_out([
        'profile' => [
            'id' => (string)$row['id'],
            'name' => (string)$row['name'],
            'email' => (string)$row['email'],
            'phone' => (string)($row['phone'] ?? ''),
            'role' => 'Customer Admin',
            'accountType' => 'Customer Owner / Admin',
            'companyName' => (string)$row['name'],
            'status' => !empty($row['is_active']) ? 'Active' : 'Inactive',
            'registeredAt' => $row['created_at'],
            'company' => [
                'name' => (string)$row['name'],
                'email' => (string)$row['email'],
                'phone' => (string)($row['phone'] ?? ''),
                'address' => (string)($row['address'] ?? ''),
                'tin' => (string)($row['tin_number'] ?? ''),
                'vrn' => (string)($row['vrn'] ?? ''),
            ],
            'source' => 'CUSTOMER REGISTRATION',
            'readOnly' => true,
        ],
    ]);
}

if ($type === 'operator') {
    $operatorId = trim((string)($payload['id'] ?? ''));
    $machineId = trim((string)($payload['machineId'] ?? ''));
    $customerId = trim((string)($payload['customerId'] ?? ''));
    if ($operatorId === '' || $machineId === '' || $customerId === '') json_error('Operator registration identity is incomplete.', 401);

    $stmt = db()->prepare(
        "SELECT o.id,o.name,o.contact,o.created_at,
                c.name AS customer_name,c.email AS customer_email,c.phone AS customer_phone,c.address AS customer_address,
                m.id AS machine_id,m.machine_type,m.brand,m.model,m.fleet_number,m.serial_number
         FROM machine_operators o
         JOIN customers c ON c.id=o.customer_id
         JOIN machines m ON m.id=o.machine_id
         WHERE o.id=? AND o.machine_id=? AND o.customer_id=?
           AND c.deleted_at IS NULL AND m.deleted_at IS NULL
         LIMIT 1"
    );
    $stmt->execute([$operatorId,$machineId,$customerId]);
    $row = $stmt->fetch();
    if (!$row) json_error('Operator registration record was not found.', 404);

    $machineLabel = trim((string)($row['brand'] ?? '') . ' ' . (string)($row['model'] ?? ''));
    if ($machineLabel === '') $machineLabel = (string)($row['machine_type'] ?? 'Machine');

    json_out([
        'profile' => [
            'id' => (string)$row['id'],
            'name' => (string)$row['name'],
            'email' => '',
            'phone' => (string)($row['contact'] ?? ''),
            'role' => 'Machine Operator',
            'accountType' => 'Machine Operator',
            'companyName' => (string)$row['customer_name'],
            'status' => 'Active',
            'registeredAt' => $row['created_at'],
            'company' => [
                'name' => (string)$row['customer_name'],
                'email' => (string)($row['customer_email'] ?? ''),
                'phone' => (string)($row['customer_phone'] ?? ''),
                'address' => (string)($row['customer_address'] ?? ''),
            ],
            'machine' => [
                'id' => (string)$row['machine_id'],
                'label' => $machineLabel,
                'fleetNumber' => (string)($row['fleet_number'] ?? ''),
                'serialNumber' => (string)($row['serial_number'] ?? ''),
            ],
            'source' => 'OPERATOR REGISTRATION',
            'readOnly' => true,
        ],
    ]);
}

json_error('Profile is not available for this account type.', 403);
