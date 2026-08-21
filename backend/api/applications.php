<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/service_due_helper.php';

$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;
$action = $_GET['action'] ?? '';

function clean_required(array $body, string $key, string $label, int $maxLength = 255): string {
    $value = trim((string)($body[$key] ?? ''));
    if ($value === '') json_error("$label is required.");
    if (strlen($value) > $maxLength) json_error("$label is too long.");
    return $value;
}

function application_portal_url(): string {
    return portal_base_url();
}

function pending_application_email_exists(string $email): bool {
    $stmt = db()->prepare(
        "SELECT
           EXISTS(SELECT 1 FROM customers WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL)
           OR EXISTS(SELECT 1 FROM customer_users WHERE LOWER(email) = LOWER(?))
           OR EXISTS(SELECT 1 FROM users WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL)
           OR EXISTS(SELECT 1 FROM customer_applications WHERE LOWER(email) = LOWER(?) AND status = 'PENDING')
           OR EXISTS(SELECT 1 FROM user_applications WHERE LOWER(email) = LOWER(?) AND status = 'PENDING')"
    );
    $stmt->execute([$email, $email, $email, $email, $email]);
    return (bool)$stmt->fetchColumn();
}

function staff_assignment(array $body): array {
    $roleId = trim((string)($body['roleId'] ?? ''));
    if ($roleId === '') json_error('Select the role to assign.', 422);

    $stmt = db()->prepare(
        'SELECT id, name, allowed_pages
         FROM roles WHERE id = ? AND deleted_at IS NULL'
    );
    $stmt->execute([$roleId]);
    $role = $stmt->fetch();
    if (!$role) json_error('Selected role was not found.', 422);

    $assignedCustomerId = null;
    $assignedCustomerName = null;
    if ($role['name'] === 'Technician') {
        $assignedCustomerId = trim((string)($body['assignedCustomerId'] ?? ''));
        if ($assignedCustomerId === '') {
            json_error('Select the customer this Technician will serve.', 422);
        }
        $stmt = db()->prepare(
            'SELECT id, name FROM customers
             WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
        );
        $stmt->execute([$assignedCustomerId]);
        $assignedCustomer = $stmt->fetch();
        if (!$assignedCustomer) json_error('Selected customer is not active.', 422);
        $assignedCustomerName = $assignedCustomer['name'];
    }

    return [
        'roleId' => $role['id'],
        'roleName' => $role['name'],
        'allowedPages' => json_decode($role['allowed_pages'] ?? '[]', true),
        'assignedCustomerId' => $assignedCustomerId,
        'assignedCustomerName' => $assignedCustomerName,
    ];
}

/**
 * Use an existing active checklist for this machine type. If none exists,
 * create a practical default inspection checklist so technicians can start
 * work immediately after approval.
 */
