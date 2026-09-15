<?php
require_once __DIR__ . '/../config/helpers.php';

$customer = require_customer_auth();
$customerId = (string)($customer['id'] ?? '');
if ($customerId === '') json_error('Customer account identity is missing.', 401);

$stmt = db()->prepare(
    'SELECT id,name,is_machinery_admin,workshop_module_active,coordinator_features
     FROM customers
     WHERE id=? AND deleted_at IS NULL AND is_active=1
     LIMIT 1'
);
$stmt->execute([$customerId]);
$row = $stmt->fetch();
if (!$row) json_error('Customer account is no longer active.', 404);

$departments = belm_customer_department_states($customerId);
$features = json_decode((string)($row['coordinator_features'] ?? '{}'), true);
if (!is_array($features)) $features = [];
if (!array_key_exists('operatorDashboard', $features)) $features['operatorDashboard'] = true;
if (!array_key_exists('technicianDashboard', $features)) $features['technicianDashboard'] = true;

$independent = !empty($row['is_machinery_admin']);
$technicianEntitled = belm_customer_technician_entitled($customerId);
$customerTechnicianEnabled = $independent && $technicianEntitled;
$workshopModuleActive = !empty($row['workshop_module_active']);

$departmentEnabled = static function (string $key) use ($departments): bool {
    return strtoupper((string)($departments[$key] ?? 'ENABLED')) !== 'REMOVED';
};

$actorType = strtolower(trim((string)($customer['actorType'] ?? 'owner')));
$actorRole = strtolower(trim((string)($customer['customerRole'] ?? ($actorType === 'owner' ? 'owner' : 'assistant'))));
$customerAdmin = $actorType === 'owner' || in_array($actorRole, ['admin', 'customer_admin', 'owner'], true);

$roles = [
    [
        'key' => 'customer_admin',
        'label' => 'Customer Admin',
        'enabled' => $departmentEnabled('administration'),
        'dashboard' => '/customer-admin-dashboard/',
        'scope' => 'Company administration, users, permissions, machines and customer-level settings',
    ],
    [
        'key' => 'workshop_manager',
        'label' => 'Workshop Manager',
        'enabled' => $departmentEnabled('technical'),
        'dashboard' => '/customer-workshop/?actor=customer',
        'scope' => 'Workshop control, Job Cards, maintenance and technical supervision',
    ],
    [
        'key' => 'technician',
        'label' => 'Technician',
        'enabled' => $customerTechnicianEnabled,
        'dashboard' => '/concept-dashboards/02-technician/',
        'scope' => $customerTechnicianEnabled
            ? 'Customer-owned diagnosis, repair, testing and Job Card execution'
            : 'Unavailable while BELM is the Service Provider',
    ],
    [
        'key' => 'operator',
        'label' => 'Operator',
        'enabled' => $departmentEnabled('operator') && !empty($features['operatorDashboard']),
        'dashboard' => '/customer-operator-dashboard/',
        'scope' => 'Daily checklist, machine operation, fuel and problem reporting',
    ],
    [
        'key' => 'procurement',
        'label' => 'Procurement',
        'enabled' => $departmentEnabled('procurement'),
        'dashboard' => '/customer-procurement-dashboard/',
        'scope' => 'Internal purchasing, spare/material requests and procurement records',
    ],
    [
        'key' => 'store_keeper',
        'label' => 'Store Keeper',
        'enabled' => $departmentEnabled('store') && $workshopModuleActive,
        'dashboard' => '/customer-store-dashboard/',
        'scope' => 'Own-company stock, tools, issue/receive and store audit',
    ],
    [
        'key' => 'accounts',
        'label' => 'Finance / Accounts',
        'enabled' => $departmentEnabled('finance'),
        'dashboard' => '/customer-finance/',
        'scope' => 'Own-company invoices/proforma when enabled, expenses, petty cash and finance reports',
    ],
];

json_out([
    'mode' => [
        'key' => $independent ? 'CUSTOMER_INDEPENDENT' : 'BELM_SERVICE_PROVIDER',
        'label' => $independent ? 'Customer Independent Workshop' : 'BELM Service Provider',
        'customerIndependent' => $independent,
        'belmServiceProvider' => !$independent,
        'customerTechnicianEnabled' => $customerTechnicianEnabled,
        'customerMachineManagementEnabled' => $independent,
    ],
    'roles' => $roles,
    'customerSettings' => [
        'available' => $departmentEnabled('administration'),
        'canEdit' => $customerAdmin,
        'dashboard' => '/customer-settings-center/',
        'scope' => ['alerts', 'email', 'whatsapp', 'management recipients', 'roles and users', 'company workshop setup'],
    ],
    'restrictions' => [
        'bankController' => false,
        'sparePartSelling' => false,
        'commercialBelmStock' => false,
    ],
    'departments' => $departments,
    'features' => $features,
]);
