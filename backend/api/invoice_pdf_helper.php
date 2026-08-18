<?php
// Professional single-document PDF for one Invoice, Proforma Invoice or
// Receipt — logo, colored table header with full grid borders, bank
// details, trading terms, an optional Important Notice box, and a Code 39
// barcode (for physical/paper tracking) encoding the document number.
// Hand-rolled raw PDF bytes, no external library — same technique as
// table_pdf_helper.php, just a richer, paginated layout.

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

function draw_code39_barcode(float $x, float $y, float $barHeight, string $text, float $narrow = 1.1): array {
    $table = code39_table();
    $clean = strtoupper((string)preg_replace('/[^A-Za-z0-9\-. $\/+%]/', '', $text));
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
        $cursor += $narrow;
    }
    return ['content' => $content, 'width' => $cursor - $x];
}

// ---------------------------------------------------------------------
// Small drawing helpers.
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
    return pdf_text($rightX - pdf_estimate_text_width($text, $font, $size), $y, $text, $font, $size, $rgb);
}

function pdf_text_center(float $centerX, float $y, string $text, string $font, float $size, array $rgb = [0, 0, 0]): string {
    return pdf_text($centerX - pdf_estimate_text_width($text, $font, $size) / 2, $y, $text, $font, $size, $rgb);
}

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

function pdf_line(float $x1, float $y1, float $x2, float $y2, float $lineWidth = 0.6): string {
    return sprintf("%.2F w\n%.2F %.2F m\n%.2F %.2F l\nS\n", $lineWidth, $x1, $y1, $x2, $y2);
}

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

/** Safe filename for a Content-Disposition header — letters, digits, dash, underscore, dot only. */
function belm_safe_filename(string $name): string {
    $clean = preg_replace('/[^A-Za-z0-9\-_.]+/', '-', $name);
    $clean = trim((string)preg_replace('/-+/', '-', $clean), '-');
    return $clean === '' ? 'document' : $clean;
}

const BELM_PDF_PAGE_WIDTH = 595.0;
const BELM_PDF_PAGE_HEIGHT = 842.0;
const BELM_PDF_MARGIN_X = 40.0;
const BELM_PDF_NAVY = [0.12, 0.19, 0.32];
const BELM_PDF_LIGHT_GRAY = [0.94, 0.95, 0.97];
const BELM_PDF_GOLD = [0.98, 0.95, 0.86];
const BELM_PDF_TABLE_COLS = ['itemNo' => 25, 'partNumber' => 80, 'description' => 175, 'qty' => 30, 'unit' => 35, 'unitPrice' => 75, 'extended' => 90];

/**
 * Draws the shared page header (logo + company block, document title,
 * customer/meta blocks and barcode). Returns [content, nextY, logoData, logoSize].
 * $fullHeader is false on table-continuation pages (page 2+), which only
 * repeat a small running header + the table.
 */
