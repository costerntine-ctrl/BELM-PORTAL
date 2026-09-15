<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
require_page_access($user, 'customers');
$method = $_SERVER['REQUEST_METHOD'];
$resource = trim((string)($_GET['resource'] ?? 'orders'));
$id = trim((string)($_GET['id'] ?? ''));
$action = trim((string)($_GET['action'] ?? ''));
$pdo = db();

function workshop_order_row(array $r): array {
    return [
        'id' => (string)($r['job_card_id'] ?? ''),
        'caseId' => (string)($r['case_id'] ?? ''),
        'jobCardId' => (string)($r['job_card_id'] ?? ''),
        'workOrderNumber' => (string)($r['job_card_no'] ?? ''),
        'customerName' => (string)($r['customer_name'] ?? ''),
        'machineModel' => trim((string)($r['brand'] ?? '') . ' ' . (string)($r['model'] ?? '')) ?: (string)($r['machine_type'] ?? ''),
        'machineType' => (string)($r['machine_type'] ?? ''),
        'title' => (string)($r['title'] ?? 'Machine Job Card'),
        'jobType' => (string)($r['source_type'] ?? 'WORKSHOP'),
        'status' => (string)($r['job_status'] ?? 'OPEN'),
        'currentStage' => (string)($r['current_stage'] ?? ''),
        'currentDepartment' => (string)($r['current_department'] ?? ''),
        'technicianName' => (string)($r['technician_name'] ?? ''),
        'contractNumber' => $r['contract_number'] ?? null,
        'supportMode' => strtoupper((string)($r['source_type'] ?? '')) === 'SERVICE_REQUEST' ? 'BELM_SUPPORT' : 'CUSTOMER_WORKSHOP',
        'createdAt' => $r['created_at'] ?? null,
        'updatedAt' => $r['updated_at'] ?? null,
    ];
}

if ($resource === 'orders') {
    if ($method === 'GET') {
        $customerId = trim((string)($_GET['customerId'] ?? ''));
        $sql = "SELECT dj.id AS job_card_id,dj.job_card_no,dj.status AS job_status,dj.technician_name,dj.created_at,dj.updated_at,
                       bc.id AS case_id,bc.title,bc.source_type,bc.current_stage,bc.current_department,
                       c.name AS customer_name,m.brand,m.model,m.machine_type,
                       (SELECT cc.contract_number
                          FROM customer_contracts cc
                         WHERE cc.customer_id=dj.customer_id
                           AND cc.status='ACTIVE'
                           AND CURRENT_DATE BETWEEN cc.start_date AND cc.end_date
                         ORDER BY cc.end_date ASC
                         LIMIT 1) AS contract_number
                  FROM digital_job_cards dj
                  JOIN breakdown_cases bc ON bc.id=dj.case_id
                  JOIN customers c ON c.id=dj.customer_id AND c.deleted_at IS NULL
                  JOIN machines m ON m.id=dj.machine_id AND m.deleted_at IS NULL
                 WHERE (?='' OR dj.customer_id=?)
                 ORDER BY CASE WHEN UPPER(COALESCE(dj.status,'')) IN ('COMPLETED','CANCELLED') THEN 1 ELSE 0 END,
                          dj.updated_at DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$customerId, $customerId]);
        json_out(array_map('workshop_order_row', $stmt->fetchAll()));
    }

    // Job Card status is intentionally controlled by the canonical Breakdown / Job Card workflow.
    if (($method === 'PUT' && $id !== '' && $action === 'status') || ($method === 'POST' && $id !== '' && $action === 'escalate')) {
        json_error('Use the canonical Job Card / Breakdown Workflow for status changes. Customer escalation to BELM must be created as an official Service Request.', 409);
    }
}

if ($resource === 'staff' && $method === 'GET') {
    $customerId = trim((string)($_GET['customerId'] ?? ''));
    $staff = [];
    $stmt = $pdo->prepare(
        "SELECT u.id,u.name,u.email,u.phone,r.name AS role,u.assigned_customer_id AS customer_id
           FROM users u
           JOIN roles r ON r.id=u.role_id
          WHERE u.deleted_at IS NULL AND u.is_active=1 AND u.is_customer_managed=1
            AND (?='' OR u.assigned_customer_id=?)
          ORDER BY u.name"
    );
    $stmt->execute([$customerId, $customerId]);
    foreach ($stmt->fetchAll() as $row) {
        $row['account_type'] = 'field_technician';
        $staff[] = $row;
    }
    $sub = $pdo->prepare(
        "SELECT cu.id,cu.name,cu.email,cu.phone,cu.role,cu.customer_id
           FROM customer_users cu
          WHERE cu.is_active=1 AND LOWER(cu.role) IN ('technician','operator','workshop_manager')
            AND (?='' OR cu.customer_id=?)
          ORDER BY cu.name"
    );
    $sub->execute([$customerId, $customerId]);
    foreach ($sub->fetchAll() as $row) {
        $row['account_type'] = 'customer_user';
        $staff[] = $row;
    }
    json_out($staff);
}

if ($resource === 'sites' && $method === 'GET') {
    $customerId = trim((string)($_GET['customerId'] ?? ''));
    $stmt = $pdo->prepare(
        "SELECT id AS customer_id,name,address AS location
           FROM customers
          WHERE deleted_at IS NULL AND is_active=1 AND (?='' OR id=?)
          ORDER BY name"
    );
    $stmt->execute([$customerId, $customerId]);
    $sites = array_map(static function(array $row): array {
        return [
            'id' => (string)$row['customer_id'] . '-main',
            'customer_id' => (string)$row['customer_id'],
            'name' => (string)$row['name'] . ' Main Site',
            'location' => (string)($row['location'] ?? ''),
            'site_type' => 'CUSTOMER_MAIN',
        ];
    }, $stmt->fetchAll());
    json_out($sites);
}

if (in_array($resource, ['sites','staff'], true) && $method === 'POST') {
    json_error('Create customer users and workshop staff through Roles & Users. Site identity is managed from the Customer profile.', 409);
}

json_error('Unsupported workshop operation.', 405);