function sync_checklist_for_machine_type(string $machineType): array {
    $stmt = db()->prepare(
        'SELECT id, machine_type
         FROM checklist_templates
         WHERE LOWER(machine_type) = LOWER(?) AND deleted_at IS NULL AND is_active = 1
         ORDER BY created_at ASC
         LIMIT 1'
    );
    $stmt->execute([$machineType]);
    $existing = $stmt->fetch();
    if ($existing) {
        return [
            'templateId' => $existing['id'],
            'machineType' => $existing['machine_type'],
            'created' => false,
        ];
    }

    $templateId = uuid();
    db()->prepare(
        'INSERT INTO checklist_templates
         (id, name, machine_type, is_active, created_at)
         VALUES (?,?,?,1,NOW())'
    )->execute([
        $templateId,
        "$machineType - Standard Inspection",
        $machineType,
    ]);

    $items = [
        ['Engine condition', 'DROPDOWN', ['Good', 'Attention', 'Critical']],
        ['Hydraulic system', 'DROPDOWN', ['Good', 'Attention', 'Critical']],
        ['Electrical system', 'DROPDOWN', ['Good', 'Attention', 'Critical']],
        ['Transmission and drive system', 'DROPDOWN', ['Good', 'Attention', 'Critical']],
        ['Tyres / tracks and wheels', 'DROPDOWN', ['Good', 'Attention', 'Critical']],
        ['Brakes and steering', 'DROPDOWN', ['Good', 'Attention', 'Critical']],
        ['Safety devices and warning alarms', 'DROPDOWN', ['Good', 'Attention', 'Critical']],
        ['Oil, coolant or hydraulic leaks', 'DROPDOWN', ['None', 'Minor', 'Serious']],
        ['Technician remarks', 'TEXT', null],
    ];
    $safety = [
        'Good' => 'GREEN',
        'Attention' => 'YELLOW',
        'Critical' => 'RED',
        'None' => 'GREEN',
        'Minor' => 'YELLOW',
        'Serious' => 'RED',
    ];

    $insert = db()->prepare(
        'INSERT INTO checklist_template_items
         (id, template_id, label, input_type, safety_level, options, option_safety, "order", is_required)
         VALUES (?,?,?,?,?,CAST(? AS JSONB),CAST(? AS JSONB),?,?)'
    );
    foreach ($items as $order => [$label, $inputType, $options]) {
        $optionSafety = [];
        foreach (($options ?? []) as $option) {
            if (isset($safety[$option])) $optionSafety[$option] = $safety[$option];
        }
        $insert->execute([
            uuid(),
            $templateId,
            $label,
            $inputType,
            null,
            $options ? json_encode($options) : null,
            $optionSafety ? json_encode($optionSafety) : null,
            $order,
            $label === 'Technician remarks' ? 0 : 1,
        ]);
    }

    return [
        'templateId' => $templateId,
        'machineType' => $machineType,
        'created' => true,
    ];
}

// Public: every customer, Technician or staff member starts here.
if ($method === 'POST' && !$id) {
    $body = body();

    // Honeypot used by the public form. Humans never see or fill this field.
    if (trim((string)($body['website'] ?? '')) !== '') {
        json_out(['ok' => true, 'message' => 'Application received.'], 202);
    }

    $applicationType = strtoupper(trim((string)($body['applicationType'] ?? 'CUSTOMER')));
    if (!in_array($applicationType, ['CUSTOMER', 'SYSTEM_USER'], true)) {
        json_error('Select Customer or Staff / Technician registration.');
    }
    $email = strtolower(clean_required($body, 'email', 'Email'));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid email address.');
    if (pending_application_email_exists($email)) {
        json_error('This email already has a portal account or pending application.', 409);
    }

    $applicationId = uuid();
    $referencePrefix = $applicationType === 'CUSTOMER' ? 'BELM-C-' : 'BELM-U-';
    $reference = $referencePrefix . strtoupper(substr(str_replace('-', '', $applicationId), 0, 8));

    if ($applicationType === 'SYSTEM_USER') {
        $fullName = clean_required($body, 'fullName', 'Full name');
        $phone = clean_required($body, 'phone', 'Phone number', 50);
        $requestedRole = clean_required($body, 'requestedRole', 'Requested role', 100);
        $reason = trim((string)($body['reason'] ?? ''));
        db()->prepare(
            'INSERT INTO user_applications
             (id, reference_no, full_name, email, phone, requested_role, reason, status, submitted_at)
             VALUES (?,?,?,?,?,?,?,? ,NOW())'
        )->execute([
            $applicationId,
            $reference,
            $fullName,
            $email,
            $phone,
            $requestedRole,
            $reason !== '' ? $reason : null,
            'PENDING',
        ]);
    } else {
        $companyName = clean_required($body, 'companyName', 'Company name');
        $address = clean_required($body, 'address', 'Company address', 500);
        $phone = clean_required($body, 'phone', 'Phone number', 50);
        $tinNumber = clean_required($body, 'tinNumber', 'TIN number', 50);
        $vrn = clean_required($body, 'vrn', 'VRN number', 50);
        // The real password is generated only after administrator approval.
        // This placeholder preserves compatibility with existing databases.
        $pendingSecret = password_hash(secure_account_secret(24), PASSWORD_BCRYPT);
        db()->prepare(
            'INSERT INTO customer_applications
             (id, reference_no, company_name, email, address, phone, tin_number, vrn,
              machine_type, brand, model, reg_number, password_hash, status, submitted_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,? ,?,NOW())'
        )->execute([
            $applicationId,
            $reference,
            $companyName,
            $email,
            $address,
            $phone,
            $tinNumber,
            $vrn,
            '',
            '',
            '',
            '',
            $pendingSecret,
            'PENDING',
        ]);
    }

    json_out([
        'ok' => true,
        'reference' => $reference,
        'status' => 'PENDING',
        'applicationType' => $applicationType,
        'message' => 'Registration request received. No dashboard access is available until an administrator assigns and approves the correct role.',
    ], 201);
}

