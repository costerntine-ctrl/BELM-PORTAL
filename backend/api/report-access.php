<?php
/**
 * V845: Report Access Configuration API
 *
 * Provides endpoints for viewing and managing role-based report access.
 * Only accessible to system administrators.
 */
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/../config/report-access.php';

$user = require_auth();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'config';

// Restrict access to super admin and system coordinator
$isAdmin = in_array('super_admin', $user['roles'] ?? []) || in_array('system_coordinator', $user['roles'] ?? []);
if (!$isAdmin) {
    json_error('Access denied - admin only', 403);
}

require_page_access($user, 'admin');

if ($method === 'GET' && $action === 'config') {
    // Get current report access configuration
    json_out([
        'config' => REPORT_ACCESS_CONFIG,
        'generalReports' => GENERAL_REPORTS,
        'restrictedReports' => ROLE_RESTRICTED_REPORTS,
    ]);
}

else if ($method === 'GET' && $action === 'accessible') {
    // Get accessible reports for a specific role
    $roleName = $_GET['role'] ?? '';

    if (!$roleName) {
        json_error('Role name is required', 400);
    }

    $accessible = REPORT_ACCESS_CONFIG[$roleName] ?? [];

    json_out([
        'role' => $roleName,
        'accessibleReports' => $accessible,
        'totalReports' => count($accessible),
    ]);
}

else if ($method === 'GET' && $action === 'user-accessible') {
    // Get accessible reports for the current user
    $accessible = get_accessible_reports($user);

    json_out([
        'userId' => $user['id'],
        'roles' => $user['roles'] ?? [],
        'accessibleReports' => $accessible,
        'totalReports' => count($accessible),
    ]);
}

else if ($method === 'POST' && $action === 'grant-role-access') {
    // Grant access to a report type for a role (future extension)
    $body = body();
    $roleName = trim((string)($body['role'] ?? ''));
    $reportType = trim((string)($body['reportType'] ?? ''));

    if (!$roleName || !$reportType) {
        json_error('Role and report type are required', 400);
    }

    // This would require a database table to store custom configurations
    // For now, return a message indicating this is a future feature
    json_out([
        'success' => false,
        'message' => 'Custom role-based report access configuration requires database schema changes (future feature)',
        'note' => 'Currently using static configuration in report-access.php',
    ]);
}

else if ($method === 'POST' && $action === 'revoke-role-access') {
    // Revoke access to a report type for a role (future extension)
    $body = body();
    $roleName = trim((string)($body['role'] ?? ''));
    $reportType = trim((string)($body['reportType'] ?? ''));

    if (!$roleName || !$reportType) {
        json_error('Role and report type are required', 400);
    }

    json_out([
        'success' => false,
        'message' => 'Custom role-based report access configuration requires database schema changes (future feature)',
        'note' => 'Currently using static configuration in report-access.php',
    ]);
}

else {
    json_error('Unknown request', 404);
}
?>
