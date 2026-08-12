<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/../config/mailer.php';
require_once __DIR__ . '/checklist_reports_helpers.php';

$customer = require_customer_auth();
$method = $_SERVER['REQUEST_METHOD'];
$sub = $_GET['sub'] ?? '';
$sub2 = $_GET['sub2'] ?? '';
$sub3 = $_GET['sub3'] ?? '';
$sub4 = $_GET['sub4'] ?? '';

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
    'machine-expenses', 'email', 'whatsapp', 'service-request', 'report-problem', 'analysis', 'assign-users',
];

function customer_permissions_from_body(array $body): ?string {
    $raw = $body['permissions'] ?? 'all';
    if ($raw === 'all' || $raw === null) return null;
    if (!is_array($raw)) return null;
    $clean = array_values(array_intersect(array_map('strval', $raw), CUSTOMER_PERMISSION_KEYS));
    if (count($clean) === 0 || count($clean) === count(CUSTOMER_PERMISSION_KEYS)) return null;
    return json_encode($clean);
}

// Validates a base64 receipt upload (image OR pdf). Returns [data, mime, name]
// or calls json_error() and exits if the upload is invalid.
function validate_receipt_upload(string $receiptPhoto, string $receiptName): array {
    if (!preg_match('#^data:(image/(?:jpeg|png|webp)|application/pdf);base64,([A-Za-z0-9+/=\r\n]+)$#', $receiptPhoto, $matches)) {
        json_error('Receipt must be a JPG, PNG, WebP image, or a PDF.');
    }
    $declaredType = $matches[1];
    $decodedReceipt = base64_decode($matches[2], true);
    if ($decodedReceipt === false) json_error('Receipt could not be read.');

    if ($declaredType === 'application/pdf') {
        if (strlen($decodedReceipt) > 4 * 1024 * 1024) {
            json_error('Receipt PDF must be 4 MB or smaller.');
        }
        if (substr($decodedReceipt, 0, 4) !== '%PDF') {
            json_error('Receipt is not a valid PDF file.');
        }
        $cleanName = preg_replace('/[^A-Za-z0-9._-]+/', '-', $receiptName ?: 'receipt');
        if (!str_ends_with(strtolower($cleanName), '.pdf')) $cleanName .= '.pdf';
        return [
            base64_encode($decodedReceipt),
            'application/pdf',
            $cleanName,
        ];
    }

    if (strlen($decodedReceipt) > 2 * 1024 * 1024) {
        json_error('Receipt photo must be 2 MB or smaller after compression.');
    }
    $imageInfo = @getimagesizefromstring($decodedReceipt);
    if ($imageInfo === false || !in_array($imageInfo['mime'] ?? '', ['image/jpeg', 'image/png', 'image/webp'], true)) {
        json_error('Receipt photo is not a valid image.');
    }
    return [
        base64_encode($decodedReceipt),
        $imageInfo['mime'],
        preg_replace('/[^A-Za-z0-9._-]+/', '-', $receiptName ?: 'receipt-photo'),
    ];
}

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
    $sql = "SELECT id, date, description, part_number, quantity, unit, unit_price,
                cost, logged_by, receipt_photo_name,
                CASE WHEN receipt_photo_data IS NOT NULL AND receipt_photo_data <> ''
                     THEN 1 ELSE 0 END AS has_receipt,
                created_at
         FROM usage_logs
         WHERE customer_id = ? AND machine_id = ? AND category = 'SPARE_PART'";
    $params = [$customerId, $machineId];
    if ($from !== null) { $sql .= ' AND date >= ?'; $params[] = $from; }
    if ($to !== null) { $sql .= ' AND date <= ?'; $params[] = $to; }
    $sql .= ' ORDER BY date DESC, created_at DESC';
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
// ---- Saved emails (boss / management team) for quick report sharing --------
if ($sub === 'saved-emails' && $method === 'GET') {
    $stmt = db()->prepare('SELECT id, label, email FROM customer_saved_emails WHERE customer_id = ? ORDER BY label ASC');
    $stmt->execute([$customer['id']]);
    json_out($stmt->fetchAll());
}

