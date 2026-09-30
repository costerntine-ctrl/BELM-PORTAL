<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'list';

require_page_access($user, 'reports');

$roleKey = belm_report_role_key($user);
$canGeneral = belm_can_view_general_report($user);
$isCustomer = ($user['type'] ?? '') === 'customer';

// Saved reports are role-scoped. A report marked as GENERAL is visible only
// to BELM Admin (Super Admin) and Customer (owner/admin). Other roles can only
// access reports saved for their own role. Customer assistants are additionally
// isolated to their own customer's reports.
function saved_report_scope_sql(array $user, string $roleKey, bool $canGeneral, bool $isCustomer, array &$params): string {
    $clauses = [];
    if ($isCustomer) {
        $clauses[] = 'customer_id = ?';
        $params[] = $user['id'];
        // Customer owner/admin can see customer-role and general reports.
        $clauses[] = "(role_name = ? OR (LOWER(role_name) IN ('general','general_report','general report') AND ? = TRUE))";
        $params[] = $roleKey;
        $params[] = $canGeneral;
    } else {
        $clauses[] = '(role_name = ? OR (LOWER(role_name) IN (\'general\',\'general_report\',\'general report\') AND ? = TRUE))';
        $params[] = $roleKey;
        $params[] = $canGeneral;
    }
    return implode(' AND ', $clauses);
}

if ($method === 'GET' && $action === 'list') {
    $type = trim((string)($_GET['type'] ?? ''));
    $role = trim((string)($_GET['role'] ?? ''));
    $limit = min(100, max(1, (int)($_GET['limit'] ?? 20)));
    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $params = [];

    $query = "SELECT id, report_title, report_type, file_format, file_size, role_name, created_at, report_date_from, report_date_to
              FROM saved_reports WHERE " . saved_report_scope_sql($user, $roleKey, $canGeneral, $isCustomer, $params);

    if ($type !== '') { $query .= ' AND report_type = ?'; $params[] = $type; }
    if ($role !== '') {
        // Never let a caller use ?role= to escape the effective role scope.
        $allowedRoleFilter = strtolower($role) === 'general' || strtolower($role) === 'general_report' || strtolower($role) === 'general report';
        if ($allowedRoleFilter && $canGeneral) {
            $query .= " AND LOWER(role_name) IN ('general','general_report','general report')";
        } elseif ($role === $roleKey) {
            $query .= ' AND role_name = ?'; $params[] = $role;
        } else {
            json_out(['success'=>true,'reports'=>[],'count'=>0,'limit'=>$limit,'offset'=>$offset]);
        }
    }

    $query .= ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    $params[] = $limit;
    $params[] = $offset;

    try {
        $stmt = db()->prepare($query);
        $stmt->execute($params);
        $reports = [];
        foreach ($stmt->fetchAll() as $row) {
            $reports[] = [
                'id' => $row['id'],
                'title' => $row['report_title'],
                'type' => $row['report_type'],
                'format' => $row['file_format'],
                'size' => (int)$row['file_size'],
                'role' => $row['role_name'],
                'dateFrom' => $row['report_date_from'],
                'dateTo' => $row['report_date_to'],
                'createdAt' => $row['created_at'],
                'downloadUrl' => '/api/saved-reports.php?action=download&id=' . urlencode($row['id'])
            ];
        }
        json_out(['success'=>true,'reports'=>$reports,'count'=>count($reports),'limit'=>$limit,'offset'=>$offset]);
    } catch (Throwable $e) {
        json_error('Database error while loading saved reports.', 500);
    }
}

if ($method === 'GET' && $action === 'download') {
    $reportId = trim((string)($_GET['id'] ?? ''));
    if ($reportId === '') json_error('Report ID is required', 400);

    try {
        $stmt = db()->prepare('SELECT id, file_data, file_format, report_title, user_id, customer_id, role_name FROM saved_reports WHERE id = ? LIMIT 1');
        $stmt->execute([$reportId]);
        $report = $stmt->fetch();
        if (!$report) json_error('Report not found', 404);

        $reportRole = strtolower(trim((string)$report['role_name']));
        $isGeneral = in_array($reportRole, ['general','general_report','general report'], true);
        $sameCustomer = $isCustomer && (string)$report['customer_id'] === (string)$user['id'];
        $sameRole = $reportRole === strtolower($roleKey);
        if (!$sameRole && !($isGeneral && $canGeneral)) json_error('Access denied', 403);
        if ($isCustomer && !$sameCustomer) json_error('Access denied', 403);
        if (!$isCustomer && $report['customer_id'] !== null && (string)$report['customer_id'] !== '' && !$sameCustomer) {
            // BELM users may not download customer-owned saved reports unless
            // the report itself is explicitly assigned to their role.
            if (!$sameRole) json_error('Access denied', 403);
        }

        activity_log($user['id'], 'download_report', 'saved_reports', $reportId, ['title'=>$report['report_title']]);
        $ext = strtolower((string)$report['file_format']) === 'pdf' ? 'pdf' : 'csv';
        $filename = preg_replace('/[^a-z0-9-]/i', '-', strtolower((string)$report['report_title'])) ?: 'saved-report';
        $filename = substr($filename, 0, 100) . '.' . $ext;
        header('Content-Type: ' . ($ext === 'pdf' ? 'application/pdf' : 'text/csv'));
        header('Content-Length: ' . strlen((string)$report['file_data']));
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');
        header('Expires: 0');
        echo $report['file_data'];
        exit;
    } catch (Throwable $e) {
        json_error('Database error while downloading saved report.', 500);
    }
}

if ($method === 'DELETE') {
    $reportId = trim((string)($_GET['id'] ?? ''));
    if ($reportId === '') json_error('Report ID is required', 400);

    try {
        $stmt = db()->prepare('SELECT user_id, customer_id, report_title, role_name FROM saved_reports WHERE id = ? LIMIT 1');
        $stmt->execute([$reportId]);
        $report = $stmt->fetch();
        if (!$report) json_error('Report not found', 404);

        $reportRole = strtolower(trim((string)$report['role_name']));
        $sameRole = $reportRole === strtolower($roleKey);
        $isGeneral = in_array($reportRole, ['general','general_report','general report'], true);
        $sameCustomer = $isCustomer && (string)$report['customer_id'] === (string)$user['id'];
        if (!$sameRole && !($isGeneral && $canGeneral)) json_error('Access denied', 403);
        if ($isCustomer && !$sameCustomer) json_error('Access denied', 403);

        db()->prepare('DELETE FROM saved_reports WHERE id = ?')->execute([$reportId]);
        activity_log($user['id'], 'delete_report', 'saved_reports', $reportId, ['title'=>$report['report_title']]);
        json_out(['success'=>true,'message'=>'Report deleted successfully']);
    } catch (Throwable $e) {
        json_error('Database error while deleting saved report.', 500);
    }
}

json_error('Invalid action or method', 400);
