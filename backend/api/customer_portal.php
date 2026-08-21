<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/../config/mailer.php';
require_once __DIR__ . '/checklist_reports_helpers.php';
require_once __DIR__ . '/proforma_pdf_helper.php';
require_once __DIR__ . '/invoice_pdf_helper.php';
require_once __DIR__ . '/table_pdf_helper.php';
require_once __DIR__ . '/service_due_helper.php';

$customer = require_customer_auth();
$method = $_SERVER['REQUEST_METHOD'];
$sub = $_GET['sub'] ?? '';
$sub2 = $_GET['sub2'] ?? '';
$sub3 = $_GET['sub3'] ?? '';
// V411: Job Card is the only customer-to-BELM work object. Keep the legacy
// service_requests storage path behind the API so existing records are preserved.
if ($sub === 'job-cards') $sub = 'service-requests';

// V273 - turns a day/month/year (or explicit date) filter from the
// "Job Card Reports" / "Daily Report" tabs into an inclusive from/to
// timestamp range for a SQL query. Accepts either a full date
// (YYYY-MM-DD) or a partial one (YYYY-MM or YYYY) for a whole-month or
// whole-year selection. Returns [null, null] when nothing was chosen,
// meaning "all time" - callers skip the date condition entirely then.
function customer_portal_date_range(string $from, string $to): array {
    $normalize = function (string $value, bool $isEnd): ?string {
        $value = trim($value);
        if ($value === '') return null;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            $dt = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('Africa/Dar_es_Salaam'));
            if (!$dt) return null;
            return $isEnd ? $dt->modify('+1 day')->format('Y-m-d') : $dt->format('Y-m-d');
        }
        if (preg_match('/^\d{4}-\d{2}$/', $value)) {
            $dt = DateTimeImmutable::createFromFormat('!Y-m', $value, new DateTimeZone('Africa/Dar_es_Salaam'));
            if (!$dt) return null;
            return $isEnd ? $dt->modify('+1 month')->format('Y-m-d') : $dt->format('Y-m-d');
        }
        if (preg_match('/^\d{4}$/', $value)) {
            $dt = DateTimeImmutable::createFromFormat('!Y', $value, new DateTimeZone('Africa/Dar_es_Salaam'));
            if (!$dt) return null;
            return $isEnd ? $dt->modify('+1 year')->format('Y-m-d') : $dt->format('Y-m-d');
        }
        return null;
    };
    $fromResolved = $normalize($from, false);
    $toResolved = $to !== '' ? $normalize($to, true) : ($fromResolved !== null && $from === $to ? $fromResolved : null);
    // If only "from" is given (e.g. picking a single month/year), treat
    // it as that whole period: recompute the end as one unit after start.
    if ($fromResolved !== null && $toResolved === null && trim($to) === '') {
        $toResolved = $normalize($from, true);
    }
    return [$fromResolved, $toResolved];
}

function log_customer_activity(array $customer, string $action): void {
    $actorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Someone'));
    db()->prepare(
        'INSERT INTO customer_activity_logs (id, customer_id, actor_name, action, created_at) VALUES (?,?,?,?,NOW())'
    )->execute([uuid(), $customer['id'], $actorName, $action]);
}


