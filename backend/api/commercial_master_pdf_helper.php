<?php
// V345 - Canonical BELM DIGITAL PROFORMA / DIGITAL INVOICE PDF renderer.
//
// The visual system in this renderer is based on the two user-approved master
// PDFs stored in backend/templates. Those master files are kept immutable and
// checksum-pinned; this renderer supplies live customer/items/totals while
// preserving the approved layout, branding, QR/bank area and footer structure.

require_once __DIR__ . '/invoice_pdf_helper.php';

const BELM_MASTER_WEBSITE = 'https://portal.belmgeneraltech.co.tz/';
const BELM_MASTER_PHONE = '+255 713 309 529 | +255 689 770 910';
const BELM_MASTER_EMAIL = 'info@belmgeneral.co.tz';
const BELM_MASTER_ADDRESS = 'P.O. BOX 8419, KINONDONI, DAR ES SALAAM';
const BELM_MASTER_ACCOUNT_NAME = 'BELM GENERAL TECH SERVICE LIMITED';
const BELM_MASTER_NMB = '20710076849';
const BELM_MASTER_CRDB = '0150761848600';

const BELM_MASTER_NAVY = [0.035, 0.133, 0.247];
const BELM_MASTER_BLUE = [0.075, 0.286, 0.467];
const BELM_MASTER_GREEN = [0.000, 0.647, 0.365];
const BELM_MASTER_GOLD = [0.985, 0.768, 0.245];
const BELM_MASTER_LIGHT = [0.950, 0.968, 0.985];
const BELM_MASTER_LIGHT_BLUE = [0.920, 0.955, 0.985];
const BELM_MASTER_LINE = [0.78, 0.84, 0.90];
const BELM_MASTER_RED = [0.82, 0.14, 0.14];
const BELM_PROFORMA_VISUAL_BG_SHA256 = 'd02414c85f62e23e813754ab7230d99ddf8be9bb5f32dbbfa8c4ddd69460f84c';
const BELM_INVOICE_VISUAL_BG_SHA256 = 'd2ba7a9b7bcb446bc12d46db21ca8d9dcd373c852a108644c42839abfcd0750a';


function belm_commercial_master_template_integrity(): array {
    $dir = __DIR__ . '/../templates';
    $expected = [
        'BELM_DIGITAL_PROFORMA_MASTER_V2.pdf' => 'e76907fc096ba3359cf62009308c343374326a076cf5098851ecb5fcc5d5a645',
        'BELM_DIGITAL_INVOICE_MASTER_V2.pdf' => 'ee37ac1139a195ca1ae3469fc28fc1a2dfa88c79b20630692cd743beb28ca0ac',
    ];
    $result = ['ok' => true, 'files' => []];
    foreach ($expected as $name => $hash) {
        $path = $dir . '/' . $name;
        $actual = is_file($path) ? hash_file('sha256', $path) : null;
        $ok = is_string($actual) && hash_equals($hash, $actual);
        $result['files'][$name] = ['ok' => $ok, 'sha256' => $actual, 'expected' => $hash];
        if (!$ok) $result['ok'] = false;
    }
    return $result;
}

function belm_proforma_visual_background_path(): string {
    return __DIR__ . '/../assets/commercial_master/proforma-master-bg.jpg';
}

function belm_proforma_visual_background_integrity(): bool {
    $path = belm_proforma_visual_background_path();
    if (!is_file($path)) return false;
    $actual = hash_file('sha256', $path);
    return is_string($actual) && hash_equals(BELM_PROFORMA_VISUAL_BG_SHA256, $actual);
}

function belm_invoice_visual_background_path(): string {
    return __DIR__ . '/../assets/commercial_master/invoice-master-bg.jpg';
}

function belm_invoice_visual_background_integrity(): bool {
    $path = belm_invoice_visual_background_path();
    if (!is_file($path)) return false;
    $actual = hash_file('sha256', $path);
    return is_string($actual) && hash_equals(BELM_INVOICE_VISUAL_BG_SHA256, $actual);
}

function belm_master_pdf_rgb(array $rgb, bool $stroke = false): string {
    return sprintf('%.3F %.3F %.3F %s' . "\n", $rgb[0], $rgb[1], $rgb[2], $stroke ? 'RG' : 'rg');
}

function belm_master_pdf_box(float $x, float $y, float $w, float $h, array $fill, ?array $stroke = null, float $lineWidth = 0.8): string {
    $out = belm_master_pdf_rgb($fill, false) . sprintf('%.2F %.2F %.2F %.2F re f' . "\n", $x, $y, $w, $h);
    if ($stroke !== null) {
        $out .= belm_master_pdf_rgb($stroke, true) . sprintf('%.2F w' . "\n", $lineWidth)
            . sprintf('%.2F %.2F %.2F %.2F re S' . "\n", $x, $y, $w, $h) . "0 0 0 RG\n";
    }
    return $out . "0 0 0 rg\n";
}

function belm_master_pdf_line(float $x1, float $y1, float $x2, float $y2, array $stroke, float $lineWidth = 0.6): string {
    return belm_master_pdf_rgb($stroke, true) . sprintf('%.2F w' . "\n", $lineWidth)
        . sprintf('%.2F %.2F m %.2F %.2F l S' . "\n", $x1, $y1, $x2, $y2) . "0 0 0 RG\n";
}

function belm_master_image(string $resource, float $x, float $y, float $w, float $h): string {
    return sprintf("q\n%.2F 0 0 %.2F %.2F %.2F cm\n/%s Do\nQ\n", $w, $h, $x, $y, $resource);
}

function belm_master_number($value): float {
    if (is_numeric($value)) return (float)$value;
    return (float)str_replace([',', 'TZS', ' '], '', (string)$value);
}

function belm_master_money($value): string {
    return number_format(belm_master_number($value), 2);
}

function belm_master_days_from_validity(string $validity): int {
    if (preg_match('/(\d+)\s*(?:day|days)/i', $validity, $m)) return max(1, min(365, (int)$m[1]));
    return 7;
}

function belm_master_date_display(string $date): string {
    $ts = strtotime($date);
    return $ts ? date('d M Y', $ts) : $date;
}

function belm_master_wrap_lines(string $text, float $maxWidth, float $fontSize = 7.0, int $maxLines = 4): array {
    $text = trim(preg_replace('/\s+/', ' ', $text));
    if ($text === '') return [];
    $lines = pdf_wrap_text($text, 'F1', $fontSize, $maxWidth);
    if (count($lines) <= $maxLines) return $lines;
    $lines = array_slice($lines, 0, $maxLines);
    $last = array_pop($lines);
    $lines[] = rtrim($last, '. ') . '...';
    return $lines;
}

/**
 * Generate a QR as vector rectangles using the qrencode system binary.
 * Dockerfile V345 installs qrencode. If it is unavailable, the function
 * returns an empty string; the human-readable bank data remains correct.
 */
