<?php
// Professional single-document PDF for one Invoice or Proforma Invoice —
// logo, colored table header, bank details, trading terms, and a Code 39
// barcode (for physical/paper tracking) encoding the document number.
// Hand-rolled raw PDF bytes, no external library — same technique as
// table_pdf_helper.php, just richer layout for a single document.

if (!function_exists('table_pdf_escape')) {
    require_once __DIR__ . '/table_pdf_helper.php';
}

// ---------------------------------------------------------------------
// Code 39 barcode — simple, no checksum required, supports 0-9 A-Z - . $ / + % space.
// Each character is 5 bars + 4 spaces (9 elements); '1' = wide, '0' = narrow.
// ---------------------------------------------------------------------
function code39_table(): array {
    return [
        '0' => '000110100', '1' => '100100001', '2' => '001100001', '3' => '101100000',
        '4' => '000110001', '5' => '100110000', '6' => '001110000', '7' => '000100101',
        '8' => '100100100', '9' => '001100100',
        'A' => '100001001', 'B' => '001001001', 'C' => '101001000', 'D' => '000011001',
        'E' => '100011000', 'F' => '001011000', 'G' => '000001101', 'H' => '100001100',
        'I' => '001001100', 'J' => '000011100', 'K' => '100000011', 'L' => '001000011',
        'M' => '101000010', 'N' => '000010011', 'O' => '100010010', 'P' => '001010010',
        'Q' => '000000111', 'R' => '100000110', 'S' => '001000110', 'T' => '000010110',
        'U' => '110000001', 'V' => '011000001', 'W' => '111000000', 'X' => '010010001',
        'Y' => '110010000', 'Z' => '011010000',
        '-' => '010000101', '.' => '110000100', ' ' => '011000100',
        '$' => '010101000', '/' => '010100010', '+' => '010001010', '%' => '000101010',
        '*' => '010010100',
    ];
}

/**
 * Returns ['content' => pdf stream fragment, 'width' => total drawn width]
 * drawing a Code 39 barcode with its lower-left corner at ($x, $y).
 */
function draw_code39_barcode(float $x, float $y, float $barHeight, string $text, float $narrow = 1.1): array {
    $table = code39_table();
    $clean = strtoupper(preg_replace('/[^A-Za-z0-9\-. $\/+%]/', '', $text));
    if ($clean === '') $clean = '0';
    $sequence = '*' . $clean . '*';

    $content = '';
    $cursor = $x;
    $wide = $narrow * 2.5;
    for ($i = 0, $len = strlen($sequence); $i < $len; $i++) {
        $char = $sequence[$i];
        $pattern = $table[$char] ?? $table['0'];
        for ($element = 0; $element < 9; $element++) {
            $isBar = $element % 2 === 0;
            $width = $pattern[$element] === '1' ? $wide : $narrow;
            if ($isBar) {
                $content .= sprintf("%.2F %.2F %.2F %.2F re f\n", $cursor, $y, $width, $barHeight);
            }
            $cursor += $width;
        }
        $cursor += $narrow; // inter-character gap
    }
    return ['content' => $content, 'width' => $cursor - $x];
}

// ---------------------------------------------------------------------
// Small drawing helpers shared by the layout builder below.
// ---------------------------------------------------------------------
function pdf_text(float $x, float $y, string $text, string $font, float $size, array $rgb = [0, 0, 0]): string {
    $color = ($rgb === [0, 0, 0]) ? '' : sprintf("%.2F %.2F %.2F rg\n", $rgb[0], $rgb[1], $rgb[2]);
    $reset = ($rgb === [0, 0, 0]) ? '' : "0 0 0 rg\n";
    return sprintf(
        "BT\n%s/%s %.2F Tf\n1 0 0 1 %.2F %.2F Tm\n(%s) Tj\nET\n%s",
        $color, $font, $size, $x, $y, table_pdf_escape($text), $reset
    );
}

