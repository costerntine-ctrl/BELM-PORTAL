<?php
require_once __DIR__ . '/../config/helpers.php';

$customer = require_customer_auth();
$method = $_SERVER['REQUEST_METHOD'];
$sub = $_GET['sub'] ?? '';
$sub2 = $_GET['sub2'] ?? '';
$sub3 = $_GET['sub3'] ?? '';

function machine_expense_pdf_escape(string $value): string {
    $converted = function_exists('iconv')
        ? iconv('UTF-8', 'Windows-1252//TRANSLIT', $value)
        : $value;
    if ($converted === false) $converted = preg_replace('/[^\x20-\x7E]/', '?', $value);
    return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], (string)$converted);
}

function output_machine_expense_pdf(string $filename, array $lines): void {
    $pages = array_chunk($lines, 48);
    if (!$pages) $pages = [['No machine expenses recorded.']];

    $objects = [];
    $fontObject = 3 + count($pages) * 2;
    $pageReferences = [];
    foreach ($pages as $index => $pageLines) {
        $pageObject = 3 + $index * 2;
        $contentObject = $pageObject + 1;
        $pageReferences[] = $pageObject . ' 0 R';
        $content = "BT\n/F1 10 Tf\n50 790 Td\n13 TL\n";
        foreach ($pageLines as $line) {
            $content .= '(' . machine_expense_pdf_escape((string)$line) . ") Tj\nT*\n";
        }
        $content .= "ET\n";
        $objects[$pageObject] =
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            . "/Resources << /Font << /F1 {$fontObject} 0 R >> >> "
            . "/Contents {$contentObject} 0 R >>";
        $objects[$contentObject] =
            "<< /Length " . strlen($content) . " >>\nstream\n{$content}endstream";
    }
    $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    $objects[2] =
        '<< /Type /Pages /Kids [' . implode(' ', $pageReferences)
        . '] /Count ' . count($pages) . ' >>';
    $objects[$fontObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
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

function machine_expense_rows(string $customerId, string $machineId): array {
    $stmt = db()->prepare(
        "SELECT id, date, description, part_number, quantity, unit, unit_price,
                cost, logged_by, receipt_photo_name,
                CASE WHEN receipt_photo_data IS NOT NULL AND receipt_photo_data <> ''
                     THEN 1 ELSE 0 END AS has_receipt,
                created_at
         FROM usage_logs
         WHERE customer_id = ? AND machine_id = ? AND category = 'SPARE_PART'
         ORDER BY date DESC, created_at DESC"
    );
    $stmt->execute([$customerId, $machineId]);
    return $stmt->fetchAll();
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
        'SELECT id, spare_name, part_number, quantity
         FROM service_request_parts
         WHERE request_id = ?
         ORDER BY created_at ASC'
    );
    $stmt->execute([$requestId]);
    $parts = $stmt->fetchAll();
    foreach ($parts as &$part) {
        $part['spareName'] = $part['spare_name'];
        $part['partNumber'] = $part['part_number'];
        unset($part['spare_name'], $part['part_number']);
    }
    unset($part);
    return $parts;
}

// ---- Dashboard ------------------------------------------------------------
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
        'SELECT id, name, email, phone, portal_link
         FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
    );
    $stmt->execute([$customer['id']]);
    $profile = $stmt->fetch();
    if ($profile) $profile['portalUrl'] = customer_portal_url($profile['portal_link']);
    json_out(['customer' => $profile, 'machines' => $machines]);
}

// ---- Machine-aware service types and their synchronized parts ---------------
if ($sub === 'service-options' && $sub2 && $method === 'GET') {
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
        $template['serviceParts'] = customer_template_service_parts($template['id']);
        unset($template['machine_type'], $template['service_type']);
    }
    unset($template);

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
    ]);
}