function belm_render_document_head(
    array $company, string $documentLabel, array $customer, array $meta,
    bool $fullHeader, int $pageNumber, int $pageCount
): array {
    $pageWidth = BELM_PDF_PAGE_WIDTH;
    $marginX = BELM_PDF_MARGIN_X;
    $content = '';

    $logoPath = __DIR__ . '/../assets/watermark.jpg';
    $logoData = is_file($logoPath) ? file_get_contents($logoPath) : false;
    $logoSize = $logoData !== false ? @getimagesizefromstring($logoData) : false;
    $logoDrawW = $fullHeader ? 130.0 : 70.0;
    $logoDrawH = $logoSize ? $logoDrawW * ($logoSize[1] / $logoSize[0]) : 0.0;
    $logoTopY = BELM_PDF_PAGE_HEIGHT - 48 - $logoDrawH;
    if ($logoData !== false && $logoSize !== false) {
        $content .= sprintf("q\n%.2F 0 0 %.2F %.2F %.2F cm\n/Logo Do\nQ\n", $logoDrawW, $logoDrawH, $marginX, $logoTopY);
    }

    $headerRightX = $pageWidth - $marginX;
    $headerY = BELM_PDF_PAGE_HEIGHT - 55;
    $content .= pdf_text_right($headerRightX, $headerY, $company['companyName'] ?? 'BELM GENERAL TECH SERVICE LIMITED', 'FB', $fullHeader ? 12 : 10);

    $lineY = $headerY - 15;
    if ($fullHeader) {
        $headerLines = array_filter([
            $company['companyAddress'] ?? null,
            isset($company['companyPhone']) ? 'TEL: ' . $company['companyPhone'] : null,
            isset($company['companyEmail']) ? 'EMAIL: ' . $company['companyEmail'] : null,
            isset($company['companyWebsite']) ? 'Website: ' . $company['companyWebsite'] : null,
        ]);
        foreach ($headerLines as $line) {
            $content .= pdf_text_right($headerRightX, $lineY, (string)$line, 'F1', 9);
            $lineY -= 13;
        }
    }

    if ($pageCount > 1) {
        $content .= pdf_text_right($headerRightX, $lineY - 4, "Page {$pageNumber} of {$pageCount}", 'F1', 8, [0.4, 0.4, 0.4]);
        $lineY -= 16;
    }

    $titleY = $logoTopY - 30;
    $titleText = $fullHeader ? strtoupper($documentLabel) : strtoupper($documentLabel) . ' (continued)';
    $content .= pdf_text_center($pageWidth / 2, $titleY, $titleText, 'FB', $fullHeader ? 16 : 12);

    $nextY = $titleY - 30;

    if ($fullHeader) {
        $content .= pdf_text($marginX, $nextY, 'BILL TO: ' . strtoupper((string)($customer['name'] ?? '—')), 'FB', 10);
        $billLineY = $nextY - 14;
        foreach (['tin' => 'TIN', 'vrn' => 'VRN', 'address' => 'Address', 'phone' => 'Phone', 'email' => 'Email'] as $key => $label) {
            if (!empty($customer[$key])) {
                $content .= pdf_text($marginX + 12, $billLineY, $label . ': ' . $customer[$key], 'F1', 9);
                $billLineY -= 13;
            }
        }

        $metaRightX = $pageWidth - $marginX;
        $metaLineY = $nextY;
        foreach ($meta as $label => $value) {
            if ($value === null || $value === '') continue;
            $niceLabel = strtoupper((string)preg_replace('/(?<!^)([A-Z])/', ' $1', $label));
            $isPrimary = in_array($label, ['invoiceNo', 'receiptNo'], true);
            $content .= pdf_text_right($metaRightX, $metaLineY, $niceLabel . ': ' . $value, $isPrimary ? 'FB' : 'F1', 9.5);
            $metaLineY -= 14;
        }

        $barcodeY = min($billLineY, $metaLineY) - 26;
        $barcodeText = (string)($meta['invoiceNo'] ?? $meta['receiptNo'] ?? '');
        if ($barcodeText !== '') {
            $barcode = draw_code39_barcode($marginX, $barcodeY, 24, $barcodeText, 1.05);
            $content .= $barcode['content'];
            $content .= pdf_text($marginX, $barcodeY - 11, $barcodeText, 'F1', 8);
            $nextY = $barcodeY - 34;
        } else {
            $nextY = min($billLineY, $metaLineY) - 20;
        }
    } else {
        $nextY -= 10;
    }

    return [$content, $nextY, $logoData, $logoSize];
}

/** Draws the items table header row at $y, returns the content fragment. */
function belm_render_table_header(float $y): string {
    $marginX = BELM_PDF_MARGIN_X;
    $colWidths = BELM_PDF_TABLE_COLS;
    $colLabels = ['itemNo' => 'Item', 'partNumber' => 'Part Number', 'description' => 'Description', 'qty' => 'Qty', 'unit' => 'Unit', 'unitPrice' => 'Unit Price', 'extended' => 'Extended Price'];
    $tableWidth = array_sum($colWidths);
    $headerHeight = 20.0;

    $content = pdf_rect_fill($marginX, $y - $headerHeight, $tableWidth, $headerHeight, BELM_PDF_NAVY);
    $colX = $marginX;
    $textY = $y - $headerHeight + 6;
    foreach ($colWidths as $key => $width) {
        $align = in_array($key, ['qty', 'unitPrice', 'extended'], true) ? 'right' : 'left';
        $label = $colLabels[$key];
        $content .= $align === 'right'
            ? pdf_text_right($colX + $width - 5, $textY, $label, 'FB', 8.5, [1, 1, 1])
            : pdf_text($colX + 5, $textY, $label, 'FB', 8.5, [1, 1, 1]);
        $colX += $width;
    }
    return $content;
}