function pdf_text_right(float $rightX, float $y, string $text, string $font, float $size, array $rgb = [0, 0, 0]): string {
    $width = pdf_estimate_text_width($text, $font, $size);
    return pdf_text($rightX - $width, $y, $text, $font, $size, $rgb);
}

function pdf_text_center(float $centerX, float $y, string $text, string $font, float $size, array $rgb = [0, 0, 0]): string {
    $width = pdf_estimate_text_width($text, $font, $size);
    return pdf_text($centerX - $width / 2, $y, $text, $font, $size, $rgb);
}

// Rough Helvetica average-width metric — good enough for right/center
// alignment of short invoice labels and currency figures.
function pdf_estimate_text_width(string $text, string $font, float $size): float {
    $factor = ($font === 'FB') ? 0.60 : 0.52;
    return strlen($text) * $size * $factor;
}

function pdf_rect_fill(float $x, float $y, float $w, float $h, array $rgb): string {
    return sprintf("%.2F %.2F %.2F rg\n%.2F %.2F %.2F %.2F re f\n0 0 0 rg\n", $rgb[0], $rgb[1], $rgb[2], $x, $y, $w, $h);
}

function pdf_rect_stroke(float $x, float $y, float $w, float $h, float $lineWidth = 0.6): string {
    return sprintf("%.2F w\n%.2F %.2F %.2F %.2F re S\n", $lineWidth, $x, $y, $w, $h);
}

function pdf_hline(float $x1, float $x2, float $y, float $lineWidth = 0.6): string {
    return sprintf("%.2F w\n%.2F %.2F m\n%.2F %.2F l\nS\n", $lineWidth, $x1, $y, $x2, $y);
}

/**
 * Wraps $text to fit within $maxWidth points at the given font/size,
 * returning an array of lines (simple greedy word-wrap).
 */
function pdf_wrap_text(string $text, string $font, float $size, float $maxWidth): array {
    $words = preg_split('/\s+/', trim($text));
    $lines = [];
    $current = '';
    foreach ($words as $word) {
        $candidate = $current === '' ? $word : $current . ' ' . $word;
        if (pdf_estimate_text_width($candidate, $font, $size) > $maxWidth && $current !== '') {
            $lines[] = $current;
            $current = $word;
        } else {
            $current = $candidate;
        }
    }
    if ($current !== '') $lines[] = $current;
    return $lines ?: [''];
}

/**
 * @param string $filename        download filename
 * @param string $documentLabel   "PROFORMA INVOICE" or "INVOICE"
 * @param array  $company         ['name','address1','address2','tel','email','website']
 * @param array  $customer        ['name','tin','vrn']
 * @param array  $meta            ['invoiceNo','tin','vrn','date', 'dueDate'?]
 * @param array  $items           each: ['itemNo','partNumber','description','qty','unit','unitPrice','extended']
 * @param array  $totals          ['subtotal','discount','vat','vatLabel','grandTotal']
 * @param array  $bank            list of ['label','value'] lines
 * @param array  $tradingTerms    list of plain text lines
 * @param array  $whyChooseUs     list of bullet strings (empty array to omit the section)
 * @param string $footerNote      e.g. "Thank you for your business"
 * @param array  $paymentSummary  optional list of ['label','value'] lines (e.g. Paid/Balance for real invoices)
 */