// ---- Customer-recorded machine spare-part expenses -------------------------
if ($sub === 'machine-expenses' && $sub2) {
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
            if (!preg_match('#^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$#', $receiptPhoto, $matches)) {
                json_error('Receipt must be a JPG, PNG or WebP image.');
            }
            $decodedReceipt = base64_decode($matches[2], true);
            if ($decodedReceipt === false) json_error('Receipt photo could not be read.');
            if (strlen($decodedReceipt) > 2 * 1024 * 1024) {
                json_error('Receipt photo must be 2 MB or smaller after compression.');
            }
            $imageInfo = @getimagesizefromstring($decodedReceipt);
            if (
                $imageInfo === false
                || !in_array($imageInfo['mime'] ?? '', ['image/jpeg', 'image/png', 'image/webp'], true)
            ) {
                json_error('Receipt photo is not a valid image.');
            }
            $receiptData = base64_encode($decodedReceipt);
            $receiptMime = $imageInfo['mime'];
            $receiptName = preg_replace('/[^A-Za-z0-9._-]+/', '-', $receiptName ?: 'receipt-photo');
        }

        $cost = round($quantity * $unitPrice, 2);
        $expenseId = uuid();
        $loggedBy = trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer'));
        db()->prepare(
            "INSERT INTO usage_logs
             (id, customer_id, machine_id, date, category, description,
              part_number, quantity, unit, unit_price, cost, logged_by,
              receipt_photo_data, receipt_photo_mime, receipt_photo_name, created_at)
             VALUES (?,?,?,?,'SPARE_PART',?,?,?,?,?,?,?,?,?,?,NOW())"
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
            $loggedBy !== '' ? $loggedBy : 'Customer',
            $receiptData,
            $receiptMime,
            $receiptName !== '' ? $receiptName : null,
        ]);
        json_out([
            'id' => $expenseId,
            'cost' => $cost,
            'message' => 'Machine expense saved successfully.',
        ], 201);
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
            ['image/jpeg', 'image/png', 'image/webp'],
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

    $expenses = machine_expense_rows($customer['id'], $machineId);

    if ($method === 'GET' && $sub3 === 'csv') {
        $safeMachine = preg_replace('/[^A-Za-z0-9_-]+/', '-', (string)$machine['model']);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="machine-expenses-' . $safeMachine . '.csv"');
        $output = fopen('php://output', 'wb');
        fputcsv($output, ['Date', 'Machine', 'Part Number', 'Description', 'Quantity', 'Unit', 'Unit Cost TZS', 'Total TZS', 'Receipt', 'Recorded By']);
        foreach ($expenses as $expense) {
            $safeText = static function ($value): string {
                $text = (string)$value;
                return preg_match('/^[=+\-@]/', $text) ? "'" . $text : $text;
            };
            fputcsv($output, [
                $expense['date'],
                $safeText($machine['model']),
                $safeText($expense['part_number'] ?? ''),
                $safeText($expense['description']),
                $expense['quantity'],
                $expense['unit'],
                $expense['unit_price'],
                $expense['cost'],
                $expense['has_receipt'] ? 'Attached' : 'No receipt',
                $safeText($expense['logged_by'] ?? ''),
            ]);
        }
        fclose($output);
        exit;
    }

    if ($method === 'GET' && $sub3 === 'pdf') {
        $totalCost = array_reduce(
            $expenses,
            static fn(float $sum, array $expense): float => $sum + (float)$expense['cost'],
            0.0
        );
        $lines = [
            'BELM GENERAL TECH - MACHINE EXPENSE REPORT',
            'Machine: ' . ($machine['brand'] ? $machine['brand'] . ' ' : '') . $machine['model'],
            'Serial / Registration: ' . ($machine['serial_number'] ?: ($machine['reg_number'] ?: 'Not recorded')),
            'Generated: ' . date('Y-m-d H:i'),
            str_repeat('-', 78),
        ];
        foreach ($expenses as $expense) {
            $lines[] = sprintf(
                '%s | Part: %s | Qty: %s %s | Unit: %s | Total: TZS %s | Receipt: %s',
                $expense['date'],
                $expense['part_number'] ?: '-',
                rtrim(rtrim(number_format((float)$expense['quantity'], 2, '.', ''), '0'), '.'),
                $expense['unit'] ?: 'PC',
                number_format((float)$expense['unit_price'], 2),
                number_format((float)$expense['cost'], 2),
                $expense['has_receipt'] ? 'Yes' : 'No'
            );
            $descriptionLine = (string)$expense['description'];
            $descriptionLine = function_exists('mb_substr')
                ? mb_substr($descriptionLine, 0, 105)
                : substr($descriptionLine, 0, 105);
            $lines[] = '  ' . $descriptionLine;
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
            'expenses' => $expenses,
        ]);
    }
}