// Every operation below is admin-only.
$user = require_auth();
require_page_access($user, 'customers');

if ($method === 'GET' && !$id) {
    $status = strtoupper(trim((string)($_GET['status'] ?? '')));
    $customerSql = 'SELECT a.*, u.name AS reviewed_by_name,
                           c.portal_link, c.name AS registered_customer_name
                    FROM customer_applications a
                    LEFT JOIN users u ON u.id = a.reviewed_by
                    LEFT JOIN customers c ON c.id = a.customer_id';
    $userSql = 'SELECT a.*, reviewer.name AS reviewed_by_name,
                       r.name AS assigned_role_name,
                       c.name AS assigned_customer_name
                FROM user_applications a
                LEFT JOIN users reviewer ON reviewer.id = a.reviewed_by
                LEFT JOIN roles r ON r.id = a.assigned_role_id
                LEFT JOIN customers c ON c.id = a.assigned_customer_id';
    $customerParams = [];
    $userParams = [];
    if (in_array($status, ['PENDING', 'APPROVED', 'CANCELLED'], true)) {
        $customerSql .= ' WHERE a.status = ?';
        $userSql .= ' WHERE a.status = ?';
        $customerParams[] = $status;
        $userParams[] = $status;
    }

    $stmt = db()->prepare($customerSql);
    $stmt->execute($customerParams);
    $applications = [];
    foreach ($stmt->fetchAll() as $row) {
        $row['application_type'] = 'CUSTOMER';
        $row['display_name'] = $row['company_name'];
        $applications[] = $row;
    }

    if (($user['roleName'] ?? '') === 'Super Admin') {
        $stmt = db()->prepare($userSql);
        $stmt->execute($userParams);
        foreach ($stmt->fetchAll() as $row) {
            $row['application_type'] = 'SYSTEM_USER';
            $row['display_name'] = $row['full_name'];
            $applications[] = $row;
        }
    }

    usort($applications, static function (array $left, array $right): int {
        $rank = ['PENDING' => 0, 'APPROVED' => 1, 'CANCELLED' => 2];
        $statusCompare = ($rank[$left['status']] ?? 9) <=> ($rank[$right['status']] ?? 9);
        if ($statusCompare !== 0) return $statusCompare;
        return strcmp((string)$right['submitted_at'], (string)$left['submitted_at']);
    });

    json_out([
        'applications' => $applications,
        'portalUrl' => application_portal_url(),
    ]);
}

