<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
if (!belm_user_has_named_role($user, ['Super Admin', 'Engineer', 'Workshop Manager'])) {
    require_page_access($user, 'customers');
}

$pdo = db();
$rows = $pdo->query(
    "SELECT
        m.id,
        m.brand,
        m.model,
        m.machine_type,
        m.fleet_number,
        m.serial_number,
        m.reg_number,
        m.status,
        m.operational_status,
        m.operational_status_note,
        m.operational_status_updated_at,
        m.service_kit,
        m.last_checked_at,
        c.name AS customer_name,
        (
            SELECT orp.message FROM operator_reports orp
            WHERE orp.machine_id = m.id
            ORDER BY orp.created_at DESC, orp.id DESC LIMIT 1
        ) AS operator_message,
        (
            SELECT orp.status FROM operator_reports orp
            WHERE orp.machine_id = m.id
            ORDER BY orp.created_at DESC, orp.id DESC LIMIT 1
        ) AS operator_status,
        (
            SELECT orp.operator_name FROM operator_reports orp
            WHERE orp.machine_id = m.id
            ORDER BY orp.created_at DESC, orp.id DESC LIMIT 1
        ) AS operator_name,
        (
            SELECT COUNT(*) FROM digital_job_cards dj
            WHERE dj.machine_id = m.id
              AND COALESCE(UPPER(dj.status),'') NOT IN ('COMPLETED','CANCELLED')
        ) AS open_job_cards,
        (
            SELECT dj.status FROM digital_job_cards dj
            WHERE dj.machine_id = m.id
              AND COALESCE(UPPER(dj.status),'') NOT IN ('COMPLETED','CANCELLED')
            ORDER BY dj.updated_at DESC, dj.created_at DESC, dj.id DESC LIMIT 1
        ) AS latest_job_status,
        (
            SELECT COUNT(*) FROM breakdown_spare_requests bsr
            JOIN breakdown_cases bc ON bc.id = bsr.case_id
            WHERE bc.machine_id = m.id
              AND COALESCE(UPPER(bsr.status),'') NOT IN ('PARTS_READY','REJECTED','CANCELLED')
        ) + (
            SELECT COUNT(*) FROM spare_part_requests spr
            WHERE spr.machine_id = m.id
              AND COALESCE(UPPER(spr.status),'') NOT IN ('COMPLETED','CANCELLED','REJECTED')
        ) AS pending_spares
     FROM machines m
     JOIN customers c ON c.id = m.customer_id
     WHERE m.deleted_at IS NULL
       AND c.deleted_at IS NULL
       AND c.is_active = 1
     ORDER BY c.name ASC, m.model ASC, m.fleet_number ASC"
)->fetchAll();

$machines = array_map(static function (array $row): array {
    return [
        'id' => (string)$row['id'],
        'brand' => (string)($row['brand'] ?? ''),
        'model' => (string)($row['model'] ?? ''),
        'machineType' => (string)($row['machine_type'] ?? ''),
        'fleetNumber' => (string)($row['fleet_number'] ?? ''),
        'serialNumber' => (string)($row['serial_number'] ?? ''),
        'regNumber' => (string)($row['reg_number'] ?? ''),
        'status' => (string)($row['status'] ?? ''),
        'operationalStatus' => (string)($row['operational_status'] ?? ''),
        'operationalStatusNote' => (string)($row['operational_status_note'] ?? ''),
        'operationalStatusUpdatedAt' => $row['operational_status_updated_at'] ?? null,
        'serviceKit' => (string)($row['service_kit'] ?? ''),
        'lastCheckedAt' => $row['last_checked_at'] ?? null,
        'customerName' => (string)($row['customer_name'] ?? ''),
        'operatorMessage' => (string)($row['operator_message'] ?? ''),
        'operatorStatus' => (string)($row['operator_status'] ?? ''),
        'operatorName' => (string)($row['operator_name'] ?? ''),
        'openJobCards' => (int)($row['open_job_cards'] ?? 0),
        'latestJobStatus' => (string)($row['latest_job_status'] ?? ''),
        'pendingSpares' => (int)($row['pending_spares'] ?? 0),
    ];
}, $rows);

json_out(['ok' => true, 'generatedAt' => date(DATE_ATOM), 'machines' => $machines]);