/**
 * @param string $filename        download filename (already meaningful; will be sanitized)
 * @param string $documentLabel   "PROFORMA INVOICE" / "INVOICE" / "OFFICIAL RECEIPT"
 * @param array  $company         result of belm_get_company_details()
 * @param array  $customer        ['name','tin','vrn','address'?,'phone'?,'email'?]
 * @param array  $meta            ordered [label => value] pairs, e.g. ['invoiceNo'=>..,'tin'=>..,'vrn'=>..,'date'=>..]
 * @param array  $items           each: ['itemNo','partNumber','description','qty','unit','unitPrice','extended']
 * @param array  $totals          ['subtotal','discount','discountLabel'?,'vat','vatLabel','grandTotal']
 * @param string $notice          optional Important Notice text — omit the whole box if empty
 * @param array  $bank            list of [label, value] pairs
 * @param array  $tradingTerms    list of plain text lines
 * @param array  $whyChooseUs     list of bullet strings (empty array to omit the section)
 * @param string $footerNote
 * @param array  $paymentSummary  optional list of [label, value] lines
 */
function output_professional_document_pdf(
    string $filename,
    string $documentLabel,
    array $company,
    array $customer,
    array $meta,
    array $items,
    array $totals,
    string $notice,
    array $bank,
    array $tradingTerms,
    array $whyChooseUs,
    string $footerNote,
    array $paymentSummary = []
): void {
    $marginX = BELM_PDF_MARGIN_X;
    $colWidths = BELM_PDF_TABLE_COLS;
    $tableWidth = array_sum($colWidths);
    $rowHeight = 18.0;
    $bottomSafeY = 60.0;

    $totalRowsCount = count(array_filter([
        isset($totals['subtotal']),
        isset($totals['discount']) && (float)str_replace(',', '', (string)($totals['discount'] ?? '0')) != 0.0,
        isset($totals['vat']),
        isset($totals['grandTotal']),
    ])) + count($paymentSummary);
    $footerBlockHeight = 22 + $totalRowsCount * 17
        + ($notice !== '' ? 46 : 0)
        + ($bank ? 18 + count($bank) * 13 + 4 : 0)
        + ($tradingTerms ? 18 + count($tradingTerms) * 13 + 4 : 0)
        + ($whyChooseUs ? 18 + count($whyChooseUs) * 13 + 6 : 0)
        + ($footerNote !== '' ? 30 : 0)
        + 20;

    $pages = [];
    $remaining = $items;
    $pageIndex = 0;
    while (true) {
        $pageIndex++;
        $isFirstPage = $pageIndex === 1;
        $headEndY = $isFirstPage ? 460.0 : 700.0;
        $isLastChunk = false;
        $maxRowsHere = (int)floor(($headEndY - $bottomSafeY) / $rowHeight);
        if (count($remaining) <= $maxRowsHere) {
            $roomWithFooter = (int)floor(($headEndY - $bottomSafeY - $footerBlockHeight) / $rowHeight);
            if (count($remaining) <= max(1, $roomWithFooter)) {
                $isLastChunk = true;
                $maxRowsHere = count($remaining);
            } else {
                $maxRowsHere = max(1, $roomWithFooter);
            }
        }
        $take = array_splice($remaining, 0, max(1, $maxRowsHere));
        $pages[] = ['rows' => $take, 'isLast' => $isLastChunk && count($remaining) === 0];
        if (count($remaining) === 0) break;
        if ($pageIndex > 40) break;
    }
    if (!$pages) $pages = [['rows' => [], 'isLast' => true]];
    $pageCount = count($pages);

    $logoData = false;
    $logoSize = false;
    $pageContents = [];

    foreach ($pages as $index => $pageInfo) {
        $pageNumber = $index + 1;
        $isFirstPage = $pageNumber === 1;
        [$headContent, $tableTop, $ld, $ls] = belm_render_document_head(
            $company, $documentLabel, $customer, $meta, $isFirstPage, $pageNumber, $pageCount
        );
        if ($ld !== false) { $logoData = $ld; $logoSize = $ls; }

        $content = '';
        if ($ld !== false && $ls !== false) {
            $wmWidth = 340.0;
            $wmHeight = $wmWidth * ($ls[1] / $ls[0]);
            $wmX = (BELM_PDF_PAGE_WIDTH - $wmWidth) / 2;
            $wmY = (BELM_PDF_PAGE_HEIGHT - $wmHeight) / 2;
            // Faint background watermark — drawn first (behind everything
            // else) at low opacity via an ExtGState so it never competes
            // with the text and numbers printed on top of it.
            $content .= sprintf("q\n/GSWatermark gs\n%.2F 0 0 %.2F %.2F %.2F cm\n/Logo Do\nQ\n", $wmWidth, $wmHeight, $wmX, $wmY);
        }
        $content .= $headContent;
        $content .= belm_render_table_header($tableTop);
        $headerHeight = 20.0;
        $rowTop = $tableTop - $headerHeight;
        $rowIndexOnPage = 0;
        foreach ($pageInfo['rows'] as $item) {
            $rowTop -= $rowHeight;
            if ($rowIndexOnPage % 2 === 1) {
                $content .= pdf_rect_fill($marginX, $rowTop, $tableWidth, $rowHeight, BELM_PDF_LIGHT_GRAY);
            }
            $colX = $marginX;
            $textY = $rowTop + 5;
            foreach ($colWidths as $key => $width) {
                $value = (string)($item[$key] ?? '');
                $align = in_array($key, ['qty', 'unitPrice', 'extended'], true) ? 'right' : 'left';
                $content .= $align === 'right'
                    ? pdf_text_right($colX + $width - 5, $textY, $value, 'F1', 8.5)
                    : pdf_text($colX + 5, $textY, $value, 'F1', 8.5);
                $colX += $width;
            }
            $rowIndexOnPage++;
        }
        $tableBottom = $rowTop;

        $content .= pdf_rect_stroke($marginX, $tableBottom, $tableWidth, $tableTop - $tableBottom, 0.7);
        $colX = $marginX;
        foreach ($colWidths as $width) {
            $colX += $width;
            $content .= pdf_line($colX, $tableTop, $colX, $tableBottom, 0.4);
        }
        for ($lineY = $tableTop - $headerHeight; $lineY >= $tableBottom; $lineY -= $rowHeight) {
            $content .= pdf_line($marginX, $lineY, $marginX + $tableWidth, $lineY, 0.4);
        }

        if (!$pageInfo['isLast']) {
            $content .= pdf_text($marginX, $tableBottom - 16, 'Continued on next page…', 'F1', 8, [0.4, 0.4, 0.4]);
            $pageContents[] = $content;
            continue;
        }

        $y = $tableBottom - 20;
        $totalsLabelX = $marginX + $tableWidth - $colWidths['extended'] - $colWidths['unitPrice'];
        $totalsValueRightX = $marginX + $tableWidth;

        $totalRows = [];
        if (isset($totals['subtotal'])) $totalRows[] = ['Subtotal', $totals['subtotal'], false];
        if (isset($totals['discount']) && (float)str_replace(',', '', (string)$totals['discount']) != 0.0) {
            $totalRows[] = [$totals['discountLabel'] ?? 'Discount', $totals['discount'], false];
        }
        if (isset($totals['vat'])) $totalRows[] = [$totals['vatLabel'] ?? 'VAT', $totals['vat'], false];
        if (isset($totals['grandTotal'])) $totalRows[] = ['Grand Total', $totals['grandTotal'], true];

        foreach ($totalRows as [$label, $value, $isGrand]) {
            if ($isGrand) {
                $content .= pdf_rect_fill($totalsLabelX - 6, $y - 4, $totalsValueRightX - $totalsLabelX + 6, 18, BELM_PDF_GOLD);
            }
            $content .= pdf_text($totalsLabelX, $y, $label, $isGrand ? 'FB' : 'F1', 9.5);
            $content .= pdf_text_right($totalsValueRightX, $y, (string)$value, $isGrand ? 'FB' : 'F1', 9.5);
            $y -= 17;
        }
        foreach ($paymentSummary as [$label, $value]) {
            $content .= pdf_text($totalsLabelX, $y, $label, 'F1', 9.5);
            $content .= pdf_text_right($totalsValueRightX, $y, (string)$value, 'F1', 9.5);
            $y -= 17;
        }

        if ($notice !== '') {
            $y -= 8;
            $noticeLines = pdf_wrap_text('Important Notice: ' . $notice, 'F1', 8.5, $tableWidth - 20);
            $boxHeight = 14 + count($noticeLines) * 12;
            $content .= pdf_rect_stroke($marginX, $y - $boxHeight + 10, $tableWidth, $boxHeight, 0.7);
            $noticeY = $y;
            foreach ($noticeLines as $lineIndex => $line) {
                $content .= pdf_text($marginX + 10, $noticeY, $line, $lineIndex === 0 ? 'FB' : 'F1', 8.5);
                $noticeY -= 12;
            }
            $y = $y - $boxHeight - 6;
        }

        $y -= 6;
        $content .= pdf_line($marginX, $y + 12, $marginX + $tableWidth, $y + 12, 0.6);
        if ($bank) {
            $content .= pdf_text($marginX, $y, 'BANK DETAILS', 'FB', 9.5);
            $y -= 14;
            foreach ($bank as [$label, $value]) {
                $content .= pdf_text($marginX, $y, $label . ': ', 'FB', 8.5);
                $content .= pdf_text($marginX + pdf_estimate_text_width($label . ':  ', 'FB', 8.5), $y, (string)$value, 'F1', 8.5);
                $y -= 13;
            }
            $y -= 4;
        }
        if ($tradingTerms) {
            $content .= pdf_text($marginX, $y, 'TRADING TERMS', 'FB', 9.5);
            $y -= 14;
            foreach ($tradingTerms as $term) {
                $content .= pdf_text($marginX, $y, (string)$term, 'F1', 8.5);
                $y -= 13;
            }
            $y -= 4;
        }
        if ($whyChooseUs) {
            $content .= pdf_text($marginX, $y, 'Why Choose Us!', 'FB', 9.5, BELM_PDF_NAVY);
            $y -= 14;
            foreach ($whyChooseUs as $point) {
                $content .= pdf_text($marginX + 12, $y, '* ' . $point, 'F1', 8.5, BELM_PDF_NAVY);
                $y -= 13;
            }
            $y -= 6;
        }
        if ($footerNote !== '') {
            $footerY = max($y, $bottomSafeY);
            $content .= pdf_rect_fill($marginX, $footerY - 4, $tableWidth, 18, BELM_PDF_NAVY);
            $content .= pdf_text_center($marginX + $tableWidth / 2, $footerY, $footerNote, 'FB', 9.5, [1, 1, 1]);
        }

        $pageContents[] = $content;
    }

    belm_assemble_pdf($filename, $pageContents, $logoData, $logoSize);
}

