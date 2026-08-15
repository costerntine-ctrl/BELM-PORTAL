<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/../config/mailer.php';
require_once __DIR__ . '/checklist_reports_helpers.php';
require_once __DIR__ . '/proforma_pdf_helper.php';
require_once __DIR__ . '/table_pdf_helper.php';

$customer = require_customer_auth();
$method = $_SERVER['REQUEST_METHOD'];
$sub = $_GET['sub'] ?? '';
$sub2 = $_GET['sub2'] ?? '';
$sub3 = $_GET['sub3'] ?? '';

function log_customer_activity(array $customer, string $action): void {
    $actorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Someone'));
    db()->prepare(
        'INSERT INTO customer_activity_logs (id, customer_id, actor_name, action, created_at) VALUES (?,?,?,?,NOW())'
    )->execute([uuid(), $customer['id'], $actorName, $action]);
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
    if (!$pages) $pages = [['No machine expenses recorded.']];

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

// Daily fuel usage — same usage_logs table, its own category. quantity is
// litres, unit_price is price/litre, cost is the total for that day's
// fill-up, mirroring the same shape as Machine Expenses / Petty Cash so
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
    $stmt = db()->prepare(
        'SELECT id, name, email, phone, portal_link, is_machinery_admin
         FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
    );
    $stmt->execute([$customer['id']]);
    $profile = $stmt->fetch();
    if ($profile) {
        $profile['portalUrl'] = customer_portal_url($profile['portal_link']);
        $profile['isMachineryAdmin'] = !empty($profile['is_machinery_admin']);
        $profile['belmServiceProviderActive'] = empty($profile['is_machinery_admin']);
        $profile['actorType'] = $customer['actorType'] ?? 'owner';
        $profile['actorRole'] = $customer['customerRole'] ?? 'owner';
        $profile['actorPermissions'] = $customer['permissions'] ?? null;
    }
    json_out(['customer' => $profile, 'machines' => $machines]);
}

// ---- Analysis summary for the dashboard's right-side card -------------------
// ---- Analysis for ONE specific machine (Machine Expenses page sidebar) -----
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
        "SELECT COALESCE(SUM(total), 0) AS total,
                COALESCE(SUM(total) FILTER (WHERE status <> 'PAID'), 0) AS outstanding
         FROM invoices WHERE customer_id = ?"
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

    // The frontend only visually hides the Petty Cash / Machine Expenses /
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
    require_customer_feature_access($customer, 'service-request', 'Request BELM Support');
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
// Machine Expenses can then issue it to a machine with an auditable balance.
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