function output_professional_document_pdf(
    string $filename,
    string $documentLabel,
    array $company,
    array $customer,
    array $meta,
    array $items,
    array $totals,
    array $bank,
    array $tradingTerms,
    array $whyChooseUs,
    string $footerNote,
    array $paymentSummary = []
): void {
    $pageWidth = 595.0;
    $pageHeight = 842.0;
    $marginX = 40.0;
    $navy = [0.12, 0.19, 0.32];
    $lightGray = [0.94, 0.95, 0.97];
    $accentGold = [0.98, 0.95, 0.86];

    $content = '';

    // ---------------- Logo + company header ----------------
    $logoPath = __DIR__ . '/../assets/watermark.jpg';
    $logoData = is_file($logoPath) ? file_get_contents($logoPath) : false;
    $logoSize = $logoData !== false ? @getimagesizefromstring($logoData) : false;
    $logoDrawW = 74.0;
    $logoDrawH = $logoSize ? $logoDrawW * ($logoSize[1] / $logoSize[0]) : 0.0;
    $logoTopY = $pageHeight - 48 - $logoDrawH;
    if ($logoData !== false && $logoSize !== false) {
        $content .= sprintf("q\n%.2F 0 0 %.2F %.2F %.2F cm\n/Logo Do\nQ\n", $logoDrawW, $logoDrawH, $marginX, $logoTopY);
    }

    $headerRightX = $pageWidth - $marginX;
    $headerY = $pageHeight - 55;
    $content .= pdf_text_right($headerRightX, $headerY, $company['name'] ?? 'BELM GENERAL TECH SERVICE LIMITED', 'FB', 12);
    $headerLines = array_filter([
        $company['address1'] ?? null,
        $company['address2'] ?? null,
        isset($company['tel']) ? 'TEL: ' . $company['tel'] : null,
        isset($company['email']) ? 'EMAIL: ' . $company['email'] : null,
        isset($company['website']) ? 'Website: ' . $company['website'] : null,
    ]);
    $lineY = $headerY - 15;
    foreach ($headerLines as $line) {
        $content .= pdf_text_right($headerRightX, $lineY, (string)$line, 'F1', 9);
        $lineY -= 13;
    }

    // ---------------- Document title ----------------
    $titleY = $logoTopY - 30;
    $content .= pdf_text_center($pageWidth / 2, $titleY, strtoupper($documentLabel), 'FB', 16);

    // ---------------- Bill-to block + meta block ----------------
    $blockTopY = $titleY - 30;
    $content .= pdf_text($marginX, $blockTopY, 'BILL TO: ' . strtoupper((string)($customer['name'] ?? '—')), 'FB', 10);
    $billLineY = $blockTopY - 14;
    if (!empty($customer['tin'])) { $content .= pdf_text($marginX + 12, $billLineY, 'TIN: ' . $customer['tin'], 'F1', 9); $billLineY -= 13; }
    if (!empty($customer['vrn'])) { $content .= pdf_text($marginX + 12, $billLineY, 'VRN: ' . $customer['vrn'], 'F1', 9); $billLineY -= 13; }

    $metaRightX = $pageWidth - $marginX;
    $metaLineY = $blockTopY;
    foreach ($meta as $label => $value) {
        if ($value === null || $value === '') continue;
        $niceLabel = strtoupper((string)preg_replace('/(?<!^)([A-Z])/', ' $1', $label));
        $isPrimary = in_array($label, ['invoiceNo'], true);
        $content .= pdf_text_right($metaRightX, $metaLineY, $niceLabel . ': ' . $value, $isPrimary ? 'FB' : 'F1', 9.5);
        $metaLineY -= 14;
    }

    // ---------------- Barcode (tracking) ----------------
    $barcodeText = (string)($meta['invoiceNo'] ?? $filename);
    $barcodeY = min($billLineY, $metaLineY) - 26;
    $barcode = draw_code39_barcode($marginX, $barcodeY, 24, $barcodeText, 1.05);
    $content .= $barcode['content'];
    $content .= pdf_text($marginX, $barcodeY - 11, $barcodeText, 'F1', 8);

    // ---------------- Items table ----------------
    $tableTop = $barcodeY - 34;
    $colWidths = ['itemNo' => 25, 'partNumber' => 85, 'description' => 180, 'qty' => 30, 'unit' => 35, 'unitPrice' => 75, 'extended' => 85];
    $colLabels = ['itemNo' => 'Item', 'partNumber' => 'Part Number', 'description' => 'Description', 'qty' => 'Qty', 'unit' => 'Unit', 'unitPrice' => 'Unit Price', 'extended' => 'Extended Price'];
    $tableWidth = array_sum($colWidths);
    $rowHeight = 18.0;
    $headerHeight = 20.0;

    $content .= pdf_rect_fill($marginX, $tableTop - $headerHeight, $tableWidth, $headerHeight, $navy);
    $colX = $marginX;
    $headerTextY = $tableTop - $headerHeight + 6;
    foreach ($colWidths as $key => $width) {
        $align = in_array($key, ['qty', 'unitPrice', 'extended'], true) ? 'right' : 'left';
        $label = $colLabels[$key];
        if ($align === 'right') {
            $content .= pdf_text_right($colX + $width - 5, $headerTextY, $label, 'FB', 8.5, [1, 1, 1]);
        } else {
            $content .= pdf_text($colX + 5, $headerTextY, $label, 'FB', 8.5, [1, 1, 1]);
        }
        $colX += $width;
    }

    $rowTop = $tableTop - $headerHeight;
    $rowIndex = 0;
    foreach ($items as $item) {
        $rowTop -= $rowHeight;
        if ($rowIndex % 2 === 1) {
            $content .= pdf_rect_fill($marginX, $rowTop, $tableWidth, $rowHeight, $lightGray);
        }
        $colX = $marginX;
        $textY = $rowTop + 5;
        foreach ($colWidths as $key => $width) {
            $value = (string)($item[$key] ?? '');
            $align = in_array($key, ['qty', 'unitPrice', 'extended'], true) ? 'right' : 'left';
            if ($align === 'right') {
                $content .= pdf_text_right($colX + $width - 5, $textY, $value, 'F1', 8.5);
            } else {
                $content .= pdf_text($colX + 5, $textY, $value, 'F1', 8.5);
            }
            $colX += $width;
        }
        $rowIndex++;
    }
    $tableBottom = $rowTop;
    $content .= pdf_rect_stroke($marginX, $tableBottom, $tableWidth, $tableTop - $tableBottom, 0.7);
    // Column separators
    $colX = $marginX;
    foreach ($colWidths as $width) {
        $colX += $width;
        if ($colX < $marginX + $tableWidth - 1) $content .= pdf_hline($colX, $colX, $tableTop, 0.4) . '';
        // vertical separator drawn via rect-less line:
    }
    $colX = $marginX;
    foreach ($colWidths as $width) {
        $colX += $width;
        $content .= sprintf("0.4 w\n%.2F %.2F m\n%.2F %.2F l\nS\n", $colX, $tableTop, $colX, $tableBottom);
    }

    // ---------------- Totals ----------------
    $totalsY = $tableBottom - 20;
    $totalsLabelX = $marginX + $tableWidth - $colWidths['extended'] - $colWidths['unitPrice'];
    $totalsValueRightX = $marginX + $tableWidth;

    $totalRows = [];
    if (isset($totals['subtotal'])) $totalRows[] = ['Subtotal', $totals['subtotal'], false];
    if (isset($totals['discount']) && (float)str_replace(',', '', (string)$totals['discount']) != 0.0) $totalRows[] = ['Discount', $totals['discount'], false];
    if (isset($totals['vat'])) $totalRows[] = [$totals['vatLabel'] ?? 'VAT', $totals['vat'], false];
    if (isset($totals['grandTotal'])) $totalRows[] = ['Grand Total', $totals['grandTotal'], true];

    foreach ($totalRows as [$label, $value, $isGrand]) {
        if ($isGrand) {
            $content .= pdf_rect_fill($totalsLabelX - 6, $totalsY - 4, $totalsValueRightX - $totalsLabelX + 6, 18, $accentGold);
        }
        $content .= pdf_text($totalsLabelX, $totalsY, $label, $isGrand ? 'FB' : 'F1', 9.5);
        $content .= pdf_text_right($totalsValueRightX, $totalsY, (string)$value, $isGrand ? 'FB' : 'F1', 9.5);
        $totalsY -= 17;
    }

    foreach ($paymentSummary as [$label, $value]) {
        $content .= pdf_text($totalsLabelX, $totalsY, $label, 'F1', 9.5);
        $content .= pdf_text_right($totalsValueRightX, $totalsY, (string)$value, 'F1', 9.5);
        $totalsY -= 17;
    }

    // ---------------- Bank details ----------------
    $sectionY = $totalsY - 22;
    $content .= pdf_hline($marginX, $marginX + $tableWidth, $sectionY + 12, 0.6);
    if ($bank) {
        $content .= pdf_text($marginX, $sectionY, 'BANK DETAILS', 'FB', 9.5);
        $sectionY -= 14;
        foreach ($bank as [$label, $value]) {
            $content .= pdf_text($marginX, $sectionY, $label . ': ', 'FB', 8.5);
            $content .= pdf_text($marginX + pdf_estimate_text_width($label . ':  ', 'FB', 8.5), $sectionY, (string)$value, 'F1', 8.5);
            $sectionY -= 13;
        }
        $sectionY -= 4;
    }

    // ---------------- Trading terms ----------------
    if ($tradingTerms) {
        $content .= pdf_text($marginX, $sectionY, 'TRADING TERMS', 'FB', 9.5);
        $sectionY -= 14;
        foreach ($tradingTerms as $term) {
            $content .= pdf_text($marginX, $sectionY, (string)$term, 'F1', 8.5);
            $sectionY -= 13;
        }
        $sectionY -= 4;
    }

    // ---------------- Why choose us ----------------
    if ($whyChooseUs) {
        $content .= pdf_text($marginX, $sectionY, 'Why Choose Us!', 'FB', 9.5, $navy);
        $sectionY -= 14;
        foreach ($whyChooseUs as $point) {
            $content .= pdf_text($marginX + 12, $sectionY, '* ' . $point, 'F1', 8.5, $navy);
            $sectionY -= 13;
        }
        $sectionY -= 6;
    }

    // ---------------- Footer bar ----------------
    if ($footerNote !== '') {
        $footerY = max($sectionY, 60);
        $content .= pdf_rect_fill($marginX, $footerY - 4, $tableWidth, 18, $navy);
        $content .= pdf_text_center($marginX + $tableWidth / 2, $footerY, $footerNote, 'FB', 9.5, [1, 1, 1]);
    }

    // ---------------- Assemble the raw PDF ----------------
    $fontObject = 4;
    $fontBoldObject = 5;
    $logoObject = null;
    if ($logoData !== false && $logoSize !== false) $logoObject = 6;

    $objects = [];
    $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    $objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
    $objects[3] =
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {$pageWidth} {$pageHeight}] "
        . "/Resources << /Font << /F1 {$fontObject} 0 R /FB {$fontBoldObject} 0 R >>"
        . ($logoObject !== null ? " /XObject << /Logo {$logoObject} 0 R >>" : '')
        . " >> /Contents 7 0 R >>";
    $objects[$fontObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    $objects[$fontBoldObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
    if ($logoObject !== null) {
        $objects[$logoObject] =
            "<< /Type /XObject /Subtype /Image /Width {$logoSize[0]} /Height {$logoSize[1]} "
            . "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode "
            . "/Length " . strlen($logoData) . " >>\nstream\n{$logoData}\nendstream";
    }
    $objects[7] = "<< /Length " . strlen($content) . " >>\nstream\n{$content}endstream";
    ksort($objects);

    $pdf = "%PDF-1.4\n";
    $offsets = [0];
    $objectCount = max(array_keys($objects));
    for ($number = 1; $number <= $objectCount; $number++) {
        $offsets[$number] = strlen($pdf);
        $body = $objects[$number] ?? '<< >>';
        $pdf .= "{$number} 0 obj\n{$body}\nendobj\n";
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
