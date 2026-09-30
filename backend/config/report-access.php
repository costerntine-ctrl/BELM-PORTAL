<?php
/**
 * V845: Role-Based Report Access Control
 *
 * Defines which reports are visible to which roles.
 * This configuration works in conjunction with backend/api/saved-reports.php
 * to enforce access control at the API level.
 */

// Report access configuration by role
// Each role maps to an array of report types it can access
const REPORT_ACCESS_CONFIG = [
    // BELM Staff Roles
    'super_admin' => [
        'company-financials',
        'all-overview',
        'analytics',
        'attendance',
        'technician-activity',
        'company-reports',
        'general-report',
        'financial-summary',
        'operational-summary',
    ],
    'system_coordinator' => [
        'company-financials',
        'all-overview',
        'analytics',
        'attendance',
        'company-reports',
        'general-report',
        'operational-summary',
    ],
    'workshop_manager' => [
        'technician-activity',
        'workshop-reports',
        'service-reports',
        'technician-assignments',
    ],
    'technician' => [
        'my-service-reports',
        'technician-machine-reports',
        'my-reports',
    ],
    'procurement' => [
        'purchase-reports',
        'supplier-reports',
        'procurement-summary',
    ],
    'store_keeper' => [
        'inventory-reports',
        'stock-movement',
        'stock-reports',
    ],
    'registration_sales' => [
        'customer-reports',
        'registration-summary',
        'sales-reports',
    ],
    'finance_accounts' => [
        'company-financials',
        'accounting-reports',
        'payment-tracking',
        'invoice-reports',
    ],
    'bank_controller' => [
        'company-financials',
        'banking-reports',
        'payment-reconciliation',
    ],

    // Customer Roles
    'customer_admin' => [
        'customer-reports',
        'machine-reports',
        'service-reports',
        'general-report',
        'maintenance-schedule',
    ],
    'workshop_manager_customer' => [
        'internal-reports',
        'maintenance-reports',
    ],
    'technician_customer' => [
        'technician-reports',
        'machine-status-reports',
    ],
    'operator' => [
        'operator-reports',
        'machine-daily-reports',
        'operational-logs',
    ],
    'procurement_customer' => [
        'purchase-orders',
        'procurement-reports',
    ],
    'store_keeper_customer' => [
        'inventory-reports',
        'stock-tracking',
    ],
    'accounts_customer' => [
        'billing-reports',
        'payment-history',
    ],
];

// Reports that BELM Admin can always see
const GENERAL_REPORTS = [
    'general-report',
    'company-financials',
    'all-overview',
    'analytics',
];

// Reports that require explicit role access
const ROLE_RESTRICTED_REPORTS = [
    'general-report' => ['super_admin', 'system_coordinator', 'customer_admin'],
    'company-financials' => ['super_admin', 'system_coordinator', 'finance_accounts', 'bank_controller'],
    'all-overview' => ['super_admin', 'system_coordinator'],
    'analytics' => ['super_admin', 'system_coordinator'],
];

/**
 * Check if a user can access a specific report type
 *
 * @param array $user User object with 'roles' and optional 'assigned_customer_id'
 * @param string $reportType The report type/action being accessed
 * @param array|null $reportData Optional report data (for additional checks)
 * @return bool True if access is allowed
 */
function can_access_report(array $user, string $reportType, ?array $reportData = null): bool {
    $userRoles = $user['roles'] ?? [];
    $isAdmin = in_array('super_admin', $userRoles) || in_array('system_coordinator', $userRoles);
    $isCustomer = isset($user['assigned_customer_id']);

    // Admins can access everything (except role-specific customer reports)
    if ($isAdmin && (!$reportData || $reportData['role_name'] !== 'customer_admin')) {
        return true;
    }

    // Check if this report is restricted and user's role is in the allowed list
    if (isset(ROLE_RESTRICTED_REPORTS[$reportType])) {
        $allowedRoles = ROLE_RESTRICTED_REPORTS[$reportType];
        foreach ($userRoles as $role) {
            if (in_array($role, $allowedRoles)) {
                return true;
            }
        }
        return false;
    }

    // Check user's specific role permissions
    foreach ($userRoles as $role) {
        if (isset(REPORT_ACCESS_CONFIG[$role])) {
            $allowedReports = REPORT_ACCESS_CONFIG[$role];
            if (in_array($reportType, $allowedReports)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Get accessible report types for a user
 *
 * @param array $user User object with 'roles'
 * @return array List of report types accessible to this user
 */
function get_accessible_reports(array $user): array {
    $userRoles = $user['roles'] ?? [];
    $accessible = [];

    foreach ($userRoles as $role) {
        if (isset(REPORT_ACCESS_CONFIG[$role])) {
            $accessible = array_merge($accessible, REPORT_ACCESS_CONFIG[$role]);
        }
    }

    return array_unique($accessible);
}

/**
 * Build SQL WHERE clause for report access filtering
 *
 * @param array $user User object
 * @return array Array with 'clause' and 'params' for SQL queries
 */
function build_report_access_filter(array $user): array {
    $userRoles = $user['roles'] ?? [];
    $isAdmin = in_array('super_admin', $userRoles) || in_array('system_coordinator', $userRoles);
    $isCustomer = isset($user['assigned_customer_id']);

    // Admins can see all saved reports
    if ($isAdmin) {
        return ['clause' => '', 'params' => []];
    }

    // Customers see only their own customer's reports
    if ($isCustomer) {
        return [
            'clause' => 'AND (customer_id = ? OR user_id = ?)',
            'params' => [$user['assigned_customer_id'], $user['id']]
        ];
    }

    // Regular BELM staff see only their own reports
    return ['clause' => 'AND user_id = ?', 'params' => [$user['id']]];
}
?>
