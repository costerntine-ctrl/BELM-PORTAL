<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];

require_page_access($user, 'reports');

if ($method !== 'POST') {
    json_error('POST only', 405);
}

// Get JSON payload
$data = json_decode(file_get_contents('php://input'), true);

if (!$data) {
    json_error('Invalid JSON payload', 400);
}

$title = trim($data['title'] ?? '');
$type = trim($data['type'] ?? '');
$format = trim($data['format'] ?? '');
$dateFrom = trim($data['dateFrom'] ?? '');
$dateTo = trim($data['dateTo'] ?? '');
$fileData = $data['fileData'] ?? '';
$roleName = trim($data['roleName'] ?? '');

// Validate inputs
if (!$title) {
    json_error('Report title is required', 422);
}
if (!$type) {
    json_error('Report type is required', 422);
}
if (!in_array($format, ['pdf', 'csv'])) {
    json_error('Invalid file format. Must be pdf or csv.', 422);
}
if (!$fileData) {
    json_error('File data is required', 422);
}
if (!$roleName) {
    json_error('Role name is required', 422);
}

// Decode base64 file data
$binaryData = base64_decode($fileData, true);
if ($binaryData === false) {
    json_error('Invalid base64 file data', 422);
}

$fileSize = strlen($binaryData);
if ($fileSize === 0) {
    json_error('File data is empty', 422);
}
if ($fileSize > 50 * 1024 * 1024) { // 50MB limit
    json_error('File size exceeds 50MB limit', 413);
}

// Validate date range
$dateFromVal = null;
$dateToVal = null;
if (!empty($dateFrom)) {
    $dateFromVal = date_parse_from_format('Y-m-d', $dateFrom);
    if (!$dateFromVal || $dateFromVal['error_count'] > 0) {
        json_error('Invalid dateFrom format. Use YYYY-MM-DD.', 422);
    }
    $dateFromVal = $dateFrom;
}
if (!empty($dateTo)) {
    $dateToVal = date_parse_from_format('Y-m-d', $dateTo);
    if (!$dateToVal || $dateToVal['error_count'] > 0) {
        json_error('Invalid dateTo format. Use YYYY-MM-DD.', 422);
    }
    $dateToVal = $dateTo;
}

// Get database connection
$db = get_db();

// Generate hash for deduplication
$fileHash = hash('sha256', $binaryData);

// Prepare metadata
$metadata = json_encode([
    'user_name' => $user['name'],
    'page' => $_SERVER['HTTP_REFERER'] ?? '',
]);

// Generate ID
$reportId = uuid();

try {
    $result = $db->prepare("
        INSERT INTO saved_reports (
            id, user_id, customer_id, report_title, report_type,
            report_date_from, report_date_to, role_name, file_format,
            file_size, file_data, file_hash, metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    ")->execute([
        $reportId,
        $user['id'],
        $user['assigned_customer_id'] ?? null,
        $title,
        $type,
        $dateFromVal,
        $dateToVal,
        $roleName,
        $format,
        $fileSize,
        $binaryData,
        $fileHash,
        $metadata
    ]);

    if (!$result) {
        json_error('Failed to save report', 500);
    }

    // Log activity
    activity_log($user['id'], 'save_report', 'saved_reports', $reportId, [
        'title' => $title,
        'type' => $type,
        'format' => $format,
        'size' => $fileSize
    ]);

    json_response([
        'success' => true,
        'reportId' => $reportId,
        'message' => 'Report saved successfully',
        'timestamp' => date('c')
    ]);

} catch (Exception $e) {
    json_error('Database error: ' . $e->getMessage(), 500);
}
?>
