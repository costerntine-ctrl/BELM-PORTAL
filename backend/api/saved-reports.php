<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

require_page_access($user, 'reports');

if ($method === 'GET' && $action === 'list') {
    // List saved reports
    $type = $_GET['type'] ?? '';
    $role = $_GET['role'] ?? '';
    $limit = (int)($_GET['limit'] ?? 20);
    $offset = (int)($_GET['offset'] ?? 0);

    if ($limit > 100) $limit = 100;
    if ($offset < 0) $offset = 0;

    $db = get_db();

    // Build query based on user role
    $query = "SELECT id, report_title, report_type, file_format, file_size, role_name, created_at, report_date_from, report_date_to FROM saved_reports WHERE 1=1";
    $params = [];

    // Restrict based on user access
    $isAdmin = in_array('super_admin', $user['roles'] ?? []) || in_array('system_coordinator', $user['roles'] ?? []);
    $isCustomer = isset($user['assigned_customer_id']);

    if ($isCustomer) {
        $query .= " AND customer_id = ?";
        $params[] = $user['assigned_customer_id'];
    } else if (!$isAdmin) {
        // Regular BELM staff can only see their own reports
        $query .= " AND user_id = ?";
        $params[] = $user['id'];
    }

    if ($type) {
        $query .= " AND report_type = ?";
        $params[] = $type;
    }

    if ($role) {
        $query .= " AND role_name = ?";
        $params[] = $role;
    }

    $query .= " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    $params[] = $limit;
    $params[] = $offset;

    try {
        $result = $db->prepare($query)->execute($params);
        $reports = [];

        while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
            $reports[] = [
                'id' => $row['id'],
                'title' => $row['report_title'],
                'type' => $row['report_type'],
                'format' => $row['file_format'],
                'size' => $row['file_size'],
                'role' => $row['role_name'],
                'dateFrom' => $row['report_date_from'],
                'dateTo' => $row['report_date_to'],
                'createdAt' => $row['created_at'],
                'downloadUrl' => '/api/saved-reports.php?action=download&id=' . urlencode($row['id'])
            ];
        }

        json_response([
            'success' => true,
            'reports' => $reports,
            'count' => count($reports),
            'limit' => $limit,
            'offset' => $offset
        ]);

    } catch (Exception $e) {
        json_error('Database error: ' . $e->getMessage(), 500);
    }

} else if ($method === 'GET' && $action === 'download') {
    // Download saved report
    $reportId = $_GET['id'] ?? '';

    if (!$reportId) {
        json_error('Report ID is required', 400);
    }

    $db = get_db();

    try {
        $result = $db->prepare("
            SELECT id, file_data, file_format, report_title, user_id, customer_id
            FROM saved_reports
            WHERE id = ?
            LIMIT 1
        ")->execute([$reportId]);

        $report = $result->fetchArray(SQLITE3_ASSOC);

        if (!$report) {
            json_error('Report not found', 404);
        }

        // Check access permissions
        $isAdmin = in_array('super_admin', $user['roles'] ?? []) || in_array('system_coordinator', $user['roles'] ?? []);
        $isOwner = $report['user_id'] === $user['id'];
        $isCustomerAccess = isset($user['assigned_customer_id']) && $report['customer_id'] === $user['assigned_customer_id'];

        if (!($isAdmin || $isOwner || $isCustomerAccess)) {
            json_error('Access denied', 403);
        }

        // Log download
        activity_log($user['id'], 'download_report', 'saved_reports', $reportId, [
            'title' => $report['report_title']
        ]);

        // Stream file
        $filename = preg_replace('/[^a-z0-9-]/i', '-', strtolower($report['report_title']));
        $filename = substr($filename, 0, 100) . '.' . $report['file_format'];

        header('Content-Type: ' . ($report['file_format'] === 'pdf' ? 'application/pdf' : 'text/csv'));
        header('Content-Length: ' . strlen($report['file_data']));
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');
        header('Expires: 0');

        echo $report['file_data'];

    } catch (Exception $e) {
        json_error('Database error: ' . $e->getMessage(), 500);
    }

} else if ($method === 'DELETE') {
    // Delete saved report
    $reportId = $_GET['id'] ?? '';

    if (!$reportId) {
        json_error('Report ID is required', 400);
    }

    $db = get_db();

    try {
        $result = $db->prepare("
            SELECT user_id, customer_id, report_title
            FROM saved_reports
            WHERE id = ?
            LIMIT 1
        ")->execute([$reportId]);

        $report = $result->fetchArray(SQLITE3_ASSOC);

        if (!$report) {
            json_error('Report not found', 404);
        }

        // Check permissions
        $isAdmin = in_array('super_admin', $user['roles'] ?? []) || in_array('system_coordinator', $user['roles'] ?? []);
        $isOwner = $report['user_id'] === $user['id'];

        if (!($isAdmin || $isOwner)) {
            json_error('Access denied', 403);
        }

        // Delete
        $db->prepare("DELETE FROM saved_reports WHERE id = ?")->execute([$reportId]);

        activity_log($user['id'], 'delete_report', 'saved_reports', $reportId, [
            'title' => $report['report_title']
        ]);

        json_response([
            'success' => true,
            'message' => 'Report deleted successfully'
        ]);

    } catch (Exception $e) {
        json_error('Database error: ' . $e->getMessage(), 500);
    }

} else {
    json_error('Invalid action or method', 400);
}
?>