function belm_master_qr_vector(string $payload, float $x, float $y, float $size): string {
    if (!function_exists('shell_exec')) return '';
    $bin = trim((string)@shell_exec('command -v qrencode 2>/dev/null'));
    if ($bin === '') return '';
    $cmd = escapeshellcmd($bin) . ' -t XPM -l M -m 0 -o - ' . escapeshellarg($payload) . ' 2>/dev/null';
    $xpm = (string)@shell_exec($cmd);
    if ($xpm === '') return '';

    if (!preg_match('/"(\d+)\s+(\d+)\s+(\d+)\s+(\d+)"/', $xpm, $header, PREG_OFFSET_CAPTURE)) return '';
    $width = (int)$header[1][0];
    $height = (int)$header[2][0];
    $colors = (int)$header[3][0];
    $cpp = (int)$header[4][0];
    if ($width <= 0 || $height <= 0 || $cpp !== 1) return '';

    preg_match_all('/"([^"\r\n]*)"/', $xpm, $quoted);
    $parts = $quoted[1] ?? [];
    $headerIndex = -1;
    foreach ($parts as $i => $part) {
        if (preg_match('/^\d+\s+\d+\s+\d+\s+\d+$/', $part)) { $headerIndex = $i; break; }
    }
    if ($headerIndex < 0) return '';
    $colorRows = array_slice($parts, $headerIndex + 1, $colors);
    $pixelRows = array_slice($parts, $headerIndex + 1 + $colors, $height);
    if (count($pixelRows) !== $height) return '';

    $blackChars = [];
    foreach ($colorRows as $row) {
        $key = substr($row, 0, 1);
        if (stripos($row, '#000000') !== false || preg_match('/\bc\s+black\b/i', $row)) $blackChars[$key] = true;
    }
    if (!$blackChars) $blackChars['#'] = true;

    $module = $size / $width;
    $out = "0 0 0 rg\n";
    for ($r = 0; $r < $height; $r++) {
        $row = $pixelRows[$r];
        for ($c = 0; $c < $width; $c++) {
            if (!isset($blackChars[$row[$c] ?? ''])) continue;
            $rx = $x + $c * $module;
            // XPM rows are top-to-bottom; PDF y is bottom-to-top.
            $ry = $y + ($height - 1 - $r) * $module;
            $out .= sprintf('%.2F %.2F %.2F %.2F re f' . "\n", $rx, $ry, $module + 0.03, $module + 0.03);
        }
    }
    return $out;
}

function belm_master_load_jpeg(string $path): ?array {
    if (!is_file($path)) return null;
    $data = @file_get_contents($path);
    $info = $data !== false ? @getimagesizefromstring($data) : false;
    if ($data === false || !$info || ($info['mime'] ?? '') !== 'image/jpeg') return null;
    return ['data' => $data, 'width' => (int)$info[0], 'height' => (int)$info[1]];
}

