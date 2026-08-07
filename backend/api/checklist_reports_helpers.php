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

// Extracts raw JPEG bytes + dimensions from a data: URL, or returns null if
// it isn't a valid embeddable JPEG photo.
function checklist_report_decode_photo(?string $dataUrl): ?array {
    if (!$dataUrl || !str_starts_with($dataUrl, 'data:image/')) return null;
    if (!preg_match('#^data:image/(jpeg|jpg);base64,([A-Za-z0-9+/=]+)$#', $dataUrl, $matches)) return null;
    $binary = base64_decode($matches[2], true);
    if ($binary === false) return null;
    $size = @getimagesizefromstring($binary);
    if ($size === false) return null;
    return ['data' => $binary, 'width' => $size[0], 'height' => $size[1]];
}

// Produces a multi-page PDF: a text summary (header + one line per answered
// item), followed by one full page per evidence photo (item label + the
// actual embedded photo — not just a "view online" placeholder).
//
// $photos: array of ['label' => string, 'photo' => ['data','width','height']]
// as returned by checklist_report_decode_photo().
function output_checklist_report_pdf(string $filename, array $lines, array $photos = []): void {
    $pages = array_chunk($lines, 50);
    if (!$pages) $pages = [['No data recorded.']];

    $watermarkPath = __DIR__ . '/../assets/watermark.jpg';
    $watermarkData = is_file($watermarkPath) ? file_get_contents($watermarkPath) : false;
    $watermarkSize = $watermarkData !== false ? @getimagesizefromstring($watermarkData) : false;

    $objects = [];
    // Object numbering plan:
    //   1 = Catalog, 2 = Pages
    //   3..(3+2*N-1) = text pages (page + content, alternating)
    //   then font object
    //   then watermark object (if present)
    //   then one image object per photo
    $textPageCount = count($pages);
    $photoPageCount = count($photos);
    $fontObject = 3 + $textPageCount * 2;
    $watermarkObject = ($watermarkData !== false && $watermarkSize !== false) ? $fontObject + 1 : null;
    $nextFree = $watermarkObject !== null ? $watermarkObject + 1 : $fontObject + 1;

    // Reserve one image object + one page object + one content object per photo.
    $photoImageObjects = [];
    $photoPageObjects = [];
    $photoContentObjects = [];
    foreach ($photos as $index => $photo) {
        $photoImageObjects[$index] = $nextFree++;
        $photoPageObjects[$index] = $nextFree++;
        $photoContentObjects[$index] = $nextFree++;
    }

    $pageReferences = [];

    // A4 = 595 x 842pt. Watermark centered, faint behind the text.
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
            $content .= '(' . checklist_report_pdf_escape((string)$line) . ") Tj\nT*\n";
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

    // One full page per evidence photo: item label at top, photo scaled to
    // fit within the page while preserving its aspect ratio.
    foreach ($photos as $index => $photo) {
        $imageObject = $photoImageObjects[$index];
        $pageObject = $photoPageObjects[$index];
        $contentObject = $photoContentObjects[$index];
        $pageReferences[] = $pageObject . ' 0 R';

        $maxWidth = 495; // 595 - 2*50pt margin
        $maxHeight = 650;
        $imgW = max(1, (int)$photo['photo']['width']);
        $imgH = max(1, (int)$photo['photo']['height']);
        $scale = min($maxWidth / $imgW, $maxHeight / $imgH, 1);
        $drawW = $imgW * $scale;
        $drawH = $imgH * $scale;
        $drawX = (595 - $drawW) / 2;
        $drawY = 792 - $drawH; // leave room for the label line at the top

        $content = "BT\n/F1 12 Tf\n50 810 Td\n";
        $content .= '(' . checklist_report_pdf_escape('Evidence photo — ' . $photo['label']) . ") Tj\nET\n";
        $content .= sprintf(
            "q\n%.2F 0 0 %.2F %.2F %.2F cm\n/Ph{$index} Do\nQ\n",
            $drawW, $drawH, $drawX, $drawY
        );

        $objects[$pageObject] =
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            . "/Resources << /Font << /F1 {$fontObject} 0 R >> /XObject << /Ph{$index} {$imageObject} 0 R >> >> "
            . "/Contents {$contentObject} 0 R >>";
        $objects[$contentObject] =
            "<< /Length " . strlen($content) . " >>\nstream\n{$content}endstream";
        $objects[$imageObject] =
            "<< /Type /XObject /Subtype /Image /Width {$imgW} /Height {$imgH} "
            . "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode "
            . "/Length " . strlen($photo['photo']['data']) . " >>\nstream\n{$photo['photo']['data']}\nendstream";
    }

    $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    $objects[2] =
        '<< /Type /Pages /Kids [' . implode(' ', $pageReferences)
        . '] /Count ' . count($pageReferences) . ' >>';
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