// ---- Customer-recorded machine spare-part expenses -------------------------
if ($sub === 'machine-expenses' && $sub2) {
    require_customer_feature_access($customer, 'machine-expenses', 'Machine Expenses');
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
                : 'Machine expense saved successfully.',
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
        header('Content-Disposition: attachment; filename="machine-expenses-' . $safeMachine . '.csv"');
        $output = fopen('php://output', 'wb');
        fputcsv($output, [strtoupper($customer['name']) . ' - MACHINE EXPENSE REPORT']);
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
            strtoupper($customer['name']) . ' - MACHINE MATERIAL & EXPENSE AUDIT',
            [
                'Machine: ' . ($machine['brand'] ? $machine['brand'] . ' ' : '') . $machine['model'],
                'Serial / Registration: ' . ($machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded')),
                'Period: ' . ($rangeFrom ? display_date($rangeFrom) . ' to ' . display_date($rangeTo) : 'All time'),
                'Machine expense total: TZS ' . number_format($totalCost, 2),
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
            strtoupper($customer['name']) . ' - MACHINE EXPENSE REPORT',
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
        $lines[] = 'TOTAL MACHINE EXPENSE: TZS ' . number_format($totalCost, 2);
        $safeMachine = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)$machine['model']);
        output_machine_expense_pdf('machine-expenses-' . $safeMachine . '.pdf', $lines);
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

// ---- Machine reports / service status / operation analysis ----------------
if ($sub === 'machines' && $sub2) {
    $machineId = $sub2;
    $stmt = db()->prepare('SELECT id FROM machines WHERE id = ? AND customer_id = ?');
    $stmt->execute([$machineId, $customer['id']]);
    if (!$stmt->fetch()) json_error('Not found', 404);

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
            ? "Service request assigned to {$row['actor_name']}"
            : "Service request status changed to {$row['to_value']}" . ($row['actor_name'] ? " by {$row['actor_name']}" : '');
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
    require_customer_feature_access($customer, 'operator-reports', 'Operator Reports');
    $machineId = $sub2;
    $stmt = db()->prepare('SELECT 1 FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL');
    $stmt->execute([$machineId, $customer['id']]);
    if (!$stmt->fetch()) json_error('Machine not found for this customer.', 404);

    $stmt = db()->prepare(
        'SELECT id, operator_name, operator_contact, message, status, notify_belm, created_at, resolved_at
         FROM operator_reports WHERE machine_id = ? ORDER BY created_at DESC'
    );
    $stmt->execute([$machineId]);
    $rows = $stmt->fetchAll();
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
        ['service-requests'],
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

Open BELM Portal > Service Requests / Customer Communication and take action.",
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
    require_customer_feature_access($customer, 'service-request', 'Request BELM Support');
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
        ['service-requests'],
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

// ---- Service requests -------------------------------------------------------
if ($sub === 'service-requests' && $method === 'GET') {
    require_customer_feature_access($customer, 'service-request', 'Request BELM Support');
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
    require_customer_feature_access($customer, 'service-request', 'Request BELM Support');
    $stmt = db()->prepare(
        "SELECT status FROM service_requests WHERE id = ? AND customer_id = ?"
    );
    $stmt->execute([$sub2, $customer['id']]);
    $status = $stmt->fetchColumn();
    if ($status === false) json_error('Service request not found.', 404);
    if (!in_array($status, ['COMPLETED', 'CANCELLED'], true)) {
        json_error('Only completed or cancelled requests can be hidden.', 422);
    }
    db()->prepare('UPDATE service_requests SET hidden_at = NOW() WHERE id = ?')->execute([$sub2]);
    json_out(['ok' => true]);
}

if ($sub === 'service-requests' && $sub2 && $sub3 === 'unhide' && $method === 'PUT') {
    require_customer_feature_access($customer, 'service-request', 'Request BELM Support');
    $stmt = db()->prepare('UPDATE service_requests SET hidden_at = NULL WHERE id = ? AND customer_id = ?');
    $stmt->execute([$sub2, $customer['id']]);
    if ($stmt->rowCount() === 0) json_error('Service request not found.', 404);
    json_out(['ok' => true]);
}

if ($sub === 'service-requests' && $method === 'POST') {
    require_customer_feature_access($customer, 'service-request', 'Request BELM Support');
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
    if ($machineId !== '') belm_sync_breakdown_case_from_service_request($newId, $actorName);
    belm_log_customer_communication(
        (string)$customer['id'], $machineId !== '' ? $machineId : null,
        'CUSTOMER_TO_BELM', 'EMAIL', 'Service Request',
        $description, 'SERVICE_REQUEST', $newId, $actorName, 'SENT'
    );
    $alertResult = ['sent' => 0];
    try {
        $machineLabel = $machine ? trim(($machine['model'] ?? '') . ' ' . ($machine['machine_type'] ?? '')) : 'No machine selected';
        $alertResult = belm_send_customer_to_belm_alert(
            ['service-requests'],
            'OFFICIAL SERVICE REQUEST — ' . ($customer['name'] ?? 'Customer') . ' — ' . $machineLabel,
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

Open Service Requests in BELM Portal to review and assign it.",
            $customer['actorEmail'] ?? null
        );
    } catch (Throwable $error) { /* notification only */ }
    json_out([
        'id' => $newId,
        'serviceType' => $serviceType,
        'belmSupport' => true,
        'emailSent' => !empty($alertResult['businessEmailSent']),
    ], 201);
}

if ($sub === 'service-requests' && $sub2 && $sub3 === 'cancel' && $method === 'PUT') {
    require_customer_feature_access($customer, 'service-request', 'Request BELM Support');
    require_customer_write_access($customer);
    $stmt = db()->prepare('SELECT * FROM service_requests WHERE id = ? AND customer_id = ?');
    $stmt->execute([$sub2, $customer['id']]);
    $req = $stmt->fetch();
    if (!$req) json_error('Not found', 404);
    if (!in_array($req['status'], ['OPEN', 'ASSIGNED'], true)) json_error('Only Open or Assigned requests can be cancelled.');
    db()->prepare("UPDATE service_requests SET status='CANCELLED', cancelled_at=COALESCE(cancelled_at,NOW()), updated_at=NOW() WHERE id=?")->execute([$sub2]);
    $actorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer'));
    belm_sync_breakdown_case_from_service_request($sub2, $actorName);
    $cancelMessage = 'Customer cancelled service request: ' . ($req['description'] ?? '');
    belm_log_customer_communication(
        (string)$customer['id'], $req['machine_id'] ?: null,
        'CUSTOMER_TO_BELM', 'EMAIL', 'Service Request Cancelled',
        $cancelMessage, 'SERVICE_REQUEST', $sub2, $actorName, 'SENT'
    );
    $cancelAlert = ['businessEmailSent' => false];
    try {
        $cancelAlert = belm_send_customer_to_belm_alert(
            ['service-requests'],
            'SERVICE REQUEST CANCELLED — ' . ($customer['name'] ?? 'Customer'),
            $cancelMessage . "\nCustomer: " . ($customer['name'] ?? 'Unknown') . "\nCancelled by: $actorName\nRequest ID: $sub2",
            $customer['actorEmail'] ?? null
        );
    } catch (Throwable $ignored) {}
    json_out(['ok' => true, 'emailSent' => !empty($cancelAlert['businessEmailSent'])]);
}

// ---- BELM inventory is private to BELM staff -------------------------------
if ($sub === 'spare-parts' && $method === 'GET') {
    json_error('BELM spare-parts inventory is private. Submit a spare request and BELM will identify the correct part.', 403);
}

// ---- Request spare parts ----------------------------------------------------
// Customer submits only the spare name/reference/quantity. The request stays
// deliberately unlinked to BELM Inventory until BELM Spare Parts staff choose
// the correct internal record; the customer never sees stock or pricing.
if ($sub === 'spare-part-requests' && $method === 'POST') {
    require_customer_feature_access($customer, 'service-request', 'Request BELM Support');
    require_customer_write_access($customer);
    $b = body();
    $referenceNumber = trim((string)($b['referenceNumber'] ?? ''));
    $description = trim((string)($b['description'] ?? ''));
    $serviceRequestId = trim((string)($b['serviceRequestId'] ?? ''));
    $machineId = trim((string)($b['machineId'] ?? ''));
    $quantity = (float)($b['quantity'] ?? 0);

    if ($description === '') json_error('Enter the spare name.');
    if (strlen($description) > 255) json_error('Spare name is too long.');
    if (strlen($referenceNumber) > 100) json_error('Reference / part number is too long.');
    if ($quantity <= 0 || floor($quantity) !== $quantity) {
        json_error('Spare-part quantity must be a whole number greater than zero.');
    }
    if ($machineId === '') json_error('Select the machine that needs this spare.');

    $machineStmt = db()->prepare(
        'SELECT id, machine_type, model, brand, serial_number, reg_number
         FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL'
    );
    $machineStmt->execute([$machineId, $customer['id']]);
    $machine = $machineStmt->fetch();
    if (!$machine) json_error('Machine not found for this customer.', 404);

    if ($serviceRequestId !== '') {
        $stmt = db()->prepare('SELECT 1 FROM service_requests WHERE id = ? AND customer_id = ? AND machine_id = ?');
        $stmt->execute([$serviceRequestId, $customer['id'], $machineId]);
        if (!$stmt->fetch()) json_error('Service request not found for this customer and machine.', 404);
    }

    $actorName = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer'));
    $newId = uuid();
    db()->prepare(
        "INSERT INTO spare_part_requests
            (id, spare_part_id, reference_number, description, request_id, machine_id,
             requested_by_id, requested_by_name, machine_type, quantity, status, created_at)
         VALUES (?,NULL,?,?,?,?,NULL,?,?,?,'PENDING',NOW())"
    )->execute([
        $newId,
        $referenceNumber !== '' ? $referenceNumber : null,
        $description,
        $serviceRequestId !== '' ? $serviceRequestId : null,
        $machineId,
        $actorName,
        $machine['machine_type'] ?? null,
        (int)$quantity,
    ]);

    belm_log_customer_communication(
        (string)$customer['id'], $machineId, 'CUSTOMER_TO_BELM', 'EMAIL',
        'Spare Request',
        $description . ($referenceNumber !== '' ? " (Ref: $referenceNumber)" : '') . ' — Qty ' . (int)$quantity,
        'SPARE_REQUEST', $newId, $actorName, 'SENT'
    );

    // Official BELM business inbox + internal Spare Parts/Accounts recipients.
    // Customer never receives or sees BELM inventory data from this notification.
    $spareAlert = ['businessEmailSent' => false];
    try {
        $machineLabel = trim(($machine['brand'] ?? '') . ' ' . ($machine['model'] ?? '')) ?: ($machine['machine_type'] ?? 'Machine');
        $serial = $machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded');
        $spareAlert = belm_send_customer_to_belm_alert(
            ['spare-parts', 'billing'],
            'OFFICIAL SPARE REQUEST — ' . ($customer['name'] ?? 'Customer') . ' — ' . $machineLabel,
            "CUSTOMER SPARE REQUEST TO BELM

"
            . "Customer: " . ($customer['name'] ?? 'Unknown') . "
"
            . "Requested by: $actorName
"
            . "Machine: $machineLabel
"
            . "Serial / Reg: $serial
"
            . "Spare name: $description
"
            . "Reference / part no.: " . ($referenceNumber !== '' ? $referenceNumber : 'Not provided') . "
"
            . "Quantity: " . (int)$quantity . "
"
            . "Request ID: $newId

"
            . "Spare Parts: open Spare Parts Manager and choose the correct BELM spare.
"
            . "Accounts: prepare the Proforma after the spare is selected.",
            $customer['actorEmail'] ?? null
        );
    } catch (Throwable $error) { /* alert must never block the saved request */ }

    json_out([
        'id' => $newId,
        'status' => 'PENDING',
        'message' => !empty($spareAlert['businessEmailSent'])
            ? 'Spare request sent to BELM official business email for part selection and Proforma preparation.'
            : 'Spare request saved in the portal, but BELM business-email delivery needs attention.',
        'emailSent' => !empty($spareAlert['businessEmailSent']),
    ], 201);
}

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