function belm_master_assemble_pdf(array $pageContents): string {
    $pageCount = count($pageContents);
    $fontObject = 3 + ($pageCount * 2);
    $boldObject = $fontObject + 1;
    $logoObject = $boldObject + 1;
    $mainQrObject = $logoObject + 1;

    $assetDir = __DIR__ . '/../assets/commercial_master';
    $logo = belm_master_load_jpeg($assetDir . '/belm-logo-master.jpg');
    $mainQr = belm_master_load_jpeg($assetDir . '/portal-main-qr.jpg');

    $objects = [];
    $pageRefs = [];
    foreach ($pageContents as $i => $content) {
        $pageObj = 3 + ($i * 2);
        $contentObj = $pageObj + 1;
        $pageRefs[] = $pageObj . ' 0 R';
        $xobjects = [];
        if ($logo) $xobjects[] = "/MasterLogo {$logoObject} 0 R";
        if ($mainQr) $xobjects[] = "/MainQR {$mainQrObject} 0 R";
        $objects[$pageObj] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
            . "/Resources << /Font << /F1 {$fontObject} 0 R /FB {$boldObject} 0 R >>"
            . ($xobjects ? ' /XObject << ' . implode(' ', $xobjects) . ' >>' : '')
            . " >> /Contents {$contentObj} 0 R >>";
        $objects[$contentObj] = '<< /Length ' . strlen($content) . ">>\nstream\n{$content}endstream";
    }
    $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    $objects[2] = '<< /Type /Pages /Kids [' . implode(' ', $pageRefs) . '] /Count ' . $pageCount . ' >>';
    $objects[$fontObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    $objects[$boldObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
    if ($logo) {
        $objects[$logoObject] = "<< /Type /XObject /Subtype /Image /Width {$logo['width']} /Height {$logo['height']} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($logo['data']) . ">>\nstream\n{$logo['data']}\nendstream";
    } else {
        $objects[$logoObject] = '<< >>';
    }
    if ($mainQr) {
        $objects[$mainQrObject] = "<< /Type /XObject /Subtype /Image /Width {$mainQr['width']} /Height {$mainQr['height']} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($mainQr['data']) . ">>\nstream\n{$mainQr['data']}\nendstream";
    } else {
        $objects[$mainQrObject] = '<< >>';
    }

    ksort($objects);
    $pdf = "%PDF-1.4\n";
    $offsets = [0];
    $maxObject = max(array_keys($objects));
    for ($n = 1; $n <= $maxObject; $n++) {
        $offsets[$n] = strlen($pdf);
        $body = $objects[$n] ?? '<< >>';
        $pdf .= "{$n} 0 obj\n{$body}\nendobj\n";
    }
    $xref = strlen($pdf);
    $pdf .= "xref\n0 " . ($maxObject + 1) . "\n0000000000 65535 f \n";
    for ($n = 1; $n <= $maxObject; $n++) $pdf .= sprintf('%010d 00000 n ' . "\n", $offsets[$n]);
    $pdf .= "trailer\n<< /Size " . ($maxObject + 1) . " /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF";
    return $pdf;
}


function belm_master_assemble_pdf_with_background(array $pageContents, string $backgroundPath): string {
    $pageCount = count($pageContents);
    $fontObject = 3 + ($pageCount * 2);
    $boldObject = $fontObject + 1;
    $logoObject = $boldObject + 1;
    $mainQrObject = $logoObject + 1;
    $backgroundObject = $mainQrObject + 1;

    $assetDir = __DIR__ . '/../assets/commercial_master';
    $logo = belm_master_load_jpeg($assetDir . '/belm-logo-master.jpg');
    $mainQr = belm_master_load_jpeg($assetDir . '/portal-main-qr.jpg');
    $background = $backgroundPath ? belm_master_load_jpeg($backgroundPath) : null;

    $objects = [];
    $pageRefs = [];
    foreach ($pageContents as $i => $content) {
        $pageObj = 3 + ($i * 2);
        $contentObj = $pageObj + 1;
        $pageRefs[] = $pageObj . ' 0 R';
        $xobjects = [];
        if ($logo) $xobjects[] = "/MasterLogo {$logoObject} 0 R";
        if ($mainQr) $xobjects[] = "/MainQR {$mainQrObject} 0 R";
        if ($background) $xobjects[] = "/MasterBackground {$backgroundObject} 0 R";
        if ($background) $content = belm_master_image('MasterBackground', 0, 0, 595, 842) . $content;
        $objects[$pageObj] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
            . "/Resources << /Font << /F1 {$fontObject} 0 R /FB {$boldObject} 0 R >>"
            . ($xobjects ? ' /XObject << ' . implode(' ', $xobjects) . ' >>' : '')
            . " >> /Contents {$contentObj} 0 R >>";
        $objects[$contentObj] = '<< /Length ' . strlen($content) . ">>\nstream\n{$content}endstream";
    }
    $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    $objects[2] = '<< /Type /Pages /Kids [' . implode(' ', $pageRefs) . '] /Count ' . $pageCount . ' >>';
    $objects[$fontObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    $objects[$boldObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
    if ($logo) {
        $objects[$logoObject] = "<< /Type /XObject /Subtype /Image /Width {$logo['width']} /Height {$logo['height']} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($logo['data']) . ">>\nstream\n{$logo['data']}\nendstream";
    } else {
        $objects[$logoObject] = '<< >>';
    }
    if ($mainQr) {
        $objects[$mainQrObject] = "<< /Type /XObject /Subtype /Image /Width {$mainQr['width']} /Height {$mainQr['height']} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($mainQr['data']) . ">>\nstream\n{$mainQr['data']}\nendstream";
    } else {
        $objects[$mainQrObject] = '<< >>';
    }
    if ($background) {
        $objects[$backgroundObject] = "<< /Type /XObject /Subtype /Image /Width {$background['width']} /Height {$background['height']} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " . strlen($background['data']) . ">>\nstream\n{$background['data']}\nendstream";
    } else {
        $objects[$backgroundObject] = '<< >>';
    }

    ksort($objects);
    $pdf = "%PDF-1.4\n";
    $offsets = [0];
    $maxObject = max(array_keys($objects));
    for ($n = 1; $n <= $maxObject; $n++) {
        $offsets[$n] = strlen($pdf);
        $body = $objects[$n] ?? '<< >>';
        $pdf .= "{$n} 0 obj\n{$body}\nendobj\n";
    }
    $xref = strlen($pdf);
    $pdf .= "xref\n0 " . ($maxObject + 1) . "\n0000000000 65535 f \n";
    for ($n = 1; $n <= $maxObject; $n++) $pdf .= sprintf('%010d 00000 n ' . "\n", $offsets[$n]);
    $pdf .= "trailer\n<< /Size " . ($maxObject + 1) . " /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF";
    return $pdf;
}


/**
 * V400 - Proforma runtime overlay on the user-approved DIGITAL PROFORMA V2.
 *
 * The approved master is used as the actual visual base. We only clear the
 * sample values inside the existing panels and draw the live database values
 * in the same positions. This prevents later UI work from silently replacing
 * the user's approved commercial document design.
 */
function belm_master_proforma_overlay_header(string $number, int $validityDays): string {
    $c = '';
    // Keep the original navy header, website QR, logo and rounded gold badge.
    // Clear only the sample PI number / badge text inside their original areas.
    $c .= belm_master_pdf_box(493, 792, 64, 17, BELM_MASTER_NAVY);
    $c .= pdf_text_right(548, 796, $number, 'FB', 9.5, [1,1,1]);
    $c .= belm_master_pdf_box(429, 763, 62, 13, BELM_MASTER_GOLD);
    $c .= pdf_text_center(460, 767, 'VALID ' . $validityDays . ' DAYS', 'FB', 8.5, BELM_MASTER_NAVY);
    return $c;
}

function belm_master_proforma_overlay_bill_meta(array $customer, array $meta): string {
    $c = '';
    // BILL TO - retain the approved rounded panel and section label.
    $c .= belm_master_pdf_box(46, 615, 236, 49, BELM_MASTER_LIGHT);
    $c .= pdf_text(48, 649, strtoupper((string)($customer['name'] ?? '-')), 'FB', 12.5, BELM_MASTER_NAVY);
    $tin = trim((string)($customer['tin'] ?? '')) ?: '-';
    $vrn = trim((string)($customer['vrn'] ?? '')) ?: '-';
    $c .= pdf_text(48, 633, 'TIN: ' . $tin . '   |   VRN: ' . $vrn, 'F1', 7.5, [0.34,0.43,0.53]);
    $ref = trim((string)($customer['customerRef'] ?? $customer['name'] ?? ''));
    $c .= pdf_text(48, 619, 'Customer Ref: ' . ($ref ?: '-'), 'F1', 7.5, [0.34,0.43,0.53]);

    // DOCUMENT DETAILS - retain the approved rounded panel and heading.
    $c .= belm_master_pdf_box(315, 610, 238, 54, BELM_MASTER_LIGHT);
    $rows = [
        ['Issue Date', $meta['issueDate'] ?? '-'],
        ['Valid Until', $meta['validUntil'] ?? '-'],
        ['Currency', $meta['currency'] ?? 'TZS'],
        ['Reference', $meta['number'] ?? '-'],
    ];
    $y = 651;
    foreach ($rows as [$label, $value]) {
        $c .= pdf_text(320, $y, $label, 'F1', 7.3, [0.34,0.43,0.53]);
        $c .= pdf_text_right(546, $y, (string)$value, 'FB', 7.6, BELM_MASTER_NAVY);
        $y -= 13;
    }
    return $c;
}

/** Clear and refill all seven sample table rows while retaining the approved header. */
function belm_master_proforma_overlay_table(array $items, float $topY = 586): array {
    $x = 34; $w = 527; $headerH = 20; $rowH = 21;
    $cols = [28, 78, 190, 35, 38, 80, 78];
    $keys = ['itemNo','partNumber','description','qty','unit','unitPrice','extended'];
    $items = array_values($items);
    $y = $topY - $headerH;
    for ($ri = 0; $ri < 7; $ri++) {
        $y -= $rowH;
        $fill = $ri % 2 ? [0.965,0.975,0.985] : [1,1,1];
        // Inset fill preserves the existing master border/rule geometry.
        $cPart = belm_master_pdf_box($x + 0.7, $y + 0.7, $w - 1.4, $rowH - 1.4, $fill);
        $cPart .= belm_master_pdf_line($x, $y, $x + $w, $y, BELM_MASTER_LINE, 0.35);
        $item = $items[$ri] ?? [];
        $cx = $x;
        foreach ($cols as $i => $cw) {
            $key = $keys[$i];
            $value = (string)($item[$key] ?? '');
            if ($value !== '') {
                $right = in_array($key, ['qty','unitPrice','extended'], true);
                $cPart .= $right
                    ? pdf_text_right($cx + $cw - 5, $y + 7, $value, 'F1', 6.7, BELM_MASTER_NAVY)
                    : pdf_text($cx + 5, $y + 7, $value, 'F1', 6.7, BELM_MASTER_NAVY);
            }
            $cx += $cw;
        }
        $c = ($c ?? '') . $cPart;
    }
    return [$c ?? '', $y];
}

function belm_master_proforma_overlay_lower(
    string $number, array $totals, string $notice, array $bank, array $terms, int $validityDays
): string {
    $c = '';
    $totalsY = 332;
    $subtotal = belm_master_money($totals['subtotal'] ?? 0);
    $discount = belm_master_money($totals['discount'] ?? 0);
    $vat = belm_master_money($totals['vat'] ?? 0);
    $grand = belm_master_money($totals['grandTotal'] ?? 0);
    $vatLabel = trim((string)($totals['vatLabel'] ?? 'VAT 18%'));

    // IMPORTANT NOTICE body - keep the approved rounded yellow panel/title.
    $c .= belm_master_pdf_box(45, 340, 294, 45, [1.00,0.978,0.90]);
    $noticeText = trim($notice) ?: 'Availability and delivery dates are confirmed upon order.';
    $lineY = 374;
    foreach (belm_master_wrap_lines($noticeText, 285, 6.5, 4) as $line) {
        $c .= pdf_text(46, $lineY, $line, 'F1', 6.5, BELM_MASTER_NAVY);
        $lineY -= 14;
    }

    // Totals values/labels inside the approved totals panel.
    $totalX = 364; $totalW = 197; $totalH = 78;
    $c .= belm_master_pdf_box($totalX + 6, $totalsY + 2, $totalW - 12, $totalH - 5, BELM_MASTER_LIGHT);
    $rowY = $totalsY + $totalH - 17;
    foreach ([['Subtotal',$subtotal],['Discount',$discount],[$vatLabel,$vat]] as [$label,$value]) {
        $c .= pdf_text($totalX + 14, $rowY, $label, 'F1', 7.2, [0.34,0.43,0.53]);
        $c .= pdf_text_right($totalX + $totalW - 14, $rowY, $value, 'F1', 7.2, BELM_MASTER_NAVY);
        $rowY -= 13;
    }
    $c .= belm_master_pdf_line($totalX + 14, $rowY + 5, $totalX + $totalW - 14, $rowY + 5, BELM_MASTER_LINE, 0.6);
    $c .= pdf_text($totalX + 14, $rowY - 7, 'GRAND TOTAL', 'FB', 9.2, BELM_MASTER_NAVY);
    $c .= pdf_text_right($totalX + $totalW - 14, $rowY - 7, 'TZS ' . $grand, 'FB', 8.5, BELM_MASTER_NAVY);
    $c .= belm_master_pdf_box($totalX + 8, $totalsY - 10, $totalW - 16, 14, BELM_MASTER_LIGHT);
    $c .= pdf_text($totalX + 14, $totalsY - 4, 'VALIDITY', 'FB', 7.2, BELM_MASTER_GREEN);
    $c .= pdf_text_right($totalX + $totalW - 14, $totalsY - 4, $validityDays . ' DAYS', 'FB', 7.2, BELM_MASTER_NAVY);

    // Account name strip and both bank cards. Clear the sample QR/reference values.
    $bankY = 164;
    $accountName = belm_master_extract_bank_value($bank, 'ACCOUNT NAME', BELM_MASTER_ACCOUNT_NAME);
    $nmb = belm_master_extract_bank_value($bank, 'NMB BANK', BELM_MASTER_NMB);
    $crdb = belm_master_extract_bank_value($bank, 'CRDB BANK', BELM_MASTER_CRDB);
    $c .= belm_master_pdf_box(49, $bankY + 94, 327, 14, BELM_MASTER_LIGHT_BLUE);
    $c .= pdf_text(54, $bankY + 99, 'ACCOUNT NAME: ' . strtoupper($accountName), 'FB', 6.3, BELM_MASTER_NAVY);
    $cardY = $bankY + 14; $cardH = 64; $cardW = 159;
    foreach ([['NMB BANK',$nmb,48],['CRDB BANK',$crdb,218]] as [$bankName,$acct,$cardX]) {
        // Preserve the master rounded card border; clear only its interior.
        $c .= belm_master_pdf_box($cardX + 2, $cardY + 2, $cardW - 4, $cardH - 4, [1,1,1]);
        $payload = BELM_MASTER_ACCOUNT_NAME . "\n" . $bankName . "\nACCOUNT NUMBER: " . $acct . "\nREFERENCE: " . $number . "\n" . BELM_MASTER_WEBSITE;
        $qr = belm_master_qr_vector($payload, $cardX + 10, $cardY + 10, 44);
        if ($qr !== '') {
            $c .= $qr;
        } else {
            // Never leave the sample PI-0498 QR on a live document.
            $c .= belm_master_pdf_box($cardX + 10, $cardY + 10, 44, 44, [1,1,1], BELM_MASTER_LINE);
            $c .= pdf_text_center($cardX + 32, $cardY + 30, 'QR', 'FB', 8, BELM_MASTER_NAVY);
        }
        $c .= pdf_text($cardX + 64, $cardY + 43, $bankName, 'FB', 8.2, BELM_MASTER_NAVY);
        $c .= pdf_text($cardX + 64, $cardY + 29, 'Account Number', 'F1', 5.8, [0.40,0.48,0.58]);
        $c .= pdf_text($cardX + 64, $cardY + 15, $acct, 'FB', 8.0, BELM_MASTER_NAVY);
        $c .= pdf_text($cardX + 64, $cardY + 5, 'SCAN DETAILS', 'FB', 5.2, BELM_MASTER_GREEN);
    }

    // Trading terms and dynamic payment reference.
    $termsX = 405; $termsW = 156; $bankH = 138;
    $c .= belm_master_pdf_box($termsX + 9, $bankY + 45, $termsW - 18, 72, [1,1,1]);
    $termY = $bankY + $bankH - 28;
    foreach (belm_master_terms($terms, $validityDays) as $term) {
        foreach (belm_master_wrap_lines('- ' . $term, $termsW - 28, 6.5, 2) as $line) {
            $c .= pdf_text($termsX + 14, $termY, $line, 'F1', 6.5, BELM_MASTER_NAVY);
            $termY -= 11;
        }
        $termY -= 5;
    }
    $c .= belm_master_pdf_box($termsX + 10, $bankY + 12, $termsW - 20, 14, [1,1,1]);
    $c .= pdf_text($termsX + 14, $bankY + 18, 'Payment reference: ' . $number, 'F1', 5.8, [0.40,0.48,0.58]);
    return $c;
}

function belm_master_proforma_overlay_continuation(): string {
    // Remove the sample lower commercial blocks from continuation pages while
    // preserving the approved header/table/footer visual language.
    $c = belm_master_pdf_box(0, 64, 595, 350, [1,1,1]);
    $c .= pdf_text(34, 320, 'CONTINUED ON NEXT PAGE', 'FB', 8.5, BELM_MASTER_BLUE);
    return $c;
}

/**
 * V404 - Invoice runtime overlay on the user-approved DIGITAL INVOICE V2.
 *
 * Like the Proforma lock, the approved Invoice master is the real visual page
 * base. Only sample values are cleared and replaced with live database values.
 */
function belm_master_invoice_overlay_header(string $number, string $badge): string {
    $c = '';
    // Preserve approved navy header, logo, website QR and rounded gold badge.
    $c .= belm_master_pdf_box(493, 792, 64, 17, BELM_MASTER_NAVY);
    $c .= pdf_text_right(548, 796, $number, 'FB', 9.5, [1,1,1]);
    $c .= belm_master_pdf_box(424, 764, 72, 11, BELM_MASTER_GOLD);
    $c .= pdf_text_center(460, 767, $badge, 'FB', 7.6, BELM_MASTER_NAVY);
    return $c;
}

function belm_master_invoice_overlay_bill_meta(array $customer, array $meta): string {
    $c = '';
    // BILL TO - retain the approved rounded panel and heading.
    $c .= belm_master_pdf_box(46, 615, 236, 49, BELM_MASTER_LIGHT);
    $c .= pdf_text(48, 649, strtoupper((string)($customer['name'] ?? '-')), 'FB', 12.5, BELM_MASTER_NAVY);
    $tin = trim((string)($customer['tin'] ?? '')) ?: '-';
    $vrn = trim((string)($customer['vrn'] ?? '')) ?: '-';
    $c .= pdf_text(48, 633, 'TIN: ' . $tin . '   |   VRN: ' . $vrn, 'F1', 7.5, [0.34,0.43,0.53]);
    $ref = trim((string)($customer['customerRef'] ?? $customer['name'] ?? ''));
    $c .= pdf_text(48, 619, 'Customer Ref: ' . ($ref ?: '-'), 'F1', 7.5, [0.34,0.43,0.53]);

    // DOCUMENT DETAILS - retain the approved rounded panel and heading.
    $c .= belm_master_pdf_box(315, 610, 238, 54, BELM_MASTER_LIGHT);
    $rows = [
        ['Date', $meta['issueDate'] ?? '-'],
        ['Currency', $meta['currency'] ?? 'TZS'],
        ['Due Status', $meta['dueStatus'] ?? 'OUTSTANDING'],
        ['Job Card Ref', $meta['jobCardRef'] ?? '-'],
    ];
    $y = 651;
    foreach ($rows as [$label, $value]) {
        $c .= pdf_text(320, $y, $label, 'F1', 7.3, [0.34,0.43,0.53]);
        $c .= pdf_text_right(546, $y, (string)$value, 'FB', 7.6, BELM_MASTER_NAVY);
        $y -= 13;
    }
    return $c;
}

function belm_master_invoice_overlay_lower(
    string $number, array $totals, array $bank, array $terms, float $paid, float $balance
): string {
    $c = '';
    $totalsY = 312;
    $subtotal = belm_master_money($totals['subtotal'] ?? 0);
    $discount = belm_master_money($totals['discount'] ?? 0);
    $vat = belm_master_money($totals['vat'] ?? 0);
    $grand = belm_master_money($totals['grandTotal'] ?? 0);
    $vatLabel = trim((string)($totals['vatLabel'] ?? 'VAT 18%'));

    // Clear only the sample values inside the approved rounded totals panel.
    $totalX = 364; $totalW = 197; $totalH = 92;
    $c .= belm_master_pdf_box($totalX + 6, $totalsY + 2, $totalW - 12, $totalH - 5, BELM_MASTER_LIGHT);
    $rowY = $totalsY + $totalH - 17;
    foreach ([['Subtotal',$subtotal],['Discount',$discount],[$vatLabel,$vat]] as [$label,$value]) {
        $c .= pdf_text($totalX + 14, $rowY, $label, 'F1', 7.2, [0.34,0.43,0.53]);
        $c .= pdf_text_right($totalX + $totalW - 14, $rowY, $value, 'F1', 7.2, BELM_MASTER_NAVY);
        $rowY -= 13;
    }
    $c .= belm_master_pdf_line($totalX + 14, $rowY + 5, $totalX + $totalW - 14, $rowY + 5, BELM_MASTER_LINE, 0.6);
    $c .= pdf_text($totalX + 14, $rowY - 7, 'GRAND TOTAL', 'FB', 9.2, BELM_MASTER_NAVY);
    $c .= pdf_text_right($totalX + $totalW - 14, $rowY - 7, 'TZS ' . $grand, 'FB', 8.5, BELM_MASTER_NAVY);
    $c .= pdf_text($totalX + 14, $totalsY + 4, 'PAID', 'FB', 7.4, BELM_MASTER_GREEN);
    $c .= pdf_text_right($totalX + $totalW - 14, $totalsY + 4, 'TZS ' . belm_master_money($paid), 'FB', 7.4, BELM_MASTER_NAVY);
    $c .= pdf_text($totalX + 14, $totalsY - 9, 'BALANCE', 'FB', 7.4, BELM_MASTER_RED);
    $c .= pdf_text_right($totalX + $totalW - 14, $totalsY - 9, 'TZS ' . belm_master_money($balance), 'FB', 7.4, BELM_MASTER_RED);

    // Account name strip and bank cards. Replace sample account/QR/reference data.
    $bankY = 164;
    $accountName = belm_master_extract_bank_value($bank, 'ACCOUNT NAME', BELM_MASTER_ACCOUNT_NAME);
    $nmb = belm_master_extract_bank_value($bank, 'NMB BANK', BELM_MASTER_NMB);
    $crdb = belm_master_extract_bank_value($bank, 'CRDB BANK', BELM_MASTER_CRDB);
    $c .= belm_master_pdf_box(49, $bankY + 94, 327, 14, BELM_MASTER_LIGHT_BLUE);
    $c .= pdf_text(54, $bankY + 99, 'ACCOUNT NAME: ' . strtoupper($accountName), 'FB', 6.3, BELM_MASTER_NAVY);
    $cardY = $bankY + 14; $cardH = 64; $cardW = 159;
    foreach ([['NMB BANK',$nmb,48],['CRDB BANK',$crdb,218]] as [$bankName,$acct,$cardX]) {
        $c .= belm_master_pdf_box($cardX + 2, $cardY + 2, $cardW - 4, $cardH - 4, [1,1,1]);
        $payload = BELM_MASTER_ACCOUNT_NAME . "\n" . $bankName . "\nACCOUNT NUMBER: " . $acct . "\nREFERENCE: " . $number . "\n" . BELM_MASTER_WEBSITE;
        $qr = belm_master_qr_vector($payload, $cardX + 10, $cardY + 10, 44);
        if ($qr !== '') {
            $c .= $qr;
        } else {
            $c .= belm_master_pdf_box($cardX + 10, $cardY + 10, 44, 44, [1,1,1], BELM_MASTER_LINE);
            $c .= pdf_text_center($cardX + 32, $cardY + 30, 'QR', 'FB', 8, BELM_MASTER_NAVY);
        }
        $c .= pdf_text($cardX + 64, $cardY + 43, $bankName, 'FB', 8.2, BELM_MASTER_NAVY);
        $c .= pdf_text($cardX + 64, $cardY + 29, 'Account Number', 'F1', 5.8, [0.40,0.48,0.58]);
        $c .= pdf_text($cardX + 64, $cardY + 15, $acct, 'FB', 8.0, BELM_MASTER_NAVY);
        $c .= pdf_text($cardX + 64, $cardY + 5, 'SCAN DETAILS', 'FB', 5.2, BELM_MASTER_GREEN);
    }

    // Trading terms and payment reference.
    $termsX = 405; $termsW = 156; $bankH = 138;
    $c .= belm_master_pdf_box($termsX + 9, $bankY + 45, $termsW - 18, 72, [1,1,1]);
    $termY = $bankY + $bankH - 28;
    foreach (belm_master_terms($terms, 7) as $term) {
        foreach (belm_master_wrap_lines('- ' . $term, $termsW - 28, 6.5, 2) as $line) {
            $c .= pdf_text($termsX + 14, $termY, $line, 'F1', 6.5, BELM_MASTER_NAVY);
            $termY -= 11;
        }
        $termY -= 5;
    }
    $c .= belm_master_pdf_box($termsX + 10, $bankY + 12, $termsW - 20, 14, [1,1,1]);
    $c .= pdf_text($termsX + 14, $bankY + 18, 'Payment reference: ' . $number, 'F1', 5.8, [0.40,0.48,0.58]);
    return $c;
}

function belm_master_invoice_overlay_continuation(): string {
    $c = belm_master_pdf_box(0, 64, 595, 350, [1,1,1]);
    $c .= pdf_text(34, 320, 'CONTINUED ON NEXT PAGE', 'FB', 8.5, BELM_MASTER_BLUE);
    return $c;
}

function belm_master_draw_header(string $kind, string $number, string $badge): string {
    $c = '';
    // Thin approved top stripe.
    $c .= belm_master_pdf_box(0, 838, 250, 4, BELM_MASTER_GOLD);
    $c .= belm_master_pdf_box(250, 838, 345, 4, BELM_MASTER_GREEN);
    $c .= belm_master_pdf_box(0, 722, 595, 116, BELM_MASTER_NAVY);

    // Logo panel and master logo.
    $c .= belm_master_pdf_box(34, 746, 132, 74, [1, 1, 1]);
    $c .= belm_master_image('MasterLogo', 44, 752, 112, 62);

    $c .= pdf_text(184, 810, 'BELM GENERAL TECH', 'FB', 13, [1,1,1]);
    $c .= pdf_text(184, 794, 'SERVICE LIMITED', 'FB', 13, [1,1,1]);
    $c .= pdf_text(184, 778, BELM_MASTER_ADDRESS, 'F1', 7.5, [1,1,1]);
    $c .= pdf_text(184, 763, BELM_MASTER_PHONE, 'F1', 7.5, [1,1,1]);
    $c .= pdf_text(184, 748, BELM_MASTER_EMAIL, 'F1', 7.5, [1,1,1]);

    $label = $kind === 'PROFORMA' ? 'DIGITAL PROFORMA' : 'DIGITAL INVOICE';
    $c .= pdf_text_right(525, 808, $label, 'FB', 15, [1,1,1]);
    $c .= pdf_text_center(530.5, 796, $number, 'FB', 9.5, [1,1,1]);

    // Gold status/validity badge.
    $badgeW = max(80, pdf_estimate_text_width($badge, 'FB', 8.5) + 24);
    $c .= belm_master_pdf_box(415, 755, $badgeW, 24, BELM_MASTER_GOLD);
    $c .= pdf_text_center(415 + $badgeW / 2, 763, $badge, 'FB', 8.5, BELM_MASTER_NAVY);

    // Main website QR from the approved template (URL is stable).
    $c .= belm_master_image('MainQR', 505, 738, 51, 51);
    $c .= pdf_text_center(530.5, 730, 'SCAN / OPEN WEBSITE', 'FB', 5.3, [1,1,1]);

    // Website strip.
    $c .= belm_master_pdf_box(0, 703, 595, 19, BELM_MASTER_LIGHT_BLUE);
    $c .= pdf_text(34, 710, 'WEBSITE', 'FB', 7.2, BELM_MASTER_NAVY);
    $c .= pdf_text(82, 710, 'portal.belmgeneraltech.co.tz', 'FB', 7.2, [0.02,0.36,0.64]);
    return $c;
}

function belm_master_draw_bill_meta(string $kind, array $customer, array $meta): string {
    $c = '';
    $c .= belm_master_pdf_box(34, 610, 258, 77, BELM_MASTER_LIGHT, BELM_MASTER_LINE);
    $c .= belm_master_pdf_box(306, 610, 255, 77, BELM_MASTER_LIGHT, BELM_MASTER_LINE);
    $c .= pdf_text(48, 669, 'BILL TO', 'FB', 8.5, BELM_MASTER_GREEN);
    $c .= pdf_text(48, 649, strtoupper((string)($customer['name'] ?? '-')), 'FB', 12.5, BELM_MASTER_NAVY);
    $tin = trim((string)($customer['tin'] ?? '')) ?: '-';
    $vrn = trim((string)($customer['vrn'] ?? '')) ?: '-';
    $c .= pdf_text(48, 633, 'TIN: ' . $tin . '   |   VRN: ' . $vrn, 'F1', 7.5, [0.34,0.43,0.53]);
    $ref = trim((string)($customer['customerRef'] ?? $customer['name'] ?? ''));
    $c .= pdf_text(48, 619, 'Customer Ref: ' . ($ref ?: '-'), 'F1', 7.5, [0.34,0.43,0.53]);

    $c .= pdf_text(320, 669, 'DOCUMENT DETAILS', 'FB', 8.5, [0.02,0.40,0.65]);
    $rows = $kind === 'PROFORMA'
        ? [
            ['Issue Date', $meta['issueDate'] ?? '-'],
            ['Valid Until', $meta['validUntil'] ?? '-'],
            ['Currency', $meta['currency'] ?? 'TZS'],
            ['Reference', $meta['number'] ?? '-'],
        ]
        : [
            ['Date', $meta['issueDate'] ?? '-'],
            ['Currency', $meta['currency'] ?? 'TZS'],
            ['Due Status', $meta['dueStatus'] ?? 'OUTSTANDING'],
            ['Job Card Ref', $meta['jobCardRef'] ?? '-'],
        ];
    $y = 651;
    foreach ($rows as [$label, $value]) {
        $c .= pdf_text(320, $y, $label, 'F1', 7.3, [0.34,0.43,0.53]);
        $c .= pdf_text_right(546, $y, (string)$value, 'FB', 7.6, BELM_MASTER_NAVY);
        $y -= 13;
    }
    return $c;
}

function belm_master_draw_table(array $items, float $topY = 586): array {
    $x = 34; $w = 527; $headerH = 20; $rowH = 21;
    $cols = [28, 78, 190, 35, 38, 80, 78];
    $keys = ['itemNo','partNumber','description','qty','unit','unitPrice','extended'];
    $labels = ['#','Part Number','Description','Qty','Unit','Unit Price','Amount'];
    $c = belm_master_pdf_box($x, $topY - $headerH, $w, $headerH, BELM_MASTER_BLUE);
    $cx = $x;
    foreach ($cols as $i => $cw) {
        $right = in_array($keys[$i], ['qty','unitPrice','extended'], true);
        $c .= $right
            ? pdf_text_right($cx + $cw - 5, $topY - 13, $labels[$i], 'FB', 6.8, [1,1,1])
            : pdf_text($cx + 5, $topY - 13, $labels[$i], 'FB', 6.8, [1,1,1]);
        $cx += $cw;
    }
    $y = $topY - $headerH;
    foreach ($items as $ri => $item) {
        $y -= $rowH;
        $fill = $ri % 2 ? [0.965,0.975,0.985] : [1,1,1];
        $c .= belm_master_pdf_box($x, $y, $w, $rowH, $fill, BELM_MASTER_LINE, 0.35);
        $cx = $x;
        foreach ($cols as $i => $cw) {
            $key = $keys[$i];
            $value = (string)($item[$key] ?? '');
            $right = in_array($key, ['qty','unitPrice','extended'], true);
            $c .= $right
                ? pdf_text_right($cx + $cw - 5, $y + 7, $value, 'F1', 6.7, BELM_MASTER_NAVY)
                : pdf_text($cx + 5, $y + 7, $value, 'F1', 6.7, BELM_MASTER_NAVY);
            $cx += $cw;
        }
    }
    return [$c, $y];
}

function belm_master_extract_bank_value(array $bank, string $label, string $fallback): string {
    foreach ($bank as $row) {
        if (!is_array($row) || count($row) < 2) continue;
        if (strtoupper(trim((string)$row[0])) === strtoupper($label)) return trim((string)$row[1]) ?: $fallback;
    }
    return $fallback;
}

function belm_master_terms(array $terms, int $validityDays): array {
    $payment = 'Payment: 100% before delivery';
    $delivery = 'Delivery: 45-60 working days';
    foreach ($terms as $term) {
        $term = trim((string)$term);
        if ($term === '') continue;
        if (stripos($term, 'payment') !== false) $payment = preg_replace('/^Term of Payment:\s*/i', 'Payment: ', $term);
        if (stripos($term, 'delivery') !== false) $delivery = preg_replace('/^Delivery Time:\s*/i', 'Delivery: ', $term);
    }
    return [$payment, $delivery, 'Price validity: ' . $validityDays . ' days', 'Subject to availability & logistics'];
}

function belm_master_draw_lower_blocks(
    string $kind, string $number, array $totals, string $notice, array $bank, array $terms,
    int $validityDays, float $tableBottom, float $paid = 0.0, float $balance = 0.0
): string {
    $c = '';
    $subtotal = belm_master_money($totals['subtotal'] ?? 0);
    $discount = belm_master_money($totals['discount'] ?? 0);
    $vat = belm_master_money($totals['vat'] ?? 0);
    $grand = belm_master_money($totals['grandTotal'] ?? 0);
    $vatLabel = trim((string)($totals['vatLabel'] ?? 'VAT 18%'));

    // Keep the approved lower composition anchored even when the table is shorter.
    $totalsY = $kind === 'INVOICE' ? 312 : 332;
    $totalHForFit = $kind === 'INVOICE' ? 92 : 78;
    if ($tableBottom < ($totalsY + $totalHForFit + 8)) $totalsY = max(250, $tableBottom - $totalHForFit - 8);

    if ($kind === 'PROFORMA') {
        $noticeText = trim($notice) ?: 'Availability and delivery dates are confirmed upon order.';
        $c .= belm_master_pdf_box(34, $totalsY, 313, 78, [1.00,0.978,0.90], BELM_MASTER_GOLD);
        $c .= pdf_text(46, $totalsY + 62, 'IMPORTANT NOTICE', 'FB', 8.3, BELM_MASTER_NAVY);
        $lineY = $totalsY + 45;
        foreach (belm_master_wrap_lines($noticeText, 285, 6.5, 4) as $line) {
            $c .= pdf_text(46, $lineY, $line, 'F1', 6.5, BELM_MASTER_NAVY);
            $lineY -= 14;
        }
    }

    $totalX = 364; $totalW = 197; $totalH = $kind === 'INVOICE' ? 92 : 78;
    $c .= belm_master_pdf_box($totalX, $totalsY, $totalW, $totalH, BELM_MASTER_LIGHT, BELM_MASTER_LINE);
    $rowY = $totalsY + $totalH - 17;
    foreach ([['Subtotal',$subtotal],['Discount',$discount],[$vatLabel,$vat]] as [$label,$value]) {
        $c .= pdf_text($totalX + 14, $rowY, $label, 'F1', 7.2, [0.34,0.43,0.53]);
        $c .= pdf_text_right($totalX + $totalW - 14, $rowY, $value, 'F1', 7.2, BELM_MASTER_NAVY);
        $rowY -= 13;
    }
    $c .= belm_master_pdf_line($totalX + 14, $rowY + 5, $totalX + $totalW - 14, $rowY + 5, BELM_MASTER_LINE, 0.6);
    $c .= pdf_text($totalX + 14, $rowY - 7, 'GRAND TOTAL', 'FB', 9.2, BELM_MASTER_NAVY);
    $c .= pdf_text_right($totalX + $totalW - 14, $rowY - 7, 'TZS ' . $grand, 'FB', 8.5, BELM_MASTER_NAVY);
    if ($kind === 'PROFORMA') {
        $c .= pdf_text($totalX + 14, $totalsY - 4, 'VALIDITY', 'FB', 7.2, BELM_MASTER_GREEN);
        $c .= pdf_text_right($totalX + $totalW - 14, $totalsY - 4, $validityDays . ' DAYS', 'FB', 7.2, BELM_MASTER_NAVY);
    } else {
        $c .= pdf_text($totalX + 14, $totalsY + 4, 'PAID', 'FB', 7.4, BELM_MASTER_GREEN);
        $c .= pdf_text_right($totalX + $totalW - 14, $totalsY + 4, 'TZS ' . belm_master_money($paid), 'FB', 7.4, BELM_MASTER_NAVY);
        $c .= pdf_text($totalX + 14, $totalsY - 9, 'BALANCE', 'FB', 7.4, BELM_MASTER_RED);
        $c .= pdf_text_right($totalX + $totalW - 14, $totalsY - 9, 'TZS ' . belm_master_money($balance), 'FB', 7.4, BELM_MASTER_RED);
    }

    $bankY = 164; $bankH = 138; $termsX = 405; $termsW = 156;
    $c .= belm_master_pdf_box(34, $bankY, 357, $bankH, BELM_MASTER_LIGHT, BELM_MASTER_LINE);
    $c .= belm_master_pdf_box($termsX, $bankY, $termsW, $bankH, [1,1,1], BELM_MASTER_LINE);
    $c .= pdf_text(48, $bankY + $bankH - 20, 'PAYMENT / BANK DETAILS', 'FB', 9, BELM_MASTER_NAVY);
    $c .= pdf_text(48, $bankY + $bankH - 34, 'Each QR contains account details only - not an official bank Pay QR.', 'F1', 5.8, [0.40,0.48,0.58]);
    $accountName = belm_master_extract_bank_value($bank, 'ACCOUNT NAME', BELM_MASTER_ACCOUNT_NAME);
    $nmb = belm_master_extract_bank_value($bank, 'NMB BANK', BELM_MASTER_NMB);
    $crdb = belm_master_extract_bank_value($bank, 'CRDB BANK', BELM_MASTER_CRDB);
    $c .= belm_master_pdf_box(48, $bankY + 81, 329, 18, BELM_MASTER_LIGHT_BLUE);
    $c .= pdf_text(54, $bankY + 87, 'ACCOUNT NAME: ' . strtoupper($accountName), 'FB', 6.3, BELM_MASTER_NAVY);

    // Two bank cards.
    $cardY = $bankY + 14; $cardH = 64; $cardW = 159;
    foreach ([['NMB BANK',$nmb,48],['CRDB BANK',$crdb,218]] as [$bankName,$acct,$cardX]) {
        $c .= belm_master_pdf_box($cardX, $cardY, $cardW, $cardH, [1,1,1], BELM_MASTER_LINE);
        $payload = BELM_MASTER_ACCOUNT_NAME . "\n" . $bankName . "\nACCOUNT NUMBER: " . $acct . "\nREFERENCE: " . $number . "\n" . BELM_MASTER_WEBSITE;
        $qr = belm_master_qr_vector($payload, $cardX + 10, $cardY + 10, 44);
        if ($qr !== '') {
            $c .= $qr;
        } else {
            $c .= belm_master_pdf_box($cardX + 10, $cardY + 10, 44, 44, [1,1,1], BELM_MASTER_LINE);
            $c .= pdf_text_center($cardX + 32, $cardY + 30, 'QR', 'FB', 8, BELM_MASTER_NAVY);
        }
        $c .= pdf_text($cardX + 64, $cardY + 43, $bankName, 'FB', 8.2, BELM_MASTER_NAVY);
        $c .= pdf_text($cardX + 64, $cardY + 29, 'Account Number', 'F1', 5.8, [0.40,0.48,0.58]);
        $c .= pdf_text($cardX + 64, $cardY + 15, $acct, 'FB', 8.0, BELM_MASTER_NAVY);
        $c .= pdf_text($cardX + 64, $cardY + 5, 'SCAN DETAILS', 'FB', 5.2, BELM_MASTER_GREEN);
    }

    $c .= pdf_text($termsX + 14, $bankY + $bankH - 20, 'TRADING TERMS', 'FB', 9, BELM_MASTER_NAVY);
    $termY = $bankY + $bankH - 44;
    foreach (belm_master_terms($terms, $validityDays) as $term) {
        foreach (belm_master_wrap_lines('- ' . $term, $termsW - 28, 6.5, 2) as $line) {
            $c .= pdf_text($termsX + 14, $termY, $line, 'F1', 6.5, BELM_MASTER_NAVY);
            $termY -= 11;
        }
        $termY -= 5;
    }
    $c .= pdf_text($termsX + 14, $bankY + 18, 'Payment reference: ' . $number, 'F1', 5.8, [0.40,0.48,0.58]);

    // Approved fixed footer.
    $c .= belm_master_pdf_box(34, 29, 527, 31, BELM_MASTER_NAVY);
    $c .= pdf_text(48, 47, $kind === 'PROFORMA' ? 'PROFORMA / WEBSITE' : 'DOCUMENT / WEBSITE', 'FB', 7.0, [1,1,1]);
    $c .= pdf_text(48, 36, 'Scan the main QR or open:', 'F1', 5.8, [1,1,1]);
    $c .= pdf_text(164, 36, BELM_MASTER_WEBSITE, 'FB', 6.1, BELM_MASTER_GOLD);
    return $c;
}

/**
 * Build the approved commercial document PDF bytes.
 *
 * Supported kinds: PROFORMA, INVOICE. The first 7 items fit on page 1. If a
 * document has more items, continuation pages retain the same approved header
 * and table style; the totals/bank/terms/footer stay on the final page.
 */
function belm_build_commercial_master_pdf(
    string $kind, array $customer, array $meta, array $items, array $totals,
    string $notice = '', array $bank = [], array $terms = [], float $paid = 0.0, ?float $balance = null
): string {
    $kind = strtoupper($kind) === 'INVOICE' ? 'INVOICE' : 'PROFORMA';
    $number = trim((string)($meta['number'] ?? '')) ?: ($kind === 'INVOICE' ? 'INV-DRAFT' : 'PI-DRAFT');
    $validityDays = (int)($meta['validityDays'] ?? 7);
    $validityDays = max(1, min(365, $validityDays));
    $grand = belm_master_number($totals['grandTotal'] ?? 0);
    if ($balance === null) $balance = max(0, $grand - $paid);
    $badge = $kind === 'PROFORMA' ? 'VALID ' . $validityDays . ' DAYS' : ($balance <= 0.005 ? 'PAID' : 'OUTSTANDING');

    $chunks = array_chunk($items ?: [['itemNo'=>'1','partNumber'=>'','description'=>'','qty'=>'','unit'=>'','unitPrice'=>'','extended'=>'']], 7);
    $pageContents = [];
    $count = count($chunks);

    if ($kind === 'PROFORMA') {
        // V400: the user's approved DIGITAL PROFORMA V2 itself is the page base.
        // Live values are overlaid into the existing approved panels.
        foreach ($chunks as $pageIndex => $chunk) {
            $last = $pageIndex === $count - 1;
            $c = belm_master_proforma_overlay_header($number, $validityDays);
            $c .= belm_master_proforma_overlay_bill_meta($customer, $meta + ['number' => $number]);
            [$table, $bottom] = belm_master_proforma_overlay_table($chunk, 586);
            $c .= $table;
            if ($last) {
                $c .= belm_master_proforma_overlay_lower($number, $totals, $notice, $bank, $terms, $validityDays);
            } else {
                $c .= belm_master_proforma_overlay_continuation();
                $c .= pdf_text_right(548, 41, 'Page ' . ($pageIndex + 1) . ' of ' . $count, 'F1', 6.3, [1,1,1]);
            }
            $pageContents[] = $c;
        }
        $background = belm_proforma_visual_background_path();
        if (!belm_proforma_visual_background_integrity()) {
            throw new RuntimeException('Approved DIGITAL PROFORMA V2 visual master is missing or changed.');
        }
        return belm_master_assemble_pdf_with_background($pageContents, $background);
    }

    // V404: use the user's approved DIGITAL INVOICE V2 itself as the visual base.
    foreach ($chunks as $pageIndex => $chunk) {
        $last = $pageIndex === $count - 1;
        $c = belm_master_invoice_overlay_header($number, $badge);
        $c .= belm_master_invoice_overlay_bill_meta($customer, $meta + ['number' => $number]);
        [$table, $bottom] = belm_master_proforma_overlay_table($chunk, 586);
        $c .= $table;
        if ($last) {
            $c .= belm_master_invoice_overlay_lower($number, $totals, $bank, $terms, $paid, (float)$balance);
        } else {
            $c .= belm_master_invoice_overlay_continuation();
            $c .= pdf_text_right(548, 41, 'Page ' . ($pageIndex + 1) . ' of ' . $count, 'F1', 6.3, [1,1,1]);
        }
        $pageContents[] = $c;
    }
    $background = belm_invoice_visual_background_path();
    if (!belm_invoice_visual_background_integrity()) {
        throw new RuntimeException('Approved DIGITAL INVOICE V2 visual master is missing or changed.');
    }
    return belm_master_assemble_pdf_with_background($pageContents, $background);
}

function belm_output_commercial_master_pdf(
    string $filename, string $kind, array $customer, array $meta, array $items, array $totals,
    string $notice = '', array $bank = [], array $terms = [], float $paid = 0.0, ?float $balance = null
): void {
    $integrity = belm_commercial_master_template_integrity();
    if (!$integrity['ok']) error_log('BELM V345 commercial master template integrity warning: ' . json_encode($integrity));
    $pdf = belm_build_commercial_master_pdf($kind, $customer, $meta, $items, $totals, $notice, $bank, $terms, $paid, $balance);
    $safeFilename = belm_safe_filename($filename);
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $safeFilename . '"');
    header('Content-Length: ' . strlen($pdf));
    echo $pdf;
    exit;
}