/** Turns a list of page content-stream strings into raw PDF bytes and streams the download. */
function belm_assemble_pdf(string $filename, array $pageContents, $logoData, $logoSize): void {
    $pageCount = count($pageContents);
    $fontObject = 3 + $pageCount * 2;
    $fontBoldObject = $fontObject + 1;
    $logoObject = ($logoData !== false && $logoSize !== false) ? $fontBoldObject + 1 : null;
    $gsObject = $logoObject !== null ? $logoObject + 1 : null;

    $objects = [];
    $pageReferences = [];
    foreach ($pageContents as $index => $content) {
        $pageObject = 3 + $index * 2;
        $contentObject = $pageObject + 1;
        $pageReferences[] = $pageObject . ' 0 R';
        $objects[$pageObject] =
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " . BELM_PDF_PAGE_WIDTH . ' ' . BELM_PDF_PAGE_HEIGHT . '] '
            . "/Resources << /Font << /F1 {$fontObject} 0 R /FB {$fontBoldObject} 0 R >>"
            . ($logoObject !== null ? " /XObject << /Logo {$logoObject} 0 R >>" : '')
            . ($gsObject !== null ? " /ExtGState << /GSWatermark {$gsObject} 0 R >>" : '')
            . " >> /Contents {$contentObject} 0 R >>";
        $objects[$contentObject] = "<< /Length " . strlen($content) . " >>\nstream\n{$content}endstream";
    }
    $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    $objects[2] = '<< /Type /Pages /Kids [' . implode(' ', $pageReferences) . '] /Count ' . $pageCount . ' >>';
    $objects[$fontObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    $objects[$fontBoldObject] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
    if ($logoObject !== null) {
        $objects[$logoObject] =
            "<< /Type /XObject /Subtype /Image /Width {$logoSize[0]} /Height {$logoSize[1]} "
            . "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode "
            . "/Length " . strlen($logoData) . " >>\nstream\n{$logoData}\nendstream";
    }
    if ($gsObject !== null) {
        // Low opacity so the watermark sits faintly behind the printed
        // text/table instead of competing with it.
        $objects[$gsObject] = '<< /Type /ExtGState /ca 0.07 /CA 0.07 >>';
    }
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

    $safeFilename = belm_safe_filename($filename);
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $safeFilename . '"');
    header('Content-Length: ' . strlen($pdf));
    echo $pdf;
    exit;
}