// V387 - Customer machine self-management is available only when BELM is NOT
// the active service provider. The UI mirrors this rule, but the API enforces
// it as the source of truth so disabled buttons cannot be bypassed manually.
function require_customer_machine_management_access(array $customer): void {
    require_customer_write_access($customer);
    $isOwner = ($customer['actorType'] ?? '') === 'owner';
    $isCompanyAdmin = ($customer['actorType'] ?? '') === 'assistant'
        && strtolower(trim((string)($customer['customerRole'] ?? ''))) === 'admin';
    if (!$isOwner && !$isCompanyAdmin) {
        json_error('Only the main customer account or Company Admin can manage machines.', 403);
    }
    $stmt = db()->prepare('SELECT is_machinery_admin FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
    $stmt->execute([$customer['id']]);
    $selfServiceEnabled = $stmt->fetchColumn();
    if (empty($selfServiceEnabled)) {
        json_error('BELM Service Provider is ON. Add, Edit, Delete and Forget Machine are controlled by BELM while this switch is ON.', 403);
    }
}

function customer_machine_details_from_body(array $body): array {
    $machineType = trim((string)($body['machineType'] ?? ''));
    $model = trim((string)($body['model'] ?? ''));
    $serialNumber = trim((string)($body['serialNumber'] ?? ''));
    $regNumber = trim((string)($body['regNumber'] ?? ''));
    $fleetNumber = trim((string)($body['fleetNumber'] ?? ''));
    $brand = trim((string)($body['brand'] ?? ''));
    $serviceKit = trim((string)($body['serviceKit'] ?? 'OK')) ?: 'OK';
    if ($machineType === '') json_error('Machine type is required.');
    if ($model === '') json_error('Machine model is required.');
    if ($serialNumber === '' && $regNumber === '') json_error('Enter a serial number or machine registration number.');
    if (!in_array($serviceKit, ['OK', 'NEW'], true)) $serviceKit = 'OK';
    return [
        'machineType' => $machineType,
        'model' => $model,
        'serialNumber' => $serialNumber !== '' ? $serialNumber : null,
        'regNumber' => $regNumber !== '' ? $regNumber : null,
        'fleetNumber' => $fleetNumber !== '' ? $fleetNumber : null,
        'brand' => $brand !== '' ? $brand : null,
        'serviceKit' => $serviceKit,
    ];
}

function customer_assert_machine_serial_available(?string $serialNumber, ?string $excludeMachineId = null): void {
    if ($serialNumber === null || trim($serialNumber) === '') return;
    $sql = 'SELECT 1 FROM machines WHERE LOWER(serial_number) = LOWER(?)';
    $params = [$serialNumber];
    if ($excludeMachineId !== null && $excludeMachineId !== '') {
        $sql .= ' AND id <> ?';
        $params[] = $excludeMachineId;
    }
    $sql .= ' LIMIT 1';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    if ($stmt->fetch()) json_error('This serial number is already registered to another machine.', 409);
}

// Same machine-owned cleanup proven on BELM Admin hard-delete, scoped here to
// one authenticated customer's machine. Customer-independent commercial rows
// are detached so the customer and every other machine remain intact.
function customer_forget_machine_permanently(PDO $pdo, string $machineId): void {
    $ids = [$machineId];
    $in = implode(',', array_fill(0, count($ids), '?'));
    $pdo->prepare("DELETE FROM checklist_answers WHERE report_id IN (SELECT id FROM checklist_reports WHERE machine_id IN ($in))")->execute($ids);
    $pdo->prepare("DELETE FROM checklist_reports WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM usage_logs WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM petty_cash_topups WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM machine_operator_shifts WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM operator_reports WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM machine_operators WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM spare_part_requests WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("UPDATE service_requests SET machine_id=NULL WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("UPDATE invoices SET machine_id=NULL WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("UPDATE proforma_invoices SET machine_id=NULL WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("UPDATE customer_applications SET machine_id=NULL WHERE machine_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM trash_entries WHERE entity_type='machine' AND entity_id IN ($in)")->execute($ids);
    $pdo->prepare("DELETE FROM machines WHERE id IN ($in)")->execute($ids);
}

// Valid per-feature access keys an assistant can be limited to. If the
// request sends 'all' (or omits permissions entirely), the assistant gets
// full access — represented internally as NULL, not an exhaustive list.
const CUSTOMER_PERMISSION_KEYS = [
    'machine-expenses', 'fuel-usage', 'email', 'whatsapp', 'check-up', 'service-request',
    'report-problem', 'operator-reports', 'assign-users', 'store', 'workflow',
];

// Role Manager roles for customer-owned portal users. Legacy admin/assistant
// values remain accepted so existing accounts keep working after upgrade.
const CUSTOMER_PORTAL_USER_ROLES = [
    'workshop_manager', 'store_keeper', 'accounts', 'procurement', 'operator',
    'admin', 'assistant',
];

function customer_has_feature_access(array $customer, string $permissionKey): bool {
    if (($customer['actorType'] ?? '') === 'owner') return true;
    $permissions = $customer['permissions'] ?? null;
    if ($permissions === null) return true;
    return is_array($permissions) && in_array($permissionKey, $permissions, true);
}

function require_customer_feature_access(array $customer, string $permissionKey, string $label = 'this section'): void {
    if (!customer_has_feature_access($customer, $permissionKey)) {
        json_error('Your Role Manager access does not include ' . $label . '.', 403);
    }
}

function require_customer_any_feature_access(array $customer, array $permissionKeys, string $label = 'this section'): void {
    foreach ($permissionKeys as $permissionKey) {
        if (customer_has_feature_access($customer, (string)$permissionKey)) return;
    }
    json_error('Your Role Manager access does not include ' . $label . '.', 403);
}

function customer_can_manage_store(array $customer): bool {
    if (($customer['actorType'] ?? '') === 'owner') return true;
    $role = strtolower(trim((string)($customer['customerRole'] ?? '')));
    $permissions = $customer['permissions'] ?? null;
    if ($permissions === null) return true;
    if (is_array($permissions)) return in_array('store', $permissions, true);
    return in_array($role, ['admin', 'assistant', 'accounts', 'workshop_manager', 'store_keeper', 'procurement'], true);
}

function customer_store_item_rows(string $customerId): array {
    $stmt = db()->prepare(
        "SELECT csi.id, csi.part_number, csi.description, csi.unit, csi.qty_on_hand,
                csi.average_unit_cost, csi.updated_at,
                COALESCE(SUM(CASE WHEN csm.movement_type = 'RECEIVE' THEN csm.quantity ELSE 0 END), 0) AS total_received,
                COALESCE(SUM(CASE WHEN csm.movement_type = 'ISSUE' THEN csm.quantity ELSE 0 END), 0) AS total_issued
         FROM customer_store_items csi
         LEFT JOIN customer_store_movements csm ON csm.store_item_id = csi.id
         WHERE csi.customer_id = ?
         GROUP BY csi.id
         ORDER BY csi.description ASC, csi.part_number ASC"
    );
    $stmt->execute([$customerId]);
    return $stmt->fetchAll();
}

function customer_store_audit_rows(string $customerId, string $machineId): array {
    $stmt = db()->prepare(
        "SELECT csm.id, csm.movement_type, csm.quantity, csm.unit_cost, csm.balance_after,
                csm.actor_name, csm.received_by, csm.note, csm.created_at,
                csi.part_number, csi.description, csi.unit,
                m.model AS machine_model, m.brand AS machine_brand
         FROM customer_store_movements csm
         JOIN customer_store_items csi ON csi.id = csm.store_item_id
         LEFT JOIN machines m ON m.id = csm.machine_id
         WHERE csm.customer_id = ?
           AND (
             csm.machine_id = ?
             OR csm.store_item_id IN (
               SELECT DISTINCT ul.store_item_id
               FROM usage_logs ul
               WHERE ul.customer_id = ? AND ul.machine_id = ?
                 AND ul.store_item_id IS NOT NULL
             )
           )
         ORDER BY csm.created_at DESC
         LIMIT 150"
    );
    $stmt->execute([$customerId, $machineId, $customerId, $machineId]);
    return $stmt->fetchAll();
}

function customer_store_summary(string $customerId, string $machineId): array {
    $items = customer_store_item_rows($customerId);
    $machineStmt = db()->prepare(
        "SELECT COUNT(*) AS issue_count, COALESCE(SUM(quantity * unit_cost),0) AS value
         FROM customer_store_movements
         WHERE customer_id = ? AND machine_id = ? AND movement_type = 'ISSUE'"
    );
    $machineStmt->execute([$customerId, $machineId]);
    $machineUsage = $machineStmt->fetch() ?: ['issue_count' => 0, 'value' => 0];
    $stockQty = 0.0;
    $stockValue = 0.0;
    foreach ($items as $item) {
        $stockQty += (float)$item['qty_on_hand'];
        $stockValue += (float)$item['qty_on_hand'] * (float)$item['average_unit_cost'];
    }
    return [
        'itemCount' => count($items),
        'stockQty' => round($stockQty, 2),
        'stockValue' => round($stockValue, 2),
        'machineIssueCount' => (int)$machineUsage['issue_count'],
        'machineIssuedValue' => round((float)$machineUsage['value'], 2),
    ];
}

function customer_can_approve_store_issue(array $customer): bool {
    if (($customer['actorType'] ?? '') === 'owner') return true;
    if (!customer_has_feature_access($customer, 'machine-expenses')) return false;
    $role = strtolower(trim((string)($customer['customerRole'] ?? '')));
    return in_array($role, ['accounts', 'admin'], true);
}

function customer_machine_for_action(string $customerId, string $machineId): array {
    $stmt = db()->prepare(
        'SELECT id, machine_type, model, serial_number, reg_number, brand
         FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
    );
    $stmt->execute([$machineId, $customerId]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine not found for this customer.', 404);
    return $machine;
}

function customer_match_store_item(string $customerId, string $referenceNumber, string $description): ?array {
    $referenceNumber = trim($referenceNumber);
    $description = trim($description);
    if ($referenceNumber === '' && $description === '') return null;
    if ($referenceNumber !== '') {
        $stmt = db()->prepare(
            'SELECT id, part_number, description, unit, qty_on_hand, average_unit_cost
             FROM customer_store_items
             WHERE customer_id = ? AND UPPER(TRIM(part_number)) = UPPER(TRIM(?))
             LIMIT 1'
        );
        $stmt->execute([$customerId, $referenceNumber]);
        $row = $stmt->fetch();
        if ($row) {
            $row['matched_by'] = 'PART_NUMBER';
            return $row;
        }
    }
    if ($description !== '') {
        $stmt = db()->prepare(
            'SELECT id, part_number, description, unit, qty_on_hand, average_unit_cost
             FROM customer_store_items
             WHERE customer_id = ? AND LOWER(TRIM(description)) = LOWER(TRIM(?))
             ORDER BY qty_on_hand DESC
             LIMIT 1'
        );
        $stmt->execute([$customerId, $description]);
        $row = $stmt->fetch();
        if ($row) {
            $row['matched_by'] = 'DESCRIPTION';
            return $row;
        }
    }
    return null;
}

function customer_spare_store_check_rows(string $customerId, array $items): array {
    $result = [];
    foreach ($items as $index => $raw) {
        if (!is_array($raw)) continue;
        $referenceNumber = trim((string)($raw['referenceNumber'] ?? ''));
        $description = trim((string)($raw['description'] ?? ''));
        $quantity = max(0, (float)($raw['quantity'] ?? 0));
        $store = customer_match_store_item($customerId, $referenceNumber, $description);
        $available = $store ? (float)$store['qty_on_hand'] : 0.0;
        $shortage = max(0.0, $quantity - $available);
        $result[] = [
            'inputIndex' => (int)$index,
            'referenceNumber' => $referenceNumber,
            'description' => $description,
            'quantity' => $quantity,
            'storeItemId' => $store['id'] ?? null,
            'storePartNumber' => $store['part_number'] ?? null,
            'storeDescription' => $store['description'] ?? null,
            'unit' => $store['unit'] ?? 'PC',
            'available' => round($available, 2),
            'shortage' => round($shortage, 2),
            'unitCost' => round((float)($store['average_unit_cost'] ?? 0), 2),
            'matchedBy' => $store['matched_by'] ?? null,
            'inStore' => $store !== null,
            'enough' => $store !== null && $available + 0.00001 >= $quantity && $quantity > 0,
        ];
    }
    return $result;
}

function customer_store_issue_request_rows(string $customerId, string $machineId): array {
    $stmt = db()->prepare(
        "SELECT csir.*, csi.qty_on_hand AS current_store_balance, csi.average_unit_cost AS current_unit_cost
         FROM customer_store_issue_requests csir
         JOIN customer_store_items csi ON csi.id = csir.store_item_id
         WHERE csir.customer_id = ? AND csir.machine_id = ?
         ORDER BY CASE WHEN csir.status = 'PENDING_APPROVAL' THEN 0 ELSE 1 END,
                  csir.requested_at DESC
         LIMIT 100"
    );
    $stmt->execute([$customerId, $machineId]);
    return $stmt->fetchAll();
}

// V297 - unified Procurement queue. Every spare requirement enters this
// queue first; Procurement decides Store issue vs external purchase.
function customer_can_manage_procurement(array $customer): bool {
    if (($customer['actorType'] ?? '') === 'owner') return true;
    if (!customer_has_feature_access($customer, 'machine-expenses')) return false;
    $role = strtolower(trim((string)($customer['customerRole'] ?? '')));
    return in_array($role, ['procurement', 'admin'], true);
}

function customer_procurement_request_rows(string $customerId, string $machineId): array {
    $stmt = db()->prepare(
        "SELECT cpr.*, csi.id AS current_store_item_id, csi.qty_on_hand AS current_store_balance,
                csi.average_unit_cost AS current_store_unit_cost,
                bsr.status AS maintenance_spare_status
         FROM customer_procurement_requests cpr
         LEFT JOIN LATERAL (
             SELECT si.id,si.qty_on_hand,si.average_unit_cost
             FROM customer_store_items si
             WHERE si.customer_id=cpr.customer_id
               AND (
                    si.id=cpr.store_item_id
                    OR (COALESCE(TRIM(cpr.part_number),'')<>'' AND UPPER(TRIM(si.part_number))=UPPER(TRIM(cpr.part_number)))
                    OR LOWER(TRIM(si.description))=LOWER(TRIM(cpr.description))
               )
             ORDER BY CASE WHEN si.id=cpr.store_item_id THEN 0
                           WHEN COALESCE(TRIM(cpr.part_number),'')<>'' AND UPPER(TRIM(si.part_number))=UPPER(TRIM(cpr.part_number)) THEN 1
                           ELSE 2 END,
                      si.updated_at DESC
             LIMIT 1
         ) csi ON TRUE
         LEFT JOIN breakdown_spare_requests bsr ON bsr.procurement_request_id = cpr.id
         WHERE cpr.customer_id = ? AND cpr.machine_id = ?
         ORDER BY CASE cpr.status
                    WHEN 'PENDING_PROCUREMENT' THEN 0
                    WHEN 'BELM_REQUESTED' THEN 1
                    WHEN 'PURCHASE_REQUIRED' THEN 2
                    WHEN 'ORDERED' THEN 3
                    ELSE 4 END,
                  cpr.requested_at DESC
         LIMIT 150"
    );
    $stmt->execute([$customerId, $machineId]);
    return $stmt->fetchAll();
}

function customer_service_job_billing_rows(string $customerId, string $machineId): array {
    $stmt=db()->prepare(
        "SELECT j.id,j.job_card_no,j.title,j.status,j.issued_by_name,j.issued_at,j.customer_signed_by_name,j.customer_signed_at,
                j.signed_copy_name,j.billing_status,j.completed_at,
                p.id AS proforma_id,p.invoice_no AS proforma_no,p.delivery_status AS proforma_status,
                i.id AS invoice_id,i.invoice_no AS invoice_no,i.status AS invoice_status,i.total AS invoice_total,i.due_date,
                COALESCE(pay.paid_amount,0) AS paid_amount,
                GREATEST(0,COALESCE(i.total,0)-COALESCE(pay.paid_amount,0)) AS balance
         FROM digital_job_cards j
         JOIN breakdown_cases bc ON bc.id=j.case_id AND bc.source_type='SERVICE_REQUEST'
         LEFT JOIN LATERAL (
             SELECT pp.id,pp.invoice_no,pp.delivery_status FROM proforma_invoices pp
             WHERE pp.source_job_card_id=j.id AND pp.deleted_at IS NULL ORDER BY pp.created_at DESC LIMIT 1
         ) p ON TRUE
         LEFT JOIN LATERAL (
             SELECT ii.id,ii.invoice_no,ii.status,ii.total,ii.due_date FROM invoices ii
             WHERE ii.source_job_card_id=j.id AND ii.deleted_at IS NULL AND ii.status<>'CANCELLED' ORDER BY ii.created_at DESC LIMIT 1
         ) i ON TRUE
         LEFT JOIN LATERAL (
             SELECT COALESCE(SUM(py.amount),0) AS paid_amount FROM payments py WHERE py.invoice_id=i.id
         ) pay ON TRUE
         WHERE j.customer_id=? AND j.machine_id=?
         ORDER BY COALESCE(j.completed_at,j.created_at) DESC LIMIT 100"
    );
    $stmt->execute([$customerId,$machineId]);
    $rows=$stmt->fetchAll();
    foreach($rows as &$row){$row['hasSignedCopy']=!empty($row['signed_copy_name']);}
    unset($row);return $rows;
}

function customer_procurement_case_for_machine(array $customer, array $machine, string $batchId): string {
    $pdo = db();
    $stmt = $pdo->prepare(
        "SELECT id FROM breakdown_cases
         WHERE customer_id = ? AND machine_id = ? AND status <> 'COMPLETED'
         ORDER BY opened_at DESC LIMIT 1"
    );
    $stmt->execute([$customer['id'], $machine['id']]);
    $caseId = (string)($stmt->fetchColumn() ?: '');
    $actor = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer')) ?: 'Customer';
    $machineLabel = trim((string)($machine['brand'] ?? '') . ' ' . (string)($machine['model'] ?? '')) ?: ((string)($machine['machine_type'] ?? 'Machine'));
    if ($caseId === '') {
        $caseId = uuid();
        $pdo->prepare(
            "INSERT INTO breakdown_cases
             (id,customer_id,machine_id,source_type,source_id,title,description,status,current_stage,current_department,
              blocker_reason,stage_started_at,opened_at,updated_at,created_by_name)
             VALUES (?,?,?,?,?,?,?,'OPEN','PROCUREMENT','Procurement',?,NOW(),NOW(),NOW(),?)"
        )->execute([
            $caseId, $customer['id'], $machine['id'], 'PROCUREMENT', $batchId,
            'Spare Procurement Request', 'Spare/material requested for ' . $machineLabel,
            'Waiting Procurement to source or issue requested spare(s).', $actor,
        ]);
    } else {
        $pdo->prepare(
            "UPDATE breakdown_cases SET current_stage='PROCUREMENT', current_department='Procurement',
                    blocker_reason='Waiting Procurement to source or issue requested spare(s).',
                    stage_started_at=NOW(), updated_at=NOW()
             WHERE id=? AND status <> 'COMPLETED'"
        )->execute([$caseId]);
    }
    $pdo->prepare(
        "INSERT INTO breakdown_case_events
         (id,case_id,stage,department,action,note,actor_type,actor_id,actor_name,created_at)
         VALUES (?,?,'PROCUREMENT','Procurement','Procurement request submitted',?, 'customer', NULL, ?, NOW())"
    )->execute([uuid(), $caseId, 'Spare requirement sent to Procurement for Store/source decision.', $actor]);
    return $caseId;
}

function customer_refresh_procurement_case(string $caseId, array $customer, string $action, string $note = ''): void {
    $pdo = db();
    $stmt = $pdo->prepare(
        "SELECT
           COUNT(*) FILTER (WHERE status NOT IN ('PARTS_READY','REJECTED')) AS pending_count,
           COUNT(*) FILTER (WHERE status = 'BELM_REQUESTED') AS belm_count,
           COUNT(*) FILTER (WHERE status = 'PARTS_READY') AS ready_count,
           COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected_count
         FROM breakdown_spare_requests
         WHERE case_id = ? AND procurement_request_id IS NOT NULL"
    );
    $stmt->execute([$caseId]);
    $counts = $stmt->fetch() ?: ['pending_count'=>0,'belm_count'=>0,'ready_count'=>0,'rejected_count'=>0];
    $pending = (int)$counts['pending_count'];
    $belmPending = (int)$counts['belm_count'];
    $ready = (int)$counts['ready_count'];
    if ($pending > 0) {
        $stage = 'PROCUREMENT';
        $department = 'Procurement';
        $blocker = $belmPending > 0
            ? 'Waiting BELM supply via Procurement on ' . $belmPending . ' spare item(s).'
            : 'Waiting Procurement action on ' . $pending . ' spare item(s).';
    } elseif ($ready > 0) {
        $stage = 'PARTS_READY';
        $department = 'Workshop';
        $blocker = null;
    } else {
        $stage = 'DIAGNOSIS';
        $department = 'Workshop';
        $blocker = 'Procurement request closed without parts issued.';
    }
    $pdo->prepare(
        "UPDATE breakdown_cases SET current_stage=?, current_department=?, blocker_reason=?, stage_started_at=NOW(), updated_at=NOW() WHERE id=? AND status <> 'COMPLETED'"
    )->execute([$stage, $department, $blocker, $caseId]);
    $actor = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer')) ?: 'Customer';
    $pdo->prepare(
        'INSERT INTO breakdown_case_events (id,case_id,stage,department,action,note,actor_type,actor_id,actor_name,created_at) VALUES (?,?,?,?,?,?,?,?,?,NOW())'
    )->execute([uuid(), $caseId, $stage, $department, $action, $note !== '' ? $note : null, 'customer', null, $actor]);
}

function customer_machine_spare_list_rows(string $customerId, string $machineId): array {
    $stmt = db()->prepare(
        'SELECT id, reference_number, description, quantity, selected, created_by_name, created_at, updated_at
         FROM customer_machine_spare_list_items
         WHERE customer_id = ? AND machine_id = ?
         ORDER BY created_at ASC, id ASC'
    );
    $stmt->execute([$customerId, $machineId]);
    return $stmt->fetchAll();
}

function customer_permissions_from_body(array $body): ?string {
    $raw = $body['permissions'] ?? 'all';
    if ($raw === 'all' || $raw === null) return null;
    if (!is_array($raw)) return null;
    $clean = array_values(array_unique(array_intersect(array_map('strval', $raw), CUSTOMER_PERMISSION_KEYS)));
    // NULL means full access. An intentionally empty selection must remain []
    // instead of silently becoming full access.
    if (count($clean) === count(CUSTOMER_PERMISSION_KEYS)) return null;
    return json_encode($clean);
}


function technician_permissions_from_body(array $body): string {
    $raw = $body['permissions'] ?? [];
    if ($raw === 'all' || $raw === null) return '__ALL__';
    if (!is_array($raw)) return '[]';
    $clean = array_values(array_unique(array_intersect(array_map('strval', $raw), CUSTOMER_PERMISSION_KEYS)));
    if (count($clean) === count(CUSTOMER_PERMISSION_KEYS)) return '__ALL__';
    return json_encode($clean);
}

function customer_role_permissions_json(string $role, ?string $permissionsJson): ?string {
    if ($role !== 'operator') return $permissionsJson;
    $operatorCardPermissions = [
        'machine-expenses', 'fuel-usage', 'operator-reports',
        'service-request', 'report-problem', 'check-up', 'workflow',
    ];
    if ($permissionsJson === null) return json_encode($operatorCardPermissions);
    $decoded = json_decode($permissionsJson, true);
    if (!is_array($decoded)) $decoded = [];
    return json_encode(array_values(array_intersect(array_map('strval', $decoded), $operatorCardPermissions)));
}

function customer_portal_user_count(string $customerId): int {
    $stmt = db()->prepare(
        "SELECT
           (SELECT COUNT(*) FROM customer_users WHERE customer_id = ? AND is_active = 1)
           +
           (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id
            WHERE u.assigned_customer_id = ? AND u.is_customer_managed = 1
              AND u.is_active = 1 AND u.deleted_at IS NULL AND r.name = 'Technician') AS total"
    );
    $stmt->execute([$customerId, $customerId]);
    return (int)$stmt->fetchColumn();
}

// Validates a base64 receipt upload (image OR pdf). Returns [data, mime, name]
// or calls json_error() and exits if the upload is invalid.


function display_date(string $isoDate): string {
    $timestamp = strtotime($isoDate);
    return $timestamp !== false ? date('d/m/Y', $timestamp) : $isoDate;
}

function machine_expense_pdf_escape(string $value): string {
    $converted = function_exists('iconv')
        ? iconv('UTF-8', 'Windows-1252//TRANSLIT', $value)
        : $value;
    if ($converted === false) $converted = preg_replace('/[^\x20-\x7E]/', '?', $value);
    return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], (string)$converted);
}

function output_single_receipt_pdf(string $filename, array $captionLines, string $jpegData): void {
    $watermarkPath = __DIR__ . '/../assets/watermark.jpg';
    $watermarkData = is_file($watermarkPath) ? file_get_contents($watermarkPath) : false;
    $watermarkSize = $watermarkData !== false ? @getimagesizefromstring($watermarkData) : false;
    $receiptSize = @getimagesizefromstring($jpegData);
    if ($receiptSize === false) json_error('Receipt photo could not be processed for PDF export.', 500);

    // A4 = 595 x 842pt. Caption block sits at the top; the receipt image is
    // scaled to fit the remaining space, keeping its aspect ratio.
    $captionHeight = 24 + count($captionLines) * 13;
    $maxImgWidth = 495;
    $maxImgHeight = 842 - $captionHeight - 60;
    $scale = min($maxImgWidth / $receiptSize[0], $maxImgHeight / $receiptSize[1], 1);
    $imgWidth = $receiptSize[0] * $scale;
    $imgHeight = $receiptSize[1] * $scale;
    $imgX = (595 - $imgWidth) / 2;
    $imgY = 842 - $captionHeight - 30 - $imgHeight;

    $wmDrawWidth = 260;
    $wmDrawHeight = $watermarkSize ? $wmDrawWidth * ($watermarkSize[1] / $watermarkSize[0]) : 0;
    $wmX = (595 - $wmDrawWidth) / 2;
    $wmY = 40;

    $content = '';
    if ($watermarkData !== false && $watermarkSize !== false) {
        $content .= sprintf("q\n%.2F 0 0 %.2F %.2F %.2F cm\n/Wm Do\nQ\n", $wmDrawWidth, $wmDrawHeight, $wmX, $wmY);
    }
    $content .= "BT\n/F1 11 Tf\n50 810 Td\n13 TL\n";
    foreach ($captionLines as $line) {
        $content .= '(' . machine_expense_pdf_escape((string)$line) . ") Tj\nT*\n";
    }
    $content .= "ET\n";
    $content .= sprintf("q\n%.2F 0 0 %.2F %.2F %.2F cm\n/Receipt Do\nQ\n", $imgWidth, $imgHeight, $imgX, $imgY);

    $resources = '/Font << /F1 4 0 R >> /XObject << /Receipt 5 0 R';
    $objects = [
        1 => '<< /Type /Catalog /Pages 2 0 R >>',
        2 => '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        3 => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << PLACEHOLDER >> /Contents 6 0 R >>",
        4 => '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        5 => "<< /Type /XObject /Subtype /Image /Width {$receiptSize[0]} /Height {$receiptSize[1]} "
            . "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($jpegData) . " >>\nstream\n{$jpegData}\nendstream",
        6 => "<< /Length " . strlen($content) . " >>\nstream\n{$content}endstream",
    ];

    $watermarkObject = null;
    if ($watermarkData !== false && $watermarkSize !== false) {
        $watermarkObject = 7;
        $objects[7] = "<< /Type /XObject /Subtype /Image /Width {$watermarkSize[0]} /Height {$watermarkSize[1]} "
            . "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($watermarkData) . " >>\nstream\n{$watermarkData}\nendstream";
    }
    $resources .= ($watermarkObject !== null ? ' /Wm 7 0 R' : '') . ' >>';
    $objects[3] = str_replace('PLACEHOLDER', $resources, $objects[3]);
    ksort($objects);

    $pdf = "%PDF-1.4\n";
    $offsets = [];
    foreach ($objects as $num => $body) {
        $offsets[$num] = strlen($pdf);
        $pdf .= "$num 0 obj\n$body\nendobj\n";
    }
    $xrefStart = strlen($pdf);
    $count = count($objects) + 1;
    $pdf .= "xref\n0 $count\n0000000000 65535 f \n";
    for ($i = 1; $i <= count($objects); $i++) {
        $pdf .= str_pad((string)$offsets[$i], 10, '0', STR_PAD_LEFT) . " 00000 n \n";
    }
    $pdf .= "trailer\n<< /Size $count /Root 1 0 R >>\nstartxref\n$xrefStart\n%%EOF";

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . strlen($pdf));
    echo $pdf;
    exit;
}

function output_machine_expense_pdf(string $filename, array $lines): void {
    $pages = array_chunk($lines, 48);
    if (!$pages) $pages = [['No procurement records recorded.']];

    $watermarkPath = __DIR__ . '/../assets/watermark.jpg';
    $watermarkData = is_file($watermarkPath) ? file_get_contents($watermarkPath) : false;
    $watermarkSize = $watermarkData !== false ? @getimagesizefromstring($watermarkData) : false;

    $objects = [];
    $watermarkObject = null;
    $fontObject = 3 + count($pages) * 2;
    if ($watermarkData !== false && $watermarkSize !== false) {
        $watermarkObject = $fontObject + 1;
    }
    $pageReferences = [];

    // A4 page = 595 x 842pt. Draw the watermark centered, ~360pt wide,
    // keeping its original aspect ratio, so it stays faint and legible
    // behind the report text rather than dominating the page.
    $wmDrawWidth = 360;
    $wmDrawHeight = $watermarkSize ? $wmDrawWidth * ($watermarkSize[1] / $watermarkSize[0]) : 0;
    $wmX = (595 - $wmDrawWidth) / 2;
    $wmY = (842 - $wmDrawHeight) / 2;

    foreach ($pages as $index => $pageLines) {
        $pageObject = 3 + $index * 2;
        $contentObject = $pageObject + 1;
        $pageReferences[] = $pageObject . ' 0 R';

        $content = '';
        if ($watermarkObject !== null) {
            $content .= sprintf(
                "q\n%.2F 0 0 %.2F %.2F %.2F cm\n/Wm Do\nQ\n",
                $wmDrawWidth, $wmDrawHeight, $wmX, $wmY
            );
        }
        $content .= "BT\n/F1 10 Tf\n50 790 Td\n13 TL\n";
        foreach ($pageLines as $line) {
            $content .= '(' . machine_expense_pdf_escape((string)$line) . ") Tj\nT*\n";
        }
        $content .= "ET\n";

        $resources = "/Font << /F1 {$fontObject} 0 R >>";
        if ($watermarkObject !== null) {
            $resources .= " /XObject << /Wm {$watermarkObject} 0 R >>";
        }
        $objects[$pageObject] =
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            . "/Resources << {$resources} >> /Contents {$contentObject} 0 R >>";
        $objects[$contentObject] =
            "<< /Length " . strlen($content) . " >>\nstream\n{$content}endstream";
    }
    $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    $objects[2] =
        '<< /Type /Pages /Kids [' . implode(' ', $pageReferences)
        . '] /Count ' . count($pages) . ' >>';
    $objects[$fontObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    if ($watermarkObject !== null) {
        $objects[$watermarkObject] =
            "<< /Type /XObject /Subtype /Image /Width {$watermarkSize[0]} /Height {$watermarkSize[1]} "
            . "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode "
            . "/Length " . strlen($watermarkData) . " >>\nstream\n{$watermarkData}\nendstream";
    }
    ksort($objects);

    $pdf = "%PDF-1.4\n";
    $offsets = [0];
    $objectCount = max(array_keys($objects));
    for ($number = 1; $number <= $objectCount; $number++) {
        $offsets[$number] = strlen($pdf);
        $pdf .= "{$number} 0 obj\n{$objects[$number]}\nendobj\n";
    }
    $xrefOffset = strlen($pdf);
    $pdf .= "xref\n0 " . ($objectCount + 1) . "\n";
    $pdf .= "0000000000 65535 f \n";
    for ($number = 1; $number <= $objectCount; $number++) {
        $pdf .= sprintf("%010d 00000 n \n", $offsets[$number]);
    }
    $pdf .= "trailer\n<< /Size " . ($objectCount + 1) . " /Root 1 0 R >>\n";
    $pdf .= "startxref\n{$xrefOffset}\n%%EOF";

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . strlen($pdf));
    echo $pdf;
    exit;
}

function machine_expense_rows(string $customerId, string $machineId, ?string $from = null, ?string $to = null): array {
    $sql = "SELECT ul.id, ul.date, ul.description, ul.part_number, ul.quantity, ul.unit, ul.unit_price,
                ul.cost, ul.logged_by, ul.receipt_photo_name, ul.stock_source, ul.store_item_id,
                ul.store_balance_after, ul.issued_by, ul.received_by,
                csi.qty_on_hand AS current_store_balance,
                CASE WHEN ul.receipt_photo_data IS NOT NULL AND ul.receipt_photo_data <> ''
                     THEN 1 ELSE 0 END AS has_receipt,
                ul.created_at
         FROM usage_logs ul
         LEFT JOIN customer_store_items csi ON csi.id = ul.store_item_id
         WHERE ul.customer_id = ? AND ul.machine_id = ? AND ul.category = 'SPARE_PART'";
    $params = [$customerId, $machineId];
    if ($from !== null) { $sql .= ' AND ul.date >= ?'; $params[] = $from; }
    if ($to !== null) { $sql .= ' AND ul.date <= ?'; $params[] = $to; }
    $sql .= ' ORDER BY ul.date DESC, ul.created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function petty_cash_rows(string $customerId, string $machineId, ?string $from = null, ?string $to = null): array {
    $sql = "SELECT id, date, description, cost, logged_by, receipt_photo_name,
                CASE WHEN receipt_photo_data IS NOT NULL AND receipt_photo_data <> ''
                     THEN 1 ELSE 0 END AS has_receipt,
                created_at
         FROM usage_logs
         WHERE customer_id = ? AND machine_id = ? AND category = 'PETTY_CASH'";
    $params = [$customerId, $machineId];
    if ($from !== null) { $sql .= ' AND date >= ?'; $params[] = $from; }
    if ($to !== null) { $sql .= ' AND date <= ?'; $params[] = $to; }
    $sql .= ' ORDER BY date DESC, created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function petty_cash_account_rows(string $customerId, ?string $from = null, ?string $to = null): array {
    $sql = "SELECT ul.id, ul.machine_id, ul.date, ul.description, ul.cost, ul.logged_by, ul.receipt_photo_name,
                CASE WHEN ul.receipt_photo_data IS NOT NULL AND ul.receipt_photo_data <> '' THEN 1 ELSE 0 END AS has_receipt,
                ul.created_at, m.brand, m.model, m.machine_type, m.serial_number, m.reg_number
         FROM usage_logs ul
         JOIN machines m ON m.id = ul.machine_id
         WHERE ul.customer_id = ? AND ul.category = 'PETTY_CASH'";
    $params = [$customerId];
    if ($from !== null) { $sql .= ' AND ul.date >= ?'; $params[] = $from; }
    if ($to !== null) { $sql .= ' AND ul.date <= ?'; $params[] = $to; }
    $sql .= ' ORDER BY ul.date DESC, ul.created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function customer_can_manage_petty_cash(array $customer): bool {
    if (($customer['actorType'] ?? '') === 'owner') return true;
    $permissions = $customer['permissions'] ?? null;
    if ($permissions === null) return true;
    $role = strtolower(trim((string)($customer['customerRole'] ?? '')));
    return in_array($role, ['admin', 'accounts'], true);
}

// V438 - Workshop Account is a shared customer workshop float shown inside
// Procurement. Procurement can view it; financial/workshop control roles can
// add or edit funds. Spending is calculated from direct procurement records.
function customer_can_manage_workshop_account(array $customer): bool {
    if (($customer['actorType'] ?? '') === 'owner') return true;
    if (!customer_has_feature_access($customer, 'machine-expenses')) return false;
    $role = strtolower(trim((string)($customer['customerRole'] ?? '')));
    return in_array($role, ['admin', 'accounts', 'procurement', 'workshop_manager'], true);
}

// Daily fuel usage — same usage_logs table, its own category. quantity is
// litres, unit_price is price/litre, cost is the total for that day's
// fill-up, mirroring the same shape as Procurement / Petty Cash so
// the same CSV/PDF/receipt pattern applies consistently.
function fuel_usage_rows(string $customerId, string $machineId, ?string $from = null, ?string $to = null): array {
    $sql = "SELECT id, date, description, quantity, unit, unit_price,
                cost, logged_by, receipt_photo_name,
                CASE WHEN receipt_photo_data IS NOT NULL AND receipt_photo_data <> ''
                     THEN 1 ELSE 0 END AS has_receipt,
                created_at
         FROM usage_logs
         WHERE customer_id = ? AND machine_id = ? AND category = 'FUEL'";
    $params = [$customerId, $machineId];
    if ($from !== null) { $sql .= ' AND date >= ?'; $params[] = $from; }
    if ($to !== null) { $sql .= ' AND date <= ?'; $params[] = $to; }
    $sql .= ' ORDER BY date DESC, created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

// Reads ?date=YYYY-MM-DD or ?month=YYYY-MM from the query string and returns
// [from, to] (both null if neither was supplied, meaning "everything").
function usage_log_date_range_from_query(): array {
    $date = trim((string)($_GET['date'] ?? ''));
    $month = trim((string)($_GET['month'] ?? ''));
    if ($date !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        return [$date, $date];
    }
    if ($month !== '' && preg_match('/^\d{4}-\d{2}$/', $month)) {
        $start = $month . '-01';
        $end = date('Y-m-t', strtotime($start));
        return [$start, $end];
    }
    return [null, null];
}

function customer_template_service_parts(string $templateId): array {
    $stmt = db()->prepare(
        'SELECT id, spare_name, part_number, quantity
         FROM checklist_template_parts
         WHERE template_id = ?
         ORDER BY "order" ASC'
    );
    $stmt->execute([$templateId]);
    $parts = $stmt->fetchAll();
    foreach ($parts as &$part) {
        $part['spareName'] = $part['spare_name'];
        $part['partNumber'] = $part['part_number'];
        unset($part['spare_name'], $part['part_number']);
    }
    unset($part);
    return $parts;
}

function customer_checklist_report_view(array $report): array {
    $createdAt = (string)($report['created_at'] ?? '');
    $created = new DateTimeImmutable($createdAt);
    $expiry = $created
        ->setTimezone(new DateTimeZone('Africa/Dar_es_Salaam'))
        ->modify('tomorrow')
        ->setTime(0, 0, 0);
    $now = new DateTimeImmutable('now', new DateTimeZone('Africa/Dar_es_Salaam'));
    $report['machineId'] = $report['machine_id'] ?? null;
    $report['templateId'] = $report['template_id'] ?? null;
    $report['filledBy'] = $report['filled_by'] ?? '';
    $report['hourMeterReading'] = isset($report['hour_meter_reading'])
        ? (float)$report['hour_meter_reading']
        : 0;
    $report['overallStatus'] = $report['overall_status'] ?? 'GREEN';
    $report['displayPhotoUrl'] = $report['display_photo_url'] ?? null;
    $report['pdfUrl'] = $report['pdf_url'] ?? null;
    $report['sentToCustomerAt'] = $report['sent_to_customer_at'] ?? null;
    $report['createdAt'] = $report['created_at'] ?? null;
    $report['expiresAt'] = $expiry->format(DateTimeInterface::ATOM);
    $report['isExpired'] = $now >= $expiry;
    $report['canEdit'] = false;
    if (array_key_exists('machine_model', $report)) {
        $report['machine'] = [
            'id' => $report['machine_id'] ?? null,
            'model' => $report['machine_model'] ?? '',
            'machineType' => $report['machine_type'] ?? '',
            'serialNumber' => $report['serial_number'] ?? '',
            'regNumber' => $report['reg_number'] ?? '',
            'brand' => $report['brand'] ?? '',
        ];
        $report['customerName'] = $report['customer_name'] ?? '';
        $report['templateName'] = $report['template_name'] ?? '';
    }
    return $report;
}

function customer_checklist_answer_view(array $answer): array {
    $answer['reportId'] = $answer['report_id'] ?? null;
    $answer['templateItemId'] = $answer['template_item_id'] ?? null;
    $answer['photoUrl'] = $answer['photo_url'] ?? null;
    $answer['safetyLevel'] = $answer['safety_level'] ?? 'GREEN';
    return $answer;
}

function customer_request_service_parts(string $requestId): array {
    $stmt = db()->prepare(
        'SELECT srp.id, srp.spare_name, srp.part_number, srp.quantity,
                sp.name AS matched_name, sp.part_number AS matched_part_number
         FROM service_request_parts srp
         LEFT JOIN spare_parts sp ON sp.id = srp.matched_spare_part_id AND sp.deleted_at IS NULL
         WHERE srp.request_id = ?
         ORDER BY srp.created_at ASC'
    );
    $stmt->execute([$requestId]);
    $parts = $stmt->fetchAll();
    foreach ($parts as &$part) {
        $part['spareName'] = $part['spare_name'];
        $part['partNumber'] = $part['part_number'];
        // Internal-only field — the customer's own request-history views
        // must never render this; it exists purely for the Admin/Engineer
        // Service Request Manager and Proforma creation screens.
        $part['inventoryMatch'] = $part['matched_name']
            ? ['name' => $part['matched_name'], 'partNumber' => $part['matched_part_number']]
            : null;
        unset($part['spare_name'], $part['part_number'], $part['matched_name'], $part['matched_part_number']);
    }
    unset($part);
    return $parts;
}

// ---- Dashboard ------------------------------------------------------------
// ---- Saved emails (administration / management team) for quick report sharing --------
if ($sub === 'saved-emails' && $method === 'GET') {
    require_customer_feature_access($customer, 'email', 'Management Email');
    // Build one communication directory from the real account records plus
    // optional manual management contacts. Account/user entries are read-only
    // here so a change made by BELM Admin or the customer user manager is
    // reflected automatically instead of creating a second copy to maintain.
    $directory = [];
    $seen = [];

    $ownerStmt = db()->prepare('SELECT name, email FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1');
    $ownerStmt->execute([$customer['id']]);
    if ($owner = $ownerStmt->fetch()) {
        $email = strtolower(trim((string)($owner['email'] ?? '')));
        if ($email !== '') {
            $directory[] = [
                'id' => 'account-owner',
                'label' => ($owner['name'] ?: 'Customer') . ' — Account Owner',
                'email' => $email,
                'source' => 'customer-account',
                'synced' => true,
                'editable' => false,
            ];
            $seen[$email] = true;
        }
    }

    $usersStmt = db()->prepare(
        'SELECT id, name, email, role FROM customer_users WHERE customer_id = ? AND is_active = 1 ORDER BY name ASC'
    );
    $usersStmt->execute([$customer['id']]);
    foreach ($usersStmt->fetchAll() as $portalUser) {
        $email = strtolower(trim((string)($portalUser['email'] ?? '')));
        if ($email === '' || isset($seen[$email])) continue;
        $role = trim((string)($portalUser['role'] ?? 'user'));
        $directory[] = [
            'id' => 'portal-user-' . $portalUser['id'],
            'label' => ($portalUser['name'] ?: 'Portal User') . ' — ' . ucwords(str_replace('-', ' ', $role)),
            'email' => $email,
            'source' => 'portal-user',
            'synced' => true,
            'editable' => false,
        ];
        $seen[$email] = true;
    }

    $savedStmt = db()->prepare('SELECT id, label, email FROM customer_saved_emails WHERE customer_id = ? ORDER BY label ASC');
    $savedStmt->execute([$customer['id']]);
    foreach ($savedStmt->fetchAll() as $entry) {
        $email = strtolower(trim((string)($entry['email'] ?? '')));
        if ($email === '' || isset($seen[$email])) continue;
        $entry['email'] = $email;
        $entry['source'] = 'saved';
        $entry['synced'] = false;
        $entry['editable'] = true;
        $directory[] = $entry;
        $seen[$email] = true;
    }
    json_out($directory);
}

if ($sub === 'saved-emails' && $method === 'POST') {
    require_customer_feature_access($customer, 'email', 'Management Email');
    require_customer_write_access($customer);
    $b = body();
    $label = trim((string)($b['label'] ?? ''));
    $email = trim((string)($b['email'] ?? ''));
    if ($label === '') json_error('Enter a label, e.g. "Administration" or "Management Team".');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid email address.');
    $email = strtolower($email);
    $duplicate = db()->prepare(
        'SELECT 1 FROM customers WHERE id = ? AND LOWER(email) = LOWER(?) AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM customer_users WHERE customer_id = ? AND LOWER(email) = LOWER(?) AND is_active = 1
         UNION ALL SELECT 1 FROM customer_saved_emails WHERE customer_id = ? AND LOWER(email) = LOWER(?)
         LIMIT 1'
    );
    $duplicate->execute([$customer['id'], $email, $customer['id'], $email, $customer['id'], $email]);
    if ($duplicate->fetch()) json_error('That email is already synchronized in your communication list.', 409);
    $newId = uuid();
    db()->prepare('INSERT INTO customer_saved_emails (id, customer_id, label, email, created_at) VALUES (?,?,?,?,NOW())')
        ->execute([$newId, $customer['id'], $label, $email]);
    json_out(['id' => $newId, 'label' => $label, 'email' => $email], 201);
}

if ($sub === 'saved-emails' && $sub2 && $method === 'PUT') {
    require_customer_feature_access($customer, 'email', 'Management Email');
    require_customer_write_access($customer);
    $b = body();
    $label = trim((string)($b['label'] ?? ''));
    $email = trim((string)($b['email'] ?? ''));
    if ($label === '') json_error('Enter a label, e.g. "Administration" or "Management Team".');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid email address.');
    $email = strtolower($email);
    $duplicate = db()->prepare(
        'SELECT 1 FROM customers WHERE id = ? AND LOWER(email) = LOWER(?) AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM customer_users WHERE customer_id = ? AND LOWER(email) = LOWER(?) AND is_active = 1
         UNION ALL SELECT 1 FROM customer_saved_emails WHERE customer_id = ? AND LOWER(email) = LOWER(?) AND id <> ?
         LIMIT 1'
    );
    $duplicate->execute([$customer['id'], $email, $customer['id'], $email, $customer['id'], $email, $sub2]);
    if ($duplicate->fetch()) json_error('That email is already synchronized in your communication list.', 409);
    $stmt = db()->prepare(
        'UPDATE customer_saved_emails SET label = ?, email = ? WHERE id = ? AND customer_id = ?'
    );
    $stmt->execute([$label, $email, $sub2, $customer['id']]);
    if ($stmt->rowCount() === 0) json_error('Saved email not found.', 404);
    json_out(['id' => $sub2, 'label' => $label, 'email' => $email]);
}

if ($sub === 'saved-emails' && $sub2 && $method === 'DELETE') {
    require_customer_feature_access($customer, 'email', 'Management Email');
    require_customer_write_access($customer);
    db()->prepare('DELETE FROM customer_saved_emails WHERE id = ? AND customer_id = ?')->execute([$sub2, $customer['id']]);
    json_out(null, 204);
}

// ---- Email a report to the customer's administration / management team ---------------
if ($sub === 'email-report' && $method === 'POST') {
    require_customer_feature_access($customer, 'email', 'Management Email');
    require_customer_write_access($customer);
    $b = body();
    $to = trim((string)($b['to'] ?? ''));
    $subject = trim((string)($b['subject'] ?? 'BELM Portal report'));
    $message = trim((string)($b['message'] ?? ''));
    $saveLabel = trim((string)($b['saveAsLabel'] ?? ''));
    $rawAttachments = is_array($b['attachments'] ?? null) ? $b['attachments'] : [];
    $rawCc = is_array($b['cc'] ?? null) ? $b['cc'] : [];

    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid recipient email address.');
    if ($message === '') json_error('The report message is empty.');
    if (count($rawAttachments) > 5) json_error('Attach at most 5 files per email.');
    if (count($rawCc) > 10) json_error('Add at most 10 CC recipients.');

    $cc = [];
    foreach ($rawCc as $ccAddress) {
        $ccAddress = trim((string)$ccAddress);
        if ($ccAddress === '') continue;
        if (!filter_var($ccAddress, FILTER_VALIDATE_EMAIL)) json_error("\"$ccAddress\" is not a valid CC email address.");
        if (strcasecmp($ccAddress, $to) !== 0 && !in_array($ccAddress, $cc, true)) $cc[] = $ccAddress;
    }

    // Attachments arrive as data: URLs (data:<mime>;base64,<data>) — same
    // pattern already used for checklist/receipt photos. Cap total size so
    // one email can't silently overload the SMTP connection or the
    // recipient's own inbox limits.
    $attachments = [];
    $totalBytes = 0;
    foreach ($rawAttachments as $item) {
        $filename = trim((string)($item['filename'] ?? 'attachment'));
        $dataUrl = (string)($item['data'] ?? '');
        if (!preg_match('#^data:([\w.+-]+/[\w.+-]+);base64,(.+)$#s', $dataUrl, $matches)) {
            json_error("Attachment \"$filename\" is not a valid file.");
        }
        $mimeType = $matches[1];
        $decoded = base64_decode($matches[2], true);
        if ($decoded === false) json_error("Attachment \"$filename\" could not be read.");
        $totalBytes += strlen($decoded);
        if ($totalBytes > 15 * 1024 * 1024) {
            json_error('Attachments are too large — keep the total under 15 MB.');
        }
        $attachments[] = ['filename' => $filename !== '' ? $filename : 'attachment', 'mimeType' => $mimeType, 'data' => $decoded];
    }

    if ($saveLabel !== '') {
        $exists = db()->prepare('SELECT 1 FROM customer_saved_emails WHERE customer_id = ? AND LOWER(email) = LOWER(?)');
        $exists->execute([$customer['id'], $to]);
        if (!$exists->fetch()) {
            db()->prepare('INSERT INTO customer_saved_emails (id, customer_id, label, email, created_at) VALUES (?,?,?,?,NOW())')
                ->execute([uuid(), $customer['id'], $saveLabel, $to]);
        }
    }

    try {
        send_email($to, $subject, $message . "\n\n— Sent from the BELM Portal by {$customer['name']}.", $attachments, $cc);
    } catch (Throwable $error) {
        error_log('BELM mail error: ' . $error->getMessage());
        json_error('Could not send the email right now. Please try again shortly.', 500);
    }

    json_out(['ok' => true, 'message' => "Report emailed to $to" . ($cc ? ' (cc: ' . implode(', ', $cc) . ')' : '') . " successfully."]);
}

// V288 - Customer-controlled BELM data sharing. Only the primary Customer
// account, Company Admin, or a user explicitly trusted with Assign Users can
// change these company-level privacy choices.
if ($sub === 'privacy') {
    require_customer_owner_or_admin($customer);
    $stmt = db()->prepare(
        'SELECT is_machinery_admin, privacy_preferences
         FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
    );
    $stmt->execute([$customer['id']]);
    $row = $stmt->fetch();
    if (!$row) json_error('Customer account is not available.', 404);

    $preferences = belm_customer_privacy_normalize($row['privacy_preferences'] ?? null);
    if ($method === 'GET') {
        json_out([
            'preferences' => $preferences,
            'belmServiceProviderActive' => empty($row['is_machinery_admin']),
            'developmentExpenseAccessOpen' => belm_development_customer_expense_access_enabled(),
            'alwaysShared' => [
                'Basic company identity and contact details',
                'Registered machine identity and operational status',
                'Official Job Cards sent to BELM and customer-owned Procurement spare requests',
                'BELM <-> Customer communications',
            ],
            'serviceProviderException' => 'While BELM Service Provider is ON, maintenance/check-up and service-kit records required to perform the service remain accessible. An open official support request also grants temporary machine-scoped maintenance/service-kit access.',
        ]);
    }

    if ($method === 'PUT') {
        require_customer_write_access($customer);
        $b = body();
        $incoming = $b['preferences'] ?? $b;
        if (!is_array($incoming)) json_error('Privacy preferences must be an object.');
        foreach (array_keys(BELM_CUSTOMER_PRIVACY_DEFAULTS) as $key) {
            if (array_key_exists($key, $incoming)) $preferences[$key] = !empty($incoming[$key]);
        }
        db()->prepare(
            'UPDATE customers SET privacy_preferences = ?::jsonb, updated_at = NOW() WHERE id = ?'
        )->execute([json_encode($preferences), $customer['id']]);
        log_customer_activity($customer, 'Updated BELM privacy/data-sharing settings');
        json_out([
            'ok' => true,
            'preferences' => $preferences,
            'belmServiceProviderActive' => empty($row['is_machinery_admin']),
            'developmentExpenseAccessOpen' => belm_development_customer_expense_access_enabled(),
            'message' => belm_development_customer_expense_access_enabled()
                ? 'Privacy preference saved. Procurement/expense access remains temporarily open to BELM during portal development.'
                : 'Privacy settings saved.',
        ]);
    }

    json_error('Unsupported privacy request.', 405);
}

if ($sub === 'dashboard') {
    $stmt = db()->prepare('SELECT * FROM machines WHERE customer_id = ? AND deleted_at IS NULL');
    $stmt->execute([$customer['id']]);
    $machines = $stmt->fetchAll();
    foreach ($machines as &$machine) {
        $machine['customerId'] = $machine['customer_id'];
        $machine['machineType'] = $machine['machine_type'];
        $machine['serialNumber'] = $machine['serial_number'];
        $machine['regNumber'] = $machine['reg_number'];
        $machine['lastCheckedAt'] = $machine['last_checked_at'];
        $machine['serviceKit'] = $machine['service_kit'];
    }
    unset($machine);

    // V422: preload the latest Operator Report for each customer machine so
    // Customer > View Your Machine can use the same large Operator Message
    // panel as BELM Customer Fleet without issuing one request per card.
    $operatorStmt = db()->prepare(
        "SELECT DISTINCT ON (machine_id) machine_id, id, operator_name, message, status, created_at
         FROM operator_reports
         WHERE customer_id = ?
         ORDER BY machine_id, created_at DESC, id DESC"
    );
    $operatorStmt->execute([$customer['id']]);
    $operatorByMachine = [];
    foreach ($operatorStmt->fetchAll() as $report) {
        $operatorByMachine[(string)$report['machine_id']] = [
            'id' => (string)$report['id'],
            'operatorName' => (string)$report['operator_name'],
            'message' => (string)$report['message'],
            'status' => (string)$report['status'],
            'createdAt' => (string)$report['created_at'],
        ];
    }
    foreach ($machines as &$machine) {
        $machine['latestOperatorMessage'] = $operatorByMachine[(string)$machine['id']] ?? null;
    }
    unset($machine);

    $stmt = db()->prepare(
        'SELECT id, name, email, phone, portal_link, is_machinery_admin, privacy_preferences
         FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
    );
    $stmt->execute([$customer['id']]);
    $profile = $stmt->fetch();
    if ($profile) {
        $profile['portalUrl'] = customer_portal_url($profile['portal_link']);
        $profile['isMachineryAdmin'] = !empty($profile['is_machinery_admin']);
        $profile['belmServiceProviderActive'] = empty($profile['is_machinery_admin']);
        $profile['privacyPreferences'] = belm_customer_privacy_normalize($profile['privacy_preferences'] ?? null);
        unset($profile['privacy_preferences']);
        $profile['actorType'] = $customer['actorType'] ?? 'owner';
        $profile['actorRole'] = $customer['customerRole'] ?? 'owner';
        $profile['actorPermissions'] = $customer['permissions'] ?? null;
    }
    json_out(['customer' => $profile, 'machines' => $machines]);
}

// ---- Analysis summary for the dashboard's right-side card -------------------
// ---- Analysis for ONE specific machine (Procurement page sidebar) -----
if ($sub === 'machine-analysis' && $sub2) {
    $machineId = $sub2;
    $stmt = db()->prepare('SELECT id, model FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL');
    $stmt->execute([$machineId, $customer['id']]);
    if (!$stmt->fetch()) json_error('Machine not found for this customer.', 404);

    $expenseStmt = db()->prepare(
        "SELECT COALESCE(SUM(cost), 0) FROM usage_logs WHERE machine_id = ? AND category = 'SPARE_PART'"
    );
    $expenseStmt->execute([$machineId]);
    $totalExpenses = (float)$expenseStmt->fetchColumn();

    $toppedUpStmt = db()->prepare('SELECT COALESCE(SUM(amount), 0) FROM petty_cash_topups WHERE machine_id = ?');
    $toppedUpStmt->execute([$machineId]);
    $totalToppedUp = (float)$toppedUpStmt->fetchColumn();

    $usedStmt = db()->prepare(
        "SELECT COALESCE(SUM(cost), 0) FROM usage_logs WHERE machine_id = ? AND category = 'PETTY_CASH'"
    );
    $usedStmt->execute([$machineId]);
    $totalUsed = (float)$usedStmt->fetchColumn();

    $requestStmt = db()->prepare(
        "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED','CANCELLED')) AS open
         FROM service_requests WHERE machine_id = ?"
    );
    $requestStmt->execute([$machineId]);
    $requestStats = $requestStmt->fetch();

    $reportStmt = db()->prepare('SELECT COUNT(*) FROM checklist_reports WHERE machine_id = ?');
    $reportStmt->execute([$machineId]);
    $totalReports = (int)$reportStmt->fetchColumn();

    json_out([
        'machineExpensesTotal' => $totalExpenses,
        'pettyCash' => [
            'totalToppedUp' => $totalToppedUp,
            'totalUsed' => $totalUsed,
            'balance' => $totalToppedUp - $totalUsed,
        ],
        'serviceRequests' => [
            'total' => (int)$requestStats['total'],
            'open' => (int)$requestStats['open'],
        ],
        'checklistReportsCount' => $totalReports,
    ]);
}

// GET /api/customer-portal?sub=recent-activity — powers the customer
// dashboard's "UPDATE" button: BELM messages, Technician daily check-up
// activity across every machine the customer owns, and a small 7-day
// checklist-activity graph. Read-only; does not touch anything else.
// Legacy direct-to-BELM spare endpoints are deliberately blocked in V297.
// Customer spare requirements must enter the Procurement queue first.
if (in_array($sub, ['spare-part-request','spare-part-requests'], true) && $method === 'POST') {
    json_error('Direct spare requests from the request screen are disabled. Send requirements to Procurement; Procurement can then download selected shortage CSV or send selected shortage to BELM.', 409);
}

if ($sub === 'recent-activity' && $method === 'GET') {
    $custId = $customer['id'];

    $belmMsgStmt = db()->prepare(
        "SELECT cc.id, cc.subject, cc.message, cc.created_at, cc.status,
                m.brand, m.model, m.machine_type
         FROM customer_communications cc
         LEFT JOIN machines m ON m.id = cc.machine_id
         WHERE cc.customer_id = ?
         ORDER BY cc.created_at DESC LIMIT 10"
    );
    $belmMsgStmt->execute([$custId]);
    $belmMessages = array_map(function ($row) {
        return [
            'id' => $row['id'],
            'subject' => $row['subject'],
            'message' => $row['message'],
            'createdAt' => $row['created_at'],
            'status' => $row['status'],
            'machineLabel' => trim(($row['brand'] ?? '') . ' ' . ($row['model'] ?? '')) ?: ($row['machine_type'] ?? null),
        ];
    }, $belmMsgStmt->fetchAll());

    $techStmt = db()->prepare(
        "SELECT cr.id, cr.filled_by, cr.overall_status, cr.hour_meter_reading, cr.created_at,
                m.brand, m.model, m.machine_type
         FROM checklist_reports cr
         JOIN machines m ON m.id = cr.machine_id
         WHERE m.customer_id = ? AND m.deleted_at IS NULL
         ORDER BY cr.created_at DESC LIMIT 10"
    );
    $techStmt->execute([$custId]);
    $technicianActivity = array_map(function ($row) {
        return [
            'id' => $row['id'],
            'filledBy' => $row['filled_by'],
            'status' => $row['overall_status'],
            'hourMeterReading' => $row['hour_meter_reading'],
            'createdAt' => $row['created_at'],
            'machineLabel' => trim(($row['brand'] ?? '') . ' ' . ($row['model'] ?? '')) ?: ($row['machine_type'] ?? null),
        ];
    }, $techStmt->fetchAll());

    $graphStmt = db()->prepare(
        "SELECT to_char(cr.created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS total,
                COUNT(*) FILTER (WHERE cr.overall_status = 'RED') AS red,
                COUNT(*) FILTER (WHERE cr.overall_status = 'YELLOW') AS yellow
         FROM checklist_reports cr
         JOIN machines m ON m.id = cr.machine_id
         WHERE m.customer_id = ? AND m.deleted_at IS NULL AND cr.created_at >= NOW() - INTERVAL '7 days'
         GROUP BY day ORDER BY day ASC"
    );
    $graphStmt->execute([$custId]);
    $graphRows = $graphStmt->fetchAll();
    $graphByDay = [];
    foreach ($graphRows as $row) $graphByDay[$row['day']] = $row;
    $sevenDayGraph = [];
    for ($i = 6; $i >= 0; $i--) {
        $day = date('Y-m-d', strtotime("-$i days"));
        $row = $graphByDay[$day] ?? null;
        $sevenDayGraph[] = [
            'day' => $day,
            'total' => (int)($row['total'] ?? 0),
            'red' => (int)($row['red'] ?? 0),
            'yellow' => (int)($row['yellow'] ?? 0),
        ];
    }

    $redMachineStmt = db()->prepare(
        "SELECT COUNT(*) FROM machines WHERE customer_id = ? AND deleted_at IS NULL AND status = 'RED'"
    );
    $redMachineStmt->execute([$custId]);
    $redMachineCount = (int)$redMachineStmt->fetchColumn();

    json_out([
        'belmMessages' => $belmMessages,
        'technicianActivity' => $technicianActivity,
        'sevenDayGraph' => $sevenDayGraph,
        'redMachineCount' => $redMachineCount,
    ]);
}

if ($sub === 'analysis') {
    $custId = $customer['id'];

    $machineStmt = db()->prepare(
        "SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status IN ('YELLOW','ATTENTION')) AS yellow,
                COUNT(*) FILTER (WHERE status IN ('RED','CRITICAL')) AS red,
                COUNT(*) FILTER (WHERE status IN ('GREEN','OK')) AS green
         FROM machines WHERE customer_id = ? AND deleted_at IS NULL"
    );
    $machineStmt->execute([$custId]);
    $machineStats = $machineStmt->fetch();

    $requestStmt = db()->prepare(
        "SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED','CANCELLED')) AS open
         FROM service_requests WHERE customer_id = ?"
    );
    $requestStmt->execute([$custId]);
    $requestStats = $requestStmt->fetch();

    $expenseStmt = db()->prepare(
        "SELECT COALESCE(SUM(cost), 0) AS total FROM usage_logs
         WHERE customer_id = ? AND category = 'SPARE_PART'"
    );
    $expenseStmt->execute([$custId]);
    $totalExpenses = (float)$expenseStmt->fetchColumn();

    $pettyCashStmt = db()->prepare(
        "SELECT COALESCE(SUM(cost), 0) AS total FROM usage_logs
         WHERE customer_id = ? AND category = 'PETTY_CASH'"
    );
    $pettyCashStmt->execute([$custId]);
    $totalPettyCash = (float)$pettyCashStmt->fetchColumn();

    $pettyTopupStmt = db()->prepare('SELECT COALESCE(SUM(amount), 0) FROM petty_cash_topups WHERE customer_id = ?');
    $pettyTopupStmt->execute([$custId]);
    $totalPettyCashTopups = (float)$pettyTopupStmt->fetchColumn();

    $reportStmt = db()->prepare(
        "SELECT COUNT(*) FROM checklist_reports cr
         JOIN machines m ON m.id = cr.machine_id
         WHERE m.customer_id = ?"
    );
    $reportStmt->execute([$custId]);
    $totalReports = (int)$reportStmt->fetchColumn();

    $invoiceStmt = db()->prepare(
        "SELECT COALESCE(SUM(i.total),0) AS total,
                COALESCE(SUM(GREATEST(i.total-COALESCE(pay.paid,0),0)),0) AS outstanding
         FROM invoices i
         LEFT JOIN (
             SELECT invoice_id,SUM(amount) AS paid FROM payments GROUP BY invoice_id
         ) pay ON pay.invoice_id=i.id
         WHERE i.customer_id=? AND i.deleted_at IS NULL AND i.status<>'CANCELLED'"
    );
    $invoiceStmt->execute([$custId]);
    $invoiceStats = $invoiceStmt->fetch();

    $fuelStmt = db()->prepare(
        "SELECT COALESCE(SUM(cost), 0) AS total FROM usage_logs
         WHERE customer_id = ? AND category = 'FUEL'"
    );
    $fuelStmt->execute([$custId]);
    $totalFuelCost = (float)$fuelStmt->fetchColumn();

    // Machines whose next service is due soon or already overdue —
    // reuses the same YELLOW/RED service-status logic as each machine's
    // own "Next Service" panel, just counted across the whole fleet.
    $machineIdsStmt = db()->prepare('SELECT id FROM machines WHERE customer_id = ? AND deleted_at IS NULL');
    $machineIdsStmt->execute([$custId]);
    $dueForServiceCount = 0;
    foreach ($machineIdsStmt->fetchAll(PDO::FETCH_COLUMN) as $machineId) {
        $status = compute_service_status_helper($machineId);
        if ($status && in_array($status['level'], ['YELLOW', 'RED'], true)) $dueForServiceCount++;
    }

    // Total containers handled across every Operator shift (open or
    // closed) for this customer's machines — the same running counter
    // operators build up on their own shift screen.
    $containerStmt = db()->prepare(
        "SELECT COALESCE(SUM(container_count), 0) FROM machine_operator_shifts WHERE customer_id = ?"
    );
    $containerStmt->execute([$custId]);
    $totalContainers = (int)$containerStmt->fetchColumn();

    // A per-machine breakdown — each machine's own quick activity
    // snapshot, listed inside the same Activity Overview card so the
    // administration/owner can scan every machine at a glance before drilling into
    // any one of them.
    $perMachineStmt = db()->prepare(
        'SELECT id, brand, model, machine_type, status FROM machines
         WHERE customer_id = ? AND deleted_at IS NULL ORDER BY brand, model'
    );
    $perMachineStmt->execute([$custId]);
    $perMachine = [];
    foreach ($perMachineStmt->fetchAll() as $machineRow) {
        $mReqStmt = db()->prepare(
            "SELECT COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED','CANCELLED')) AS open_count
             FROM service_requests WHERE machine_id = ?"
        );
        $mReqStmt->execute([$machineRow['id']]);
        $mOpenRequests = (int)$mReqStmt->fetchColumn();

        $mReportStmt = db()->prepare('SELECT COUNT(*) FROM checklist_reports WHERE machine_id = ?');
        $mReportStmt->execute([$machineRow['id']]);
        $mReportsCount = (int)$mReportStmt->fetchColumn();

        $mExpenseStmt = db()->prepare(
            "SELECT COALESCE(SUM(cost), 0) FROM usage_logs WHERE machine_id = ? AND category = 'SPARE_PART'"
        );
        $mExpenseStmt->execute([$machineRow['id']]);
        $mExpenseTotal = (float)$mExpenseStmt->fetchColumn();

        $mServiceStatus = compute_service_status_helper($machineRow['id']);

        $perMachine[] = [
            'id' => $machineRow['id'],
            'name' => trim(($machineRow['brand'] ?? '') . ' ' . ($machineRow['model'] ?? '')) ?: ($machineRow['machine_type'] ?: 'Machine'),
            'status' => $machineRow['status'],
            'openServiceRequests' => $mOpenRequests,
            'checklistReportsCount' => $mReportsCount,
            'expensesTotal' => $mExpenseTotal,
            'serviceLevel' => $mServiceStatus['level'] ?? null,
        ];
    }

    // The frontend only visually hides the Petty Cash / Procurement /
    // Invoices figures from a customer sub-user without the relevant Role
    // Manager permission (a DOM/CSS-level hide). That is not real access
    // control - the raw numbers were still returned in this JSON response
    // to any authenticated customer token, so a restricted sub-user (e.g.
    // an Operator) could read the full Petty Cash balance or outstanding
    // invoices straight from the API/Network tab even though the UI never
    // shows them. Redact server-side too, based on the same permission
    // keys the frontend already uses to hide these cards.
    $canSeeExpenses = customer_has_feature_access($customer, 'machine-expenses');
    $canSeeFuel = customer_has_feature_access($customer, 'fuel-usage');
    if (!$canSeeExpenses) {
        $totalExpenses = 0.0;
        $totalPettyCash = 0.0;
        $totalPettyCashTopups = 0.0;
        $invoiceStats = ['total' => 0.0, 'outstanding' => 0.0];
        foreach ($perMachine as &$pm) { $pm['expensesTotal'] = 0.0; }
        unset($pm);
    }
    if (!$canSeeFuel) $totalFuelCost = 0.0;

    json_out([
        'machines' => [
            'total' => (int)$machineStats['total'],
            'green' => (int)$machineStats['green'],
            'yellow' => (int)$machineStats['yellow'],
            'red' => (int)$machineStats['red'],
        ],
        'perMachine' => $perMachine,
        'fuelCostTotal' => $totalFuelCost,
        'dueForServiceCount' => $dueForServiceCount,
        'totalContainersHandled' => $totalContainers,
        'serviceRequests' => [
            'total' => (int)$requestStats['total'],
            'open' => (int)$requestStats['open'],
        ],
        'machineExpensesTotal' => $totalExpenses,
        'pettyCashTotal' => $totalPettyCash,
        'pettyCashAccount' => [
            'totalToppedUp' => round($totalPettyCashTopups, 2),
            'totalUsed' => round($totalPettyCash, 2),
            'balance' => round($totalPettyCashTopups - $totalPettyCash, 2),
        ],
        'checklistReportsCount' => $totalReports,
        'invoices' => [
            'total' => (float)$invoiceStats['total'],
            'outstanding' => (float)$invoiceStats['outstanding'],
        ],
    ]);
}

// ---- Machine-aware service types and their synchronized parts ---------------
if ($sub === 'service-options' && $sub2 && $method === 'GET') {
    require_customer_feature_access($customer, 'service-request', 'Job Card');
    $stmt = db()->prepare(
        'SELECT id, machine_type, model, serial_number, reg_number, brand
         FROM machines
         WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
    );
    $stmt->execute([$sub2, $customer['id']]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine not found for this customer.', 404);

    $stmt = db()->prepare(
        'SELECT id, name, machine_type, service_type
         FROM checklist_templates
         WHERE deleted_at IS NULL AND is_active = 1
           AND (
             LOWER(TRIM(machine_type)) = LOWER(TRIM(?))
             OR LOWER(TRIM(machine_type)) = LOWER(TRIM(?))
           )
         ORDER BY service_type ASC, name ASC'
    );
    $stmt->execute([$machine['machine_type'], $machine['model']]);
    $templates = $stmt->fetchAll();
    foreach ($templates as &$template) {
        $template['machineType'] = $template['machine_type'];
        $template['serviceType'] = $template['service_type'] ?: 'General Service';
        // Customer portal intentionally does not receive BELM's internal spare
        // catalog/template-part mapping. Parts matching is handled internally.
        unset($template['machine_type'], $template['service_type']);
    }
    unset($template);

    $modeStmt = db()->prepare('SELECT is_machinery_admin FROM customers WHERE id = ?');
    $modeStmt->execute([$customer['id']]);
    $selfServiceMode = !empty($modeStmt->fetchColumn());
    $company = belm_get_company_details();

    json_out([
        'machine' => [
            'id' => $machine['id'],
            'machineType' => $machine['machine_type'],
            'model' => $machine['model'],
            'serialNumber' => $machine['serial_number'],
            'regNumber' => $machine['reg_number'],
            'brand' => $machine['brand'],
        ],
        'serviceOptions' => $templates,
        'selfServiceMode' => $selfServiceMode,
        'belmServiceProviderActive' => !$selfServiceMode,
        'belmBusiness' => [
            'name' => $company['companyName'] ?? 'BELM GENERAL TECH SERVICE LIMITED',
            'email' => $company['companyEmail'] ?? '',
            'phone' => $company['companyPhone'] ?? '',
        ],
    ]);
}

// ---- Customer-owned Store Ledger -------------------------------------------
// Separate from BELM Inventory. Customers can receive their own stock here;
// Procurement can then issue it to a machine with an auditable balance.
if ($sub === 'store') {
    require_customer_feature_access($customer, 'store', 'Store Keeper');
    if ($method === 'GET') {
        $items = customer_store_item_rows((string)$customer['id']);
        $recentStmt = db()->prepare(
            "SELECT csm.id, csm.movement_type, csm.quantity, csm.unit_cost, csm.balance_after,
                    csm.actor_name, csm.received_by, csm.note, csm.created_at,
                    csi.part_number, csi.description, csi.unit,
                    m.model AS machine_model, m.brand AS machine_brand
             FROM customer_store_movements csm
             JOIN customer_store_items csi ON csi.id = csm.store_item_id
             LEFT JOIN machines m ON m.id = csm.machine_id
             WHERE csm.customer_id = ?
             ORDER BY csm.created_at DESC
             LIMIT 100"
        );
        $recentStmt->execute([$customer['id']]);
        json_out([
            'canManageStore' => customer_can_manage_store($customer),
            'items' => $items,
            'recentMovements' => $recentStmt->fetchAll(),
        ]);
    }

    if ($method === 'POST') {
        require_customer_write_access($customer);
        if (!customer_can_manage_store($customer)) {
            json_error('Your account can view Store balances but cannot receive stock.', 403);
        }
        $b = body();
        $partNumber = strtoupper(trim((string)($b['partNumber'] ?? '')));
        $description = trim((string)($b['description'] ?? ''));
        $unit = strtoupper(trim((string)($b['unit'] ?? 'PC')));
        $quantity = (float)($b['quantity'] ?? 0);
        $unitCost = (float)($b['unitCost'] ?? 0);
        $note = trim((string)($b['note'] ?? ''));
        if ($partNumber === '') json_error('Part number is required.');
        if ($description === '') json_error('Spare/material description is required.');
        if ($quantity <= 0) json_error('Received quantity must be greater than zero.');
        if ($unitCost < 0) json_error('Unit cost cannot be negative.');
        if ($unit === '' || strlen($unit) > 20) json_error('Enter a valid unit.');

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $itemStmt = $pdo->prepare(
                'SELECT * FROM customer_store_items
                 WHERE customer_id = ? AND UPPER(part_number) = UPPER(?)
                 FOR UPDATE'
            );
            $itemStmt->execute([$customer['id'], $partNumber]);
            $item = $itemStmt->fetch();
            if ($item) {
                $oldQty = (float)$item['qty_on_hand'];
                $oldCost = (float)$item['average_unit_cost'];
                $newQty = $oldQty + $quantity;
                $newAvg = $newQty > 0
                    ? (($oldQty * $oldCost) + ($quantity * $unitCost)) / $newQty
                    : 0;
                $pdo->prepare(
                    'UPDATE customer_store_items
                     SET description = ?, unit = ?, qty_on_hand = ?, average_unit_cost = ?, updated_at = NOW()
                     WHERE id = ?'
                )->execute([$description, $unit, $newQty, round($newAvg, 2), $item['id']]);
                $itemId = $item['id'];
                $balanceAfter = $newQty;
            } else {
                $itemId = uuid();
                $balanceAfter = $quantity;
                $pdo->prepare(
                    'INSERT INTO customer_store_items
                     (id, customer_id, part_number, description, unit, qty_on_hand, average_unit_cost, created_at, updated_at)
                     VALUES (?,?,?,?,?,?,?,NOW(),NOW())'
                )->execute([
                    $itemId, $customer['id'], $partNumber, $description, $unit,
                    $quantity, round($unitCost, 2),
                ]);
            }
            $actor = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer Store')) ?: 'Customer Store';
            $pdo->prepare(
                'INSERT INTO customer_store_movements
                 (id, customer_id, store_item_id, machine_id, movement_type, quantity, unit_cost,
                  balance_after, actor_name, received_by, note, created_at)
                 VALUES (?,?,?,NULL,\'RECEIVE\',?,?,?,?,NULL,?,NOW())'
            )->execute([
                uuid(), $customer['id'], $itemId, $quantity, round($unitCost, 2),
                round($balanceAfter, 2), $actor, $note !== '' ? $note : null,
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        log_customer_activity($customer, "Store received {$quantity} {$unit} of {$partNumber} - {$description}.");
        json_out([
            'ok' => true,
            'itemId' => $itemId,
            'balance' => round($balanceAfter, 2),
            'message' => 'Stock received and Store balance updated.',
        ], 201);
    }

    json_error('Method not allowed.', 405);
}

// ---- V297 Procurement-first spare workflow ---------------------------------
// Customer searches its own Store and submits the requirement to Procurement.
// The request screen never sends a spare directly to BELM Inventory or a
// supplier. Procurement owns the sourcing decision and Maintenance Process
// mirrors each status until the part is ready.
if ($sub === 'spare-search' && $sub2 && $method === 'GET') {
    require_customer_feature_access($customer, 'service-request', 'Job Card & Service Parts');
    customer_machine_for_action((string)$customer['id'], (string)$sub2);
    $q = trim((string)($_GET['q'] ?? ''));
    if ($q === '') json_out(['items' => []]);
    if (strlen($q) > 120) json_error('Spare search is too long.');
    $like = '%' . $q . '%';
    $stmt = db()->prepare(
        "SELECT id, part_number, description, unit, qty_on_hand, average_unit_cost
         FROM customer_store_items
         WHERE customer_id = ?
           AND (part_number ILIKE ? OR description ILIKE ?)
         ORDER BY
           CASE WHEN UPPER(TRIM(part_number)) = UPPER(TRIM(?)) THEN 0
                WHEN LOWER(TRIM(description)) = LOWER(TRIM(?)) THEN 1 ELSE 2 END,
           qty_on_hand DESC, description ASC
         LIMIT 15"
    );
    $stmt->execute([$customer['id'], $like, $like, $q, $q]);
    json_out(['items' => $stmt->fetchAll()]);
}

// V298 - Procurement may hand selected shortage quantities to BELM.
// Customer Store balance remains the source of truth; only the shortage is sent.
if ($sub === 'procurement-belm-supply' && $sub2 && $method === 'POST') {
    require_customer_feature_access($customer, 'machine-expenses', 'Procurement');
    require_customer_write_access($customer);
    if (!customer_can_manage_procurement($customer)) {
        json_error('Only Customer Procurement, Admin or Owner can send shortage items to BELM.', 403);
    }
    $machine = customer_machine_for_action((string)$customer['id'], (string)$sub2);
    $b = body();
    $requestIds = $b['requestIds'] ?? [];
    if (!is_array($requestIds) || !$requestIds) json_error('Select at least one shortage item to send to BELM.');
    $requestIds = array_values(array_unique(array_filter(array_map(static fn($v) => trim((string)$v), $requestIds))));
    if (!$requestIds) json_error('Select at least one shortage item to send to BELM.');
    if (count($requestIds) > 100) json_error('A maximum of 100 shortage items can be sent at once.');

    $pdo = db();
    $actor = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Procurement')) ?: 'Procurement';
    $machineLabel = trim(($machine['brand'] ?? '') . ' ' . ($machine['model'] ?? '')) ?: ($machine['machine_type'] ?? 'Machine');
    $created = [];
    $duplicates = [];
    $skipped = [];
    $caseIds = [];
    $pdo->beginTransaction();
    try {
        $getReq = $pdo->prepare(
            "SELECT * FROM customer_procurement_requests
             WHERE id=? AND customer_id=? AND machine_id=? FOR UPDATE"
        );
        $findBelmPart = $pdo->prepare(
            "SELECT id FROM spare_parts
             WHERE deleted_at IS NULL AND UPPER(TRIM(part_number))=UPPER(TRIM(?)) LIMIT 1"
        );
        $findDuplicate = $pdo->prepare(
            "SELECT id FROM spare_part_requests
             WHERE procurement_request_id=? AND status IN ('PENDING','PURCHASE_REQUIRED') LIMIT 1"
        );
        $insertBelm = $pdo->prepare(
            "INSERT INTO spare_part_requests
             (id,spare_part_id,request_id,machine_id,requested_by_id,requested_by_name,description,machine_type,
              quantity,status,created_at,reference_number,procurement_request_id)
             VALUES (?,?,NULL,?,NULL,?,?,?,?, 'PENDING',NOW(),?,?)"
        );
        foreach ($requestIds as $requestId) {
            $getReq->execute([$requestId, $customer['id'], $sub2]);
            $req = $getReq->fetch();
            if (!$req) { $skipped[] = ['id'=>$requestId,'reason'=>'Not found']; continue; }
            if (!in_array((string)$req['status'], ['PENDING_PROCUREMENT','PURCHASE_REQUIRED','BELM_REQUESTED'], true)) {
                $skipped[] = ['id'=>$requestId,'reason'=>'Status ' . $req['status'] . ' cannot be sent'];
                continue;
            }

            $store = customer_match_store_item((string)$customer['id'], (string)($req['part_number'] ?? ''), (string)$req['description']);
            $available = $store ? max(0.0, (float)$store['qty_on_hand']) : 0.0;
            $required = max(0.0, (float)$req['quantity']);
            $shortage = max(0.0, $required - $available);
            if ($shortage <= 0.00001) {
                $skipped[] = ['id'=>$requestId,'reason'=>'Customer Store now has enough stock'];
                continue;
            }

            $findDuplicate->execute([$requestId]);
            if ($existing = $findDuplicate->fetchColumn()) {
                $duplicates[] = ['id'=>$requestId,'belmRequestId'=>$existing];
                continue;
            }

            $partNumber = trim((string)($req['part_number'] ?? ''));
            $belmPartId = null;
            if ($partNumber !== '') {
                $findBelmPart->execute([$partNumber]);
                $belmPartId = $findBelmPart->fetchColumn() ?: null;
            }
            $belmRequestId = uuid();
            $shortageQty = max(1, (int)ceil($shortage));
            $insertBelm->execute([
                $belmRequestId, $belmPartId, $sub2,
                $actor . ' @ ' . ($customer['name'] ?? 'Customer'),
                (string)$req['description'], (string)($machine['machine_type'] ?? 'Machine'),
                $shortageQty, $partNumber !== '' ? $partNumber : null, $requestId,
            ]);
            $note = 'Shortage ' . $shortageQty . ' ' . ($req['unit'] ?: 'PC') . ' sent to BELM for supply by Procurement.';
            $pdo->prepare(
                "UPDATE customer_procurement_requests
                 SET status='BELM_REQUESTED', handled_by_name=?, handled_at=NOW(), decision_note=?, updated_at=NOW()
                 WHERE id=?"
            )->execute([$actor, $note, $requestId]);
            $pdo->prepare(
                "UPDATE breakdown_spare_requests
                 SET status='BELM_REQUESTED', approval_note=?, updated_at=NOW()
                 WHERE procurement_request_id=?"
            )->execute([$note, $requestId]);
            if (!empty($req['workflow_case_id'])) $caseIds[(string)$req['workflow_case_id']] = true;
            $created[] = [
                'id'=>$requestId,'belmRequestId'=>$belmRequestId,'partNumber'=>$partNumber,
                'description'=>$req['description'],'shortage'=>$shortageQty,'unit'=>$req['unit'] ?: 'PC',
            ];
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    foreach (array_keys($caseIds) as $caseId) {
        customer_refresh_procurement_case($caseId, $customer, 'Selected shortage sent to BELM', 'Procurement chose BELM supply for selected shortage item(s).');
    }
    if ($created) {
        $lines = [];
        foreach ($created as $item) {
            $lines[] = ($item['partNumber'] ?: 'No part number') . ' - ' . $item['description'] . ' x ' . $item['shortage'] . ' ' . $item['unit'];
        }
        try {
            belm_send_staff_page_alert(
                ['spare-parts'],
                'CUSTOMER PROCUREMENT - BELM SUPPLY REQUEST - ' . $machineLabel,
                "Customer: " . ($customer['name'] ?? 'Customer') . "\nMachine: $machineLabel\nRequested by: $actor\n\n" . implode("\n", $lines) . "\n\nOpen Spare Parts Inventory to process."
            );
        } catch (Throwable $ignored) {}
        try {
            belm_log_customer_communication(
                (string)$customer['id'], (string)$sub2, 'CUSTOMER_TO_BELM', 'PORTAL',
                'Procurement Spare Supply Request',
                'Procurement sent ' . count($created) . ' selected shortage item(s) to BELM for supply.',
                'PROCUREMENT', null, $actor, 'SENT'
            );
        } catch (Throwable $ignored) {}
        log_customer_activity($customer, 'Procurement sent ' . count($created) . ' shortage item(s) to BELM for ' . $machineLabel . '.');
    }
    json_out([
        'ok'=>true,'createdCount'=>count($created),'created'=>$created,'alreadySent'=>$duplicates,'skipped'=>$skipped,
        'requests'=>customer_procurement_request_rows((string)$customer['id'], (string)$sub2),
        'message'=>count($created) . ' selected shortage item(s) sent to BELM. Maintenance Process now shows waiting BELM supply via Procurement.'
    ], $created ? 201 : 200);
}

if ($sub === 'procurement-requests' && $sub2) {
    if ($method === 'GET') {
        require_customer_any_feature_access($customer, ['machine-expenses', 'service-request'], 'Procurement requests');
        customer_machine_for_action((string)$customer['id'], (string)$sub2);
        json_out([
            'items' => customer_procurement_request_rows((string)$customer['id'], (string)$sub2),
            'canManage' => customer_can_manage_procurement($customer),
        ]);
    }

    if ($method === 'POST') {
        require_customer_feature_access($customer, 'service-request', 'Job Card & Service Parts');
        require_customer_write_access($customer);
        $machine = customer_machine_for_action((string)$customer['id'], (string)$sub2);
        $b = body();
        $items = $b['items'] ?? [];
        if (!is_array($items) || !$items) json_error('Select at least one spare to send to Procurement.');
        if (count($items) > 100) json_error('A maximum of 100 spare items can be submitted at once.');
        $clean = [];
        foreach ($items as $raw) {
            if (!is_array($raw)) continue;
            $referenceNumber = trim((string)($raw['referenceNumber'] ?? ''));
            $description = trim((string)($raw['description'] ?? ''));
            $quantity = (float)($raw['quantity'] ?? 0);
            if ($referenceNumber === '' && $description === '') continue;
            if ($description === '') $description = $referenceNumber;
            if ($quantity <= 0 || floor($quantity) !== $quantity) json_error('Spare quantity must be a whole number above zero.');
            if (strlen($description) > 255 || strlen($referenceNumber) > 120) json_error('Spare name or part number is too long.');
            $clean[] = ['referenceNumber'=>$referenceNumber,'description'=>$description,'quantity'=>(int)$quantity];
        }
        if (!$clean) json_error('Add at least one spare before sending to Procurement.');

        // V298 - every spare submitted as a requirement also becomes/remains
        // part of the machine's reusable spare master list. This is enforced
        // server-side as well as by the UI Save Spare List step.
        $listPdo = db();
        $listActor = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer')) ?: 'Customer';
        foreach ($clean as $listItem) {
            $ref = trim((string)$listItem['referenceNumber']);
            $desc = trim((string)$listItem['description']);
            if ($ref !== '') {
                $findList = $listPdo->prepare(
                    "SELECT id FROM customer_machine_spare_list_items
                     WHERE customer_id=? AND machine_id=? AND UPPER(TRIM(COALESCE(reference_number,'')))=UPPER(TRIM(?))
                     ORDER BY updated_at DESC LIMIT 1"
                );
                $findList->execute([$customer['id'],$sub2,$ref]);
            } else {
                $findList = $listPdo->prepare(
                    "SELECT id FROM customer_machine_spare_list_items
                     WHERE customer_id=? AND machine_id=? AND LOWER(TRIM(description))=LOWER(TRIM(?))
                     ORDER BY updated_at DESC LIMIT 1"
                );
                $findList->execute([$customer['id'],$sub2,$desc]);
            }
            $existingListId = $findList->fetchColumn();
            if ($existingListId) {
                $listPdo->prepare(
                    'UPDATE customer_machine_spare_list_items SET reference_number=?,description=?,quantity=?,selected=1,updated_at=NOW() WHERE id=?'
                )->execute([$ref !== '' ? $ref : null,$desc,(int)$listItem['quantity'],$existingListId]);
            } else {
                $listPdo->prepare(
                    'INSERT INTO customer_machine_spare_list_items (id,customer_id,machine_id,reference_number,description,quantity,selected,created_by_name,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,NOW(),NOW())'
                )->execute([uuid(),$customer['id'],$sub2,$ref !== '' ? $ref : null,$desc,(int)$listItem['quantity'],$listActor]);
            }
        }
        $checks = customer_spare_store_check_rows((string)$customer['id'], $clean);
        $actor = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer')) ?: 'Customer';
        $batchId = uuid();
        $pdo = db();
        $created = [];
        $duplicates = [];
        $pdo->beginTransaction();
        try {
            $caseId = customer_procurement_case_for_machine($customer, $machine, $batchId);
            $insertReq = $pdo->prepare(
                "INSERT INTO customer_procurement_requests
                 (id,customer_id,machine_id,store_item_id,workflow_case_id,part_number,description,quantity,unit,
                  store_available_at_request,store_unit_cost,store_match_status,status,requested_by_name,requested_at,updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'PENDING_PROCUREMENT', ?,NOW(),NOW())"
            );
            $insertSpare = $pdo->prepare(
                "INSERT INTO breakdown_spare_requests
                 (id,case_id,job_card_id,spare_name,part_number,quantity,unit,reason,status,requested_by_name,requested_at,updated_at,procurement_request_id)
                 VALUES (?,?,NULL,?,?,?,?,?,'PROCUREMENT_REVIEW',?,NOW(),NOW(),?)"
            );
            foreach ($checks as $check) {
                $partNumber = trim((string)($check['storePartNumber'] ?: $check['referenceNumber']));
                $description = trim((string)($check['storeDescription'] ?: $check['description']));
                $quantity = (float)$check['quantity'];
                $storeMatch = !empty($check['enough']) ? 'IN_STORE' : (!empty($check['inStore']) ? 'STORE_SHORTAGE' : 'NOT_IN_STORE');
                $dup = $pdo->prepare(
                    "SELECT id FROM customer_procurement_requests
                     WHERE customer_id=? AND machine_id=?
                       AND status IN ('PENDING_PROCUREMENT','BELM_REQUESTED','PURCHASE_REQUIRED','ORDERED')
                       AND COALESCE(UPPER(TRIM(part_number)),'') = ?
                       AND LOWER(TRIM(description)) = ?
                     LIMIT 1"
                );
                $dup->execute([$customer['id'], $sub2, strtoupper($partNumber), strtolower($description)]);
                if ($existing = $dup->fetchColumn()) {
                    $duplicates[] = ['id'=>$existing,'partNumber'=>$partNumber,'description'=>$description,'quantity'=>$quantity];
                    continue;
                }
                $requestId = uuid();
                $insertReq->execute([
                    $requestId, $customer['id'], $sub2, $check['storeItemId'] ?: null, $caseId,
                    $partNumber !== '' ? $partNumber : null, $description, $quantity, $check['unit'] ?: 'PC',
                    (float)$check['available'], (float)$check['unitCost'], $storeMatch, $actor,
                ]);
                $spareId = uuid();
                $insertSpare->execute([
                    $spareId, $caseId, $description, $partNumber !== '' ? $partNumber : null,
                    $quantity, $check['unit'] ?: 'PC',
                    'Procurement request. Store at request: ' . (float)$check['available'] . ' ' . ($check['unit'] ?: 'PC'),
                    $actor, $requestId,
                ]);
                $created[] = ['id'=>$requestId,'spareId'=>$spareId,'description'=>$description,'storeMatchStatus'=>$storeMatch];
            }
            if (!$created && $duplicates) {
                $pdo->commit();
                json_out([
                    'ok'=>true,'createdCount'=>0,'created'=>[],'alreadyPending'=>$duplicates,
                    'requests'=>customer_procurement_request_rows((string)$customer['id'], (string)$sub2),
                    'message'=>'Selected spare(s) are already in the Procurement queue.'
                ]);
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        try {
            $machineLabel = trim(($machine['brand'] ?? '') . ' ' . ($machine['model'] ?? '')) ?: ($machine['machine_type'] ?? 'Machine');
            customer_send_team_alert(
                (string)$customer['id'], ['machine-expenses'],
                'PROCUREMENT REQUEST - ' . $machineLabel,
                count($created) . " spare item(s) are waiting for Procurement.\nMachine: $machineLabel\nRequested by: $actor\nOpen Procurement to check Store and source the items.",
                true
            );
        } catch (Throwable $ignored) {}
        log_customer_activity($customer, 'Sent ' . count($created) . ' spare item(s) to Procurement for machine ' . (($machine['model'] ?? '') ?: $sub2) . '.');
        json_out([
            'ok'=>true,'createdCount'=>count($created),'created'=>$created,'alreadyPending'=>$duplicates,
            'requests'=>customer_procurement_request_rows((string)$customer['id'], (string)$sub2),
            'message'=>count($created) . ' spare item(s) sent to Procurement. Maintenance Process now shows Procurement status.'
        ], 201);
    }

    if ($method === 'PUT') {
        require_customer_feature_access($customer, 'machine-expenses', 'Procurement');
        require_customer_write_access($customer);
        if (!customer_can_manage_procurement($customer)) {
            json_error('Only Customer Procurement, Admin or Owner can process spare sourcing requests.', 403);
        }
        $b = body();
        $action = strtoupper(trim((string)($b['action'] ?? '')));
        $note = trim((string)($b['note'] ?? ''));
        if (!in_array($action, ['ISSUE_STORE','PURCHASE_REQUIRED','ORDERED','PARTS_READY','REJECT'], true)) {
            json_error('Choose a valid Procurement action.');
        }
        if (strlen($note) > 500) json_error('Procurement note is too long.');
        $actor = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Procurement')) ?: 'Procurement';
        $pdo = db();
        $pdo->beginTransaction();
        $expenseId = null;
        $balanceAfter = null;
        try {
            $stmt = $pdo->prepare('SELECT * FROM customer_procurement_requests WHERE id=? AND customer_id=? FOR UPDATE');
            $stmt->execute([$sub2, $customer['id']]);
            $req = $stmt->fetch();
            if (!$req) {
                $pdo->rollBack();
                json_error('Procurement request not found.', 404);
            }
            if (in_array($req['status'], ['PARTS_READY','REJECTED'], true)) {
                $pdo->rollBack();
                json_error('This Procurement request is already closed.', 409);
            }
            $newStatus = $req['status'];
            $spareStatus = 'PROCUREMENT_REVIEW';
            if ($action === 'REJECT') {
                $newStatus = 'REJECTED';
                $spareStatus = 'REJECTED';
            } elseif ($action === 'PURCHASE_REQUIRED') {
                $newStatus = 'PURCHASE_REQUIRED';
                $spareStatus = 'PROCUREMENT_REQUIRED';
            } elseif ($action === 'ORDERED') {
                $newStatus = 'ORDERED';
                $spareStatus = 'ORDERED';
            } elseif ($action === 'PARTS_READY') {
                $newStatus = 'PARTS_READY';
                $spareStatus = 'PARTS_READY';
            } elseif ($action === 'ISSUE_STORE') {
                $storeId = trim((string)($req['store_item_id'] ?? ''));
                if ($storeId === '') {
                    $matchedStore = customer_match_store_item((string)$customer['id'], (string)($req['part_number'] ?? ''), (string)$req['description']);
                    $storeId = trim((string)($matchedStore['id'] ?? ''));
                    if ($storeId !== '') {
                        $pdo->prepare('UPDATE customer_procurement_requests SET store_item_id=?, updated_at=NOW() WHERE id=?')->execute([$storeId,$sub2]);
                    }
                }
                if ($storeId === '') {
                    $pdo->rollBack();
                    json_error('This spare is not matched to Customer Store. Choose Purchase Required, CSV sourcing, or Send to BELM.', 409);
                }
                $storeStmt = $pdo->prepare(
                    'SELECT id,part_number,description,unit,qty_on_hand,average_unit_cost FROM customer_store_items WHERE id=? AND customer_id=? FOR UPDATE'
                );
                $storeStmt->execute([$storeId, $customer['id']]);
                $store = $storeStmt->fetch();
                if (!$store) {
                    $pdo->rollBack();
                    json_error('Customer Store item no longer exists.', 409);
                }
                $quantity = (float)$req['quantity'];
                $available = (float)$store['qty_on_hand'];
                if ($available + 0.00001 < $quantity) {
                    $pdo->rollBack();
                    json_error('Store balance is insufficient. Available: ' . rtrim(rtrim(number_format($available,2,'.',''),'0'),'.') . ' ' . ($store['unit'] ?: $req['unit']) . '. Choose Purchase Required or replenish Store.', 409);
                }
                $balanceAfter = round($available - $quantity, 2);
                $unitCost = round((float)$store['average_unit_cost'], 2);
                $unit = strtoupper(trim((string)$store['unit'])) ?: strtoupper(trim((string)$req['unit'])) ?: 'PC';
                $description = trim((string)$store['description']) ?: trim((string)$req['description']);
                $partNumber = strtoupper(trim((string)$store['part_number'])) ?: strtoupper(trim((string)$req['part_number']));
                $expenseId = uuid();
                $pdo->prepare('UPDATE customer_store_items SET qty_on_hand=?, updated_at=NOW() WHERE id=?')->execute([$balanceAfter,$store['id']]);
                $machine = customer_machine_for_action((string)$customer['id'], (string)$req['machine_id']);
                $machineLabel = trim(($machine['brand'] ?? '') . ' ' . ($machine['model'] ?? '')) ?: ($machine['machine_type'] ?? 'Machine');
                $pdo->prepare(
                    "INSERT INTO customer_store_movements
                     (id,customer_id,store_item_id,machine_id,movement_type,quantity,unit_cost,balance_after,actor_name,received_by,note,created_at)
                     VALUES (?,?,?,?, 'ISSUE', ?,?,?,?,?,?,NOW())"
                )->execute([
                    uuid(),$customer['id'],$store['id'],$req['machine_id'],$quantity,$unitCost,$balanceAfter,$actor,
                    $req['requested_by_name'] ?: null,'Procurement issued to ' . $machineLabel . ($note !== '' ? ' - ' . $note : '')
                ]);
                $cost = round($quantity * $unitCost, 2);
                $pdo->prepare(
                    "INSERT INTO usage_logs
                     (id,customer_id,machine_id,date,category,description,part_number,quantity,unit,unit_price,cost,logged_by,
                      store_item_id,stock_source,store_balance_after,issued_by,received_by,created_at)
                     VALUES (?,?,?,CURRENT_DATE,'SPARE_PART',?,?,?,?,?,?,?,?,?,?,?,?,NOW())"
                )->execute([
                    $expenseId,$customer['id'],$req['machine_id'],$description,$partNumber,$quantity,$unit,$unitCost,$cost,$actor,
                    $store['id'],'CUSTOMER_STORE',$balanceAfter,$actor,$req['requested_by_name'] ?: null
                ]);
                $newStatus = 'PARTS_READY';
                $spareStatus = 'PARTS_READY';
            }
            $pdo->prepare(
                'UPDATE customer_procurement_requests SET status=?, handled_by_name=?, handled_at=NOW(), decision_note=?, expense_id=COALESCE(?,expense_id), updated_at=NOW() WHERE id=?'
            )->execute([$newStatus,$actor,$note !== '' ? $note : null,$expenseId,$sub2]);
            if ($spareStatus === 'PARTS_READY') {
                $pdo->prepare(
                    "UPDATE breakdown_spare_requests SET status='PARTS_READY', fulfilled_by_name=?, fulfilled_at=NOW(), approval_note=?, updated_at=NOW() WHERE procurement_request_id=?"
                )->execute([$actor,$note !== '' ? $note : null,$sub2]);
            } else {
                $pdo->prepare(
                    'UPDATE breakdown_spare_requests SET status=?, approval_note=?, updated_at=NOW() WHERE procurement_request_id=?'
                )->execute([$spareStatus,$note !== '' ? $note : null,$sub2]);
            }
            $caseId = (string)($req['workflow_case_id'] ?? '');
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        if ($caseId !== '') customer_refresh_procurement_case($caseId, $customer, 'Procurement: ' . str_replace('_',' ',$newStatus), $note);
        if ($newStatus === 'PARTS_READY') {
            try { customer_send_team_alert((string)$customer['id'], ['workflow','service-request'], 'PARTS READY - MAINTENANCE CAN CONTINUE', 'Procurement has made the requested spare ready for the machine. Open Maintenance Process for status.', true); } catch (Throwable $ignored) {}
        }
        log_customer_activity($customer, 'Procurement request ' . $sub2 . ' changed to ' . $newStatus . '.');
        json_out([
            'ok'=>true,'status'=>$newStatus,'expenseId'=>$expenseId,'storeBalanceAfter'=>$balanceAfter,
            'message'=>$newStatus === 'PARTS_READY' ? 'Spare is ready. Maintenance Process updated.' : 'Procurement status updated.'
        ]);
    }

    json_error('Method not allowed.', 405);
}

// ---- V295 Machine spare list + Customer Store approval ----------------------
// This workflow remains fully customer-owned. It never exposes BELM Inventory.
// Saved lists can be reused, exported for outside procurement, or checked
// against the Customer Store. Store stock is deducted only after an explicit
// Accounts/Owner/Admin approval.
if ($sub === 'spare-store-check' && $sub2 && $method === 'POST') {
    require_customer_feature_access($customer, 'service-request', 'Job Card & Service Parts');
    customer_machine_for_action((string)$customer['id'], (string)$sub2);
    $b = body();
    $items = $b['items'] ?? [];
    if (!is_array($items)) json_error('Spare items are required.');
    if (count($items) > 100) json_error('A maximum of 100 spare items can be checked at once.');
    json_out(['items' => customer_spare_store_check_rows((string)$customer['id'], $items)]);
}

if ($sub === 'spare-workspace' && $sub2) {
    require_customer_feature_access($customer, 'service-request', 'Job Card & Service Parts');
    $machine = customer_machine_for_action((string)$customer['id'], (string)$sub2);

    if ($method === 'GET') {
        $saved = customer_machine_spare_list_rows((string)$customer['id'], (string)$sub2);
        $checkInput = array_map(static function ($row) {
            return [
                'referenceNumber' => $row['reference_number'] ?? '',
                'description' => $row['description'] ?? '',
                'quantity' => (float)($row['quantity'] ?? 0),
            ];
        }, $saved);
        json_out([
            'machine' => $machine,
            'items' => $saved,
            'storeChecks' => customer_spare_store_check_rows((string)$customer['id'], $checkInput),
            'approvalRequests' => customer_store_issue_request_rows((string)$customer['id'], (string)$sub2),
            'procurementRequests' => customer_procurement_request_rows((string)$customer['id'], (string)$sub2),
            'canApproveStoreIssue' => customer_can_approve_store_issue($customer),
            'canManageProcurement' => customer_can_manage_procurement($customer),
        ]);
    }

    if ($method === 'PUT') {
        require_customer_write_access($customer);
        $b = body();
        $items = $b['items'] ?? [];
        if (!is_array($items)) json_error('Spare list is required.');
        if (count($items) > 100) json_error('A maximum of 100 spare items can be saved per machine list.');
        $clean = [];
        foreach ($items as $raw) {
            if (!is_array($raw)) continue;
            $referenceNumber = trim((string)($raw['referenceNumber'] ?? ''));
            $description = trim((string)($raw['description'] ?? ''));
            $quantity = (float)($raw['quantity'] ?? 0);
            $selected = !array_key_exists('selected', $raw) || !empty($raw['selected']);
            if ($description === '' && $referenceNumber === '') continue;
            if ($description === '') json_error('Every saved spare must have a spare name.');
            if (strlen($description) > 255) json_error('Spare name is too long.');
            if (strlen($referenceNumber) > 100) json_error('Reference / part number is too long.');
            if ($quantity <= 0 || floor($quantity) !== $quantity) json_error('Saved spare quantity must be a whole number above zero.');
            $clean[] = [
                'referenceNumber' => $referenceNumber,
                'description' => $description,
                'quantity' => (int)$quantity,
                'selected' => $selected,
            ];
        }
        if (!$clean) json_error('Add at least one spare before saving the machine list.');
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM customer_machine_spare_list_items WHERE customer_id = ? AND machine_id = ?')
                ->execute([$customer['id'], $sub2]);
            $insert = $pdo->prepare(
                'INSERT INTO customer_machine_spare_list_items
                 (id, customer_id, machine_id, reference_number, description, quantity, selected,
                  created_by_name, created_at, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())'
            );
            $actor = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer')) ?: 'Customer';
            foreach ($clean as $item) {
                $insert->execute([
                    uuid(), $customer['id'], $sub2,
                    $item['referenceNumber'] !== '' ? $item['referenceNumber'] : null,
                    $item['description'], $item['quantity'], $item['selected'] ? 1 : 0, $actor,
                ]);
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        log_customer_activity($customer, 'Saved machine spare list with ' . count($clean) . ' item(s) for ' . (($machine['brand'] ? $machine['brand'] . ' ' : '') . $machine['model']) . '.');
        json_out([
            'ok' => true,
            'message' => 'Spare list saved for this machine.',
            'items' => customer_machine_spare_list_rows((string)$customer['id'], (string)$sub2),
            'storeChecks' => customer_spare_store_check_rows((string)$customer['id'], $clean),
        ]);
    }

    json_error('Method not allowed.', 405);
}

if ($sub === 'store-issue-requests' && $sub2) {
    // GET/POST sub2 is a machine ID. PUT sub2 is an approval-request ID.
    if ($method === 'GET') {
        require_customer_any_feature_access($customer, ['machine-expenses', 'service-request'], 'Procurement approvals');
        customer_machine_for_action((string)$customer['id'], (string)$sub2);
        json_out([
            'items' => customer_store_issue_request_rows((string)$customer['id'], (string)$sub2),
            'canApprove' => customer_can_approve_store_issue($customer),
        ]);
    }

    if ($method === 'POST') {
        require_customer_feature_access($customer, 'service-request', 'Job Card & Service Parts');
        require_customer_write_access($customer);
        $machine = customer_machine_for_action((string)$customer['id'], (string)$sub2);
        $b = body();
        $items = $b['items'] ?? [];
        if (!is_array($items) || !$items) json_error('Select at least one spare to send for Procurement approval.');
        if (count($items) > 100) json_error('A maximum of 100 spare items can be submitted at once.');
        $checks = customer_spare_store_check_rows((string)$customer['id'], $items);
        $created = [];
        $procurement = [];
        $duplicates = [];
        $actor = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer')) ?: 'Customer';
        $pdo = db();
        // Group duplicate list rows that resolve to the same Store item so one
        // approval represents the total requested quantity and cannot
        // accidentally over-reserve the same balance in separate rows.
        $grouped = [];
        foreach ($checks as $check) {
            if (empty($check['storeItemId'])) {
                $procurement[] = $check;
                continue;
            }
            $key = (string)$check['storeItemId'];
            if (!isset($grouped[$key])) {
                $grouped[$key] = $check;
                $grouped[$key]['quantity'] = 0.0;
            }
            $grouped[$key]['quantity'] += (float)$check['quantity'];
        }
        foreach ($grouped as $check) {
            $requestedQty = round((float)$check['quantity'], 2);
            $availableQty = round(max(0.0, (float)$check['available']), 2);
            $issueQty = round(min($requestedQty, $availableQty), 2);
            $shortageQty = round(max(0.0, $requestedQty - $issueQty), 2);
            if ($shortageQty > 0) {
                $procurementRow = $check;
                $procurementRow['requestedQuantity'] = $requestedQty;
                $procurementRow['quantity'] = $shortageQty;
                $procurementRow['shortage'] = $shortageQty;
                $procurementRow['availableForApproval'] = $issueQty;
                $procurementRow['enough'] = false;
                $procurement[] = $procurementRow;
            }
            // Partial Store balance is useful too: send the available portion
            // to Procurement approval and leave only the shortage for outside procurement.
            if ($issueQty <= 0) continue;
            $check['requestedQuantity'] = $requestedQty;
            $check['quantity'] = $issueQty;
            $check['shortage'] = $shortageQty;
            $check['enough'] = true;
            $dup = $pdo->prepare(
                "SELECT id FROM customer_store_issue_requests
                 WHERE customer_id = ? AND machine_id = ? AND store_item_id = ?
                   AND status = 'PENDING_APPROVAL'
                 LIMIT 1"
            );
            $dup->execute([$customer['id'], $sub2, $check['storeItemId']]);
            if ($existing = $dup->fetchColumn()) {
                $check['existingRequestId'] = $existing;
                $duplicates[] = $check;
                continue;
            }
            $requestId = uuid();
            $pdo->prepare(
                "INSERT INTO customer_store_issue_requests
                 (id, customer_id, machine_id, store_item_id, part_number, description,
                  quantity, unit, unit_cost, balance_at_request, requested_by_name,
                  requested_at, status, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(),'PENDING_APPROVAL',NOW())"
            )->execute([
                $requestId, $customer['id'], $sub2, $check['storeItemId'],
                $check['storePartNumber'] ?: ($check['referenceNumber'] ?: 'STORE-ITEM'),
                $check['storeDescription'] ?: $check['description'],
                $check['quantity'], $check['unit'] ?: 'PC', $check['unitCost'], $check['available'], $actor,
            ]);
            $created[] = $requestId;
        }
        if ($created) {
            try {
                $machineLabel = trim(($machine['brand'] ?? '') . ' ' . ($machine['model'] ?? '')) ?: ($machine['machine_type'] ?? 'Machine');
                customer_send_team_alert(
                    (string)$customer['id'], ['machine-expenses'],
                    'STORE ISSUE APPROVAL REQUIRED - ' . $machineLabel,
                    count($created) . " Customer Store item(s) are waiting for Procurement approval.\nMachine: $machineLabel\nRequested by: $actor\nOpen Procurement to approve or reject.",
                    true
                );
            } catch (Throwable $ignored) {}
            log_customer_activity($customer, 'Sent ' . count($created) . ' Customer Store issue request(s) to Procurement approval.');
        }
        json_out([
            'ok' => true,
            'createdCount' => count($created),
            'createdIds' => $created,
            'procurementRequired' => $procurement,
            'alreadyPending' => $duplicates,
            'approvalRequests' => customer_store_issue_request_rows((string)$customer['id'], (string)$sub2),
            'message' => count($created) . ' Store item(s) sent to Procurement approval. Stock has not been deducted yet.',
        ], $created ? 201 : 200);
    }

    if ($method === 'PUT') {
        require_customer_feature_access($customer, 'machine-expenses', 'Procurement');
        require_customer_write_access($customer);
        if (!customer_can_approve_store_issue($customer)) {
            json_error('Only Customer Owner, Admin or Accounts can approve Store issues in Procurement.', 403);
        }
        $b = body();
        $action = strtoupper(trim((string)($b['action'] ?? '')));
        $note = trim((string)($b['note'] ?? ''));
        if (!in_array($action, ['APPROVE', 'REJECT'], true)) json_error('Choose APPROVE or REJECT.');
        if (strlen($note) > 500) json_error('Decision note is too long.');
        $approver = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer')) ?: 'Customer';
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $reqStmt = $pdo->prepare(
                'SELECT * FROM customer_store_issue_requests
                 WHERE id = ? AND customer_id = ? FOR UPDATE'
            );
            $reqStmt->execute([$sub2, $customer['id']]);
            $req = $reqStmt->fetch();
            if (!$req) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                json_error('Store issue approval request not found.', 404);
            }
            if ($req['status'] !== 'PENDING_APPROVAL') {
                if ($pdo->inTransaction()) $pdo->rollBack();
                json_error('This Store issue request has already been decided.', 409);
            }
            if ($action === 'REJECT') {
                $pdo->prepare(
                    "UPDATE customer_store_issue_requests
                     SET status='REJECTED', rejected_by_name=?, rejected_at=NOW(), decision_note=?, updated_at=NOW()
                     WHERE id=?"
                )->execute([$approver, $note !== '' ? $note : null, $sub2]);
                $pdo->commit();
                log_customer_activity($customer, 'Rejected Customer Store issue request ' . $sub2 . '.');
                json_out(['ok' => true, 'status' => 'REJECTED', 'message' => 'Store issue request rejected.']);
            }

            $machine = customer_machine_for_action((string)$customer['id'], (string)$req['machine_id']);
            $storeStmt = $pdo->prepare(
                'SELECT id, part_number, description, unit, qty_on_hand, average_unit_cost
                 FROM customer_store_items WHERE id = ? AND customer_id = ? FOR UPDATE'
            );
            $storeStmt->execute([$req['store_item_id'], $customer['id']]);
            $store = $storeStmt->fetch();
            if (!$store) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                json_error('Customer Store item no longer exists.', 409);
            }
            $quantity = (float)$req['quantity'];
            $available = (float)$store['qty_on_hand'];
            if ($available + 0.00001 < $quantity) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                json_error('Store balance changed and is now insufficient. Available: ' . rtrim(rtrim(number_format($available, 2, '.', ''), '0'), '.') . ' ' . ($store['unit'] ?: $req['unit']) . '.', 409);
            }
            $balanceAfter = round($available - $quantity, 2);
            $unitCost = round((float)$store['average_unit_cost'], 2);
            $unit = strtoupper(trim((string)$store['unit'])) ?: strtoupper(trim((string)$req['unit'])) ?: 'PC';
            $description = trim((string)$store['description']) ?: trim((string)$req['description']);
            $partNumber = strtoupper(trim((string)$store['part_number'])) ?: strtoupper(trim((string)$req['part_number']));
            $expenseId = uuid();
            $pdo->prepare('UPDATE customer_store_items SET qty_on_hand = ?, updated_at = NOW() WHERE id = ?')
                ->execute([$balanceAfter, $store['id']]);
            $machineLabel = trim(($machine['brand'] ?? '') . ' ' . ($machine['model'] ?? '')) ?: ($machine['machine_type'] ?? 'Machine');
            $pdo->prepare(
                "INSERT INTO customer_store_movements
                 (id, customer_id, store_item_id, machine_id, movement_type, quantity, unit_cost,
                  balance_after, actor_name, received_by, note, created_at)
                 VALUES (?,?,?,?, 'ISSUE', ?,?,?,?,?,?,NOW())"
            )->execute([
                uuid(), $customer['id'], $store['id'], $req['machine_id'], $quantity, $unitCost,
                $balanceAfter, $approver, $req['requested_by_name'] ?: null,
                'Approved Expenses issue to ' . $machineLabel . ($note !== '' ? ' - ' . $note : ''),
            ]);
            $cost = round($quantity * $unitCost, 2);
            $pdo->prepare(
                "INSERT INTO usage_logs
                 (id, customer_id, machine_id, date, category, description,
                  part_number, quantity, unit, unit_price, cost, logged_by,
                  store_item_id, stock_source, store_balance_after, issued_by, received_by, created_at)
                 VALUES (?,?,?,CURRENT_DATE,'SPARE_PART',?,?,?,?,?,?,?,?,?,?,?,?,NOW())"
            )->execute([
                $expenseId, $customer['id'], $req['machine_id'], $description, $partNumber,
                $quantity, $unit, $unitCost, $cost, $approver,
                $store['id'], 'CUSTOMER_STORE', $balanceAfter, $approver, $req['requested_by_name'] ?: null,
            ]);
            $pdo->prepare(
                "UPDATE customer_store_issue_requests
                 SET status='APPROVED', approved_by_name=?, approved_at=NOW(), decision_note=?,
                     expense_id=?, unit_cost=?, updated_at=NOW()
                 WHERE id=?"
            )->execute([$approver, $note !== '' ? $note : null, $expenseId, $unitCost, $sub2]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        log_customer_activity($customer, 'Approved Customer Store issue ' . $partNumber . ' x ' . $quantity . ' for ' . $machineLabel . '. Balance: ' . $balanceAfter . ' ' . $unit . '.');
        json_out([
            'ok' => true,
            'status' => 'APPROVED',
            'expenseId' => $expenseId,
            'storeBalanceAfter' => $balanceAfter,
            'message' => 'Approved. Store balance deducted and Procurement record created.',
        ]);
    }

    json_error('Method not allowed.', 405);
}

// ---- Customer Workshop Account ---------------------------------------------
// One customer-level workshop float shared by all machines. The available
// balance is always computed as funded amount minus DIRECT_PURCHASE
// procurement spending. Customer Store issues are inventory movements and do
// not deduct cash a second time.
if ($sub === 'workshop-account') {
    require_customer_feature_access($customer, 'machine-expenses', 'Workshop Account');

    $accountStmt = db()->prepare(
        'SELECT id, funded_amount, note, receipt_photo_name, receipt_photo_mime,
                CASE WHEN receipt_photo_data IS NOT NULL AND receipt_photo_data <> \'\' THEN 1 ELSE 0 END AS has_receipt,
                updated_by_name, created_at, updated_at
         FROM customer_workshop_accounts WHERE customer_id = ? LIMIT 1'
    );
    $accountStmt->execute([$customer['id']]);
    $account = $accountStmt->fetch() ?: null;

    if ($method === 'POST' && $sub2 === 'add') {
        require_customer_write_access($customer);
        if (!customer_can_manage_workshop_account($customer)) {
            json_error('Your account cannot add Workshop Account funds.', 403);
        }
        $b = body();
        $amount = (float)($b['amount'] ?? 0);
        $note = trim((string)($b['note'] ?? ''));
        $receiptPhoto = trim((string)($b['receiptPhoto'] ?? ''));
        $receiptName = trim((string)($b['receiptName'] ?? ''));
        if ($amount <= 0) json_error('Amount must be greater than zero.');
        if (strlen($note) > 255) json_error('Workshop Account note is too long.');
        $receiptData = null; $receiptMime = null;
        if ($receiptPhoto !== '') {
            [$receiptData, $receiptMime, $receiptName] = validate_receipt_upload($receiptPhoto, $receiptName);
        }
        $actorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer')) ?: 'Customer';
        if ($account) {
            $sql = 'UPDATE customer_workshop_accounts
                    SET funded_amount = funded_amount + ?, note = ?, updated_by_name = ?, updated_at = NOW()';
            $params = [round($amount, 2), $note !== '' ? $note : $account['note'], $actorName];
            if ($receiptData !== null) {
                $sql .= ', receipt_photo_data = ?, receipt_photo_mime = ?, receipt_photo_name = ?';
                array_push($params, $receiptData, $receiptMime, $receiptName !== '' ? $receiptName : null);
            }
            $sql .= ' WHERE customer_id = ?';
            $params[] = $customer['id'];
            db()->prepare($sql)->execute($params);
        } else {
            db()->prepare(
                'INSERT INTO customer_workshop_accounts
                 (id, customer_id, funded_amount, note, receipt_photo_data, receipt_photo_mime, receipt_photo_name, updated_by_name, created_at, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())'
            )->execute([
                uuid(), $customer['id'], round($amount, 2), $note !== '' ? $note : null,
                $receiptData, $receiptMime, $receiptName !== '' ? $receiptName : null, $actorName,
            ]);
        }
        log_customer_activity($customer, 'Added Workshop Account funds: TZS ' . number_format($amount, 2));
        json_out(['ok'=>true, 'message'=>'Workshop Account funds added successfully.'], 201);
    }

    if ($method === 'PUT' && $sub2 === 'edit') {
        require_customer_write_access($customer);
        if (!customer_can_manage_workshop_account($customer)) {
            json_error('Your account cannot edit the Workshop Account.', 403);
        }
        $b = body();
        $amount = (float)($b['amount'] ?? 0);
        $note = trim((string)($b['note'] ?? ''));
        $receiptPhoto = trim((string)($b['receiptPhoto'] ?? ''));
        $receiptName = trim((string)($b['receiptName'] ?? ''));
        if ($amount < 0) json_error('Funded amount cannot be negative.');
        if (strlen($note) > 255) json_error('Workshop Account note is too long.');
        $receiptData = null; $receiptMime = null;
        if ($receiptPhoto !== '') {
            [$receiptData, $receiptMime, $receiptName] = validate_receipt_upload($receiptPhoto, $receiptName);
        }
        $actorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer')) ?: 'Customer';
        if ($account) {
            $sql = 'UPDATE customer_workshop_accounts SET funded_amount = ?, note = ?, updated_by_name = ?, updated_at = NOW()';
            $params = [round($amount, 2), $note !== '' ? $note : null, $actorName];
            if ($receiptData !== null) {
                $sql .= ', receipt_photo_data = ?, receipt_photo_mime = ?, receipt_photo_name = ?';
                array_push($params, $receiptData, $receiptMime, $receiptName !== '' ? $receiptName : null);
            }
            $sql .= ' WHERE customer_id = ?';
            $params[] = $customer['id'];
            db()->prepare($sql)->execute($params);
        } else {
            db()->prepare(
                'INSERT INTO customer_workshop_accounts
                 (id, customer_id, funded_amount, note, receipt_photo_data, receipt_photo_mime, receipt_photo_name, updated_by_name, created_at, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())'
            )->execute([
                uuid(), $customer['id'], round($amount, 2), $note !== '' ? $note : null,
                $receiptData, $receiptMime, $receiptName !== '' ? $receiptName : null, $actorName,
            ]);
        }
        log_customer_activity($customer, 'Edited Workshop Account funded amount: TZS ' . number_format($amount, 2));
        json_out(['ok'=>true, 'message'=>'Workshop Account updated successfully.']);
    }

    if ($method === 'PUT' && $sub2 === 'receipt') {
        require_customer_write_access($customer);
        if (!customer_can_manage_workshop_account($customer)) {
            json_error('Your account cannot upload a Workshop Account receipt.', 403);
        }
        if (!$account) json_error('Add Workshop Account funds before uploading a receipt.', 409);
        $b = body();
        $receiptPhoto = trim((string)($b['receiptPhoto'] ?? ''));
        $receiptName = trim((string)($b['receiptName'] ?? ''));
        if ($receiptPhoto === '') json_error('Choose a receipt photo or PDF.');
        [$receiptData, $receiptMime, $receiptName] = validate_receipt_upload($receiptPhoto, $receiptName);
        $actorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer')) ?: 'Customer';
        db()->prepare(
            'UPDATE customer_workshop_accounts
             SET receipt_photo_data=?, receipt_photo_mime=?, receipt_photo_name=?, updated_by_name=?, updated_at=NOW()
             WHERE customer_id=?'
        )->execute([$receiptData, $receiptMime, $receiptName !== '' ? $receiptName : null, $actorName, $customer['id']]);
        log_customer_activity($customer, 'Uploaded Workshop Account receipt.');
        json_out(['ok'=>true, 'message'=>'Workshop Account receipt uploaded successfully.']);
    }

    if ($method === 'GET' && $sub2 === 'receipt') {
        if (!$account || empty($account['has_receipt'])) json_error('Workshop Account receipt was not found.', 404);
        $stmt = db()->prepare(
            'SELECT receipt_photo_data, receipt_photo_mime, receipt_photo_name
             FROM customer_workshop_accounts WHERE customer_id = ? LIMIT 1'
        );
        $stmt->execute([$customer['id']]);
        $receipt = $stmt->fetch();
        $binary = base64_decode((string)($receipt['receipt_photo_data'] ?? ''), true);
        if ($binary === false || $binary === '') json_error('Workshop Account receipt is damaged.', 500);
        $mime = in_array($receipt['receipt_photo_mime'], ['image/jpeg','image/png','image/webp','application/pdf'], true)
            ? $receipt['receipt_photo_mime'] : 'image/jpeg';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . strlen($binary));
        $disposition = !empty($_GET['download']) ? 'attachment' : 'inline';
        header('Content-Disposition: ' . $disposition . '; filename="' .
            preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)($receipt['receipt_photo_name'] ?: 'workshop-account-receipt')) . '"');
        echo $binary; exit;
    }

    if ($method === 'GET' && $sub2 === '') {
        $spendStmt = db()->prepare(
            "SELECT COALESCE(SUM(cost),0)
             FROM usage_logs
             WHERE customer_id = ? AND category = 'SPARE_PART'
               AND COALESCE(stock_source,'DIRECT_PURCHASE') = 'DIRECT_PURCHASE'"
        );
        $spendStmt->execute([$customer['id']]);
        $totalSpent = (float)$spendStmt->fetchColumn();
        $funded = $account ? (float)$account['funded_amount'] : 0.0;
        json_out([
            'fundedAmount'=>round($funded,2),
            'totalSpent'=>round($totalSpent,2),
            'balance'=>round($funded-$totalSpent,2),
            'note'=>$account['note'] ?? null,
            'hasReceipt'=>$account ? (bool)$account['has_receipt'] : false,
            'receiptName'=>$account['receipt_photo_name'] ?? null,
            'updatedBy'=>$account['updated_by_name'] ?? null,
            'updatedAt'=>$account['updated_at'] ?? null,
            'canManage'=>customer_can_manage_workshop_account($customer),
        ]);
    }

    json_error('Method not allowed.', 405);
}

// ---- Customer-recorded machine spare-part expenses -------------------------
if ($sub === 'machine-expenses' && $sub2) {
    require_customer_feature_access($customer, 'machine-expenses', 'Procurement');
    $machineId = $sub2;
    $stmt = db()->prepare(
        'SELECT id, machine_type, model, serial_number, reg_number, brand
         FROM machines
         WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
    );
    $stmt->execute([$machineId, $customer['id']]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine not found for this customer.', 404);

    if ($method === 'POST' && $sub3 === '') {
        require_customer_write_access($customer);
        $b = body();
        $date = trim((string)($b['date'] ?? date('Y-m-d')));
        $description = trim((string)($b['description'] ?? ''));
        $partNumber = strtoupper(trim((string)($b['partNumber'] ?? '')));
        $quantity = (float)($b['quantity'] ?? 0);
        $unitPrice = (float)($b['unitPrice'] ?? 0);
        $unit = strtoupper(trim((string)($b['unit'] ?? 'PC')));
        $receiptPhoto = trim((string)($b['receiptPhoto'] ?? ''));
        $receiptName = trim((string)($b['receiptName'] ?? ''));
        $receiptData = null;
        $receiptMime = null;
        $parsedDate = DateTime::createFromFormat('!Y-m-d', $date);

        if (!$parsedDate || $parsedDate->format('Y-m-d') !== $date) {
            json_error('Enter a valid expense date.');
        }
        if ($description === '') json_error('Spare description is required.');
        if ($partNumber === '') json_error('Part number is required.');
        if ($quantity <= 0) json_error('Quantity must be greater than zero.');
        if ($unitPrice < 0) json_error('Unit cost cannot be negative.');
        if ($unit === '' || strlen($unit) > 20) json_error('Enter a valid unit.');
        if ($receiptPhoto !== '') {
            [$receiptData, $receiptMime, $receiptName] = validate_receipt_upload($receiptPhoto, $receiptName);
        }

        $stockSource = strtoupper(trim((string)($b['stockSource'] ?? 'DIRECT_PURCHASE')));
        $receivedBy = trim((string)($b['receivedBy'] ?? ''));
        if (!in_array($stockSource, ['DIRECT_PURCHASE', 'CUSTOMER_STORE'], true)) {
            json_error('Choose a valid material source.');
        }
        if ($stockSource === 'CUSTOMER_STORE' && !customer_can_manage_store($customer)) {
            json_error('Your account cannot issue stock from the Customer Store.', 403);
        }

        $expenseId = uuid();
        $loggedBy = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer')) ?: 'Customer';
        $issuedBy = $stockSource === 'CUSTOMER_STORE' ? $loggedBy : null;
        $storeItemId = null;
        $storeBalanceAfter = null;
        $pdo = db();
        $pdo->beginTransaction();
        try {
            if ($stockSource === 'CUSTOMER_STORE') {
                $storeStmt = $pdo->prepare(
                    'SELECT id, description, unit, qty_on_hand, average_unit_cost
                     FROM customer_store_items
                     WHERE customer_id = ? AND UPPER(part_number) = UPPER(?)
                     FOR UPDATE'
                );
                $storeStmt->execute([$customer['id'], $partNumber]);
                $storeItem = $storeStmt->fetch();
                if (!$storeItem) {
                    if ($pdo->inTransaction()) $pdo->rollBack();
                    json_error('This part is not in your Customer Store. Receive stock first or choose Direct purchase.', 409);
                }
                $available = (float)$storeItem['qty_on_hand'];
                if ($available + 0.00001 < $quantity) {
                    if ($pdo->inTransaction()) $pdo->rollBack();
                    json_error(
                        'Insufficient Customer Store balance. Available: ' .
                        rtrim(rtrim(number_format($available, 2, '.', ''), '0'), '.') . ' ' . ($storeItem['unit'] ?: $unit) . '.',
                        409
                    );
                }
                $storeItemId = $storeItem['id'];
                $storeBalanceAfter = round($available - $quantity, 2);
                $unitPrice = (float)$storeItem['average_unit_cost'];
                $unit = strtoupper(trim((string)$storeItem['unit'])) ?: $unit;
                if ($description === '') $description = (string)$storeItem['description'];
                $pdo->prepare(
                    'UPDATE customer_store_items SET qty_on_hand = ?, updated_at = NOW() WHERE id = ?'
                )->execute([$storeBalanceAfter, $storeItemId]);
                $pdo->prepare(
                    'INSERT INTO customer_store_movements
                     (id, customer_id, store_item_id, machine_id, movement_type, quantity, unit_cost,
                      balance_after, actor_name, received_by, note, created_at)
                     VALUES (?,?,?,?,\'ISSUE\',?,?,?,?,?,?,NOW())'
                )->execute([
                    uuid(), $customer['id'], $storeItemId, $machineId, $quantity,
                    round($unitPrice, 2), $storeBalanceAfter, $loggedBy,
                    $receivedBy !== '' ? $receivedBy : null,
                    'Issued to ' . (($machine['brand'] ? $machine['brand'] . ' ' : '') . $machine['model']),
                ]);
            }

            $cost = round($quantity * $unitPrice, 2);
            $pdo->prepare(
                "INSERT INTO usage_logs
                 (id, customer_id, machine_id, date, category, description,
                  part_number, quantity, unit, unit_price, cost, logged_by,
                  receipt_photo_data, receipt_photo_mime, receipt_photo_name,
                  store_item_id, stock_source, store_balance_after, issued_by, received_by, created_at)
                 VALUES (?,?,?,?,'SPARE_PART',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())"
            )->execute([
                $expenseId,
                $customer['id'],
                $machineId,
                $date,
                $description,
                $partNumber,
                $quantity,
                $unit,
                $unitPrice,
                $cost,
                $loggedBy,
                $receiptData,
                $receiptMime,
                $receiptName !== '' ? $receiptName : null,
                $storeItemId,
                $stockSource,
                $storeBalanceAfter,
                $issuedBy,
                $receivedBy !== '' ? $receivedBy : null,
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        log_customer_activity(
            $customer,
            ($stockSource === 'CUSTOMER_STORE' ? 'Issued from Store' : 'Recorded direct purchase') .
            " - {$quantity} {$unit} {$partNumber} for " . (($machine['brand'] ? $machine['brand'] . ' ' : '') . $machine['model'])
        );
        json_out([
            'id' => $expenseId,
            'cost' => $cost,
            'stockSource' => $stockSource,
            'storeBalanceAfter' => $storeBalanceAfter,
            'message' => $stockSource === 'CUSTOMER_STORE'
                ? 'Material issued to machine and Store balance updated.'
                : 'Procurement record saved successfully.',
        ], 201);
    }

    if ($method === 'PUT' && $sub3 === 'receipt') {
        require_customer_write_access($customer);
        $expenseId = trim((string)($_GET['expenseId'] ?? ''));
        if ($expenseId === '') json_error('Expense is required.');
        $b = body();
        $receiptPhoto = trim((string)($b['receiptPhoto'] ?? ''));
        $receiptName = trim((string)($b['receiptName'] ?? ''));
        if ($receiptPhoto === '') json_error('Choose a receipt photo or PDF to upload.');
        [$receiptData, $receiptMime, $receiptName] = validate_receipt_upload($receiptPhoto, $receiptName);

        $stmt = db()->prepare(
            "UPDATE usage_logs
             SET receipt_photo_data = ?, receipt_photo_mime = ?, receipt_photo_name = ?
             WHERE id = ? AND customer_id = ? AND machine_id = ? AND category = 'SPARE_PART'"
        );
        $stmt->execute([$receiptData, $receiptMime, $receiptName, $expenseId, $customer['id'], $machineId]);
        if ($stmt->rowCount() === 0) json_error('Expense not found.', 404);
        json_out(['ok' => true, 'message' => 'Receipt attached successfully.']);
    }

    if ($method === 'GET' && $sub3 === 'receipts-list') {
        $dateFilter = trim((string)($_GET['date'] ?? ''));
        $monthFilter = trim((string)($_GET['month'] ?? ''));
        $sql = "SELECT id, receipt_photo_name, receipt_photo_mime, date, description
                FROM usage_logs
                WHERE customer_id = ? AND machine_id = ? AND category = 'SPARE_PART'
                  AND receipt_photo_data IS NOT NULL AND receipt_photo_data <> ''";
        $params = [$customer['id'], $machineId];
        if ($dateFilter !== '') {
            $sql .= ' AND date = ?';
            $params[] = $dateFilter;
        } elseif ($monthFilter !== '') {
            $sql .= " AND to_char(date, 'YYYY-MM') = ?";
            $params[] = $monthFilter;
        }
        $sql .= ' ORDER BY date ASC';
        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        $result = array_map(function ($row) use ($machineId) {
            $ext = $row['receipt_photo_mime'] === 'application/pdf' ? '.pdf' : '';
            $name = $row['receipt_photo_name'] ?: ('receipt-' . $row['id']);
            if ($ext && !str_ends_with(strtolower($name), '.pdf')) $name .= $ext;
            return [
                'id' => $row['id'],
                'name' => $name,
                'date' => $row['date'],
                'description' => $row['description'],
                'downloadUrl' => "/customer-portal/machine-expenses/{$machineId}/receipt?expenseId={$row['id']}",
            ];
        }, $rows);
        json_out($result);
    }

    if ($method === 'GET' && $sub3 === 'receipt') {
        $expenseId = trim((string)($_GET['expenseId'] ?? ''));
        if ($expenseId === '') json_error('Expense receipt was not specified.');
        $stmt = db()->prepare(
            "SELECT receipt_photo_data, receipt_photo_mime, receipt_photo_name
             FROM usage_logs
             WHERE id = ? AND customer_id = ? AND machine_id = ?
               AND category = 'SPARE_PART'"
        );
        $stmt->execute([$expenseId, $customer['id'], $machineId]);
        $receipt = $stmt->fetch();
        if (!$receipt || !$receipt['receipt_photo_data']) {
            json_error('Receipt photo was not found.', 404);
        }
        $binary = base64_decode((string)$receipt['receipt_photo_data'], true);
        if ($binary === false) json_error('Receipt photo is damaged.', 500);
        $mime = in_array(
            $receipt['receipt_photo_mime'],
            ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
            true
        ) ? $receipt['receipt_photo_mime'] : 'image/jpeg';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . strlen($binary));
        $disposition = !empty($_GET['download']) ? 'attachment' : 'inline';
        header('Content-Disposition: ' . $disposition . '; filename="' .
            preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)($receipt['receipt_photo_name'] ?: 'receipt-photo')) .
            '"');
        echo $binary;
        exit;
    }

    [$rangeFrom, $rangeTo] = usage_log_date_range_from_query();
    $expenses = machine_expense_rows($customer['id'], $machineId, $rangeFrom, $rangeTo);

    if ($method === 'GET' && $sub3 === 'csv') {
        $safeMachine = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)$machine['model']);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="procurement-' . $safeMachine . '.csv"');
        $output = fopen('php://output', 'wb');
        fputcsv($output, [strtoupper($customer['name']) . ' - MACHINE PROCUREMENT REPORT']);
        fputcsv($output, ['Service provided by', 'BELM General Tech Service Limited']);
        fputcsv($output, ['Period', $rangeFrom ? "$rangeFrom to $rangeTo" : 'All time']);
        fputcsv($output, []);
        fputcsv($output, ['Date', 'Machine', 'Source', 'Part Number', 'Description', 'Quantity', 'Unit', 'Unit Cost TZS', 'Total TZS', 'Store Balance After', 'Issued By', 'Received By', 'Receipt', 'Recorded By']);
        foreach ($expenses as $expense) {
            $safeText = static function ($value): string {
                $text = (string)$value;
                return preg_match('/^[=+\-@]/', $text) ? "'" . $text : $text;
            };
            fputcsv($output, [
                $expense['date'],
                $safeText($machine['model']),
                ($expense['stock_source'] ?? 'DIRECT_PURCHASE') === 'CUSTOMER_STORE' ? 'Customer Store' : 'Direct Purchase',
                $safeText($expense['part_number'] ?? ''),
                $safeText($expense['description']),
                $expense['quantity'],
                $expense['unit'],
                $expense['unit_price'],
                $expense['cost'],
                $expense['store_balance_after'] !== null ? $expense['store_balance_after'] : '',
                $safeText($expense['issued_by'] ?? ''),
                $safeText($expense['received_by'] ?? ''),
                $expense['has_receipt'] ? 'Attached' : 'No receipt',
                $safeText($expense['logged_by'] ?? ''),
            ]);
        }
        fclose($output);
        exit;
    }

    if ($method === 'GET' && $sub3 === 'audit-pdf') {
        $storeItems = customer_store_item_rows((string)$customer['id']);
        $storeSummary = customer_store_summary((string)$customer['id'], $machineId);
        $totalCost = array_reduce(
            $expenses,
            static fn(float $sum, array $expense): float => $sum + (float)$expense['cost'],
            0.0
        );
        $auditRows = [
            ['MACHINE MATERIAL USAGE'],
            ['Date', 'Source', 'Part', 'Qty', 'Unit', 'Unit Cost', 'Total', 'Bal After'],
        ];
        foreach ($expenses as $expense) {
            $auditRows[] = [
                display_date($expense['date']),
                ($expense['stock_source'] ?? 'DIRECT_PURCHASE') === 'CUSTOMER_STORE' ? 'STORE' : 'DIRECT',
                (string)($expense['part_number'] ?: '-'),
                rtrim(rtrim(number_format((float)$expense['quantity'], 2, '.', ''), '0'), '.'),
                (string)($expense['unit'] ?: 'PC'),
                number_format((float)$expense['unit_price'], 2),
                number_format((float)$expense['cost'], 2),
                $expense['store_balance_after'] !== null
                    ? rtrim(rtrim(number_format((float)$expense['store_balance_after'], 2, '.', ''), '0'), '.')
                    : '-',
            ];
            $auditRows[] = [
                'Description: ' . substr((string)$expense['description'], 0, 46),
                'Issued/recorded by: ' . substr((string)($expense['issued_by'] ?: $expense['logged_by'] ?: '-'), 0, 22),
                'Received/used by: ' . substr((string)($expense['received_by'] ?: '-'), 0, 22),
            ];
        }
        $auditRows[] = ['CUSTOMER STORE BALANCE SNAPSHOT'];
        $auditRows[] = ['Part', 'Description', 'Unit', 'Received', 'Issued', 'Balance', 'Avg Unit Cost', 'Stock Value'];
        foreach ($storeItems as $item) {
            $balance = (float)$item['qty_on_hand'];
            $avg = (float)$item['average_unit_cost'];
            $auditRows[] = [
                (string)$item['part_number'],
                substr((string)$item['description'], 0, 30),
                (string)$item['unit'],
                rtrim(rtrim(number_format((float)$item['total_received'], 2, '.', ''), '0'), '.'),
                rtrim(rtrim(number_format((float)$item['total_issued'], 2, '.', ''), '0'), '.'),
                rtrim(rtrim(number_format($balance, 2, '.', ''), '0'), '.'),
                number_format($avg, 2),
                number_format($balance * $avg, 2),
            ];
        }
        $auditRows[] = ['STORE MOVEMENT AUDIT - PARTS RELATED TO THIS MACHINE'];
        $auditRows[] = ['Time', 'Move', 'Part', 'Qty', 'Balance', 'Machine', 'Actor', 'Received By'];
        foreach (customer_store_audit_rows((string)$customer['id'], $machineId) as $move) {
            $machineLabel = trim(((string)($move['machine_brand'] ?? '')) . ' ' . ((string)($move['machine_model'] ?? '')));
            $auditRows[] = [
                date('d/m/Y H:i', strtotime((string)$move['created_at'])),
                (string)$move['movement_type'],
                (string)$move['part_number'],
                rtrim(rtrim(number_format((float)$move['quantity'], 2, '.', ''), '0'), '.') . ' ' . (string)$move['unit'],
                rtrim(rtrim(number_format((float)$move['balance_after'], 2, '.', ''), '0'), '.'),
                $machineLabel !== '' ? substr($machineLabel, 0, 18) : 'STORE',
                substr((string)$move['actor_name'], 0, 18),
                substr((string)($move['received_by'] ?: '-'), 0, 18),
            ];
        }
        $safeMachine = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)$machine['model']);
        output_table_pdf(
            'machine-material-audit-' . $safeMachine . '.pdf',
            strtoupper($customer['name']) . ' - MACHINE PROCUREMENT & MATERIAL AUDIT',
            [
                'Machine: ' . ($machine['brand'] ? $machine['brand'] . ' ' : '') . $machine['model'],
                'Serial / Registration: ' . ($machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded')),
                'Period: ' . ($rangeFrom ? display_date($rangeFrom) . ' to ' . display_date($rangeTo) : 'All time'),
                'Procurement total: TZS ' . number_format($totalCost, 2),
                'Customer Store issues to this machine: ' . (int)$storeSummary['machineIssueCount']
                    . ' issue record(s) / TZS ' . number_format((float)$storeSummary['machineIssuedValue'], 2),
                'Customer Store current stock value: TZS ' . number_format((float)$storeSummary['stockValue'], 2),
                'Generated: ' . date('d/m/Y H:i'),
            ],
            $auditRows
        );
    }

    if ($method === 'GET' && $sub3 === 'pdf') {
        $totalCost = array_reduce(
            $expenses,
            static fn(float $sum, array $expense): float => $sum + (float)$expense['cost'],
            0.0
        );
        $lines = [
            strtoupper($customer['name']) . ' - MACHINE PROCUREMENT REPORT',
            'Service provided by: BELM General Tech Service Limited',
            'Machine: ' . ($machine['brand'] ? $machine['brand'] . ' ' : '') . $machine['model'],
            'Serial / Registration: ' . ($machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded')),
            'Period: ' . ($rangeFrom ? display_date($rangeFrom) . ' to ' . display_date($rangeTo) : 'All time'),
            'Generated: ' . date('d/m/Y H:i'),
            str_repeat('-', 78),
        ];
        foreach ($expenses as $expense) {
            $lines[] = sprintf(
                '%s | %s | Part: %s | Qty: %s %s | Unit: %s | Total: TZS %s | Balance after: %s | Receipt: %s',
                display_date($expense['date']),
                ($expense['stock_source'] ?? 'DIRECT_PURCHASE') === 'CUSTOMER_STORE' ? 'STORE' : 'DIRECT',
                $expense['part_number'] ?: '-',
                rtrim(rtrim(number_format((float)$expense['quantity'], 2, '.', ''), '0'), '.'),
                $expense['unit'] ?: 'PC',
                number_format((float)$expense['unit_price'], 2),
                number_format((float)$expense['cost'], 2),
                $expense['store_balance_after'] !== null ? number_format((float)$expense['store_balance_after'], 2) : '-',
                $expense['has_receipt'] ? 'Yes' : 'No'
            );
            $descriptionLine = (string)$expense['description'];
            $descriptionLine = function_exists('mb_substr')
                ? mb_substr($descriptionLine, 0, 105)
                : substr($descriptionLine, 0, 105);
            $lines[] = '  ' . $descriptionLine;
            $lines[] = '  Issued/Recorded by: ' . ($expense['issued_by'] ?: $expense['logged_by'] ?: '-') . ' | Received by: ' . ($expense['received_by'] ?: '-');
        }
        $lines[] = str_repeat('-', 78);
        $lines[] = 'TOTAL PROCUREMENT: TZS ' . number_format($totalCost, 2);
        $safeMachine = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)$machine['model']);
        output_machine_expense_pdf('procurement-' . $safeMachine . '.pdf', $lines);
    }

    if ($method === 'GET' && $sub3 === '') {
        $recordCount = count($expenses);
        $totalQuantity = 0.0;
        $totalCost = 0.0;
        $receiptCount = 0;
        foreach ($expenses as $expense) {
            $totalQuantity += (float)$expense['quantity'];
            $totalCost += (float)$expense['cost'];
            if ($expense['has_receipt']) $receiptCount++;
        }
        json_out([
            'machine' => [
                'id' => $machine['id'],
                'machineType' => $machine['machine_type'],
                'model' => $machine['model'],
                'serialNumber' => $machine['serial_number'],
                'regNumber' => $machine['reg_number'],
                'brand' => $machine['brand'],
            ],
            'summary' => [
                'recordCount' => $recordCount,
                'totalQuantity' => $totalQuantity,
                'totalCost' => round($totalCost, 2),
                'averageCost' => $recordCount > 0 ? round($totalCost / $recordCount, 2) : 0,
                'receiptCount' => $receiptCount,
            ],
            'storeSummary' => customer_store_summary((string)$customer['id'], $machineId),
            'storeItems' => customer_store_item_rows((string)$customer['id']),
            'storeMovements' => customer_store_audit_rows((string)$customer['id'], $machineId),
            'canManageStore' => customer_can_manage_store($customer),
            'storeIssueRequests' => customer_store_issue_request_rows((string)$customer['id'], $machineId),
            'canApproveStoreIssue' => customer_can_approve_store_issue($customer),
            'procurementRequests' => customer_procurement_request_rows((string)$customer['id'], $machineId),
            'canManageProcurement' => customer_can_manage_procurement($customer),
            'serviceJobBilling' => customer_service_job_billing_rows((string)$customer['id'], $machineId),
            'expenses' => $expenses,
        ]);
    }
}

// ---- Customer-recorded daily fuel usage per machine ------------------------
if ($sub === 'fuel-usage' && $sub2) {
    require_customer_feature_access($customer, 'fuel-usage', 'Fuel Usage');
    $machineId = $sub2;
    $stmt = db()->prepare(
        'SELECT id, machine_type, model, serial_number, reg_number, brand
         FROM machines
         WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
    );
    $stmt->execute([$machineId, $customer['id']]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine not found for this customer.', 404);

    if ($method === 'POST' && $sub3 === '') {
        require_customer_write_access($customer);
        $b = body();
        $date = trim((string)($b['date'] ?? date('Y-m-d')));
        $litres = (float)($b['litres'] ?? 0);
        $unitPrice = (float)($b['unitPrice'] ?? 0);
        $description = trim((string)($b['description'] ?? 'Fuel'));
        $receiptPhoto = trim((string)($b['receiptPhoto'] ?? ''));
        $receiptName = trim((string)($b['receiptName'] ?? ''));
        $receiptData = null;
        $receiptMime = null;
        $parsedDate = DateTime::createFromFormat('!Y-m-d', $date);

        if (!$parsedDate || $parsedDate->format('Y-m-d') !== $date) {
            json_error('Enter a valid fuel date.');
        }
        if ($litres <= 0) json_error('Litres must be greater than zero.');
        if ($unitPrice < 0) json_error('Price per litre cannot be negative.');
        if ($receiptPhoto !== '') {
            [$receiptData, $receiptMime, $receiptName] = validate_receipt_upload($receiptPhoto, $receiptName);
        }

        $cost = round($litres * $unitPrice, 2);
        $fuelId = uuid();
        $loggedBy = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer'));
        db()->prepare(
            "INSERT INTO usage_logs
             (id, customer_id, machine_id, date, category, description,
              quantity, unit, unit_price, cost, logged_by,
              receipt_photo_data, receipt_photo_mime, receipt_photo_name, created_at)
             VALUES (?,?,?,?,'FUEL',?,?,'L',?,?,?,?,?,?,NOW())"
        )->execute([
            $fuelId,
            $customer['id'],
            $machineId,
            $date,
            $description !== '' ? $description : 'Fuel',
            $litres,
            $unitPrice,
            $cost,
            $loggedBy !== '' ? $loggedBy : 'Customer',
            $receiptData,
            $receiptMime,
            $receiptName !== '' ? $receiptName : null,
        ]);
        json_out([
            'id' => $fuelId,
            'cost' => $cost,
            'message' => 'Fuel usage saved successfully.',
        ], 201);
    }

    if ($method === 'GET' && $sub3 === 'receipts-list') {
        $dateFilter = trim((string)($_GET['date'] ?? ''));
        $monthFilter = trim((string)($_GET['month'] ?? ''));
        $sql = "SELECT id, receipt_photo_name, receipt_photo_mime, date, description
                FROM usage_logs
                WHERE customer_id = ? AND machine_id = ? AND category = 'FUEL'
                  AND receipt_photo_data IS NOT NULL AND receipt_photo_data <> ''";
        $params = [$customer['id'], $machineId];
        if ($dateFilter !== '') {
            $sql .= ' AND date = ?';
            $params[] = $dateFilter;
        } elseif ($monthFilter !== '') {
            $sql .= " AND to_char(date, 'YYYY-MM') = ?";
            $params[] = $monthFilter;
        }
        $sql .= ' ORDER BY date ASC';
        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        $result = array_map(function ($row) use ($machineId) {
            $ext = $row['receipt_photo_mime'] === 'application/pdf' ? '.pdf' : '';
            $name = $row['receipt_photo_name'] ?: ('fuel-receipt-' . $row['id']);
            if ($ext && !str_ends_with(strtolower($name), '.pdf')) $name .= $ext;
            return [
                'id' => $row['id'],
                'name' => $name,
                'date' => $row['date'],
                'description' => $row['description'],
                'downloadUrl' => "/customer-portal/fuel-usage/{$machineId}/receipt?expenseId={$row['id']}",
            ];
        }, $rows);
        json_out($result);
    }

    if ($method === 'GET' && $sub3 === 'receipt') {
        $entryId = trim((string)($_GET['expenseId'] ?? ''));
        if ($entryId === '') json_error('Fuel receipt was not specified.');
        $stmt = db()->prepare(
            "SELECT receipt_photo_data, receipt_photo_mime, receipt_photo_name
             FROM usage_logs
             WHERE id = ? AND customer_id = ? AND machine_id = ?
               AND category = 'FUEL'"
        );
        $stmt->execute([$entryId, $customer['id'], $machineId]);
        $receipt = $stmt->fetch();
        if (!$receipt || !$receipt['receipt_photo_data']) {
            json_error('Receipt photo was not found.', 404);
        }
        $binary = base64_decode((string)$receipt['receipt_photo_data'], true);
        if ($binary === false) json_error('Receipt photo is damaged.', 500);
        $mime = in_array(
            $receipt['receipt_photo_mime'],
            ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
            true
        ) ? $receipt['receipt_photo_mime'] : 'image/jpeg';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . strlen($binary));
        $disposition = !empty($_GET['download']) ? 'attachment' : 'inline';
        header('Content-Disposition: ' . $disposition . '; filename="' .
            preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)($receipt['receipt_photo_name'] ?: 'fuel-receipt')) .
            '"');
        echo $binary;
        exit;
    }

    [$rangeFrom, $rangeTo] = usage_log_date_range_from_query();
    $fuelEntries = fuel_usage_rows($customer['id'], $machineId, $rangeFrom, $rangeTo);

    if ($method === 'GET' && $sub3 === 'csv') {
        $safeMachine = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)$machine['model']);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="fuel-usage-' . $safeMachine . '.csv"');
        $output = fopen('php://output', 'w');
        fputcsv($output, [strtoupper($customer['name']) . ' - DAILY FUEL USAGE']);
        fputcsv($output, ['Service provided by', 'BELM General Tech Service Limited']);
        fputcsv($output, ['Period', $rangeFrom ? "$rangeFrom to $rangeTo" : 'All time']);
        fputcsv($output, []);
        fputcsv($output, ['Date', 'Machine', 'Litres', 'Price/Litre TZS', 'Total TZS', 'Receipt', 'Recorded By']);
        $totalLitres = 0.0;
        $totalCost = 0.0;
        foreach ($fuelEntries as $entry) {
            $totalLitres += (float)$entry['quantity'];
            $totalCost += (float)$entry['cost'];
            fputcsv($output, [
                $entry['date'],
                trim(($machine['brand'] ?? '') . ' ' . ($machine['model'] ?? '')),
                $entry['quantity'],
                number_format((float)$entry['unit_price'], 2, '.', ''),
                number_format((float)$entry['cost'], 2, '.', ''),
                $entry['has_receipt'] ? 'Yes' : 'No',
                $entry['logged_by'],
            ]);
        }
        fputcsv($output, []);
        fputcsv($output, ['TOTAL', '', $totalLitres, '', number_format($totalCost, 2, '.', '')]);
        fclose($output);
        exit;
    }

    if ($method === 'GET' && $sub3 === 'pdf') {
        $totalLitres = array_reduce($fuelEntries, static fn(float $sum, array $e): float => $sum + (float)$e['quantity'], 0.0);
        $totalCost = array_reduce($fuelEntries, static fn(float $sum, array $e): float => $sum + (float)$e['cost'], 0.0);
        $lines = [
            strtoupper($customer['name']) . ' - DAILY FUEL USAGE REPORT',
            'Service provided by: BELM General Tech Service Limited',
            'Machine: ' . ($machine['brand'] ? $machine['brand'] . ' ' : '') . $machine['model'],
            'Serial / Registration: ' . ($machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded')),
            'Period: ' . ($rangeFrom ? display_date($rangeFrom) . ' to ' . display_date($rangeTo) : 'All time'),
            'Generated: ' . date('d/m/Y H:i'),
            str_repeat('-', 78),
        ];
        foreach ($fuelEntries as $entry) {
            $lines[] = sprintf(
                '%s | Litres: %s | Price/L: TZS %s | Total: TZS %s | Receipt: %s | By: %s',
                display_date($entry['date']),
                rtrim(rtrim(number_format((float)$entry['quantity'], 2, '.', ''), '0'), '.'),
                number_format((float)$entry['unit_price'], 2),
                number_format((float)$entry['cost'], 2),
                $entry['has_receipt'] ? 'Yes' : 'No',
                $entry['logged_by'] ?: '—'
            );
        }
        $lines[] = str_repeat('-', 78);
        $lines[] = 'TOTAL LITRES: ' . rtrim(rtrim(number_format($totalLitres, 2, '.', ''), '0'), '.');
        $lines[] = 'TOTAL FUEL COST: TZS ' . number_format($totalCost, 2);
        $safeMachine = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)$machine['model']);
        output_machine_expense_pdf('fuel-usage-' . $safeMachine . '.pdf', $lines);
    }

    if ($method === 'GET' && $sub3 === '') {
        $recordCount = count($fuelEntries);
        $totalLitres = 0.0;
        $totalCost = 0.0;
        $receiptCount = 0;
        foreach ($fuelEntries as $entry) {
            $totalLitres += (float)$entry['quantity'];
            $totalCost += (float)$entry['cost'];
            if ($entry['has_receipt']) $receiptCount++;
        }
        json_out([
            'machine' => [
                'id' => $machine['id'],
                'machineType' => $machine['machine_type'],
                'model' => $machine['model'],
                'serialNumber' => $machine['serial_number'],
                'regNumber' => $machine['reg_number'],
                'brand' => $machine['brand'],
            ],
            'summary' => [
                'recordCount' => $recordCount,
                'totalLitres' => round($totalLitres, 2),
                'totalCost' => round($totalCost, 2),
                'averageCostPerFillUp' => $recordCount > 0 ? round($totalCost / $recordCount, 2) : 0,
                'receiptCount' => $receiptCount,
            ],
            'entries' => $fuelEntries,
        ]);
    }
}

