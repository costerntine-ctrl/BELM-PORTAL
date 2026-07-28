<?php
// Shared by api/checklist_reports.php (admin) and api/customer_portal.php
// (customer view) so the Service Tracking math lives in exactly one place.

function compute_service_status_helper(string $machineId): array {
    $stmt = db()->prepare('SELECT service_interval_hours, last_service_hours FROM machines WHERE id = ?');
    $stmt->execute([$machineId]);
    $machine = $stmt->fetch();
    if (!$machine) json_error('Machine not found', 404);

    $stmt = db()->prepare('SELECT hour_meter_reading FROM checklist_reports WHERE machine_id = ? ORDER BY created_at DESC LIMIT 1');
    $stmt->execute([$machineId]);
    $latest = $stmt->fetch();

    $intervalHours = $machine['service_interval_hours'] ?: 80;
    $totalHours = $latest ? (float)$latest['hour_meter_reading'] : 0;
    $lastServiceHours = (float)($machine['last_service_hours'] ?? 0);
    $hoursSinceService = max(0, $totalHours - $lastServiceHours);
    $hoursRemaining = $intervalHours - $hoursSinceService;
    $pct = min(100, round(($hoursSinceService / $intervalHours) * 100));

    $level = 'GREEN';
    if ($hoursRemaining <= 0) $level = 'RED';
    elseif ($hoursRemaining <= $intervalHours * 0.15) $level = 'YELLOW';

    return compact('intervalHours', 'totalHours', 'lastServiceHours', 'hoursSinceService', 'hoursRemaining', 'pct', 'level');
}