// V301 - reusable customer-safe invoice PDF output. When customerId is
// supplied, the document is returned only when that invoice belongs to the
// authenticated customer.
function belm_output_invoice_document_pdf(string $invoiceId, ?string $customerId = null): void {
    require_once __DIR__ . '/commercial_master_pdf_helper.php';
    $sql='SELECT i.*,c.name AS customer_name,c.email AS customer_email,c.phone AS customer_phone,
                 c.address AS customer_address,c.tin_number AS customer_tin,c.vrn AS customer_vrn,
                 j.job_card_no AS source_job_card_no
          FROM invoices i
          JOIN customers c ON c.id=i.customer_id
          LEFT JOIN digital_job_cards j ON j.id=i.source_job_card_id
          WHERE i.id=? AND i.deleted_at IS NULL';
    $params=[$invoiceId];
    if($customerId!==null){$sql.=' AND i.customer_id=?';$params[]=$customerId;}
    $stmt=db()->prepare($sql);$stmt->execute($params);$invoice=$stmt->fetch();
    if(!$invoice) json_error('Invoice not found or not available to this customer.',404);

    $itemsStmt=db()->prepare('SELECT part_number,description,quantity,unit,unit_price,line_total FROM invoice_items WHERE invoice_id=?');
    $itemsStmt->execute([$invoiceId]);$items=$itemsStmt->fetchAll();
    $paymentsStmt=db()->prepare('SELECT p.paid_at,p.amount,p.method,b.bank_name FROM payments p LEFT JOIN bank_accounts b ON b.id=p.bank_account_id WHERE p.invoice_id=? ORDER BY p.paid_at ASC');
    $paymentsStmt->execute([$invoiceId]);$payments=$paymentsStmt->fetchAll();
    $paid=array_sum(array_map(static fn($x)=>(float)$x['amount'],$payments));
    $balance=max(0,(float)$invoice['total']-$paid);
    $company=belm_get_company_details();

    $pdfItems=[];
    foreach($items as $index=>$item){
        $pdfItems[]=[
            'itemNo'=>(string)($index+1),
            'partNumber'=>(string)($item['part_number']?:''),
            'description'=>(string)$item['description'],
            'qty'=>(string)$item['quantity'],
            'unit'=>(string)($item['unit']?:'PC'),
            'unitPrice'=>number_format((float)$item['unit_price'],2),
            'extended'=>number_format((float)$item['line_total'],2),
        ];
    }
    $bank=[
        ['ACCOUNT NAME',(string)($company['bankAccountName']?:BELM_MASTER_ACCOUNT_NAME)],
        ['NMB BANK',(string)($company['bankNmbNumber']?:BELM_MASTER_NMB)],
        ['CRDB BANK',(string)($company['bankCrdbNumber']?:BELM_MASTER_CRDB)],
    ];
    $terms=array_values(array_filter([
        $invoice['payment_terms']?'Payment: '.$invoice['payment_terms']:($company['defaultPaymentTerms']?'Payment: '.$company['defaultPaymentTerms']:null),
        $company['defaultDeliveryTime']?'Delivery: '.$company['defaultDeliveryTime']:null,
    ]));
    belm_output_commercial_master_pdf(
        'Invoice-'.$invoice['invoice_no'].'-'.$invoice['customer_name'].'.pdf',
        'INVOICE',
        ['name'=>$invoice['customer_name'],'tin'=>$invoice['customer_tin']?:null,'vrn'=>$invoice['customer_vrn']?:null,'customerRef'=>$invoice['customer_name']],
        [
            'number'=>$invoice['invoice_no'],
            'issueDate'=>belm_master_date_display((string)$invoice['created_at']),
            'currency'=>'TZS',
            'dueStatus'=>$balance<=0.005?'PAID':'OUTSTANDING',
            'jobCardRef'=>trim((string)($invoice['source_job_card_no']??''))?:'-',
            'validityDays'=>7,
        ],
        $pdfItems,
        [
            'subtotal'=>(float)$invoice['subtotal'],
            'discount'=>(float)($invoice['discount']??0),
            'vat'=>(float)$invoice['tax'],
            'vatLabel'=>((float)($invoice['vat_rate']??0)>0?'VAT '.rtrim(rtrim(number_format((float)$invoice['vat_rate'],2),'0'),'.').'%':'VAT 0%'),
            'grandTotal'=>(float)$invoice['total'],
        ],
        (string)($invoice['notice']??''),
        $bank,
        $terms,
        $paid,
        $balance
    );
}