// ---- Machine reports / service status / operation analysis ----------------
if ($sub === 'machines' && $sub2) {
    $machineId = $sub2;
    $stmt = db()->prepare('SELECT id FROM machines WHERE id = ? AND customer_id = ?');
    $stmt->execute([$machineId, $customer['id']]);
    if (!$stmt->fetch()) json_error('Not found', 404);

    if ($sub3 === 'reports') {
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

// ---- Customer assistants ---------------------------------------------------
if ($sub === 'users' && $method === 'GET') {
    require_customer_owner($customer);
    $stmt = db()->prepare(
        'SELECT id, name, email, phone, role, is_active, created_at
         FROM customer_users WHERE customer_id = ? ORDER BY created_at DESC'
    );
    $stmt->execute([$customer['id']]);
    $assistants = $stmt->fetchAll();
    foreach ($assistants as &$assistant) {
        $assistant['isActive'] = (bool)$assistant['is_active'];
        unset($assistant['is_active']);
    }
    json_out($assistants);
}

if ($sub === 'users' && $method === 'POST') {
    require_customer_owner($customer);
    $b = body();
    $name = trim((string)($b['name'] ?? ''));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $password = (string)($b['password'] ?? '');
    $phone = trim((string)($b['phone'] ?? ''));
    $role = strtolower(trim((string)($b['role'] ?? 'operator')));

    if ($name === '') json_error('Assistant name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid assistant email address.');
    if (strlen($password) < 8) json_error('Assistant password must contain at least 8 characters.');
    if (!in_array($role, ['operator', 'viewer'], true)) json_error('Assistant role must be Operator or Viewer.');

    $emailCheck = db()->prepare(
        'SELECT 1 FROM customers WHERE LOWER(email) = ?
         UNION ALL SELECT 1 FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM customer_users WHERE LOWER(email) = ?
         LIMIT 1'
    );
    $emailCheck->execute([$email, $email, $email]);
    if ($emailCheck->fetch()) json_error('This email address is already used by another portal account.', 409);

    $newId = uuid();
    $recoveryCode = account_recovery_code();
    db()->prepare(
        'INSERT INTO customer_users
         (id, customer_id, name, email, password, recovery_code_hash, phone, role, is_active, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,NOW())'
    )->execute([
        $newId,
        $customer['id'],
        $name,
        $email,
        password_hash($password, PASSWORD_BCRYPT),
        password_hash($recoveryCode, PASSWORD_BCRYPT),
        $phone !== '' ? $phone : null,
        $role,
        1,
    ]);
    json_out([
        'id' => $newId,
        'name' => $name,
        'email' => $email,
        'phone' => $phone !== '' ? $phone : null,
        'role' => $role,
        'isActive' => true,
        'recoveryCode' => $recoveryCode,
    ], 201);
}

if ($sub === 'users' && $sub2 && $method === 'PUT') {
    require_customer_owner($customer);
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
    $newPassword = (string)($b['password'] ?? '');

    if ($name === '') json_error('Assistant name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid assistant email address.');
    if (!in_array($role, ['operator', 'viewer'], true)) json_error('Assistant role must be Operator or Viewer.');
    if ($newPassword !== '' && strlen($newPassword) < 8) {
        json_error('New password must contain at least 8 characters.');
    }

    $emailCheck = db()->prepare(
        'SELECT 1 FROM customers WHERE LOWER(email) = ?
         UNION ALL SELECT 1 FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM customer_users WHERE LOWER(email) = ? AND id <> ?
         LIMIT 1'
    );
    $emailCheck->execute([$email, $email, $email, $sub2]);
    if ($emailCheck->fetch()) json_error('This email address is already used by another portal account.', 409);

    if ($newPassword !== '') {
        $recoveryCode = account_recovery_code();
        db()->prepare(
            'UPDATE customer_users
             SET name=?, email=?, phone=?, role=?, is_active=?, password=?, recovery_code_hash=?
             WHERE id=? AND customer_id=?'
        )->execute([
            $name,
            $email,
            $phone !== '' ? $phone : null,
            $role,
            $isActive,
            password_hash($newPassword, PASSWORD_BCRYPT),
            password_hash($recoveryCode, PASSWORD_BCRYPT),
            $sub2,
            $customer['id'],
        ]);
    } else {
        db()->prepare(
            'UPDATE customer_users
             SET name=?, email=?, phone=?, role=?, is_active=?
             WHERE id=? AND customer_id=?'
        )->execute([
            $name,
            $email,
            $phone !== '' ? $phone : null,
            $role,
            $isActive,
            $sub2,
            $customer['id'],
        ]);
    }
    json_out([
        'ok' => true,
        'recoveryCode' => $newPassword !== '' ? $recoveryCode : null,
    ]);
}

if ($sub === 'users' && $sub2 && $method === 'DELETE') {
    require_customer_owner($customer);
    $stmt = db()->prepare('DELETE FROM customer_users WHERE id = ? AND customer_id = ?');
    $stmt->execute([$sub2, $customer['id']]);
    if ($stmt->rowCount() === 0) json_error('Assistant not found.', 404);
    json_out(null, 204);
}

// ---- Service requests -------------------------------------------------------
if ($sub === 'service-requests' && $method === 'GET') {
    $stmt = db()->prepare(
        'SELECT sr.*, m.model AS machine_model, m.machine_type
         FROM service_requests sr
         LEFT JOIN machines m ON m.id = sr.machine_id
         WHERE sr.customer_id = ?
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
        $request['serviceParts'] = customer_request_service_parts($request['id']);
        unset($request['machine_model'], $request['machine_type']);
    }
    unset($request);
    json_out($requests);
}

if ($sub === 'service-requests' && $method === 'POST') {
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
        foreach ($serviceParts as $part) {
            $pdo->prepare(
                'INSERT INTO service_request_parts
                 (id, request_id, spare_name, part_number, quantity, created_at)
                 VALUES (?,?,?,?,?,NOW())'
            )->execute([
                uuid(),
                $newId,
                $part['spareName'],
                $part['partNumber'],
                $part['quantity'],
            ]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    json_out([
        'id' => $newId,
        'serviceType' => $serviceType,
        'serviceParts' => $serviceParts,
    ], 201);
}

if ($sub === 'service-requests' && $sub2 && $sub3 === 'cancel' && $method === 'PUT') {
    require_customer_write_access($customer);
    $stmt = db()->prepare('SELECT * FROM service_requests WHERE id = ? AND customer_id = ?');
    $stmt->execute([$sub2, $customer['id']]);
    $req = $stmt->fetch();
    if (!$req) json_error('Not found', 404);
    if (!in_array($req['status'], ['OPEN', 'ASSIGNED'], true)) json_error('Only Open or Assigned requests can be cancelled.');
    db()->prepare("UPDATE service_requests SET status='CANCELLED', updated_at=NOW() WHERE id=?")->execute([$sub2]);
    json_out(['ok' => true]);
}

// ---- Spare parts (read-only, no pricing) -----------------------------------
if ($sub === 'spare-parts' && $method === 'GET') {
    $stmt = db()->query('SELECT id, part_number, name, category, stock_qty FROM spare_parts WHERE deleted_at IS NULL');
    json_out($stmt->fetchAll());
}

// ---- Request spare parts ----------------------------------------------------
if ($sub === 'spare-part-requests' && $method === 'POST') {
    require_customer_write_access($customer);
    $b = body();
    $sparePartId = trim((string)($b['sparePartId'] ?? ''));
    $serviceRequestId = trim((string)($b['serviceRequestId'] ?? ''));
    $quantity = (float)($b['quantity'] ?? 0);
    if ($quantity <= 0 || floor($quantity) !== $quantity) {
        json_error('Spare-part quantity must be a whole number greater than zero.');
    }
    $stmt = db()->prepare('SELECT 1 FROM spare_parts WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$sparePartId]);
    if (!$stmt->fetch()) json_error('Spare part not found.', 404);
    if ($serviceRequestId !== '') {
        $stmt = db()->prepare('SELECT 1 FROM service_requests WHERE id = ? AND customer_id = ?');
        $stmt->execute([$serviceRequestId, $customer['id']]);
        if (!$stmt->fetch()) json_error('Service request not found for this customer.', 404);
    }
    $newId = uuid();
    db()->prepare("INSERT INTO spare_part_requests (id, spare_part_id, request_id, quantity, status, created_at) VALUES (?,?,?,?,'PENDING',NOW())")
        ->execute([
            $newId,
            $sparePartId,
            $serviceRequestId !== '' ? $serviceRequestId : null,
            (int)$quantity,
        ]);
    json_out(['id' => $newId], 201);
}

// ---- Download a checklist report (JSON for now — swap in a real PDF
// generator such as dompdf/mpdf if you want a byte-for-byte PDF file) -----
if ($sub === 'reports' && $sub2 && $sub3 === 'download' && $method === 'GET') {
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
    $report = customer_checklist_report_view($report);
    $report['answers'] = array_map('customer_checklist_answer_view', $stmt2->fetchAll());
    json_out($report);
}

json_error('Unknown request', 404);