if ($method === 'PUT' && $id && $action === 'approve') {
    $approvalBody = body();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT * FROM customer_applications WHERE id = ? FOR UPDATE');
        $stmt->execute([$id]);
        $application = $stmt->fetch();
        if ($application) {
            if ($application['status'] !== 'PENDING') {
                $pdo->rollBack();
                json_error('Only a pending application can be approved.', 409);
            }

            $stmt = $pdo->prepare(
                'SELECT 1 FROM customers WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL
                 UNION ALL SELECT 1 FROM users WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL
                 UNION ALL SELECT 1 FROM customer_users WHERE LOWER(email) = LOWER(?)
                 LIMIT 1'
            );
            $stmt->execute([$application['email'], $application['email'], $application['email']]);
            if ($stmt->fetch()) {
                $pdo->rollBack();
                json_error('This email already belongs to another portal account.', 409);
            }

            $customerId = uuid();
            $portalLink = customer_portal_slug($application['company_name']);
            $temporaryPassword = secure_account_secret();
            $recoveryCode = account_recovery_code();

            $pdo->prepare(
                'INSERT INTO customers
                 (id, name, tin_number, vrn, email, phone, address, portal_link,
                  password, recovery_code_hash, is_active, created_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,1,NOW())'
            )->execute([
                $customerId,
                $application['company_name'],
                $application['tin_number'],
                $application['vrn'],
                $application['email'],
                $application['phone'],
                $application['address'],
                $portalLink,
                password_hash($temporaryPassword, PASSWORD_BCRYPT),
                password_hash($recoveryCode, PASSWORD_BCRYPT),
            ]);

            // Registration approval creates the customer account only. Machines are
            // registered later from the customer machine workspace or BELM Admin.
            $pdo->prepare(
                "UPDATE customer_applications
                 SET status = 'APPROVED', reviewed_at = NOW(), reviewed_by = ?,
                     customer_id = ?, machine_id = NULL
                 WHERE id = ?"
            )->execute([$user['id'], $customerId, $id]);

            $pdo->prepare(
                'INSERT INTO activity_logs (id, user_id, action, entity, entity_id, metadata, created_at)
                 VALUES (?,?,?,?,?,?,NOW())'
            )->execute([
                uuid(),
                $user['id'],
                'APPROVE_CUSTOMER_APPLICATION',
                'customerApplication',
                $id,
                json_encode(['customerId' => $customerId, 'machineCreated' => false]),
            ]);

            $pdo->commit();
            json_out([
                'ok' => true,
                'status' => 'APPROVED',
                'applicationType' => 'CUSTOMER',
                'customerId' => $customerId,
                'customerName' => $application['company_name'],
                'displayName' => $application['company_name'],
                'assignedRole' => 'Customer',
                'loginEmail' => $application['email'],
                'temporaryPassword' => $temporaryPassword,
                'recoveryCode' => $recoveryCode,
                'portalLink' => $portalLink,
                'loginUrl' => customer_portal_url($portalLink, $application['email']),
                'message' => 'Customer account is ready. Machines can be registered after login.',
            ]);
        }

        $stmt = $pdo->prepare('SELECT * FROM user_applications WHERE id = ? FOR UPDATE');
        $stmt->execute([$id]);
        $staffApplication = $stmt->fetch();
        if (!$staffApplication) {
            $pdo->rollBack();
            json_error('Application not found.', 404);
        }
        if (($user['roleName'] ?? '') !== 'Super Admin') {
            $pdo->rollBack();
            json_error('Only a Super Admin can approve system-user access.', 403);
        }
        if ($staffApplication['status'] !== 'PENDING') {
            $pdo->rollBack();
            json_error('Only a pending application can be approved.', 409);
        }

        $assignment = staff_assignment($approvalBody);
        $stmt = $pdo->prepare(
            'SELECT 1 FROM users WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL
             UNION ALL SELECT 1 FROM customers WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL
             UNION ALL SELECT 1 FROM customer_users WHERE LOWER(email) = LOWER(?)
             LIMIT 1'
        );
        $stmt->execute([
            $staffApplication['email'],
            $staffApplication['email'],
            $staffApplication['email'],
        ]);
        if ($stmt->fetch()) {
            $pdo->rollBack();
            json_error('This email already belongs to another portal account.', 409);
        }

        $newUserId = uuid();
        $temporaryPassword = secure_account_secret();
        $recoveryCode = account_recovery_code();
        $pdo->prepare(
            'INSERT INTO users
             (id, name, email, password_hash, recovery_code_hash, phone, is_active,
              role_id, assigned_customer_id, created_at)
             VALUES (?,?,?,?,?,?,1,?,?,NOW())'
        )->execute([
            $newUserId,
            $staffApplication['full_name'],
            $staffApplication['email'],
            password_hash($temporaryPassword, PASSWORD_BCRYPT),
            password_hash($recoveryCode, PASSWORD_BCRYPT),
            $staffApplication['phone'],
            $assignment['roleId'],
            $assignment['assignedCustomerId'],
        ]);
        $pdo->prepare(
            "UPDATE user_applications
             SET status = 'APPROVED', reviewed_at = NOW(), reviewed_by = ?,
                 user_id = ?, assigned_role_id = ?, assigned_customer_id = ?
             WHERE id = ?"
        )->execute([
            $user['id'],
            $newUserId,
            $assignment['roleId'],
            $assignment['assignedCustomerId'],
            $id,
        ]);
        $pdo->prepare(
            'INSERT INTO activity_logs (id, user_id, action, entity, entity_id, metadata, created_at)
             VALUES (?,?,?,?,?,?,NOW())'
        )->execute([
            uuid(),
            $user['id'],
            'APPROVE_USER_APPLICATION',
            'userApplication',
            $id,
            json_encode([
                'newUserId' => $newUserId,
                'roleId' => $assignment['roleId'],
                'assignedCustomerId' => $assignment['assignedCustomerId'],
            ]),
        ]);

        // V289: friendly staff aliases. Technician -> TECH@BELM;
        // every other BELM user -> <name>@BELM. The account's own credentials
        // and assigned role still determine actual access after sign-in.
        $staffLoginUrl = belm_staff_login_url($staffApplication['full_name'], $assignment['roleName']);
        $pdo->commit();
        json_out([
            'ok' => true,
            'status' => 'APPROVED',
            'applicationType' => 'SYSTEM_USER',
            'userId' => $newUserId,
            'displayName' => $staffApplication['full_name'],
            'customerName' => $staffApplication['full_name'],
            'assignedRole' => $assignment['roleName'],
            'assignedCustomerName' => $assignment['assignedCustomerName'],
            'loginEmail' => $staffApplication['email'],
            'temporaryPassword' => $temporaryPassword,
            'recoveryCode' => $recoveryCode,
            'loginUrl' => $staffLoginUrl,
            'message' => 'System user was activated with only the assigned role access.',
        ]);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

if ($method === 'PUT' && $id && $action === 'cancel') {
    $stmt = db()->prepare(
        "UPDATE customer_applications
         SET status = 'CANCELLED', reviewed_at = NOW(), reviewed_by = ?
         WHERE id = ? AND status = 'PENDING'"
    );
    $stmt->execute([$user['id'], $id]);
    if ($stmt->rowCount() === 0) {
        if (($user['roleName'] ?? '') !== 'Super Admin') {
            json_error('Only a Super Admin can cancel system-user registration.', 403);
        }
        $stmt = db()->prepare(
            "UPDATE user_applications
             SET status = 'CANCELLED', reviewed_at = NOW(), reviewed_by = ?
             WHERE id = ? AND status = 'PENDING'"
        );
        $stmt->execute([$user['id'], $id]);
    }
    if ($stmt->rowCount() === 0) {
        json_error('Application was not found or is no longer pending.', 409);
    }
    db()->prepare(
        'INSERT INTO activity_logs (id, user_id, action, entity, entity_id, created_at)
         VALUES (?,?,?,?,?,NOW())'
    )->execute([uuid(), $user['id'], 'CANCEL_ACCESS_APPLICATION', 'accessApplication', $id]);
    json_out(['ok' => true, 'status' => 'CANCELLED']);
}

json_error('Unknown application request.', 404);