if ($sub === 'saved-emails' && $method === 'POST') {
    require_customer_write_access($customer);
    $b = body();
    $label = trim((string)($b['label'] ?? ''));
    $email = trim((string)($b['email'] ?? ''));
    if ($label === '') json_error('Enter a label, e.g. "Boss" or "Management Team".');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid email address.');
    $newId = uuid();
    db()->prepare('INSERT INTO customer_saved_emails (id, customer_id, label, email, created_at) VALUES (?,?,?,?,NOW())')
        ->execute([$newId, $customer['id'], $label, $email]);
    json_out(['id' => $newId, 'label' => $label, 'email' => $email], 201);
}

if ($sub === 'saved-emails' && $sub2 && $method === 'DELETE') {
    require_customer_write_access($customer);
    db()->prepare('DELETE FROM customer_saved_emails WHERE id = ? AND customer_id = ?')->execute([$sub2, $customer['id']]);
    json_out(null, 204);
}

// ---- Email a report to the customer's boss / management team ---------------
if ($sub === 'email-report' && $method === 'POST') {
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
        'SELECT id, name, email, phone, portal_link
         FROM customers WHERE id = ? AND deleted_at IS NULL AND is_active = 1'
    );
    $stmt->execute([$customer['id']]);
    $profile = $stmt->fetch();
    if ($profile) $profile['portalUrl'] = customer_portal_url($profile['portal_link']);
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

    json_out([
        'machines' => [
            'total' => (int)$machineStats['total'],
            'green' => (int)$machineStats['green'],
            'yellow' => (int)$machineStats['yellow'],
            'red' => (int)$machineStats['red'],
        ],
        'serviceRequests' => [
            'total' => (int)$requestStats['total'],
            'open' => (int)$requestStats['open'],
        ],
        'machineExpensesTotal' => $totalExpenses,
        'pettyCashTotal' => $totalPettyCash,
        'checklistReportsCount' => $totalReports,
        'invoices' => [
            'total' => (float)$invoiceStats['total'],
            'outstanding' => (float)$invoiceStats['outstanding'],
        ],
    ]);
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
            [$receiptData, $receiptMime, $receiptName] = validate_receipt_upload($receiptPhoto, $receiptName);
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
                'downloadUrl' => "/api/customer-portal/machine-expenses/{$machineId}/receipt?expenseId={$row['id']}",
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
                '%s | Part: %s | Qty: %s %s | Unit: %s | Total: TZS %s | Receipt: %s',
                display_date($expense['date']),
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
// ---- Machine Operators (roster) — managed by owner or Machine Admin -------
if ($sub === 'machine-operators' && $sub2 && $method === 'GET') {
    $machineId = $sub2;
    $stmt = db()->prepare('SELECT 1 FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL');
    $stmt->execute([$machineId, $customer['id']]);
    if (!$stmt->fetch()) json_error('Machine not found for this customer.', 404);

    $stmt = db()->prepare('SELECT id, name, contact, created_at FROM machine_operators WHERE machine_id = ? ORDER BY name ASC');
    $stmt->execute([$machineId]);
    json_out($stmt->fetchAll());
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
    if ($name === '') json_error('Operator name is required.');
    if ($contact === '') json_error('Operator contact (phone) is required.');

    $newId = uuid();
    db()->prepare('INSERT INTO machine_operators (id, machine_id, customer_id, name, contact, created_at) VALUES (?,?,?,?,?,NOW())')
        ->execute([$newId, $machineId, $customer['id'], $name, $contact]);
    log_customer_activity($customer, "Added \"$name\" to the Machine Operator roster.");
    json_out(['id' => $newId, 'name' => $name, 'contact' => $contact], 201);
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
// Any operator (or owner/admin) can report a problem. Visible to the
// customer's own Machine Admin/owner, and to BELM engineer/technician staff
// on the admin side.
if ($sub === 'operator-reports' && $sub2 && $method === 'GET') {
    $machineId = $sub2;
    $stmt = db()->prepare('SELECT 1 FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL');
    $stmt->execute([$machineId, $customer['id']]);
    if (!$stmt->fetch()) json_error('Machine not found for this customer.', 404);

    $stmt = db()->prepare(
        'SELECT id, operator_name, operator_contact, message, status, created_at, resolved_at
         FROM operator_reports WHERE machine_id = ? ORDER BY created_at DESC'
    );
    $stmt->execute([$machineId]);
    json_out($stmt->fetchAll());
}

if ($sub === 'operator-reports' && $sub2 && $method === 'POST') {
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

    $newId = uuid();
    db()->prepare(
        'INSERT INTO operator_reports
            (id, machine_id, customer_id, operator_id, operator_name, operator_contact, message, status, created_at)
         VALUES (?,?,?,?,?,?,?,\'OPEN\',NOW())'
    )->execute([
        $newId, $machineId, $customer['id'],
        $operatorId !== '' ? $operatorId : null,
        $operatorName, $operatorContact, $message,
    ]);
    json_out(['id' => $newId, 'message' => 'Problem reported successfully. BELM has been notified.'], 201);
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
    $byRole = ['admin' => 0, 'assistant' => 0, 'accounts' => 0, 'operator' => 0];
    $totalByRole = ['admin' => 0, 'assistant' => 0, 'accounts' => 0, 'operator' => 0];
    foreach ($rows as $row) {
        if (isset($byRole[$row['role']])) {
            $byRole[$row['role']] = (int)$row['active_count'];
            $totalByRole[$row['role']] = (int)$row['total_count'];
        }
    }
    $machineStmt = db()->prepare(
        'SELECT COUNT(*) FROM machine_operators mo
         JOIN machines m ON m.id = mo.machine_id
         WHERE mo.customer_id = ? AND m.deleted_at IS NULL'
    );
    $machineStmt->execute([$customer['id']]);
    $machineOperatorCount = (int)$machineStmt->fetchColumn();

    json_out([
        'departments' => [
            ['key' => 'admin', 'label' => 'Machinery Admin', 'active' => $byRole['admin'], 'total' => $totalByRole['admin']],
            ['key' => 'assistant', 'label' => 'Machinery Admin Assistant', 'active' => $byRole['assistant'], 'total' => $totalByRole['assistant']],
            ['key' => 'accounts', 'label' => 'Accounts', 'active' => $byRole['accounts'], 'total' => $totalByRole['accounts']],
            ['key' => 'operator', 'label' => 'Machine Operator (portal login)', 'active' => $byRole['operator'], 'total' => $totalByRole['operator']],
        ],
        'machineOperatorRosterCount' => $machineOperatorCount,
        'totalUsers' => array_sum($totalByRole),
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

if ($sub === 'users' && $method === 'GET') {
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

if ($sub === 'users' && $method === 'POST') {
    require_customer_owner_or_admin($customer);
    $b = body();
    $name = trim((string)($b['name'] ?? ''));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $password = (string)($b['password'] ?? '');
    $phone = trim((string)($b['phone'] ?? ''));
    $role = strtolower(trim((string)($b['role'] ?? 'operator')));
    $permissionsJson = customer_permissions_from_body($b);

    if ($name === '') json_error('Assistant name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid assistant email address.');
    if (strlen($password) < 8) json_error('Assistant password must contain at least 8 characters.');
    if (!in_array($role, ['admin', 'assistant', 'accounts', 'operator'], true)) json_error('Assistant role must be Admin, Assistant, Accounts or Operator.');

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
         (id, customer_id, name, email, password, recovery_code_hash, phone, role, is_active, permissions, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,NOW())'
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
        'recoveryCode' => $recoveryCode,
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
    $newPassword = (string)($b['password'] ?? '');
    $permissionsJson = array_key_exists('permissions', $b)
        ? customer_permissions_from_body($b)
        : $existing['permissions'];

    if ($name === '') json_error('Assistant name is required.');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid assistant email address.');
    if (!in_array($role, ['admin', 'assistant', 'accounts', 'operator'], true)) json_error('Assistant role must be Admin, Assistant, Accounts or Operator.');
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
             SET name=?, email=?, phone=?, role=?, is_active=?, password=?, recovery_code_hash=?, permissions=?
             WHERE id=? AND customer_id=?'
        )->execute([
            $name,
            $email,
            $phone !== '' ? $phone : null,
            $role,
            $isActive,
            password_hash($newPassword, PASSWORD_BCRYPT),
            password_hash($recoveryCode, PASSWORD_BCRYPT),
            $permissionsJson,
            $sub2,
            $customer['id'],
        ]);
    } else {
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
    }
    json_out([
        'ok' => true,
        'recoveryCode' => $newPassword !== '' ? $recoveryCode : null,
    ]);
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

// ---- Service requests -------------------------------------------------------
if ($sub === 'service-requests' && $method === 'GET') {
    $stmt = db()->prepare(
        'SELECT sr.*, m.model AS machine_model, m.machine_type,
                cu.name AS completed_by_name, xu.name AS cancelled_by_name,
                au.name AS assigned_to_name
         FROM service_requests sr
         LEFT JOIN machines m ON m.id = sr.machine_id
         LEFT JOIN users cu ON cu.id = sr.completed_by_id
         LEFT JOIN users xu ON xu.id = sr.cancelled_by_id
         LEFT JOIN users au ON au.id = sr.assigned_to_id
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
        $request['completedBy'] = $request['completed_by_id'] ? ['name' => $request['completed_by_name']] : null;
        $request['completedAt'] = $request['completed_at'];
        $request['cancelledBy'] = $request['cancelled_by_id'] ? ['name' => $request['cancelled_by_name']] : null;
        $request['cancelledAt'] = $request['cancelled_at'];
        $request['assignedTo'] = $request['assigned_to_id'] ? ['name' => $request['assigned_to_name']] : null;
        $request['serviceParts'] = customer_request_service_parts($request['id']);
        unset($request['machine_model'], $request['machine_type'], $request['completed_by_name'], $request['cancelled_by_name'], $request['assigned_to_name']);
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
        $pdo->prepare(
            'INSERT INTO service_request_history
             (id, request_id, event_type, from_value, to_value, actor_id, actor_name, created_at)
             VALUES (?,?,?,?,?,?,?,NOW())'
        )->execute([uuid(), $newId, 'OPENED', null, 'OPEN', null, trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer'))]);
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
    // Notify the company inbox by email (best-effort — a failed email
    // must never block the customer's request from being saved).
    try {
        $company = belm_get_company_details();
        $adminEmail = trim((string)($company['companyEmail'] ?? ''));
        if ($adminEmail !== '') {
            $machineLabel = $machineId !== '' ? " for machine ID $machineId" : '';
            send_email(
                $adminEmail,
                'New Service Request — ' . ($customer['name'] ?? 'Customer'),
                "A new service request was submitted$machineLabel.\n\n"
                . "Customer: " . ($customer['name'] ?? 'Unknown') . "\n"
                . "Submitted by: " . trim((string)($customer['actorName'] ?? $customer['name'] ?? 'Customer')) . "\n"
                . "Priority: $priority\n"
                . "Service type: " . ($serviceType ?: 'Not specified') . "\n\n"
                . "Description:\n$description\n\n"
                . "Open the Service Requests page in BELM Portal to review and assign this."
            );
        }
    } catch (Throwable $error) { /* notification only — never block the request itself */ }
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
    $stmt = db()->query('SELECT id, part_number, reference_number, name, category, stock_qty FROM spare_parts WHERE deleted_at IS NULL ORDER BY name ASC');
    json_out($stmt->fetchAll());
}

// ---- Request spare parts ----------------------------------------------------
// Either sparePartId (pick from BELM's live inventory) OR referenceNumber +
// description (a custom part not yet in inventory) must be provided.
if ($sub === 'spare-part-requests' && $method === 'POST') {
    require_customer_write_access($customer);
    $b = body();
    $sparePartId = trim((string)($b['sparePartId'] ?? ''));
    $referenceNumber = trim((string)($b['referenceNumber'] ?? ''));
    $description = trim((string)($b['description'] ?? ''));
    $serviceRequestId = trim((string)($b['serviceRequestId'] ?? ''));
    $machineId = trim((string)($b['machineId'] ?? ''));
    $quantity = (float)($b['quantity'] ?? 0);
    if ($quantity <= 0 || floor($quantity) !== $quantity) {
        json_error('Spare-part quantity must be a whole number greater than zero.');
    }

    if ($sparePartId !== '') {
        $stmt = db()->prepare('SELECT 1 FROM spare_parts WHERE id = ? AND deleted_at IS NULL');
        $stmt->execute([$sparePartId]);
        if (!$stmt->fetch()) json_error('Spare part not found.', 404);
    } elseif ($referenceNumber === '' && $description === '') {
        json_error('Select a spare part from inventory, or enter a reference number / description for a custom part.');
    } else {
        // Customer typed a reference number instead of picking from the
        // dropdown — try to match it against Spare Parts Inventory (by
        // reference number or part number) so Inventory/Billing see this
        // request as already synced with stock and pricing, instead of
        // treating it as a brand-new custom part.
        if ($referenceNumber !== '') {
            $matchStmt = db()->prepare(
                'SELECT id FROM spare_parts
                 WHERE deleted_at IS NULL
                   AND (UPPER(reference_number) = UPPER(?) OR UPPER(part_number) = UPPER(?))
                 LIMIT 1'
            );
            $matchStmt->execute([$referenceNumber, $referenceNumber]);
            $matchedId = $matchStmt->fetchColumn();
            if ($matchedId) $sparePartId = $matchedId;
        }
    }

    if ($serviceRequestId !== '') {
        $stmt = db()->prepare('SELECT 1 FROM service_requests WHERE id = ? AND customer_id = ?');
        $stmt->execute([$serviceRequestId, $customer['id']]);
        if (!$stmt->fetch()) json_error('Service request not found for this customer.', 404);
    }
    if ($machineId !== '') {
        $stmt = db()->prepare('SELECT 1 FROM machines WHERE id = ? AND customer_id = ? AND deleted_at IS NULL');
        $stmt->execute([$machineId, $customer['id']]);
        if (!$stmt->fetch()) json_error('Machine not found for this customer.', 404);
    }

    $newId = uuid();
    db()->prepare(
        "INSERT INTO spare_part_requests
            (id, spare_part_id, reference_number, description, request_id, machine_id, quantity, status, created_at)
         VALUES (?,?,?,?,?,?,?,'PENDING',NOW())"
    )->execute([
        $newId,
        $sparePartId !== '' ? $sparePartId : null,
        $referenceNumber !== '' ? $referenceNumber : null,
        $description !== '' ? $description : null,
        $serviceRequestId !== '' ? $serviceRequestId : null,
        $machineId !== '' ? $machineId : null,
        (int)$quantity,
    ]);
    json_out(['id' => $newId], 201);
}

// ---- Download a checklist report (JSON for now — swap in a real PDF
// generator such as dompdf/mpdf if you want a byte-for-byte PDF file) -----
// Returns the report as JSON for the "View Checked Report" modal. Kept
// separate from /download (which returns a PDF file) — these serve two
// different purposes and must not share a URL.
if ($sub === 'reports' && $sub2 && $sub3 === 'view' && $method === 'GET') {
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
    foreach ($answers as $answer) {
        $displayValue = $answer['value'];
        $isImageValue = $displayValue !== '' && str_starts_with((string)$displayValue, 'data:image/');
        $photo = checklist_report_decode_photo($answer['photoUrl'] ?: ($isImageValue ? $displayValue : null));
        if ($photo) $photos[] = ['label' => $answer['label'], 'photo' => $photo];
        $levelSuffix = strtoupper((string)$answer['safetyLevel']) === 'NONE' ? '' : ' [' . $answer['safetyLevel'] . ']';
        $noteSuffix = trim((string)($answer['note'] ?? '')) !== '' ? ' -- Issue: ' . trim((string)$answer['note']) : '';
        $lines[] = sprintf(
            '%s: %s%s%s%s',
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

// V150 Customer Workshop workspace: customer-managed technicians and internal jobs.
if ($sub === 'workshop' && $sub2 === 'overview' && $method === 'GET') {
    $cid=$customer['id'];
    $contract=db()->prepare("SELECT * FROM customer_contracts WHERE customer_id=? AND status='ACTIVE' AND end_date>=CURRENT_DATE ORDER BY end_date LIMIT 1");$contract->execute([$cid]);
    $counts=[];
    foreach(['sites'=>'customer_sites','staff'=>'customer_workshop_staff','orders'=>'workshop_work_orders'] as $key=>$table){$q=db()->prepare("SELECT COUNT(*) FROM $table WHERE customer_id=?".($key==='orders'?" AND status NOT IN ('COMPLETED','CANCELLED')":""));$q->execute([$cid]);$counts[$key]=(int)$q->fetchColumn();}
    $q=db()->prepare("SELECT COUNT(*) FROM machines WHERE customer_id=? AND deleted_at IS NULL");$q->execute([$cid]);$counts['machines']=(int)$q->fetchColumn();
    json_out(['contract'=>$contract->fetch()?:null,'counts'=>$counts]);
}
if ($sub === 'workshop' && $sub2 === 'sites') {
    if($method==='GET'){ $q=db()->prepare('SELECT * FROM customer_sites WHERE customer_id=? AND is_active=1 ORDER BY name');$q->execute([$customer['id']]);json_out($q->fetchAll()); }
    if($method==='POST'){ require_customer_write_access($customer);$b=body();$name=trim((string)($b['name']??''));if(!$name)json_error('Site/workshop name is required.');$id=uuid();db()->prepare('INSERT INTO customer_sites(id,customer_id,name,location,site_type) VALUES(?,?,?,?,?)')->execute([$id,$customer['id'],$name,$b['location']??null,$b['siteType']??'WORKSHOP']);log_customer_activity($customer,"Created workshop/site $name.");json_out(['id'=>$id],201); }
}
if ($sub === 'workshop' && $sub2 === 'staff') {
    if($method==='GET'){ $q=db()->prepare('SELECT ws.*,cs.name site_name FROM customer_workshop_staff ws LEFT JOIN customer_sites cs ON cs.id=ws.site_id WHERE ws.customer_id=? AND ws.is_active=1 ORDER BY ws.name');$q->execute([$customer['id']]);json_out($q->fetchAll()); }
    if($method==='POST'){ require_customer_write_access($customer);$b=body();$name=trim((string)($b['name']??''));if(!$name)json_error('Employee name is required.');$id=uuid();db()->prepare('INSERT INTO customer_workshop_staff(id,customer_id,site_id,name,phone,email,role,specialty) VALUES(?,?,?,?,?,?,?,?)')->execute([$id,$customer['id'],$b['siteId']??null,$name,$b['phone']??null,$b['email']??null,$b['role']??'TECHNICIAN',$b['specialty']??null]);log_customer_activity($customer,"Added workshop employee $name.");json_out(['id'=>$id],201); }
}
if ($sub === 'workshop' && $sub2 === 'orders') {
    if($method==='GET'){ $q=db()->prepare('SELECT wo.*,m.model machine_model,cs.name site_name,ws.name assigned_customer_staff_name FROM workshop_work_orders wo LEFT JOIN machines m ON m.id=wo.machine_id LEFT JOIN customer_sites cs ON cs.id=wo.site_id LEFT JOIN customer_workshop_staff ws ON ws.id=wo.assigned_customer_staff_id WHERE wo.customer_id=? ORDER BY wo.created_at DESC');$q->execute([$customer['id']]);json_out($q->fetchAll()); }
    if($method==='POST' && !$sub3){ require_customer_write_access($customer);$b=body();$title=trim((string)($b['title']??''));$desc=trim((string)($b['description']??''));if(!$title||!$desc)json_error('Title and description are required.');$machine=$b['machineId']??null;if($machine){$v=db()->prepare('SELECT 1 FROM machines WHERE id=? AND customer_id=? AND deleted_at IS NULL');$v->execute([$machine,$customer['id']]);if(!$v->fetch())json_error('Machine not found.',404);} $contract=db()->prepare("SELECT id FROM customer_contracts WHERE customer_id=? AND status='ACTIVE' AND end_date>=CURRENT_DATE ORDER BY end_date LIMIT 1");$contract->execute([$customer['id']]);$contractId=$contract->fetchColumn()?:null;$id=uuid();$number='WO-'.date('ymd').'-'.strtoupper(substr(str_replace('-','',$id),0,6));db()->prepare('INSERT INTO workshop_work_orders(id,work_order_number,customer_id,contract_id,site_id,machine_id,assigned_customer_staff_id,job_type,title,description,priority,status,created_by_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([$id,$number,$customer['id'],$contractId,$b['siteId']??null,$machine,$b['assignedStaffId']??null,$b['jobType']??'BREAKDOWN_REPAIR',$title,$desc,$b['priority']??'NORMAL','OPEN',$customer['actorName']??$customer['name']]);db()->prepare('INSERT INTO workshop_work_order_history(id,work_order_id,event_type,to_value,actor_name,note) VALUES(?,?,?,?,?,?)')->execute([uuid(),$id,'OPENED','OPEN',$customer['actorName']??$customer['name'],'Internal workshop work order opened']);log_customer_activity($customer,"Opened workshop work order $number.");json_out(['id'=>$id,'workOrderNumber'=>$number],201); }
    if($method==='POST' && $sub3 && $sub4==='escalate'){ require_customer_write_access($customer); $id=$sub3; $q=db()->prepare('SELECT * FROM workshop_work_orders WHERE id=? AND customer_id=?');$q->execute([$id,$customer['id']]);$wo=$q->fetch();if(!$wo)json_error('Work order not found.',404);if($wo['belm_service_request_id'])json_error('Already escalated to BELM.');$sr=uuid();$pdo=db();$pdo->beginTransaction();try{$pdo->prepare("INSERT INTO service_requests(id,customer_id,machine_id,service_type,description,status,priority,origin,created_at,updated_at) VALUES(?,?,?,?,?,'OPEN',?,'CUSTOMER_WORKSHOP',NOW(),NOW())")->execute([$sr,$customer['id'],$wo['machine_id'],$wo['job_type'],'Workshop escalation '.$wo['work_order_number'].': '.$wo['description'],$wo['priority']]);$pdo->prepare("UPDATE workshop_work_orders SET status='ESCALATED_TO_BELM',belm_service_request_id=?,updated_at=NOW() WHERE id=?")->execute([$sr,$id]);$pdo->prepare('INSERT INTO workshop_work_order_history(id,work_order_id,event_type,from_value,to_value,actor_name,note) VALUES(?,?,?,?,?,?,?)')->execute([uuid(),$id,'ESCALATED',$wo['status'],'ESCALATED_TO_BELM',$customer['actorName']??$customer['name'],'Escalated to BELM']);$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}log_customer_activity($customer,"Escalated workshop work order {$wo['work_order_number']} to BELM.");json_out(['ok'=>true,'serviceRequestId'=>$sr]); }
}

json_error('Unknown request', 404);

