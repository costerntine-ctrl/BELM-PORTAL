<?php
// Shared helper for exporting a simple tabular report (Invoices, Payments,
// Expenses, Proforma) to a hand-rolled PDF — no external library, matching
// the same raw-PDF technique used for checklist reports and machine
// expenses elsewhere in this codebase.

function table_pdf_escape(string $value): string {
    return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $value);
}

function display_date_billing(?string $value): string {
    if (!$value) return '—';
    $timestamp = strtotime($value);
    return $timestamp !== false ? date('d/m/Y', $timestamp) : $value;
}

/**
 * @param string $filename   download filename
 * @param string $title      big report title, e.g. "INVOICES REPORT"
 * @param array  $summaryLines extra lines under the title (e.g. "Generated: ...")
 * @param array  $rows       each row is an array of strings, already formatted for display
 */
function output_table_pdf(string $filename, string $title, array $summaryLines, array $rows): void {
    $lines = [strtoupper($title)];
    foreach ($summaryLines as $line) $lines[] = $line;
    $lines[] = str_repeat('-', 100);
    if (count($rows) === 0) {
        $lines[] = 'No records found.';
    } else {
        foreach ($rows as $row) {
            $lines[] = implode('  |  ', $row);
        }
    }
    $lines[] = str_repeat('-', 100);

    $wrapped = [];
    foreach ($lines as $line) {
        $chunks = str_split((string)$line, 118);
        foreach ($chunks as $chunk) $wrapped[] = $chunk;
    }

    $pages = array_chunk($wrapped, 58);
    if (!$pages) $pages = [['No data recorded.']];

    $watermarkPath = __DIR__ . '/../assets/watermark.jpg';
    $watermarkData = is_file($watermarkPath) ? file_get_contents($watermarkPath) : false;
    $watermarkSize = $watermarkData !== false ? @getimagesizefromstring($watermarkData) : false;

    $objects = [];
    $watermarkObject = null;
    $fontObject = 3 + count($pages) * 2;
    $fontBoldObject = $fontObject + 1;
    if ($watermarkData !== false && $watermarkSize !== false) {
        $watermarkObject = $fontBoldObject + 1;
    }
    $pageReferences = [];

    $wmDrawWidth = 360;
    $wmDrawHeight = $watermarkSize ? $wmDrawWidth * ($watermarkSize[1] / $watermarkSize[0]) : 0;
    $wmX = (842 - $wmDrawWidth) / 2;
    $wmY = (595 - $wmDrawHeight) / 2;

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
        $content .= "BT\n/FB 12 Tf\n30 565 Td\n13 TL\n";
        foreach ($pageLines as $lineIndex => $line) {
            $font = $lineIndex === 0 ? '/FB 12 Tf' : '/F1 8 Tf';
            $content .= "{$font}\n(" . table_pdf_escape((string)$line) . ") Tj\nT*\n";
        }
        $content .= "ET\n";

        $objects[$pageObject] =
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] "
            . "/Resources << /Font << /F1 {$fontObject} 0 R /FB {$fontBoldObject} 0 R >>"
            . ($watermarkObject !== null ? " /XObject << /Wm {$watermarkObject} 0 R >>" : '')
            . " >> /Contents {$contentObject} 0 R >>";
        $objects[$contentObject] =
            "<< /Length " . strlen($content) . " >>\nstream\n{$content}endstream";
    }
    $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    $objects[2] =
        '<< /Type /Pages /Kids [' . implode(' ', $pageReferences)
        . '] /Count ' . count($pages) . ' >>';
    $objects[$fontObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    $objects[$fontBoldObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
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
