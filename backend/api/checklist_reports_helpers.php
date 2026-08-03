<?php
// Shared by api/checklist_reports.php (admin) and api/customer_portal.php
// (customer view) so the Service Tracking math lives in exactly one place.

function checklist_report_pdf_escape(string $value): string {
    $converted = function_exists('iconv')
        ? iconv('UTF-8', 'Windows-1252//TRANSLIT', $value)
        : $value;
    if ($converted === false) $converted = preg_replace('/[^\x20-\x7E]/', '?', $value);
    return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], (string)$converted);
}

// Produces a simple multi-page text PDF summarizing one checklist report:
// header lines, then one line per answered item. Kept intentionally lean
// (no embedded photos) to avoid duplicating the more complex image-embedding
// logic already used for receipts elsewhere.
function output_checklist_report_pdf(string $filename, array $lines): void {
    $pages = array_chunk($lines, 50);
    if (!$pages) $pages = [['No data recorded.']];

    $objects = [];
    $fontObject = 3 + count($pages) * 2;
    $pageReferences = [];
    foreach ($pages as $index => $pageLines) {
        $pageObject = 3 + $index * 2;
        $contentObject = $pageObject + 1;
        $pageReferences[] = $pageObject . ' 0 R';
        $content = "BT\n/F1 10 Tf\n50 790 Td\n13 TL\n";
        foreach ($pageLines as $line) {
            $content .= '(' . checklist_report_pdf_escape((string)$line) . ") Tj\nT*\n";
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
