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

$title = trim((string)($data['title'] ?? ''));
$type = trim((string)($data['type'] ?? ''));
$format = strtolower(trim((string)($data['format'] ?? '')));
$dateFrom = trim((string)($data['dateFrom'] ?? ''));
$dateTo = trim((string)($data['dateTo'] ?? ''));
$fileData = is_string($data['fileData'] ?? null) ? $data['fileData'] : '';
$roleName = trim((string)($data['roleName'] ?? ''));
$effectiveRole = belm_report_role_key($user);
$submittedRole = strtolower(trim($roleName));
$submittedAliases = [
    'admin' => 'super_admin',
    'belm_admin' => 'super_admin',
    'super_admin' => 'super_admin',
    'customer' => 'customer_admin',
    'owner' => 'customer_admin',
    'customer_admin' => 'customer_admin',
    'finance' => 'finance_accounts',
    'accounts' => 'finance_accounts',
];
$submittedRoleKey = $submittedAliases[$submittedRole] ?? $submittedRole;
$isGeneralRole = in_array($submittedRole, ['general', 'general_report', 'general report'], true);
if (!$isGeneralRole && $submittedRoleKey !== strtolower($effectiveRole)) {
    json_error('You can only save reports belonging to your own role.', 403);
}
if ($isGeneralRole) {
    require_general_report_access($user);
    $roleName = 'general';
} else {
    $roleName = $effectiveRole;
}

// Validate inputs
if (!$title) {
    json_error('Report title is required', 422);
}
if (!$type) {
    json_error('Report type is required', 422);
}
if (!in_array($format, ['pdf', 'csv'], true)) {
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
foreach (['dateFrom' => $dateFrom, 'dateTo' => $dateTo] as $label => $value) {
    if ($value === '') continue;
    $parsed = DateTime::createFromFormat('!Y-m-d', $value);
    $errors = DateTime::getLastErrors();
    $clean = $parsed instanceof DateTime && $parsed->format('Y-m-d') === $value
        && (!$errors || ($errors['warning_count'] === 0 && $errors['error_count'] === 0));
    if (!$clean) json_error('Invalid ' . $label . ' format. Use a real date as YYYY-MM-DD.', 422);
    if ($label === 'dateFrom') $dateFromVal = $value; else $dateToVal = $value;
}
if ($dateFromVal !== null && $dateToVal !== null && $dateFromVal > $dateToVal) {
    json_error('dateFrom cannot be after dateTo.', 422);
}

// Get database connection
$db = db();

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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, decode(?, 'base64'), ?, ?, NOW(), NOW())
    ")->execute([
        $reportId,
        $user['id'],
        $user['assignedCustomerId'] ?? $user['assigned_customer_id'] ?? null,
        $title,
        $type,
        $dateFromVal,
        $dateToVal,
        $roleName,
        $format,
        $fileSize,
        base64_encode($binaryData),
        $fileHash,
        $metadata
    ]);

    if (!$result) {
        json_error('Failed to save report', 500);
    }

    // Log activity
    log_activity($user, 'save_report', 'saved_reports', $reportId, [
        'title' => $title,
        'type' => $type,
        'format' => $format,
        'size' => $fileSize
    ]);

    json_out([
        'success' => true,
        'reportId' => $reportId,
        'message' => 'Report saved successfully',
        'timestamp' => date('c')
    ]);

} catch (Throwable $e) {
    json_error('Database error while saving report.', 500);
}
?>