// ---- Customer-level petty cash account ------------------------------------
// One float/account is shared by all machines. Spending remains tied to the
// machine that consumed the cash, while top-ups belong to the customer account.
if ($sub === 'petty-cash-account') {
    require_customer_feature_access($customer, 'machine-expenses', 'Petty Cash');
    [$rangeFrom, $rangeTo] = usage_log_date_range_from_query();

    if ($method === 'POST' && $sub2 === 'topup') {
        require_customer_write_access($customer);
        if (!customer_can_manage_petty_cash($customer)) {
            json_error('Only Administration/Accounts with full customer control can add Petty Cash funds.', 403);
        }
        $b = body();
        $amount = (float)($b['amount'] ?? 0);
        $note = trim((string)($b['note'] ?? ''));
        if ($amount <= 0) json_error('Top-up amount must be greater than zero.');
        if (strlen($note) > 255) json_error('Top-up note is too long.');
        $actorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Administration'));
        $id = uuid();
        db()->prepare(
            'INSERT INTO petty_cash_topups (id, machine_id, customer_id, amount, note, added_by, added_by_name, created_at) VALUES (?,NULL,?,?,?,?,?,NOW())'
        )->execute([$id, $customer['id'], round($amount, 2), $note !== '' ? $note : null, null, $actorName ?: 'Administration']);
        log_customer_activity($customer, 'Added Petty Cash funds: TZS ' . number_format($amount, 2));
        json_out(['id' => $id, 'message' => 'Petty Cash funds added successfully.'], 201);
    }

    if ($method === 'POST' && $sub2 === 'entry') {
        require_customer_write_access($customer);
        $b = body();
        $machineId = trim((string)($b['machineId'] ?? ''));
        $date = trim((string)($b['date'] ?? date('Y-m-d')));
        $description = trim((string)($b['description'] ?? ''));
        $amount = (float)($b['amount'] ?? 0);
        $receiptPhoto = trim((string)($b['receiptPhoto'] ?? ''));
        $receiptName = trim((string)($b['receiptName'] ?? ''));
        $receiptData = null; $receiptMime = null;
        $parsedDate = DateTime::createFromFormat('!Y-m-d', $date);
        if (!$parsedDate || $parsedDate->format('Y-m-d') !== $date) json_error('Enter a valid date.');
        if ($description === '') json_error('Description is required.');
        if ($amount <= 0) json_error('Amount must be greater than zero.');
        $machineStmt = db()->prepare('SELECT id FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL');
        $machineStmt->execute([$machineId, $customer['id']]);
        if (!$machineStmt->fetch()) json_error('Choose a valid machine for this Petty Cash entry.');
        if ($receiptPhoto !== '') [$receiptData, $receiptMime, $receiptName] = validate_receipt_upload($receiptPhoto, $receiptName);
        $entryId = uuid();
        $loggedBy = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer'));
        db()->prepare(
            "INSERT INTO usage_logs (id, customer_id, machine_id, date, category, description, cost, logged_by, receipt_photo_data, receipt_photo_mime, receipt_photo_name, created_at)
             VALUES (?,?,?,?,'PETTY_CASH',?,?,?,?,?,?,NOW())"
        )->execute([$entryId, $customer['id'], $machineId, $date, $description, round($amount, 2), $loggedBy ?: 'Customer', $receiptData, $receiptMime, $receiptName !== '' ? $receiptName : null]);
        log_customer_activity($customer, 'Recorded Petty Cash expense: TZS ' . number_format($amount, 2));
        json_out(['id' => $entryId, 'message' => 'Petty Cash entry saved successfully.'], 201);
    }

    if ($method === 'GET' && $sub2 === 'receipt') {
        $entryId = trim((string)($_GET['expenseId'] ?? ''));
        if ($entryId === '') json_error('Petty Cash receipt was not specified.');
        $stmt = db()->prepare("SELECT receipt_photo_data, receipt_photo_mime, receipt_photo_name FROM usage_logs WHERE id = ? AND customer_id = ? AND category = 'PETTY_CASH'");
        $stmt->execute([$entryId, $customer['id']]);
        $receipt = $stmt->fetch();
        if (!$receipt || !$receipt['receipt_photo_data']) json_error('Receipt photo was not found.', 404);
        $binary = base64_decode((string)$receipt['receipt_photo_data'], true);
        if ($binary === false) json_error('Receipt photo is damaged.', 500);
        $mime = in_array($receipt['receipt_photo_mime'], ['image/jpeg','image/png','image/webp','application/pdf'], true) ? $receipt['receipt_photo_mime'] : 'image/jpeg';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . strlen($binary));
        header('Content-Disposition: inline; filename="' . preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)($receipt['receipt_photo_name'] ?: 'petty-cash-receipt')) . '"');
        echo $binary; exit;
    }

    $entries = petty_cash_account_rows($customer['id'], $rangeFrom, $rangeTo);

    if ($method === 'GET' && $sub2 === 'receipts-list') {
        $result = [];
        foreach ($entries as $row) {
            if (empty($row['has_receipt'])) continue;
            $name = $row['receipt_photo_name'] ?: ('petty-cash-receipt-' . $row['id']);
            $result[] = ['id' => $row['id'], 'name' => $name, 'downloadUrl' => '/customer-portal/petty-cash-account/receipt?expenseId=' . rawurlencode($row['id'])];
        }
        json_out($result);
    }

    if ($method === 'GET' && $sub2 === 'csv') {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="petty-cash-account.csv"');
        $output = fopen('php://output', 'wb');
        fputcsv($output, [strtoupper($customer['name']) . ' - PETTY CASH ACCOUNT REPORT']);
        fputcsv($output, ['Period', $rangeFrom ? "$rangeFrom to $rangeTo" : 'All time']);
        fputcsv($output, []);
        fputcsv($output, ['Date','Machine','Description','Amount TZS','Receipt','Recorded By']);
        foreach ($entries as $entry) {
            fputcsv($output, [$entry['date'], trim(($entry['brand'] ?? '') . ' ' . ($entry['model'] ?? '')), $entry['description'], $entry['cost'], $entry['has_receipt'] ? 'Yes' : 'No', $entry['logged_by']]);
        }
        fclose($output); exit;
    }

    if ($method === 'GET' && $sub2 === 'pdf') {
        $total = array_reduce($entries, static fn(float $sum, array $entry): float => $sum + (float)$entry['cost'], 0.0);
        $lines = [strtoupper($customer['name']) . ' - PETTY CASH ACCOUNT REPORT', 'Service system: BELM General Tech Service Limited', 'Period: ' . ($rangeFrom ? display_date($rangeFrom) . ' to ' . display_date($rangeTo) : 'All time'), 'Generated: ' . date('d/m/Y H:i'), str_repeat('-', 78)];
        foreach ($entries as $entry) {
            $machineName = trim(($entry['brand'] ?? '') . ' ' . ($entry['model'] ?? '')) ?: ($entry['machine_type'] ?? 'Machine');
            $lines[] = sprintf('%s | %s | TZS %s | %s', display_date($entry['date']), $machineName, number_format((float)$entry['cost'], 2), $entry['description']);
        }
        $lines[] = str_repeat('-', 78);
        $lines[] = 'TOTAL USED: TZS ' . number_format($total, 2);
        output_machine_expense_pdf('petty-cash-account.pdf', $lines);
    }

    if ($method === 'GET' && $sub2 === '') {
        $topupStmt = db()->prepare(
            "SELECT pct.id, pct.amount, pct.note, pct.created_at, COALESCE(pct.added_by_name, u.name, 'Administration') AS added_by_name
             FROM petty_cash_topups pct LEFT JOIN users u ON u.id = pct.added_by
             WHERE pct.customer_id = ? ORDER BY pct.created_at DESC"
        );
        $topupStmt->execute([$customer['id']]);
        $topups = $topupStmt->fetchAll();
        $totalToppedUp = array_reduce($topups, static fn(float $sum, array $t): float => $sum + (float)$t['amount'], 0.0);
        $usedStmt = db()->prepare("SELECT COALESCE(SUM(cost),0) FROM usage_logs WHERE customer_id = ? AND category = 'PETTY_CASH'");
        $usedStmt->execute([$customer['id']]);
        $totalUsed = (float)$usedStmt->fetchColumn();
        $machineStmt = db()->prepare('SELECT id, brand, model, machine_type, serial_number, reg_number FROM machines WHERE customer_id = ? AND deleted_at IS NULL ORDER BY brand, model');
        $machineStmt->execute([$customer['id']]);
        $machines = array_map(static fn(array $m): array => ['id'=>$m['id'], 'name'=>trim(($m['brand'] ?? '') . ' ' . ($m['model'] ?? '')) ?: ($m['machine_type'] ?? 'Machine'), 'serialNumber'=>$m['serial_number'], 'regNumber'=>$m['reg_number']], $machineStmt->fetchAll());
        $mappedEntries = array_map(static fn(array $e): array => [
            'id'=>$e['id'], 'machineId'=>$e['machine_id'], 'machineName'=>trim(($e['brand'] ?? '') . ' ' . ($e['model'] ?? '')) ?: ($e['machine_type'] ?? 'Machine'),
            'date'=>$e['date'], 'description'=>$e['description'], 'cost'=>(float)$e['cost'], 'loggedBy'=>$e['logged_by'], 'hasReceipt'=>(bool)$e['has_receipt'], 'createdAt'=>$e['created_at']
        ], $entries);
        $filteredTotal = array_reduce($mappedEntries, static fn(float $sum, array $e): float => $sum + (float)$e['cost'], 0.0);
        json_out([
            'account'=>['totalToppedUp'=>round($totalToppedUp,2), 'totalUsed'=>round($totalUsed,2), 'balance'=>round($totalToppedUp-$totalUsed,2), 'canTopUp'=>customer_can_manage_petty_cash($customer),
                'topups'=>array_map(static fn(array $t): array => ['id'=>$t['id'], 'amount'=>(float)$t['amount'], 'note'=>$t['note'], 'addedBy'=>$t['added_by_name'], 'createdAt'=>$t['created_at']], $topups)],
            'summary'=>['recordCount'=>count($mappedEntries), 'totalCost'=>round($filteredTotal,2), 'averageCost'=>count($mappedEntries) ? round($filteredTotal/count($mappedEntries),2) : 0, 'receiptCount'=>count(array_filter($mappedEntries, static fn(array $e): bool => $e['hasReceipt']))],
            'machines'=>$machines, 'entries'=>$mappedEntries,
        ]);
    }
}

// ---- Legacy machine-specific Petty Cash route (kept for old bookmarks) -----
// ---- Customer-recorded petty cash (small day-to-day machine costs) --------
if ($sub === 'petty-cash' && $sub2) {
    $machineId = $sub2;
    $stmt = db()->prepare(
        'SELECT id, machine_type, model, serial_number, reg_number, brand
         FROM machines
         WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
    );
    $stmt->execute([$machineId, $customer['id']]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine not found for this customer.', 404);

    if ($method === 'POST' && $sub3 === '') {
        require_customer_write_access($customer);
        $b = body();
        $date = trim((string)($b['date'] ?? date('Y-m-d')));
        $description = trim((string)($b['description'] ?? ''));
        $amount = (float)($b['amount'] ?? 0);
        $receiptPhoto = trim((string)($b['receiptPhoto'] ?? ''));
        $receiptName = trim((string)($b['receiptName'] ?? ''));
        $receiptData = null;
        $receiptMime = null;
        $parsedDate = DateTime::createFromFormat('!Y-m-d', $date);

        if (!$parsedDate || $parsedDate->format('Y-m-d') !== $date) {
            json_error('Enter a valid date.');
        }
        if ($description === '') json_error('Description is required.');
        if ($amount <= 0) json_error('Amount must be greater than zero.');
        if ($receiptPhoto !== '') {
            [$receiptData, $receiptMime, $receiptName] = validate_receipt_upload($receiptPhoto, $receiptName);
        }

        $entryId = uuid();
        $loggedBy = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer'));
        db()->prepare(
            "INSERT INTO usage_logs
             (id, customer_id, machine_id, date, category, description, cost,
              logged_by, receipt_photo_data, receipt_photo_mime, receipt_photo_name, created_at)
             VALUES (?,?,?,?,'PETTY_CASH',?,?,?,?,?,?,NOW())"
        )->execute([
            $entryId,
            $customer['id'],
            $machineId,
            $date,
            $description,
            round($amount, 2),
            $loggedBy !== '' ? $loggedBy : 'Customer',
            $receiptData,
            $receiptMime,
            $receiptName !== '' ? $receiptName : null,
        ]);
        json_out([
            'id' => $entryId,
            'amount' => round($amount, 2),
            'message' => 'Petty cash entry saved successfully.',
        ], 201);
    }

    if ($method === 'GET' && $sub3 === 'receipts-list') {
        $dateFilter = trim((string)($_GET['date'] ?? ''));
        $monthFilter = trim((string)($_GET['month'] ?? ''));
        $sql = "SELECT id, receipt_photo_name, receipt_photo_mime, date, description
                FROM usage_logs
                WHERE customer_id = ? AND machine_id = ? AND category = 'PETTY_CASH'
                  AND receipt_photo_data IS NOT NULL AND receipt_photo_data <> ''";
        $params = [$customer['id'], $machineId];
        if ($dateFilter !== '') {
            $sql .= ' AND date = ?';
            $params[] = $dateFilter;
        } elseif ($monthFilter !== '') {
            $sql .= " AND to_char(date, 'YYYY-MM') = ?";
            $params[] = $monthFilter;
        }
        $sql .= ' ORDER BY date ASC';
        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        $result = array_map(function ($row) use ($machineId) {
            $ext = $row['receipt_photo_mime'] === 'application/pdf' ? '.pdf' : '';
            $name = $row['receipt_photo_name'] ?: ('petty-cash-receipt-' . $row['id']);
            if ($ext && !str_ends_with(strtolower($name), '.pdf')) $name .= $ext;
            return [
                'id' => $row['id'],
                'name' => $name,
                'date' => $row['date'],
                'description' => $row['description'],
                'downloadUrl' => "/customer-portal/petty-cash/{$machineId}/receipt?expenseId={$row['id']}",
            ];
        }, $rows);
        json_out($result);
    }

    if ($method === 'GET' && $sub3 === 'receipt') {
        $entryId = trim((string)($_GET['expenseId'] ?? ''));
        if ($entryId === '') json_error('Petty cash receipt was not specified.');
        $stmt = db()->prepare(
            "SELECT receipt_photo_data, receipt_photo_mime, receipt_photo_name
             FROM usage_logs
             WHERE id = ? AND customer_id = ? AND machine_id = ?
               AND category = 'PETTY_CASH'"
        );
        $stmt->execute([$entryId, $customer['id'], $machineId]);
        $receipt = $stmt->fetch();
        if (!$receipt || !$receipt['receipt_photo_data']) {
            json_error('Receipt photo was not found.', 404);
        }
        $binary = base64_decode((string)$receipt['receipt_photo_data'], true);
        if ($binary === false) json_error('Receipt photo is damaged.', 500);
        $mime = in_array(
            $receipt['receipt_photo_mime'],
            ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
            true
        ) ? $receipt['receipt_photo_mime'] : 'image/jpeg';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . strlen($binary));
        header('Content-Disposition: inline; filename="' .
            preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)($receipt['receipt_photo_name'] ?: 'receipt-photo')) .
            '"');
        echo $binary;
        exit;
    }

    [$rangeFrom, $rangeTo] = usage_log_date_range_from_query();
    $entries = petty_cash_rows($customer['id'], $machineId, $rangeFrom, $rangeTo);

    if ($method === 'GET' && $sub3 === 'csv') {
        $safeMachine = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)$machine['model']);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="petty-cash-' . $safeMachine . '.csv"');
        $output = fopen('php://output', 'wb');
        fputcsv($output, [strtoupper($customer['name']) . ' - PETTY CASH REPORT']);
        fputcsv($output, ['Service provided by', 'BELM General Tech Service Limited']);
        fputcsv($output, ['Period', $rangeFrom ? "$rangeFrom to $rangeTo" : 'All time']);
        fputcsv($output, []);
        fputcsv($output, ['Date', 'Machine', 'Description', 'Amount TZS', 'Receipt', 'Recorded By']);
        foreach ($entries as $entry) {
            $safeText = static function ($value): string {
                $text = (string)$value;
                return preg_match('/^[=+\-@]/', $text) ? "'" . $text : $text;
            };
            fputcsv($output, [
                $entry['date'],
                $safeText($machine['model']),
                $safeText($entry['description']),
                $entry['cost'],
                $entry['has_receipt'] ? 'Attached' : 'No receipt',
                $safeText($entry['logged_by'] ?? ''),
            ]);
        }
        fclose($output);
        exit;
    }

    if ($method === 'GET' && $sub3 === 'pdf') {
        $totalCost = array_reduce(
            $entries,
            static fn(float $sum, array $entry): float => $sum + (float)$entry['cost'],
            0.0
        );
        $lines = [
            strtoupper($customer['name']) . ' - PETTY CASH REPORT',
            'Service provided by: BELM General Tech Service Limited',
            'Machine: ' . ($machine['brand'] ? $machine['brand'] . ' ' : '') . $machine['model'],
            'Serial / Registration: ' . ($machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded')),
            'Period: ' . ($rangeFrom ? display_date($rangeFrom) . ' to ' . display_date($rangeTo) : 'All time'),
            'Generated: ' . date('d/m/Y H:i'),
            str_repeat('-', 78),
        ];
        foreach ($entries as $entry) {
            $lines[] = sprintf(
                '%s | Amount: TZS %s | Receipt: %s',
                display_date($entry['date']),
                number_format((float)$entry['cost'], 2),
                $entry['has_receipt'] ? 'Yes' : 'No'
            );
            $descriptionLine = (string)$entry['description'];
            $descriptionLine = function_exists('mb_substr')
                ? mb_substr($descriptionLine, 0, 105)
                : substr($descriptionLine, 0, 105);
            $lines[] = '  ' . $descriptionLine;
        }
        $lines[] = str_repeat('-', 78);
        $lines[] = 'TOTAL PETTY CASH: TZS ' . number_format($totalCost, 2);
        $safeMachine = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)$machine['model']);
        output_machine_expense_pdf('petty-cash-' . $safeMachine . '.pdf', $lines);
    }

    if ($method === 'GET' && $sub3 === '') {
        $recordCount = count($entries);
        $totalCost = 0.0;
        $receiptCount = 0;
        foreach ($entries as $entry) {
            $totalCost += (float)$entry['cost'];
            if ($entry['has_receipt']) $receiptCount++;
        }

        $topupStmt = db()->prepare(
            "SELECT pct.id, pct.amount, pct.note, pct.created_at, u.name AS added_by_name
             FROM petty_cash_topups pct
             LEFT JOIN users u ON u.id = pct.added_by
             WHERE pct.machine_id = ?
             ORDER BY pct.created_at DESC"
        );
        $topupStmt->execute([$machineId]);
        $topups = $topupStmt->fetchAll();
        $totalToppedUp = array_reduce($topups, static fn(float $sum, array $t): float => $sum + (float)$t['amount'], 0.0);

        // Total used includes every logged expense regardless of the current
        // date-range filter, so the balance always reflects real spending.
        $allUsedStmt = db()->prepare(
            "SELECT COALESCE(SUM(cost), 0) FROM usage_logs WHERE machine_id = ? AND category = 'PETTY_CASH'"
        );
        $allUsedStmt->execute([$machineId]);
        $totalUsedAllTime = (float)$allUsedStmt->fetchColumn();

        json_out([
            'machine' => [
                'id' => $machine['id'],
                'machineType' => $machine['machine_type'],
                'model' => $machine['model'],
                'serialNumber' => $machine['serial_number'],
                'regNumber' => $machine['reg_number'],
                'brand' => $machine['brand'],
            ],
            'summary' => [
                'recordCount' => $recordCount,
                'totalCost' => round($totalCost, 2),
                'averageCost' => $recordCount > 0 ? round($totalCost / $recordCount, 2) : 0,
                'receiptCount' => $receiptCount,
            ],
            'account' => [
                'totalToppedUp' => round($totalToppedUp, 2),
                'totalUsed' => round($totalUsedAllTime, 2),
                'balance' => round($totalToppedUp - $totalUsedAllTime, 2),
                'topups' => array_map(static fn(array $t): array => [
                    'id' => $t['id'],
                    'amount' => (float)$t['amount'],
                    'note' => $t['note'],
                    'addedBy' => $t['added_by_name'],
                    'createdAt' => $t['created_at'],
                ], $topups),
            ],
            'entries' => $entries,
        ]);
    }
}


// ---- Customer-owned machine management -------------------------------------
// V387: These four actions are customer-side only and are enabled only while
// Customer Self-Service is ON (equivalent to BELM Service Provider being OFF).
if ($sub === 'machines' && !$sub2 && $method === 'POST') {
    require_customer_machine_management_access($customer);
    $machine = customer_machine_details_from_body(body());
    customer_assert_machine_serial_available($machine['serialNumber']);
    $newId = uuid();
    db()->prepare(
        'INSERT INTO machines (id, customer_id, machine_type, model, serial_number, reg_number, fleet_number, brand, service_kit, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,NOW())'
    )->execute([
        $newId, $customer['id'], $machine['machineType'], $machine['model'],
        $machine['serialNumber'], $machine['regNumber'], $machine['fleetNumber'],
        $machine['brand'], $machine['serviceKit'], 'NOT_CHECKED',
    ]);
    $seededServiceParts = belm_seed_machine_service_parts_from_templates($newId, $machine['machineType']);
    log_customer_activity($customer, 'Added machine "' . $machine['model'] . '".');
    json_out(['id' => $newId, 'servicePartsSeeded' => $seededServiceParts, 'sync' => ['customer' => true, 'belm' => true]], 201);
}

if ($sub === 'machines' && $sub2 && !$sub3 && $method === 'PUT') {
    require_customer_machine_management_access($customer);
    $stmt = db()->prepare('SELECT id, model FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL');
    $stmt->execute([$sub2, $customer['id']]);
    $existing = $stmt->fetch();
    if (!$existing) json_error('Machine not found for this customer.', 404);
    $machine = customer_machine_details_from_body(body());
    customer_assert_machine_serial_available($machine['serialNumber'], $sub2);
    db()->prepare(
        'UPDATE machines SET machine_type=?, model=?, serial_number=?, reg_number=?, fleet_number=?, brand=?, service_kit=?, updated_at=NOW() WHERE id=? AND customer_id=?'
    )->execute([
        $machine['machineType'], $machine['model'], $machine['serialNumber'], $machine['regNumber'],
        $machine['fleetNumber'], $machine['brand'], $machine['serviceKit'], $sub2, $customer['id'],
    ]);
    log_customer_activity($customer, 'Edited machine "' . $existing['model'] . '" to "' . $machine['model'] . '".');
    json_out(['ok' => true, 'sync' => ['customer' => true, 'belm' => true]]);
}

if ($sub === 'machines' && $sub2 && !$sub3 && $method === 'DELETE') {
    require_customer_machine_management_access($customer);
    $stmt = db()->prepare('SELECT id, model FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL');
    $stmt->execute([$sub2, $customer['id']]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine not found for this customer.', 404);
    send_to_trash('machine', $sub2, $machine['model'], $customer['actorId'] ?? null, 'Deleted by customer self-service');
    soft_delete('machines', $sub2);
    log_customer_activity($customer, 'Deleted machine "' . $machine['model'] . '" to Recycle Bin.');
    json_out(['ok' => true, 'sync' => ['customer' => true, 'belm' => true]]);
}

if ($sub === 'machines' && $sub2 && $sub3 === 'forget' && $method === 'DELETE') {
    require_customer_machine_management_access($customer);
    $stmt = db()->prepare('SELECT id, model FROM machines WHERE id = ? AND customer_id = ?');
    $stmt->execute([$sub2, $customer['id']]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine not found for this customer.', 404);
    $model = (string)$machine['model'];
    $pdo = db();
    $pdo->beginTransaction();
    try {
        customer_forget_machine_permanently($pdo, $sub2);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    log_customer_activity($customer, 'Permanently forgot machine "' . $model . '".');
    json_out([
        'ok' => true,
        'message' => 'Machine "' . $model . '" has been permanently forgotten.',
        'sync' => ['customer' => true, 'belm' => true],
    ]);
}

// ---- Machine reports / service status / operation analysis ----------------
if ($sub === 'machines' && $sub2) {
    $machineId = $sub2;
    $stmt = db()->prepare('SELECT id FROM machines WHERE id = ? AND customer_id = ?');
    $stmt->execute([$machineId, $customer['id']]);
    if (!$stmt->fetch()) json_error('Not found', 404);

    // V378 - Customer > View Your Machine can update the same live Activity Status
    // shown to BELM Admin. The customer-scoped endpoint prevents cross-customer edits.
    if ($sub3 === 'activity-status' && $method === 'PUT') {
        require_customer_any_feature_access($customer, ['check-up', 'workflow'], 'Activity Status');
        $b = body();
        $status = strtoupper(trim((string)($b['operationalStatus'] ?? '')));
        $allowedStatuses = ['NORMAL', 'SERVICE_IN_PROGRESS', 'CHECKUP_IN_PROGRESS', 'MAINTENANCE_IN_PROGRESS', 'GROUNDED'];
        if (!in_array($status, $allowedStatuses, true)) json_error('Invalid operational status.', 422);

        $machineStmt = db()->prepare(
            'SELECT id, brand, model, machine_type, serial_number, reg_number
             FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
        );
        $machineStmt->execute([$machineId, $customer['id']]);
        $machine = $machineStmt->fetch();
        if (!$machine) json_error('Machine not found for this customer.', 404);

        db()->prepare(
            'UPDATE machines SET operational_status = ?, operational_status_updated_at = NOW() WHERE id = ? AND customer_id = ?'
        )->execute([$status, $machineId, $customer['id']]);

        $actorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer'));
        $machineLabel = trim((string)($machine['brand'] ?? '') . ' ' . (string)($machine['model'] ?? ''))
            ?: ((string)($machine['machine_type'] ?? '') ?: 'Machine');
        $statusLabels = [
            'NORMAL' => 'Normal',
            'SERVICE_IN_PROGRESS' => 'Service in progress',
            'CHECKUP_IN_PROGRESS' => 'Check-up in progress',
            'MAINTENANCE_IN_PROGRESS' => 'Maintenance in progress',
            'GROUNDED' => 'Grounded',
        ];
        $message = $actorName . ' updated machine Activity Status to ' . ($statusLabels[$status] ?? $status) . '.';
        log_customer_activity($customer, $message . ' Machine: ' . $machineLabel);
        belm_log_customer_communication(
            (string)$customer['id'], $machineId, 'CUSTOMER_TO_BELM', 'PORTAL',
            'Machine Activity Status - ' . $machineLabel, $message,
            'MACHINE_ACTIVITY_STATUS', $machineId, $actorName, 'SENT'
        );

        json_out([
            'ok' => true,
            'operationalStatus' => $status,
            'sync' => ['customer' => true, 'belm' => true],
        ]);
    }

    if ($sub3 === 'daily-checklist' && $method === 'GET') {
        require_customer_feature_access($customer, 'check-up', 'Check Up');
        $machineStmt = db()->prepare(
            'SELECT id, machine_type, model, serial_number, reg_number, brand
             FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
        );
        $machineStmt->execute([$machineId, $customer['id']]);
        $machine = $machineStmt->fetch();
        if (!$machine) json_error('Machine not found for this customer.', 404);

        $templateStmt = db()->prepare(
            'SELECT id, name, machine_type, service_type
             FROM checklist_templates
             WHERE deleted_at IS NULL AND is_active = 1
               AND (LOWER(TRIM(machine_type)) = LOWER(TRIM(?)) OR LOWER(TRIM(machine_type)) = LOWER(TRIM(?)))
             ORDER BY CASE WHEN LOWER(TRIM(machine_type)) = LOWER(TRIM(?)) THEN 0 ELSE 1 END, name ASC'
        );
        $templateStmt->execute([$machine['machine_type'], $machine['model'], $machine['machine_type']]);
        $templates = $templateStmt->fetchAll();

        $latestDisplayStmt = db()->prepare(
            'SELECT id, hour_meter_reading, display_photo_url, created_at FROM checklist_reports WHERE machine_id = ? ORDER BY created_at DESC LIMIT 1'
        );
        $latestDisplayStmt->execute([$machineId]);
        $latestDisplay = $latestDisplayStmt->fetch() ?: null;
        $fuelLevel = null;
        if ($latestDisplay) {
            $fuelAnswerStmt = db()->prepare(
                "SELECT value FROM checklist_answers WHERE report_id = ? AND LOWER(label) LIKE '%fuel%' AND LOWER(label) LIKE '%level%' ORDER BY id LIMIT 1"
            );
            $fuelAnswerStmt->execute([$latestDisplay['id']]);
            $fuelLevelValue = $fuelAnswerStmt->fetchColumn();
            if ($fuelLevelValue !== false && trim((string)$fuelLevelValue) !== '') $fuelLevel = trim((string)$fuelLevelValue);
        }
        $serviceStatusForDisplay = compute_service_status_helper($machineId);
        $displayTelemetry = [
            'displayPhotoUrl' => $latestDisplay['display_photo_url'] ?? null,
            'hourMeterReading' => $latestDisplay ? (float)$latestDisplay['hour_meter_reading'] : (float)($serviceStatusForDisplay['totalHours'] ?? 0),
            'fuelLevel' => $fuelLevel,
            'capturedAt' => $latestDisplay['created_at'] ?? null,
        ];

        $tz = new DateTimeZone('Africa/Dar_es_Salaam');
        $today = (new DateTimeImmutable('now', $tz))->format('Y-m-d');
        foreach ($templates as &$template) {
            $itemStmt = db()->prepare(
                'SELECT id, label, input_type, is_required, safety_level, "order"
                 FROM checklist_template_items WHERE template_id = ? ORDER BY "order" ASC'
            );
            $itemStmt->execute([$template['id']]);
            $template['items'] = array_map(static function (array $item): array {
                return [
                    'id' => $item['id'],
                    'label' => $item['label'],
                    'inputType' => $item['input_type'],
                    'isRequired' => (bool)$item['is_required'],
                    'safetyLevel' => $item['safety_level'] ?: 'GREEN',
                    'order' => (int)$item['order'],
                ];
            }, $itemStmt->fetchAll());

            $reportStmt = db()->prepare(
                'SELECT id, filled_by, created_at, overall_status, hour_meter_reading
                 FROM checklist_reports WHERE machine_id = ? AND template_id = ? ORDER BY created_at DESC'
            );
            $reportStmt->execute([$machineId, $template['id']]);
            $todayReport = null;
            foreach ($reportStmt->fetchAll() as $candidate) {
                try {
                    $created = new DateTimeImmutable((string)$candidate['created_at'], $tz);
                    $created = $created->setTimezone($tz);
                    if ($created->format('Y-m-d') !== $today) continue;
                } catch (Throwable $e) {
                    continue;
                }
                $todayReport = [
                    'id' => $candidate['id'],
                    'filledBy' => $candidate['filled_by'],
                    'createdAt' => $candidate['created_at'],
                    'overallStatus' => $candidate['overall_status'],
                    'hourMeterReading' => (float)$candidate['hour_meter_reading'],
                ];
                break;
            }
            $template['machineType'] = $template['machine_type'];
            $template['serviceType'] = $template['service_type'] ?: 'General Inspection';
            $template['todayReport'] = $todayReport;
            unset($template['machine_type'], $template['service_type']);
        }
        unset($template);
        $primaryTemplate = $templates[0] ?? null;
        $primaryMatchedBy = null;
        if ($primaryTemplate) {
            $primaryMachineType = trim((string)($primaryTemplate['machineType'] ?? ''));
            if ($primaryMachineType !== '' && strcasecmp($primaryMachineType, trim((string)$machine['machine_type'])) === 0) {
                $primaryMatchedBy = 'machine_type';
            } elseif ($primaryMachineType !== '' && strcasecmp($primaryMachineType, trim((string)$machine['model'])) === 0) {
                $primaryMatchedBy = 'model';
            }
        }
        json_out([
            'date' => $today,
            'machine' => [
                'id' => $machine['id'],
                'machineType' => $machine['machine_type'],
                'model' => $machine['model'],
                'serialNumber' => $machine['serial_number'],
                'regNumber' => $machine['reg_number'],
                'brand' => $machine['brand'],
            ],
            'telemetry' => $displayTelemetry,
            'sync' => [
                'status' => $primaryTemplate ? 'SYNCED' : 'MISSING',
                'machineType' => $machine['machine_type'],
                'matchedBy' => $primaryMatchedBy,
                'matchedTemplateCount' => count($templates),
                'primaryTemplateId' => $primaryTemplate['id'] ?? null,
                'primaryTemplateName' => $primaryTemplate['name'] ?? null,
            ],
            'templates' => $templates,
        ]);
    }

    if ($sub3 === 'daily-checklist-pdf' && $method === 'GET') {
        require_customer_feature_access($customer, 'check-up', 'Check Up');
        $templateId = trim((string)($_GET['templateId'] ?? ''));
        if ($templateId === '') json_error('Checklist Template is required.');
        $machineStmt = db()->prepare(
            'SELECT id, machine_type, model, serial_number, reg_number, brand
             FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
        );
        $machineStmt->execute([$machineId, $customer['id']]);
        $machine = $machineStmt->fetch();
        if (!$machine) json_error('Machine not found for this customer.', 404);
        $templateStmt = db()->prepare(
            'SELECT id, name, machine_type FROM checklist_templates
             WHERE id = ? AND deleted_at IS NULL AND is_active = 1
               AND (LOWER(TRIM(machine_type)) = LOWER(TRIM(?)) OR LOWER(TRIM(machine_type)) = LOWER(TRIM(?)))'
        );
        $templateStmt->execute([$templateId, $machine['machine_type'], $machine['model']]);
        $template = $templateStmt->fetch();
        if (!$template) json_error('Checklist Template is not assigned to this machine.', 404);
        $itemStmt = db()->prepare(
            'SELECT label, input_type, is_required FROM checklist_template_items
             WHERE template_id = ? ORDER BY "order" ASC'
        );
        $itemStmt->execute([$templateId]);
        $items = $itemStmt->fetchAll();
        $todayDate = new DateTimeImmutable('now', new DateTimeZone('Africa/Dar_es_Salaam'));
        $today = $todayDate->format('d/m/Y');
        $lines = [
            strtoupper($customer['name'] ?? 'BELM CUSTOMER') . ' - DAILY MACHINE CHECKLIST',
            'Service system: BELM General Tech Service Limited',
            'Date: ' . $today,
            'Template: ' . ($template['name'] ?: 'Checklist'),
            'Machine: ' . trim(($machine['brand'] ?? '') . ' ' . ($machine['model'] ?? '')),
            'Machine type: ' . ($machine['machine_type'] ?? 'Not recorded'),
            'Serial / Registration: ' . ($machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded')),
            'Technician / Inspector: __________________________________________',
            'Hour meter: ____________________________________________________',
            str_repeat('-', 78),
        ];
        foreach ($items as $index => $item) {
            $required = (bool)$item['is_required'] ? ' [REQUIRED]' : '';
            $lines[] = ($index + 1) . '. ' . $item['label'] . $required . ' (' . $item['input_type'] . ')';
            $lines[] = '   Result: _______________________________________________________';
        }
        $lines[] = str_repeat('-', 78);
        $lines[] = 'Inspector signature: _____________________________________________';
        $lines[] = 'Customer / supervisor acknowledgement: __________________________';
        $safeMachine = preg_replace('/[^A-Za-z0-9_-]+/', '-', trim(($machine['brand'] ?? '') . '-' . ($machine['model'] ?? '')));
        output_checklist_report_pdf('daily-checklist-' . $safeMachine . '-' . $todayDate->format('Y-m-d') . '.pdf', $lines, []);
    }

    if ($sub3 === 'reports') {
        require_customer_feature_access($customer, 'check-up', 'Check Up');
        $stmt = db()->prepare('SELECT * FROM checklist_reports WHERE machine_id = ? ORDER BY created_at DESC');
        $stmt->execute([$machineId]);
        $reports = array_map('customer_checklist_report_view', $stmt->fetchAll());
        json_out($reports);
    }

    // V273 - "Job Card Reports" and "Daily Report" tabs on the Check Up
    // dialog: these never delete or hide anything (Job Cards and
    // Checklist Reports already stay in the database permanently, the
    // same as every other record - see V266's "Forget permanently" audit
    // for the one place records are ever truly removed, and that only
    // runs when a whole customer account is deleted on purpose). What
    // was missing was a per-machine, date-filterable view with a single
    // combined PDF download - this adds exactly that, for both.
    if ($sub3 === 'job-cards') {
        require_customer_feature_access($customer, 'workflow', 'Maintenance Process');
        [$fromDate, $toDate] = customer_portal_date_range($_GET['from'] ?? '', $_GET['to'] ?? '');
        $sql = "SELECT id, job_card_no, title, status, technician_name, started_at, completed_at, created_at
                FROM digital_job_cards WHERE machine_id = ?";
        $params = [$machineId];
        if ($fromDate !== null) { $sql .= ' AND created_at >= ?'; $params[] = $fromDate; }
        if ($toDate !== null) { $sql .= ' AND created_at < ?'; $params[] = $toDate; }
        $sql .= ' ORDER BY created_at DESC';
        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        json_out($stmt->fetchAll());
    }

    if ($sub3 === 'job-cards-pdf') {
        require_customer_feature_access($customer, 'workflow', 'Maintenance Process');
        [$fromDate, $toDate] = customer_portal_date_range($_GET['from'] ?? '', $_GET['to'] ?? '');
        $sql = "SELECT job_card_no, title, status, technician_name, started_at, completed_at, created_at
                FROM digital_job_cards WHERE machine_id = ?";
        $params = [$machineId];
        if ($fromDate !== null) { $sql .= ' AND created_at >= ?'; $params[] = $fromDate; }
        if ($toDate !== null) { $sql .= ' AND created_at < ?'; $params[] = $toDate; }
        $sql .= ' ORDER BY created_at DESC';
        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        $jobCards = $stmt->fetchAll();
        $rows = array_map(fn($jc) => [
            $jc['job_card_no'], $jc['title'], $jc['status'],
            $jc['technician_name'] ?: 'Unassigned', display_date_billing($jc['created_at']),
        ], $jobCards);
        output_table_pdf(
            'BELM-job-card-history.pdf',
            'JOB CARD REPORTS',
            [
                'Machine ID: ' . $machineId,
                'Period: ' . ($fromDate ?? 'All time') . ' to ' . ($toDate ?? 'now'),
                'Job Card No  |  Title  |  Status  |  Technician  |  Date',
            ],
            $rows
        );
    }

    if ($sub3 === 'reports-pdf') {
        require_customer_feature_access($customer, 'check-up', 'Check Up');
        [$fromDate, $toDate] = customer_portal_date_range($_GET['from'] ?? '', $_GET['to'] ?? '');
        $sql = "SELECT filled_by, overall_status, hour_meter_reading, created_at
                FROM checklist_reports WHERE machine_id = ?";
        $params = [$machineId];
        if ($fromDate !== null) { $sql .= ' AND created_at >= ?'; $params[] = $fromDate; }
        if ($toDate !== null) { $sql .= ' AND created_at < ?'; $params[] = $toDate; }
        $sql .= ' ORDER BY created_at DESC';
        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        $reports = $stmt->fetchAll();
        $rows = array_map(fn($r) => [
            display_date_billing($r['created_at']), $r['filled_by'] ?: 'Not recorded',
            $r['overall_status'], 'Hrs: ' . $r['hour_meter_reading'],
        ], $reports);
        output_table_pdf(
            'BELM-daily-report-history.pdf',
            'DAILY REPORT HISTORY',
            [
                'Machine ID: ' . $machineId,
                'Period: ' . ($fromDate ?? 'All time') . ' to ' . ($toDate ?? 'now'),
                'Date  |  Filled by  |  Status  |  Hour meter',
            ],
            $rows
        );
    }

    if ($sub3 === 'service-status') {
        require_once __DIR__ . '/checklist_reports_helpers.php';
        json_out(compute_service_status_helper($machineId));
    }

    if ($sub3 === 'operation-analysis') {
        $stmt = db()->prepare('SELECT * FROM checklist_reports WHERE machine_id = ? ORDER BY created_at ASC');
        $stmt->execute([$machineId]);
        $reports = $stmt->fetchAll();

        $groundedCount = 0; $totalDowntimeMs = 0; $currentlyGrounded = false; $currentGroundedSinceMs = null;
        foreach ($reports as $i => $r) {
            if ($r['overall_status'] === 'RED') {
                $groundedCount++;
                $next = $reports[$i + 1] ?? null;
                $startMs = strtotime($r['created_at']) * 1000;
                $endMs = $next ? strtotime($next['created_at']) * 1000 : time() * 1000;
                $totalDowntimeMs += max(0, $endMs - $startMs);
                if (!$next) { $currentlyGrounded = true; $currentGroundedSinceMs = $startMs; }
            }
        }
        $totalChecks = count($reports);
        $firstMs = $totalChecks ? strtotime($reports[0]['created_at']) * 1000 : null;
        $totalTrackedMs = $firstMs ? max(1, time() * 1000 - $firstMs) : 1;
        $uptimePct = max(0, min(100, round(100 * (1 - $totalDowntimeMs / $totalTrackedMs))));

        json_out([
            'totalChecks' => $totalChecks, 'groundedCount' => $groundedCount, 'totalDowntimeMs' => $totalDowntimeMs,
            'avgDowntimeMs' => $groundedCount > 0 ? $totalDowntimeMs / $groundedCount : 0,
            'currentlyGrounded' => $currentlyGrounded, 'currentGroundedSinceMs' => $currentGroundedSinceMs, 'uptimePct' => $uptimePct,
        ]);
    }
}

// Recent updates for one machine — service request status changes
// (Assigned/Completed/Cancelled by Engineer/BELM Admin/Technician) plus
// operator report resolutions, combined into a single small feed shown
// right on that machine's card so the customer sees what happened
// without having to open Service Requests or Operator Reports separately.
if ($sub === 'machine-recent-updates' && $sub2 && $method === 'GET') {
    $machineId = $sub2;
    $stmt = db()->prepare('SELECT 1 FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL');
    $stmt->execute([$machineId, $customer['id']]);
    if (!$stmt->fetch()) json_error('Machine not found for this customer.', 404);

    $srStmt = db()->prepare(
        "SELECT srh.id, srh.event_type, srh.to_value, srh.actor_name, srh.created_at
         FROM service_request_history srh
         JOIN service_requests sr ON sr.id = srh.request_id
         WHERE sr.machine_id = ? AND srh.event_type IN ('STATUS', 'ASSIGNMENT')
         ORDER BY srh.created_at DESC LIMIT 5"
    );
    $srStmt->execute([$machineId]);
    $updates = array_map(function ($row) {
        $text = $row['event_type'] === 'ASSIGNMENT'
            ? "Job Card assigned to {$row['actor_name']}"
            : "Job Card status changed to {$row['to_value']}" . ($row['actor_name'] ? " by {$row['actor_name']}" : '');
        return ['id' => 'srh-' . $row['id'], 'text' => $text, 'createdAt' => $row['created_at']];
    }, $srStmt->fetchAll());

    $opStmt = db()->prepare(
        "SELECT o.id, o.message, o.resolved_at, u.name AS resolved_by_name
         FROM operator_reports o
         LEFT JOIN users u ON u.id = o.resolved_by_id
         WHERE o.machine_id = ? AND o.status = 'RESOLVED' AND o.resolved_at IS NOT NULL
         ORDER BY o.resolved_at DESC LIMIT 5"
    );
    $opStmt->execute([$machineId]);
    foreach ($opStmt->fetchAll() as $row) {
        $updates[] = [
            'id' => 'op-' . $row['id'],
            'text' => 'Operator report resolved' . ($row['resolved_by_name'] ? " by {$row['resolved_by_name']}" : ''),
            'createdAt' => $row['resolved_at'],
        ];
    }

    $openOpStmt = db()->prepare(
        "SELECT id, operator_name, message, created_at
         FROM operator_reports WHERE machine_id = ? AND status = 'OPEN'
         ORDER BY created_at DESC LIMIT 5"
    );
    $openOpStmt->execute([$machineId]);
    foreach ($openOpStmt->fetchAll() as $row) {
        $updates[] = [
            'id' => 'op-open-' . $row['id'],
            'text' => 'New problem report by ' . ($row['operator_name'] ?: 'Operator') . ': ' . $row['message'],
            'createdAt' => $row['created_at'],
        ];
    }

    $checkStmt = db()->prepare(
        'SELECT id, filled_by, overall_status, created_at
         FROM checklist_reports WHERE machine_id = ? ORDER BY created_at DESC LIMIT 5'
    );
    $checkStmt->execute([$machineId]);
    foreach ($checkStmt->fetchAll() as $row) {
        $updates[] = [
            'id' => 'check-' . $row['id'],
            'text' => 'Check Up submitted by ' . ($row['filled_by'] ?: 'Technician') . ' - ' . strtoupper((string)$row['overall_status']),
            'createdAt' => $row['created_at'],
        ];
    }

    $commStmt = db()->prepare(
        'SELECT id, related_type, related_id, direction, channel, subject, message, status, created_by_name, created_at
         FROM customer_communications WHERE customer_id = ? AND machine_id = ?
         ORDER BY created_at DESC LIMIT 30'
    );
    $commStmt->execute([$customer['id'], $machineId]);
    $communicationRows = $commStmt->fetchAll();
    foreach ($communicationRows as $row) {
        $updates[] = [
            'id' => 'comm-' . $row['id'],
            'text' => $row['subject'] . ': ' . $row['message'],
            'createdAt' => $row['created_at'],
            'direction' => $row['direction'],
            'channel' => $row['channel'],
            'relatedType' => $row['related_type'],
            'relatedId' => $row['related_id'],
            'deliveryStatus' => $row['status'],
        ];
    }

    usort($updates, fn($a, $b) => strcmp($b['createdAt'], $a['createdAt']));
    json_out(array_slice($updates, 0, 30));
}

// ---- Customer assistants ---------------------------------------------------
// ---- Machine Operators (roster) — managed by owner or Machine Admin -------
if ($sub === 'machine-operators' && $sub2 && $method === 'GET') {
    $machineId = $sub2;
    $stmt = db()->prepare('SELECT 1 FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL');
    $stmt->execute([$machineId, $customer['id']]);
    if (!$stmt->fetch()) json_error('Machine not found for this customer.', 404);

    $stmt = db()->prepare('SELECT id, name, contact, created_at, (pin_hash IS NOT NULL) AS has_pin FROM machine_operators WHERE machine_id = ? ORDER BY name ASC');
    $stmt->execute([$machineId]);
    json_out(array_map(function ($row) {
        $row['hasPin'] = !empty($row['has_pin']);
        unset($row['has_pin']);
        return $row;
    }, $stmt->fetchAll()));
}

if ($sub === 'machine-operators' && $sub2 && $sub3 && $method === 'PUT') {
    require_customer_owner_or_admin($customer);
    $b = body();
    $pin = trim((string)($b['pin'] ?? ''));
    if (!preg_match('/^\d{4,6}$/', $pin)) json_error('Operator PIN must be 4–6 digits.');
    $stmt = db()->prepare(
        'UPDATE machine_operators SET pin_hash = ? WHERE id = ? AND customer_id = ? AND machine_id = ?'
    );
    $stmt->execute([password_hash($pin, PASSWORD_BCRYPT), $sub3, $customer['id'], $sub2]);
    if ($stmt->rowCount() === 0) json_error('Operator not found.', 404);
    json_out(['ok' => true, 'message' => 'Operator PIN updated successfully.']);
}

if ($sub === 'machine-operators' && $sub2 && $method === 'POST') {
    require_customer_owner_or_admin($customer);
    $machineId = $sub2;
    $stmt = db()->prepare('SELECT 1 FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL');
    $stmt->execute([$machineId, $customer['id']]);
    if (!$stmt->fetch()) json_error('Machine not found for this customer.', 404);

    $b = body();
    $name = trim((string)($b['name'] ?? ''));
    $contact = trim((string)($b['contact'] ?? ''));
    $pin = trim((string)($b['pin'] ?? ''));
    if ($name === '') json_error('Operator name is required.');
    if ($contact === '') json_error('Operator contact (phone) is required.');
    if ($pin !== '' && !preg_match('/^\d{4,6}$/', $pin)) {
        json_error('Operator PIN must be 4–6 digits.');
    }

    $newId = uuid();
    db()->prepare('INSERT INTO machine_operators (id, machine_id, customer_id, name, contact, pin_hash, created_at) VALUES (?,?,?,?,?,?,NOW())')
        ->execute([$newId, $machineId, $customer['id'], $name, $contact, $pin !== '' ? password_hash($pin, PASSWORD_BCRYPT) : null]);
    log_customer_activity($customer, "Added \"$name\" to the Machine Operator roster.");
    json_out(['id' => $newId, 'name' => $name, 'contact' => $contact, 'hasPin' => $pin !== ''], 201);
}

if ($sub === 'machine-operators' && $sub2 && $sub3 && $method === 'DELETE') {
    require_customer_owner_or_admin($customer);
    $opStmt = db()->prepare('SELECT name FROM machine_operators WHERE id = ? AND customer_id = ?');
    $opStmt->execute([$sub3, $customer['id']]);
    $opName = $opStmt->fetchColumn();
    db()->prepare('DELETE FROM machine_operators WHERE id = ? AND customer_id = ?')->execute([$sub3, $customer['id']]);
    if ($opName) log_customer_activity($customer, "Removed \"$opName\" from the Machine Operator roster.");
    json_out(null, 204);
}

// ---- Operator problem reports -----------------------------------------------
// In Customer Self-Service mode a problem report stays inside the customer's
// own maintenance team unless the sender explicitly asks BELM for Technical
// Support. In BELM-managed mode, problem reports always notify BELM.
if ($sub === 'operator-reports' && $sub2 && $method === 'GET') {
    require_customer_feature_access($customer, 'operator-reports', 'Operator Reported');
    $machineId = $sub2;
    $machineStmt = db()->prepare(
        'SELECT id, brand, model, machine_type, serial_number, reg_number
         FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
    );
    $machineStmt->execute([$machineId, $customer['id']]);
    $machine = $machineStmt->fetch();
    if (!$machine) json_error('Machine not found for this customer.', 404);

    [$fromDate, $toDate] = customer_portal_date_range((string)($_GET['from'] ?? ''), (string)($_GET['to'] ?? ''));
    $sql = 'SELECT id, operator_name, operator_contact, message, status, notify_belm, created_at, resolved_at
            FROM operator_reports WHERE machine_id = ?';
    $params = [$machineId];
    if ($fromDate !== null) { $sql .= ' AND created_at >= ?'; $params[] = $fromDate; }
    if ($toDate !== null) { $sql .= ' AND created_at < ?'; $params[] = $toDate; }
    $sql .= ' ORDER BY created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    if ($sub3 === 'pdf') {
        $machineLabel = trim((string)($machine['brand'] ?? '') . ' ' . (string)($machine['model'] ?? ''));
        if ($machineLabel === '') $machineLabel = (string)($machine['machine_type'] ?? 'Machine');
        $safeMachine = preg_replace('/[^A-Za-z0-9_-]+/', '-', $machineLabel);
        $pdfRows = array_map(static fn(array $r): array => [
            display_date_billing($r['created_at']),
            (string)($r['operator_name'] ?: 'Operator'),
            (string)($r['operator_contact'] ?: '-'),
            strtoupper((string)($r['status'] ?: 'OPEN')),
            (string)($r['message'] ?: '-'),
        ], $rows);
        output_table_pdf(
            'BELM-operator-reported-' . $safeMachine . '.pdf',
            'OPERATOR REPORTED',
            [
                'Customer: ' . (string)($customer['name'] ?? 'Customer'),
                'Machine: ' . $machineLabel,
                'Serial / Registration: ' . (string)($machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded')),
                'Period: ' . ($fromDate ?? 'All time') . ' to ' . ($toDate ?? 'now'),
                'Date  |  Operator  |  Contact  |  Status  |  Reported issue',
            ],
            $pdfRows
        );
    }

    foreach ($rows as &$row) {
        $row['notifyBelm'] = !empty($row['notify_belm']);
        unset($row['notify_belm']);
    }
    unset($row);
    json_out($rows);
}

if ($sub === 'operator-reports' && $sub2 && $method === 'POST') {
    require_customer_feature_access($customer, 'report-problem', 'Report Problem');
    require_customer_write_access($customer);
    $machineId = $sub2;
    $stmt = db()->prepare('SELECT 1 FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL');
    $stmt->execute([$machineId, $customer['id']]);
    if (!$stmt->fetch()) json_error('Machine not found for this customer.', 404);

    $b = body();
    $message = trim((string)($b['message'] ?? ''));
    $operatorId = trim((string)($b['operatorId'] ?? ''));
    if ($message === '') json_error('Write a short message describing the problem.');

    $operatorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Operator'));
    $operatorContact = null;
    if ($operatorId !== '') {
        $stmt = db()->prepare('SELECT name, contact FROM machine_operators WHERE id = ? AND machine_id = ?');
        $stmt->execute([$operatorId, $machineId]);
        $operatorRow = $stmt->fetch();
        if ($operatorRow) {
            $operatorName = $operatorRow['name'];
            $operatorContact = $operatorRow['contact'];
        }
    }

    $modeStmt = db()->prepare('SELECT is_machinery_admin FROM customers WHERE id = ?');
    $modeStmt->execute([$customer['id']]);
    $selfServiceMode = !empty($modeStmt->fetchColumn());
    $notifyBelm = !$selfServiceMode || !empty($b['sendToBelm']);

    $newId = uuid();
    db()->prepare(
        "INSERT INTO operator_reports
            (id, machine_id, customer_id, operator_id, operator_name, operator_contact, message, status, notify_belm, created_at)
         VALUES (?,?,?,?,?,?,?,'OPEN',?,NOW())"
    )->execute([
        $newId, $machineId, $customer['id'],
        $operatorId !== '' ? $operatorId : null,
        $operatorName, $operatorContact, $message, $notifyBelm ? 1 : 0,
    ]);

    belm_ensure_breakdown_case_from_operator_report($newId, $operatorName);

    $machineInfoStmt = db()->prepare('SELECT brand, model, machine_type, serial_number, reg_number FROM machines WHERE id = ?');
    $machineInfoStmt->execute([$machineId]);
    $machineInfo = $machineInfoStmt->fetch() ?: [];
    $machineLabel = trim(($machineInfo['brand'] ?? '') . ' ' . ($machineInfo['model'] ?? '')) ?: ($machineInfo['machine_type'] ?? 'Machine');
    $serial = $machineInfo['serial_number'] ?: ($machineInfo['reg_number'] ?: 'Not recorded');

    // Internal customer-team alert is always sent to the owner and users who
    // have Operator Reports / Report Problem dashboard access. BELM is added
    // separately only when Service Provider mode or explicit support is used.
    try {
        customer_send_team_alert(
            (string)$customer['id'],
            ['operator-reports', 'report-problem'],
            'MACHINE PROBLEM REPORT - ' . $machineLabel,
            "MACHINE PROBLEM REPORTED

"
                . "Customer: " . ($customer['name'] ?? 'Customer') . "
"
                . "Reported by: $operatorName
"
                . "Machine: $machineLabel
"
                . "Serial / Reg: $serial
"
                . "Problem: $message

"
                . "Open the Customer Portal > Operator Reports to review and act.",
            true
        );
    } catch (Throwable $ignored) {}

    if (!$notifyBelm) {
        log_customer_activity($customer, "Internal machine problem reported by $operatorName: $message");
        json_out([
            'id' => $newId,
            'message' => 'Problem saved for your internal maintenance team. BELM was not notified.',
            'belmAlertSent' => false,
            'internalOnly' => true,
        ], 201);
    }

    belm_log_customer_communication(
        (string)$customer['id'], $machineId, 'CUSTOMER_TO_BELM', 'EMAIL',
        'BELM Technical Support — Problem Report', $message, 'OPERATOR_REPORT', $newId, $operatorName, 'SENT'
    );
    $alertResult = belm_send_customer_to_belm_alert(
        ['job-cards','service-requests'],
        'OFFICIAL SUPPORT REQUEST — ' . ($customer['name'] ?? 'Customer') . ' — ' . $machineLabel,
        "CUSTOMER TECHNICAL SUPPORT REQUEST

"
        . "Customer: " . ($customer['name'] ?? 'Unknown') . "
"
        . "Reported by: $operatorName
"
        . "Machine: $machineLabel
"
        . "Serial / Reg: $serial
"
        . "Problem: $message
"
        . "Report ID: $newId

Open BELM Portal > TECHNICAL DEP > Job Card / Customer Communication and take action.",
        $customer['actorEmail'] ?? null
    );
    $businessEmailSent = !empty($alertResult['businessEmailSent']);
    json_out([
        'id' => $newId,
        'message' => $businessEmailSent
            ? 'Problem sent to BELM Technical Support and the official BELM business email.'
            : 'Problem saved for BELM support, but official business-email delivery needs attention.',
        'belmAlertSent' => $businessEmailSent,
        'internalOnly' => false,
    ], 201);
}

// ---- Team analysis: how many active users in each department/role --------
if ($sub === 'users' && $sub2 === 'analysis' && $method === 'GET') {
    require_customer_owner_or_admin($customer);
    $stmt = db()->prepare(
        "SELECT role, COUNT(*) FILTER (WHERE is_active = 1) AS active_count, COUNT(*) AS total_count
         FROM customer_users WHERE customer_id = ? GROUP BY role"
    );
    $stmt->execute([$customer['id']]);
    $rows = $stmt->fetchAll();
    $trackedRoles = ['workshop_manager', 'store_keeper', 'accounts', 'procurement', 'operator', 'admin', 'assistant'];
    $byRole = array_fill_keys($trackedRoles, 0);
    $totalByRole = array_fill_keys($trackedRoles, 0);
    foreach ($rows as $row) {
        if (isset($byRole[$row['role']])) {
            $byRole[$row['role']] = (int)$row['active_count'];
            $totalByRole[$row['role']] = (int)$row['total_count'];
        }
    }
    $techStmt = db()->prepare(
        "SELECT COUNT(*) FILTER (WHERE u.is_active = 1) AS active_count, COUNT(*) AS total_count
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE r.name = 'Technician' AND u.assigned_customer_id = ?
           AND u.is_customer_managed = 1 AND u.deleted_at IS NULL"
    );
    $techStmt->execute([$customer['id']]);
    $techCounts = $techStmt->fetch() ?: ['active_count' => 0, 'total_count' => 0];
    $technicianActive = (int)$techCounts['active_count'];
    $technicianTotal = (int)$techCounts['total_count'];

    $machineStmt = db()->prepare(
        'SELECT COUNT(*) FROM machine_operators mo
         JOIN machines m ON m.id = mo.machine_id
         WHERE mo.customer_id = ? AND m.deleted_at IS NULL'
    );
    $machineStmt->execute([$customer['id']]);
    $machineOperatorCount = (int)$machineStmt->fetchColumn();

    json_out([
        'departments' => [
            ['key' => 'workshop_manager', 'label' => 'Workshop Manager', 'active' => $byRole['workshop_manager'], 'total' => $totalByRole['workshop_manager']],
            ['key' => 'store_keeper', 'label' => 'Store Keeper', 'active' => $byRole['store_keeper'], 'total' => $totalByRole['store_keeper']],
            ['key' => 'accounts', 'label' => 'Muhasibu / Accountant', 'active' => $byRole['accounts'], 'total' => $totalByRole['accounts']],
            ['key' => 'procurement', 'label' => 'Procurement', 'active' => $byRole['procurement'], 'total' => $totalByRole['procurement']],
            ['key' => 'operator', 'label' => 'Operator (portal login)', 'active' => $byRole['operator'], 'total' => $totalByRole['operator']],
            ['key' => 'technician', 'label' => 'Fundi / Technician', 'active' => $technicianActive, 'total' => $technicianTotal],
            ['key' => 'admin', 'label' => 'Legacy Company Admin', 'active' => $byRole['admin'], 'total' => $totalByRole['admin']],
            ['key' => 'assistant', 'label' => 'Legacy Assistant', 'active' => $byRole['assistant'], 'total' => $totalByRole['assistant']],
        ],
        'machineOperatorRosterCount' => $machineOperatorCount,
        'totalUsers' => array_sum($totalByRole) + $technicianTotal,
    ]);
}

// ---- Recent team activity ---------------------------------------------------
if ($sub === 'activity-logs' && $method === 'GET') {
    require_customer_owner_or_admin($customer);
    $stmt = db()->prepare(
        'SELECT id, actor_name, action, created_at FROM customer_activity_logs
         WHERE customer_id = ? ORDER BY created_at DESC LIMIT 30'
    );
    $stmt->execute([$customer['id']]);
    $logs = $stmt->fetchAll();
    foreach ($logs as &$log) {
        $log['actorName'] = $log['actor_name'];
        $log['createdAt'] = $log['created_at'];
        unset($log['actor_name'], $log['created_at']);
    }
    unset($log);
    json_out($logs);
}

if ($sub === 'users' && !$sub2 && $method === 'GET') {
    require_customer_owner_or_admin($customer);
    $stmt = db()->prepare(
        'SELECT id, name, email, phone, role, is_active, permissions, created_at
         FROM customer_users WHERE customer_id = ? ORDER BY created_at DESC'
    );
    $stmt->execute([$customer['id']]);
    $assistants = $stmt->fetchAll();
    foreach ($assistants as &$assistant) {
        $assistant['isActive'] = (bool)$assistant['is_active'];
        $assistant['permissions'] = $assistant['permissions'] ? json_decode($assistant['permissions'], true) : null;
        unset($assistant['is_active']);
    }
    json_out($assistants);
}

// A small, separate endpoint (rather than reshaping the array above) so
// GET /technicians — list this customer's own field Technicians (only
// meaningful once BELM has turned on Customer Self-Service mode).
if ($sub === 'technicians' && $method === 'GET') {
    require_customer_owner_or_admin($customer);
    $stmt = db()->prepare(
        "SELECT u.id, u.name, u.email, u.phone, u.is_active, u.customer_permissions, u.created_at
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE r.name = 'Technician' AND u.assigned_customer_id = ?
           AND u.is_customer_managed = 1 AND u.deleted_at IS NULL
         ORDER BY u.created_at DESC"
    );
    $stmt->execute([$customer['id']]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        $row['isActive'] = (bool)$row['is_active'];
        if ((string)($row['customer_permissions'] ?? '') === '__ALL__') {
            $row['permissions'] = null;
        } else {
            $decoded = json_decode((string)($row['customer_permissions'] ?? '[]'), true);
            $row['permissions'] = is_array($decoded) ? $decoded : [];
        }
        unset($row['is_active'], $row['customer_permissions']);
    }
    unset($row);
    json_out($rows);
}

// POST /technicians — a Customer Self-Service account adds
// their OWN field Technician. This creates a normal staff `users` row
// (role=Technician, assigned_customer_id=this customer) — the exact
// same account type BELM's own admin creates, just self-served. Blocked
// entirely unless BELM has switched Customer Self-Service ON for this customer.
if ($sub === 'technicians' && $method === 'POST') {
    require_customer_owner_or_admin($customer);
    $customerRow = db()->prepare('SELECT is_machinery_admin FROM customers WHERE id = ?');
    $customerRow->execute([$customer['id']]);
    if (empty($customerRow->fetchColumn())) {
        json_error('Customer Self-Service is not enabled for your account. Contact BELM Admin to turn it on.', 403);
    }

    $b = body();
    $name = trim((string)($b['name'] ?? ''));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $phone = trim((string)($b['phone'] ?? ''));
    $password = (string)($b['password'] ?? '');
    $permissionsJson = technician_permissions_from_body($b);

    $limitStmt = db()->prepare('SELECT user_limit FROM customers WHERE id = ?');
    $limitStmt->execute([$customer['id']]);
    $userLimit = $limitStmt->fetchColumn();
    $userLimit = $userLimit !== false && $userLimit !== null ? (int)$userLimit : DEFAULT_CUSTOMER_USER_LIMIT;
    if (customer_portal_user_count((string)$customer['id']) >= $userLimit) {
        json_error("You've reached your limit of $userLimit portal user(s). Contact BELM Admin to request additional users.", 403);
    }

    if ($name === '') json_error('Technician name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid email for this Technician.');
    if (strlen($password) < 8) json_error('Initial Technician password must contain at least 8 characters.');

    $emailCheck = db()->prepare(
        'SELECT 1 FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM customers WHERE LOWER(email) = ? AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM customer_users WHERE LOWER(email) = ?
         LIMIT 1'
    );
    $emailCheck->execute([$email, $email, $email]);
    if ($emailCheck->fetch()) json_error('This email is already used by another portal account.', 409);

    $roleStmt = db()->prepare("SELECT id FROM roles WHERE name = 'Technician' LIMIT 1");
    $roleStmt->execute();
    $roleId = $roleStmt->fetchColumn();
    if (!$roleId) json_error('The Technician role is not set up yet — contact BELM Admin.', 500);

    $newId = uuid();
    db()->prepare(
        'INSERT INTO users
         (id, name, email, password_hash, recovery_code_hash, phone, role_id, assigned_customer_id, is_customer_managed, customer_permissions, created_at)
         VALUES (?,?,?,?,NULL,?,?,?,1,?,NOW())'
    )->execute([
        $newId, $name, $email,
        password_hash($password, PASSWORD_BCRYPT),
        $phone !== '' ? $phone : null,
        $roleId,
        $customer['id'],
        $permissionsJson,
    ]);
    log_customer_activity($customer, "Added \"$name\" as their own field Technician.");
    $slugStmt = db()->prepare('SELECT portal_link FROM customers WHERE id = ?');
    $slugStmt->execute([$customer['id']]);
    $customerSlug = (string)$slugStmt->fetchColumn();
    json_out([
        'id' => $newId,
        'loginUrl' => customer_portal_url($customerSlug),
    ], 201);
}

// PUT /technicians/{id} — Administration may update a customer's own
// Technician profile, status and dashboard access. Password changes remain
// self-service through Forgot Password + OTP.
if ($sub === 'technicians' && $sub2 && $method === 'PUT') {
    require_customer_owner_or_admin($customer);
    $stmt = db()->prepare(
        "SELECT u.* FROM users u JOIN roles r ON r.id=u.role_id
         WHERE u.id=? AND u.assigned_customer_id=? AND u.is_customer_managed=1
           AND r.name='Technician' AND u.deleted_at IS NULL"
    );
    $stmt->execute([$sub2, $customer['id']]);
    $existing = $stmt->fetch();
    if (!$existing) json_error('Technician not found.', 404);

    $b = body();
    $name = trim((string)($b['name'] ?? $existing['name']));
    $email = strtolower(trim((string)($b['email'] ?? $existing['email'])));
    $phone = trim((string)($b['phone'] ?? ($existing['phone'] ?? '')));
    $isActive = array_key_exists('isActive', $b) ? ((bool)$b['isActive'] ? 1 : 0) : (int)$existing['is_active'];
    $permissionsJson = array_key_exists('permissions', $b)
        ? technician_permissions_from_body($b)
        : $existing['customer_permissions'];

    if ($name === '') json_error('Technician name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid Technician email address.');
    $emailCheck = db()->prepare(
        'SELECT 1 FROM customers WHERE LOWER(email)=?
         UNION ALL SELECT 1 FROM customer_users WHERE LOWER(email)=?
         UNION ALL SELECT 1 FROM users WHERE LOWER(email)=? AND id<>? AND deleted_at IS NULL
         LIMIT 1'
    );
    $emailCheck->execute([$email, $email, $email, $sub2]);
    if ($emailCheck->fetch()) json_error('This email address is already used by another portal account.', 409);

    db()->prepare(
        'UPDATE users SET name=?, email=?, phone=?, is_active=?, customer_permissions=?
         WHERE id=? AND assigned_customer_id=? AND is_customer_managed=1'
    )->execute([
        $name, $email, $phone !== '' ? $phone : null, $isActive,
        $permissionsJson, $sub2, $customer['id'],
    ]);
    log_customer_activity($customer, "Updated Technician access for \"$name\".");
    json_out(['ok' => true]);
}

// the frontend can show "2 of 3 users used" before the customer even
// tries to add one, without changing the existing assistants-list shape.
if ($sub === 'users' && $sub2 === 'limit' && $method === 'GET') {
    require_customer_owner_or_admin($customer);
    $limitStmt = db()->prepare('SELECT user_limit FROM customers WHERE id = ?');
    $limitStmt->execute([$customer['id']]);
    $userLimit = $limitStmt->fetchColumn();
    $userLimit = $userLimit !== false && $userLimit !== null ? (int)$userLimit : DEFAULT_CUSTOMER_USER_LIMIT;
    json_out(['limit' => $userLimit, 'used' => customer_portal_user_count((string)$customer['id'])]);
}

// Customer passwords are reset only through the public Forgot Password
// email-OTP flow. Keeping this route explicit prevents old clients/bookmarks
// from silently changing credentials by the legacy current-password method.
if ($sub === 'change-password' && $method === 'PUT') {
    json_error('Use Forgot Password on the login page. A 6-digit OTP will be sent to your account email.', 410);
}

if ($sub === 'users' && $method === 'POST') {
    require_customer_owner_or_admin($customer);
    $b = body();
    $name = trim((string)($b['name'] ?? ''));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $password = (string)($b['password'] ?? '');
    $phone = trim((string)($b['phone'] ?? ''));
    $role = strtolower(trim((string)($b['role'] ?? 'operator')));
    $permissionsJson = customer_permissions_from_body($b);

    // Enforce this customer's user limit — set by BELM Admin per
    // customer, or the system default if they haven't set one. Once
    // reached, they must contact BELM Admin (or request more) rather
    // than adding freely.
    $limitStmt = db()->prepare('SELECT user_limit FROM customers WHERE id = ?');
    $limitStmt->execute([$customer['id']]);
    $userLimit = $limitStmt->fetchColumn();
    $userLimit = $userLimit !== false && $userLimit !== null ? (int)$userLimit : DEFAULT_CUSTOMER_USER_LIMIT;
    $currentUserCount = customer_portal_user_count((string)$customer['id']);
    if ($currentUserCount >= $userLimit) {
        json_error(
            "You've reached your limit of $userLimit portal user(s). Contact BELM Admin to request additional users.",
            403
        );
    }

    if ($name === '') json_error('User name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid user email address.');
    if (strlen($password) < 8) json_error('Initial password must contain at least 8 characters.');
    if (!in_array($role, CUSTOMER_PORTAL_USER_ROLES, true)) json_error('Select a valid Role Manager role.');
    $permissionsJson = customer_role_permissions_json($role, $permissionsJson);

    $emailCheck = db()->prepare(
        'SELECT 1 FROM customers WHERE LOWER(email) = ?
         UNION ALL SELECT 1 FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM customer_users WHERE LOWER(email) = ?
         LIMIT 1'
    );
    $emailCheck->execute([$email, $email, $email]);
    if ($emailCheck->fetch()) json_error('This email address is already used by another portal account.', 409);

    $newId = uuid();
    db()->prepare(
        'INSERT INTO customer_users
         (id, customer_id, name, email, password, recovery_code_hash, phone, role, is_active, permissions, created_at)
         VALUES (?,?,?,?,?,NULL,?,?,?,?,NOW())'
    )->execute([
        $newId,
        $customer['id'],
        $name,
        $email,
        password_hash($password, PASSWORD_BCRYPT),
        $phone !== '' ? $phone : null,
        $role,
        1,
        $permissionsJson,
    ]);
    log_customer_activity($customer, "Added \"$name\" as $role.");
    json_out([
        'id' => $newId,
        'name' => $name,
        'email' => $email,
        'phone' => $phone !== '' ? $phone : null,
        'role' => $role,
        'isActive' => true,
    ], 201);
}

if ($sub === 'users' && $sub2 && $method === 'PUT') {
    require_customer_owner_or_admin($customer);
    $stmt = db()->prepare('SELECT * FROM customer_users WHERE id = ? AND customer_id = ?');
    $stmt->execute([$sub2, $customer['id']]);
    $existing = $stmt->fetch();
    if (!$existing) json_error('Assistant not found.', 404);

    $b = body();
    $name = trim((string)($b['name'] ?? $existing['name']));
    $email = strtolower(trim((string)($b['email'] ?? $existing['email'])));
    $phone = trim((string)($b['phone'] ?? ($existing['phone'] ?? '')));
    $role = strtolower(trim((string)($b['role'] ?? $existing['role'])));
    $isActive = array_key_exists('isActive', $b) ? ((bool)$b['isActive'] ? 1 : 0) : (int)$existing['is_active'];
    $permissionsJson = array_key_exists('permissions', $b)
        ? customer_permissions_from_body($b)
        : $existing['permissions'];

    if ($name === '') json_error('User name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid user email address.');
    if (!in_array($role, CUSTOMER_PORTAL_USER_ROLES, true)) json_error('Select a valid Role Manager role.');
    $permissionsJson = customer_role_permissions_json($role, $permissionsJson);
    $emailCheck = db()->prepare(
        'SELECT 1 FROM customers WHERE LOWER(email) = ?
         UNION ALL SELECT 1 FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM customer_users WHERE LOWER(email) = ? AND id <> ?
         LIMIT 1'
    );
    $emailCheck->execute([$email, $email, $email, $sub2]);
    if ($emailCheck->fetch()) json_error('This email address is already used by another portal account.', 409);

    // Customer Admin may edit profile, role, status and permissions, but not the
    // user's password after account creation. The user owns password recovery
    // through Forgot Password + email OTP.
    db()->prepare(
        'UPDATE customer_users
         SET name=?, email=?, phone=?, role=?, is_active=?, permissions=?
         WHERE id=? AND customer_id=?'
    )->execute([
        $name,
        $email,
        $phone !== '' ? $phone : null,
        $role,
        $isActive,
        $permissionsJson,
        $sub2,
        $customer['id'],
    ]);
    json_out(['ok' => true]);
}

if ($sub === 'users' && $sub2 && $method === 'DELETE') {
    require_customer_owner_or_admin($customer);
    $nameStmt = db()->prepare('SELECT name FROM customer_users WHERE id = ? AND customer_id = ?');
    $nameStmt->execute([$sub2, $customer['id']]);
    $removedName = $nameStmt->fetchColumn();
    $stmt = db()->prepare('DELETE FROM customer_users WHERE id = ? AND customer_id = ?');
    $stmt->execute([$sub2, $customer['id']]);
    if ($stmt->rowCount() === 0) json_error('Assistant not found.', 404);
    if ($removedName) log_customer_activity($customer, "Removed assistant \"$removedName\".");
    json_out(null, 204);
}

// ---- Direct BELM support message -------------------------------------------
// Available in both modes. In Self-Service mode this is the explicit doorway
// for involving BELM without turning the customer's whole workshop over to
// BELM. Every message is saved in the portal history AND emailed to the
// official Business Email from System Settings, with Reply-To set to the
// customer's login email when available.
if ($sub === 'belm-support' && $method === 'POST') {
    require_customer_feature_access($customer, 'service-request', 'Job Card');
    require_customer_write_access($customer);
    $b = body();
    $topic = strtoupper(trim((string)($b['topic'] ?? 'TECHNICAL_SUPPORT')));
    $subject = trim((string)($b['subject'] ?? ''));
    $message = trim((string)($b['message'] ?? ''));
    $machineId = trim((string)($b['machineId'] ?? ''));
    $allowedTopics = ['TECHNICAL_SUPPORT', 'PORTAL_SUPPORT', 'SERVICE_CONTRACT', 'OTHER'];
    if (!in_array($topic, $allowedTopics, true)) $topic = 'OTHER';
    if ($message === '') json_error('Write the message you want to send to BELM.');
    if (mb_strlen($message) > 3000) json_error('Message is too long. Keep it under 3000 characters.');
    if ($subject === '') {
        $subject = match ($topic) {
            'PORTAL_SUPPORT' => 'Portal / System Support',
            'SERVICE_CONTRACT' => 'Service / Contract Enquiry',
            'OTHER' => 'Customer Message',
            default => 'Technical Support',
        };
    }
    if (mb_strlen($subject) > 160) json_error('Subject is too long.');

    $machine = null;
    if ($machineId !== '') {
        $stmt = db()->prepare(
            'SELECT id, brand, model, machine_type, serial_number, reg_number
             FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
        );
        $stmt->execute([$machineId, $customer['id']]);
        $machine = $stmt->fetch();
        if (!$machine) json_error('Selected machine was not found.', 404);
    }

    $actorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer'));
    $communicationId = belm_log_customer_communication(
        (string)$customer['id'], $machineId !== '' ? $machineId : null,
        'CUSTOMER_TO_BELM', 'EMAIL', $subject, $message,
        'DIRECT_SUPPORT', null, $actorName, 'SENT'
    );

    $machineLabel = $machine
        ? (trim(($machine['brand'] ?? '') . ' ' . ($machine['model'] ?? '')) ?: ($machine['machine_type'] ?? 'Machine'))
        : 'General / account level';
    $serial = $machine ? ($machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded')) : 'N/A';
    $alertResult = belm_send_customer_to_belm_alert(
        ['job-cards','service-requests'],
        'OFFICIAL CUSTOMER MESSAGE — ' . ($customer['name'] ?? 'Customer') . ' — ' . $subject,
        "OFFICIAL CUSTOMER MESSAGE FROM BELM PORTAL\n\n"
        . "Customer: " . ($customer['name'] ?? 'Unknown') . "\n"
        . "Sent by: $actorName\n"
        . "Topic: " . str_replace('_', ' ', $topic) . "\n"
        . "Machine: $machineLabel\n"
        . "Serial / Reg: $serial\n\n"
        . "Subject: $subject\n\n$message\n\n"
        . "Communication ID: $communicationId\n\nReply to this email or open Customer Communication in BELM Portal.",
        $customer['actorEmail'] ?? null
    );

    json_out([
        'id' => $communicationId,
        'message' => !empty($alertResult['businessEmailSent'])
            ? 'Message sent to BELM official business email and support team.'
            : 'Message saved in the portal, but email delivery needs attention.',
        'emailSent' => !empty($alertResult['businessEmailSent']),
    ], 201);
}

// ---- Job Cards -------------------------------------------------------
if ($sub === 'service-requests' && $method === 'GET') {
    require_customer_feature_access($customer, 'service-request', 'Job Card');
    $showHidden = !empty($_GET['hidden']);
    $stmt = db()->prepare(
        'SELECT sr.*, m.model AS machine_model, m.machine_type,
                cu.name AS completed_by_name, xu.name AS cancelled_by_name,
                au.name AS assigned_to_name
         FROM service_requests sr
         LEFT JOIN machines m ON m.id = sr.machine_id
         LEFT JOIN users cu ON cu.id = sr.completed_by_id
         LEFT JOIN users xu ON xu.id = sr.cancelled_by_id
         LEFT JOIN users au ON au.id = sr.assigned_to_id
         WHERE sr.customer_id = ? AND sr.hidden_at IS ' . ($showHidden ? 'NOT NULL' : 'NULL') . '
         ORDER BY sr.created_at DESC'
    );
    $stmt->execute([$customer['id']]);
    $requests = $stmt->fetchAll();
    foreach ($requests as &$request) {
        $request['machine'] = $request['machine_id']
            ? [
                'id' => $request['machine_id'],
                'model' => $request['machine_model'],
                'machineType' => $request['machine_type'],
            ]
            : null;
        $request['serviceType'] = $request['service_type'];
        $request['templateId'] = $request['template_id'];
        $request['createdAt'] = $request['created_at'];
        $request['updatedAt'] = $request['updated_at'];
        $request['completedBy'] = $request['completed_by_id'] ? ['name' => $request['completed_by_name']] : null;
        $request['completedAt'] = $request['completed_at'];
        $request['cancelledBy'] = $request['cancelled_by_id'] ? ['name' => $request['cancelled_by_name']] : null;
        $request['cancelledAt'] = $request['cancelled_at'];
        $request['assignedTo'] = $request['assigned_to_id'] ? ['name' => $request['assigned_to_name']] : null;
        // BELM's template-part and inventory matching stays internal.
        // Customer history contains the service request itself, not BELM stock/catalog data.
        $request['hiddenAt'] = $request['hidden_at'];
        unset($request['machine_model'], $request['machine_type'], $request['completed_by_name'], $request['cancelled_by_name'], $request['assigned_to_name']);
    }
    unset($request);
    json_out($requests);
}

// Lets the customer tidy up their own dashboard the same way BELM Admin
// can — hide a COMPLETED/CANCELLED request from the default list without
// deleting anything (still fully intact, retrievable via ?hidden=1).
if ($sub === 'service-requests' && $sub2 && $sub3 === 'hide' && $method === 'PUT') {
    require_customer_feature_access($customer, 'service-request', 'Job Card');
    $stmt = db()->prepare(
        "SELECT status FROM service_requests WHERE id = ? AND customer_id = ?"
    );
    $stmt->execute([$sub2, $customer['id']]);
    $status = $stmt->fetchColumn();
    if ($status === false) json_error('Job Card not found.', 404);
    if (!in_array($status, ['COMPLETED', 'CANCELLED'], true)) {
        json_error('Only completed or cancelled requests can be hidden.', 422);
    }
    db()->prepare('UPDATE service_requests SET hidden_at = NOW() WHERE id = ?')->execute([$sub2]);
    json_out(['ok' => true]);
}

if ($sub === 'service-requests' && $sub2 && $sub3 === 'unhide' && $method === 'PUT') {
    require_customer_feature_access($customer, 'service-request', 'Job Card');
    $stmt = db()->prepare('UPDATE service_requests SET hidden_at = NULL WHERE id = ? AND customer_id = ?');
    $stmt->execute([$sub2, $customer['id']]);
    if ($stmt->rowCount() === 0) json_error('Job Card not found.', 404);
    json_out(['ok' => true]);
}

if ($sub === 'service-requests' && $method === 'POST') {
    require_customer_feature_access($customer, 'service-request', 'Job Card');
    require_customer_write_access($customer);
    $b = body();
    $description = trim((string)($b['description'] ?? ''));
    $priority = strtoupper(trim((string)($b['priority'] ?? 'NORMAL')));
    $templateId = trim((string)($b['templateId'] ?? ''));
    $serviceType = trim((string)($b['serviceType'] ?? ''));
    if ($description === '') json_error('Describe the service required.');
    if (!in_array($priority, ['LOW', 'NORMAL', 'HIGH', 'URGENT'], true)) {
        json_error('Invalid service priority.');
    }
    $machineId = trim((string)($b['machineId'] ?? ''));
    $machine = null;
    $customerActorType = strtolower(trim((string)($customer['actorType'] ?? '')));
    $customerActorRole = strtolower(trim((string)($customer['customerRole'] ?? '')));
    $canIssueBelmMachineJobCard = $customerActorType === 'owner' || $customerActorRole === 'admin';
    if ($machineId !== '' && !$canIssueBelmMachineJobCard) {
        json_error('Only Customer Admin can send a machine Job Card to BELM. Workshop Manager should assign the customer-owned team, or ask Customer Admin to send the Job Card to BELM.', 403);
    }
    if ($machineId) {
        $stmt = db()->prepare(
            'SELECT id, machine_type, model FROM machines
             WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
        );
        $stmt->execute([$machineId, $customer['id']]);
        $machine = $stmt->fetch();
        if (!$machine) json_error('Selected machine was not found.', 404);
    }

    $serviceParts = [];
    if ($templateId !== '') {
        if (!$machine) json_error('Select a machine before choosing a service type.');
        $stmt = db()->prepare(
            'SELECT id, service_type
             FROM checklist_templates
             WHERE id = ? AND deleted_at IS NULL AND is_active = 1
               AND (
                 LOWER(TRIM(machine_type)) = LOWER(TRIM(?))
                 OR LOWER(TRIM(machine_type)) = LOWER(TRIM(?))
               )'
        );
        $stmt->execute([$templateId, $machine['machine_type'], $machine['model']]);
        $template = $stmt->fetch();
        if (!$template) {
            json_error('The selected service type does not match this machine model.', 422);
        }
        $serviceType = $template['service_type'] ?: 'General Service';
        $serviceParts = customer_template_service_parts($templateId);
    } elseif (strlen($serviceType) > 150) {
        json_error('Service type is too long.');
    }

    $newId = uuid();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            "INSERT INTO service_requests
             (id, customer_id, machine_id, template_id, service_type,
              description, status, priority, created_at, updated_at)
             VALUES (?,?,?,?,?,?,'OPEN',?,NOW(),NOW())"
        )->execute([
            $newId,
            $customer['id'],
            $machineId !== '' ? $machineId : null,
            $templateId !== '' ? $templateId : null,
            $serviceType !== '' ? $serviceType : null,
            $description,
            $priority,
        ]);
        $pdo->prepare(
            'INSERT INTO service_request_history
             (id, request_id, event_type, from_value, to_value, actor_id, actor_name, created_at)
             VALUES (?,?,?,?,?,?,?,NOW())'
        )->execute([uuid(), $newId, 'OPENED', null, 'OPEN', null, trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer'))]);
        foreach ($serviceParts as $part) {
            $pdo->prepare(
                'INSERT INTO service_request_parts
                 (id, request_id, spare_name, part_number, quantity, matched_spare_part_id, created_at)
                 VALUES (?,?,?,?,?,?,NOW())'
            )->execute([
                uuid(),
                $newId,
                $part['spareName'],
                $part['partNumber'],
                $part['quantity'],
                match_spare_part_by_text($part['partNumber'] ?? '', $part['spareName'] ?? ''),
            ]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    $actorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer'));
    // V220: a machine-linked official BELM Support Request enters the same
    // Breakdown Process automatically. Requests without a machine stay only
    // in Service Requests because there is no machine workflow to attach.
    $jobReceipt = null;
    if ($machineId !== '') {
        belm_sync_breakdown_case_from_service_request($newId, $actorName);
        $jobReceiptStmt = db()->prepare(
            "SELECT j.id,j.job_card_no,j.status,COALESCE(j.issued_at,j.created_at) AS received_at
             FROM breakdown_cases bc
             JOIN digital_job_cards j ON j.case_id=bc.id
             WHERE bc.source_type='SERVICE_REQUEST' AND bc.source_id=?
             ORDER BY j.created_at ASC LIMIT 1"
        );
        $jobReceiptStmt->execute([$newId]);
        if ($jobReceiptRow = $jobReceiptStmt->fetch()) {
            $jobReceipt = [
                'id' => $jobReceiptRow['id'],
                'jobCardNo' => $jobReceiptRow['job_card_no'],
                'status' => $jobReceiptRow['status'],
                'receivedAt' => $jobReceiptRow['received_at'],
                'receivedByBelm' => true,
            ];
        }
    }
    belm_log_customer_communication(
        (string)$customer['id'], $machineId !== '' ? $machineId : null,
        'CUSTOMER_TO_BELM', 'EMAIL', 'Job Card',
        $description, 'SERVICE_REQUEST', $newId, $actorName, 'SENT'
    );
    $alertResult = ['sent' => 0];
    try {
        $machineLabel = $machine ? trim(($machine['model'] ?? '') . ' ' . ($machine['machine_type'] ?? '')) : 'No machine selected';
        $alertResult = belm_send_customer_to_belm_alert(
            ['job-cards','service-requests'],
            'OFFICIAL JOB CARD — ' . ($customer['name'] ?? 'Customer') . ' — ' . $machineLabel,
            "CUSTOMER REQUEST FOR BELM TECHNICAL SUPPORT

"
            . "Customer: " . ($customer['name'] ?? 'Unknown') . "
"
            . "Submitted by: $actorName
"
            . "Machine: $machineLabel
Priority: $priority
"
            . "Service type: " . ($serviceType ?: 'Not specified') . "

"
            . "Description:
$description

Open TECHNICAL DEP > Job Card in BELM Portal to review and assign it.",
            $customer['actorEmail'] ?? null
        );
    } catch (Throwable $error) { /* notification only */ }
    json_out([
        'id' => $newId,
        'serviceType' => $serviceType,
        'belmSupport' => true,
        'emailSent' => !empty($alertResult['businessEmailSent']),
        'jobCard' => $jobReceipt,
    ], 201);
}

if ($sub === 'service-requests' && $sub2 && $sub3 === 'cancel' && $method === 'PUT') {
    require_customer_feature_access($customer, 'service-request', 'Job Card');
    require_customer_write_access($customer);
    $stmt = db()->prepare('SELECT * FROM service_requests WHERE id = ? AND customer_id = ?');
    $stmt->execute([$sub2, $customer['id']]);
    $req = $stmt->fetch();
    if (!$req) json_error('Not found', 404);
    if (!in_array($req['status'], ['OPEN', 'ASSIGNED'], true)) json_error('Only Open or Assigned requests can be cancelled.');
    db()->prepare("UPDATE service_requests SET status='CANCELLED', cancelled_at=COALESCE(cancelled_at,NOW()), updated_at=NOW() WHERE id=?")->execute([$sub2]);
    $actorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer'));
    db()->prepare(
        'INSERT INTO service_request_history(id,request_id,event_type,from_value,to_value,actor_id,actor_name,note,created_at) VALUES(?,?,?,?,?,?,?,?,NOW())'
    )->execute([uuid(),$sub2,'STATUS',(string)$req['status'],'CANCELLED',null,$actorName,'Cancelled by customer']);
    belm_sync_breakdown_case_from_service_request($sub2, $actorName);
    $cancelMessage = 'Customer cancelled Job Card: ' . ($req['description'] ?? '');
    belm_log_customer_communication(
        (string)$customer['id'], $req['machine_id'] ?: null,
        'CUSTOMER_TO_BELM', 'EMAIL', 'Job Card Cancelled',
        $cancelMessage, 'SERVICE_REQUEST', $sub2, $actorName, 'SENT'
    );
    $cancelAlert = ['businessEmailSent' => false];
    try {
        $cancelAlert = belm_send_customer_to_belm_alert(
            ['job-cards','service-requests'],
            'JOB CARD CANCELLED — ' . ($customer['name'] ?? 'Customer'),
            $cancelMessage . "\nCustomer: " . ($customer['name'] ?? 'Unknown') . "\nCancelled by: $actorName\nRequest ID: $sub2",
            $customer['actorEmail'] ?? null
        );
    } catch (Throwable $ignored) {}
    json_out(['ok' => true, 'emailSent' => !empty($cancelAlert['businessEmailSent'])]);
}

// ---- BELM inventory is private to BELM staff -------------------------------
if ($sub === 'spare-parts' && $method === 'GET') {
    json_error('BELM spare-parts inventory is private. Customer spare requirements are handled by Procurement.', 403);
}

// ---- Legacy direct spare request route -------------------------------------
// Blocked above by the Procurement-first compatibility guard.

// ---- Direct messages sent by BELM to this customer -------------------------
if ($sub === 'communications' && $method === 'GET' && $sub2 === '') {
    $stmt = db()->prepare(
        "SELECT cc.id, cc.machine_id, cc.subject, cc.message, cc.status, cc.created_by_name, cc.created_at,
                m.brand AS machine_brand, m.model AS machine_model, m.machine_type
         FROM customer_communications cc
         LEFT JOIN machines m ON m.id = cc.machine_id
         WHERE cc.customer_id = ? AND cc.direction = 'BELM_TO_CUSTOMER'
           AND cc.related_type = 'DIRECT_MESSAGE'
         ORDER BY cc.created_at DESC
         LIMIT 30"
    );
    $stmt->execute([$customer['id']]);
    $rows = array_map(static function ($row) {
        $row['machineLabel'] = trim((string)($row['machine_brand'] ?? '') . ' ' . (string)($row['machine_model'] ?? ''))
            ?: ((string)($row['machine_type'] ?? '') ?: null);
        unset($row['machine_brand'], $row['machine_model'], $row['machine_type']);
        return $row;
    }, $stmt->fetchAll());
    json_out($rows);
}

// ---- BELM invoices synchronized to the Customer Procurement/Billing view ---
if ($sub === 'invoices' && $method === 'GET' && $sub2 === '') {
    $stmt=db()->prepare(
        "SELECT i.id,i.invoice_no,i.machine_id,i.source_job_card_id,i.total,i.status,i.due_date,i.created_at,
                COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id),0) AS paid_amount
         FROM invoices i WHERE i.customer_id=? AND i.deleted_at IS NULL ORDER BY i.created_at DESC"
    );
    $stmt->execute([$customer['id']]);$rows=$stmt->fetchAll();
    foreach($rows as &$row){$row['balance']=max(0,(float)$row['total']-(float)$row['paid_amount']);$row['downloadUrl']='/api/customer-portal/invoices/'.$row['id'].'/download';}
    unset($row);json_out($rows);
}

if ($sub === 'invoices' && $sub2 && $sub3 === 'download' && $method === 'GET') {
    belm_output_invoice_document_pdf((string)$sub2,(string)$customer['id']);
}

// ---- Proformas published by BELM to this customer --------------------------
if ($sub === 'proformas' && $method === 'GET' && $sub2 === '') {
    $stmt = db()->prepare(
        "SELECT p.* FROM proforma_invoices p
         WHERE p.customer_id = ? AND p.deleted_at IS NULL
           AND p.delivery_status IN ('SENT','RESPONDED')
         ORDER BY COALESCE(p.sent_at, p.created_at) DESC"
    );
    $stmt->execute([$customer['id']]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        $itemsStmt = db()->prepare('SELECT section, part_number, description, qty, unit, unit_price FROM proforma_invoice_items WHERE proforma_id = ? ORDER BY "order" ASC');
        $itemsStmt->execute([$row['id']]);
        $row['items'] = $itemsStmt->fetchAll();
        $row['totals'] = belm_proforma_totals($row, $row['items']);
        $row['downloadUrl'] = '/api/customer-portal/proformas/' . $row['id'] . '/download';
    }
    unset($row);
    json_out($rows);
}

if ($sub === 'proformas' && $sub2 && $sub3 === 'download' && $method === 'GET') {
    $check = db()->prepare(
        "SELECT 1 FROM proforma_invoices
         WHERE id = ? AND customer_id = ? AND deleted_at IS NULL
           AND delivery_status IN ('SENT','RESPONDED')"
    );
    $check->execute([$sub2, $customer['id']]);
    if (!$check->fetch()) json_error('This Proforma is not available to your account.', 404);
    belm_output_proforma_document_pdf($sub2, (string)$customer['id']);
}

if ($sub === 'proformas' && $sub2 && $sub3 === 'respond' && $method === 'PUT') {
    require_customer_write_access($customer);
    $b = body();
    $response = strtoupper(trim((string)($b['response'] ?? '')));
    $responseMessage = trim((string)($b['message'] ?? ''));
    if (!in_array($response, ['ACCEPTED', 'CHANGE_REQUESTED'], true)) json_error('Choose Accept or Request Change.');
    if ($response === 'CHANGE_REQUESTED' && $responseMessage === '') json_error('Write the change you want BELM to review.');
    if (mb_strlen($responseMessage) > 1000) json_error('Response message must be 1000 characters or fewer.');

    $stmt = db()->prepare(
        "SELECT p.id, p.invoice_no, p.machine_id FROM proforma_invoices p
         WHERE p.id = ? AND p.customer_id = ? AND p.deleted_at IS NULL
           AND p.delivery_status IN ('SENT','RESPONDED')"
    );
    $stmt->execute([$sub2, $customer['id']]);
    $proforma = $stmt->fetch();
    if (!$proforma) json_error('Proforma not found or not yet sent.', 404);

    db()->prepare(
        "UPDATE proforma_invoices SET delivery_status = 'RESPONDED', customer_response = ?,
         customer_response_message = ?, customer_responded_at = NOW() WHERE id = ?"
    )->execute([$response, $responseMessage !== '' ? $responseMessage : null, $sub2]);
    $actorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer'));
    $messageText = $response === 'ACCEPTED'
        ? 'Customer accepted Proforma ' . $proforma['invoice_no'] . '.'
        : 'Customer requested a change to Proforma ' . $proforma['invoice_no'] . ': ' . $responseMessage;
    belm_log_customer_communication(
        (string)$customer['id'], $proforma['machine_id'] ?: null, 'CUSTOMER_TO_BELM', 'EMAIL',
        $response === 'ACCEPTED' ? 'Proforma Accepted' : 'Proforma Change Requested',
        $messageText, 'PROFORMA', $sub2, $actorName, 'SENT'
    );
    belm_send_customer_to_belm_alert(
        ['billing'],
        ($response === 'ACCEPTED' ? 'Proforma Accepted — ' : 'Proforma Change Requested — ') . $proforma['invoice_no'],
        $messageText . "\nCustomer: " . ($customer['name'] ?? 'Unknown') . "\nResponded by: $actorName",
        $customer['actorEmail'] ?? null
    );
    json_out(['ok' => true, 'deliveryStatus' => 'RESPONDED', 'customerResponse' => $response]);
}

// ---- Download a checklist report (JSON for now — swap in a real PDF
// generator such as dompdf/mpdf if you want a byte-for-byte PDF file) -----
// Returns the report as JSON for the "View Checked Report" modal. Kept
// separate from /download (which returns a PDF file) — these serve two
// different purposes and must not share a URL.
if ($sub === 'reports' && $sub2 && $sub3 === 'view' && $method === 'GET') {
    require_customer_feature_access($customer, 'check-up', 'Check Up');
    $stmt = db()->prepare(
        'SELECT cr.*, m.customer_id, m.model AS machine_model, m.machine_type,
                m.serial_number, m.reg_number, m.brand,
                c.name AS customer_name, ct.name AS template_name
         FROM checklist_reports cr
         JOIN machines m ON m.id = cr.machine_id
         JOIN customers c ON c.id = m.customer_id
         LEFT JOIN checklist_templates ct ON ct.id = cr.template_id
         WHERE cr.id = ?'
    );
    $stmt->execute([$sub2]);
    $report = $stmt->fetch();
    if (!$report || $report['customer_id'] !== $customer['id']) json_error('Not found', 404);
    $stmt2 = db()->prepare('SELECT * FROM checklist_answers WHERE report_id = ?');
    $stmt2->execute([$sub2]);
    $view = customer_checklist_report_view($report);
    $view['answers'] = array_map('customer_checklist_answer_view', $stmt2->fetchAll());
    json_out($view);
}

if ($sub === 'reports' && $sub2 && $sub3 === 'download' && $method === 'GET') {
    require_customer_feature_access($customer, 'check-up', 'Check Up');
    $stmt = db()->prepare(
        'SELECT cr.*, m.customer_id, m.model AS machine_model, m.machine_type,
                m.serial_number, m.reg_number, m.brand,
                c.name AS customer_name, ct.name AS template_name
         FROM checklist_reports cr
         JOIN machines m ON m.id = cr.machine_id
         JOIN customers c ON c.id = m.customer_id
         LEFT JOIN checklist_templates ct ON ct.id = cr.template_id
         WHERE cr.id = ?'
    );
    $stmt->execute([$sub2]);
    $report = $stmt->fetch();
    if (!$report || $report['customer_id'] !== $customer['id']) json_error('Not found', 404);
    $stmt2 = db()->prepare('SELECT * FROM checklist_answers WHERE report_id = ?');
    $stmt2->execute([$sub2]);
    $view = customer_checklist_report_view($report);
    $answers = array_map('customer_checklist_answer_view', $stmt2->fetchAll());

    $lines = [
        strtoupper($report['customer_name'] ?: 'BELM CUSTOMER') . ' - CHECKLIST REPORT',
        'Service provided by: BELM General Tech Service Limited',
        'Template: ' . ($report['template_name'] ?: 'Checklist'),
        'Machine: ' . trim(($report['brand'] ?? '') . ' ' . ($report['machine_model'] ?? '')),
        'Serial / Registration: ' . ($report['serial_number'] ?: ($report['reg_number'] ?: 'Not recorded')),
        'Filled by: ' . ($view['filledBy'] ?? '—'),
        'Date: ' . date('d/m/Y H:i', strtotime((string)($view['createdAt'] ?? 'now'))),
        'Hour meter: ' . ($view['hourMeterReading'] ?? 0),
        'Overall status: ' . ($view['overallStatus'] ?? 'GREEN'),
    ];
    $photos = [];
    $displayPhoto = checklist_report_decode_photo($view['displayPhotoUrl'] ?? null);
    if ($displayPhoto) {
        $lines[] = 'Display photo: (see photo page below)';
        $photos[] = ['label' => 'Display Photo', 'photo' => $displayPhoto];
    }
    $lines[] = str_repeat('-', 78);
    $itemNumber = 0;
    foreach ($answers as $answer) {
        $itemNumber++;
        $displayValue = $answer['value'];
        $isImageValue = $displayValue !== '' && str_starts_with((string)$displayValue, 'data:image/');
        $photo = checklist_report_decode_photo($answer['photoUrl'] ?: ($isImageValue ? $displayValue : null));
        if ($photo) $photos[] = ['label' => $answer['label'], 'photo' => $photo];
        $levelSuffix = strtoupper((string)$answer['safetyLevel']) === 'NONE' ? '' : ' [' . $answer['safetyLevel'] . ']';
        $noteSuffix = trim((string)($answer['note'] ?? '')) !== '' ? ' -- Issue: ' . trim((string)$answer['note']) : '';
        $lines[] = sprintf(
            '%d. %s: %s%s%s%s',
            $itemNumber,
            $answer['label'],
            $isImageValue ? '(Photo)' : ($displayValue !== '' ? $displayValue : '—'),
            $levelSuffix,
            $noteSuffix,
            $photo ? ' (see photo page below)' : ''
        );
    }
    $lines[] = str_repeat('-', 78);

    $safeMachine = preg_replace('/[^A-Za-z0-9_-]+/', '-', trim(($report['brand'] ?? '') . '-' . ($report['machine_model'] ?? '')));
    output_checklist_report_pdf('checklist-report-' . $safeMachine . '.pdf', $lines, $photos);
}

json_error('Unknown request', 404);
