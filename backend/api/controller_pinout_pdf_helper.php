<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/invoice_pdf_helper.php';

function belm_controller_pdf_safe_text(?string $value): string {
    $text = trim((string)$value);
    if ($text === '') return '-';
    // The built-in PDF writer uses Helvetica/WinAnsi-like text. Keep the
    // document printable even when pasted text contains smart punctuation.
    return strtr($text, [
        "\xE2\x80\x93" => '-', "\xE2\x80\x94" => '-', "\xE2\x80\x98" => "'",
        "\xE2\x80\x99" => "'", "\xE2\x80\x9C" => '"', "\xE2\x80\x9D" => '"',
        "\xC2\xA0" => ' ',
    ]);
}

function belm_load_controller_pinout_pdf(string $id): array {
    $stmt = db()->prepare('SELECT * FROM controller_pinouts WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$id]);
    $pinout = $stmt->fetch();
    if (!$pinout) json_error('Controller pinout not found.', 404);

    $pinsStmt = db()->prepare(
        'SELECT pin_label, pin_function, sort_order FROM controller_pinout_pins WHERE pinout_id = ? ORDER BY sort_order ASC, created_at ASC'
    );
    $pinsStmt->execute([$id]);
    $pins = $pinsStmt->fetchAll();

    $photosStmt = db()->prepare(
        'SELECT label, photo_mime, sort_order FROM controller_pinout_photos WHERE pinout_id = ? ORDER BY sort_order ASC, created_at ASC'
    );
    $photosStmt->execute([$id]);
    $photos = $photosStmt->fetchAll();

    return [$pinout, $pins, $photos];
}

function belm_controller_pdf_header(array $company, array $pinout, int $pageNo, bool $continuation = false): array {
    $pageW = BELM_PDF_PAGE_WIDTH;
    $pageH = BELM_PDF_PAGE_HEIGHT;
    $margin = BELM_PDF_MARGIN_X;
    $content = '';

    $logoPath = __DIR__ . '/../assets/watermark.jpg';
    $logoData = is_file($logoPath) ? file_get_contents($logoPath) : false;
    $logoSize = $logoData !== false ? @getimagesizefromstring($logoData) : false;
    if ($logoData !== false && $logoSize !== false) {
        $logoW = $continuation ? 72.0 : 108.0;
        $logoH = $logoW * ($logoSize[1] / $logoSize[0]);
        $logoY = $pageH - 46 - $logoH;
        $content .= sprintf("q\n%.2F 0 0 %.2F %.2F %.2F cm\n/Logo Do\nQ\n", $logoW, $logoH, $margin, $logoY);
    }

    $right = $pageW - $margin;
    $content .= pdf_text_right($right, $pageH - 52, (string)($company['companyName'] ?? 'BELM GENERAL TECH SERVICE LIMITED'), 'FB', 11.5, BELM_PDF_NAVY);
    if (!$continuation) {
        $lineY = $pageH - 67;
        foreach (array_filter([
            $company['companyPhone'] ?? null,
            $company['companyEmail'] ?? null,
            $company['companyWebsite'] ?? null,
        ]) as $line) {
            $content .= pdf_text_right($right, $lineY, belm_controller_pdf_safe_text((string)$line), 'F1', 8.5);
            $lineY -= 12;
        }
    }

    $titleY = $continuation ? $pageH - 108 : $pageH - 150;
    $title = $continuation ? 'CONTROLLER WIRING / PIN OUT - CONTINUED' : 'CONTROLLER WIRING / PIN OUT';
    $content .= pdf_text_center($pageW / 2, $titleY, $title, 'FB', $continuation ? 12 : 15, BELM_PDF_NAVY);
    $content .= pdf_text_right($right, $titleY, 'Page ' . $pageNo, 'F1', 8, [0.4, 0.4, 0.4]);
    return [$content, $titleY - 28, $logoData, $logoSize];
}

function belm_controller_pdf_draw_field(string &$content, float $x, float &$y, float $w, string $label, string $value): void {
    $content .= pdf_text($x, $y, strtoupper($label), 'FB', 7.5, [0.40, 0.44, 0.50]);
    $lines = pdf_wrap_text(belm_controller_pdf_safe_text($value), 'FB', 10.2, $w);
    $lineY = $y - 13;
    foreach ($lines as $line) {
        $content .= pdf_text($x, $lineY, $line, 'FB', 10.2, BELM_PDF_NAVY);
        $lineY -= 12;
    }
    $y = $lineY - 5;
}

function belm_controller_pdf_pin_header(float $y): string {
    $x = BELM_PDF_MARGIN_X;
    $tableW = BELM_PDF_PAGE_WIDTH - BELM_PDF_MARGIN_X * 2;
    $content = pdf_rect_fill($x, $y - 18, $tableW, 20, BELM_PDF_NAVY);
    $content .= pdf_text($x + 8, $y - 11, '#', 'FB', 8.5, [1, 1, 1]);
    $content .= pdf_text($x + 34, $y - 11, 'PIN', 'FB', 8.5, [1, 1, 1]);
    $content .= pdf_text($x + 145, $y - 11, 'FUNCTION / SIGNAL', 'FB', 8.5, [1, 1, 1]);
    return $content;
}

function belm_build_controller_pinout_pdf(array $company, array $pinout, array $pins, array $photos): array {
    $pages = [];
    $pageNo = 1;
    [$content, $y, $logoData, $logoSize] = belm_controller_pdf_header($company, $pinout, $pageNo, false);
    $margin = BELM_PDF_MARGIN_X;
    $tableW = BELM_PDF_PAGE_WIDTH - $margin * 2;

    // Controller identity block.
    $blockTop = $y;
    $content .= pdf_rect_fill($margin, $blockTop - 93, $tableW, 98, BELM_PDF_LIGHT_GRAY);
    $leftX = $margin + 12;
    $rightX = $margin + $tableW / 2 + 8;
    $leftY = $blockTop - 12;
    $rightY = $blockTop - 12;
    belm_controller_pdf_draw_field($content, $leftX, $leftY, $tableW / 2 - 28, 'Machine brand', (string)$pinout['machine_brand']);
    belm_controller_pdf_draw_field($content, $leftX, $leftY, $tableW / 2 - 28, 'Controller number', (string)$pinout['controller_number']);
    belm_controller_pdf_draw_field($content, $rightX, $rightY, $tableW / 2 - 28, 'Controller brand', (string)$pinout['controller_brand']);
    belm_controller_pdf_draw_field($content, $rightX, $rightY, $tableW / 2 - 28, 'System', (string)($pinout['system'] ?? ''));
    $y = $blockTop - 112;

    if (!empty($pinout['notes'])) {
        $content .= pdf_text($margin, $y, 'NOTES', 'FB', 9, BELM_PDF_NAVY);
        $y -= 14;
        foreach (pdf_wrap_text(belm_controller_pdf_safe_text((string)$pinout['notes']), 'F1', 8.8, $tableW) as $line) {
            $content .= pdf_text($margin, $y, $line, 'F1', 8.8);
            $y -= 12;
        }
        $y -= 8;
    }

    if ($photos) {
        $content .= pdf_text($margin, $y, 'REFERENCE FILES SAVED WITH THIS RECORD', 'FB', 9, BELM_PDF_NAVY);
        $y -= 14;
        foreach ($photos as $index => $photo) {
            $type = ($photo['photo_mime'] ?? '') === 'application/pdf' ? 'PDF' : 'IMAGE';
            $label = trim((string)($photo['label'] ?? '')) ?: ('Reference ' . ($index + 1));
            $line = ($index + 1) . '. ' . $label . ' [' . $type . ']';
            foreach (pdf_wrap_text(belm_controller_pdf_safe_text($line), 'F1', 8.5, $tableW - 12) as $wrapped) {
                $content .= pdf_text($margin + 8, $y, $wrapped, 'F1', 8.5);
                $y -= 11;
            }
        }
        $content .= pdf_text($margin + 8, $y - 1, 'Reference files remain available in the Controller Pin Out record in the portal.', 'F1', 7.5, [0.42, 0.45, 0.50]);
        $y -= 22;
    }

    $content .= pdf_text($margin, $y, 'PIN FUNCTIONS', 'FB', 10, BELM_PDF_NAVY);
    $y -= 10;
    $content .= belm_controller_pdf_pin_header($y);
    $y -= 24;

    if (!$pins) {
        $content .= pdf_text($margin + 8, $y, 'No pin functions have been documented.', 'F1', 8.8);
        $y -= 18;
    } else {
        foreach ($pins as $index => $pin) {
            $pinLabel = belm_controller_pdf_safe_text((string)($pin['pin_label'] ?? ''));
            $pinFunction = belm_controller_pdf_safe_text((string)($pin['pin_function'] ?? ''));
            $pinLines = pdf_wrap_text($pinLabel, 'F1', 8.5, 100);
            $functionLines = pdf_wrap_text($pinFunction, 'F1', 8.5, $tableW - 160);
            $lineCount = max(count($pinLines), count($functionLines), 1);
            $rowH = max(23.0, 10.5 * $lineCount + 10.0);

            if ($y - $rowH < 58) {
                $pages[] = $content;
                $pageNo++;
                [$content, $y] = belm_controller_pdf_header($company, $pinout, $pageNo, true);
                $content .= belm_controller_pdf_pin_header($y);
                $y -= 24;
            }

            if ($index % 2 === 1) {
                $content .= pdf_rect_fill($margin, $y - $rowH + 4, $tableW, $rowH, [0.975, 0.98, 0.985]);
            }
            $content .= pdf_rect_stroke($margin, $y - $rowH + 4, $tableW, $rowH, 0.35);
            $content .= pdf_line($margin + 27, $y - $rowH + 4, $margin + 27, $y + 4, 0.35);
            $content .= pdf_line($margin + 138, $y - $rowH + 4, $margin + 138, $y + 4, 0.35);
            $content .= pdf_text($margin + 8, $y - 11, (string)($index + 1), 'F1', 8.2);

            $textY = $y - 11;
            foreach ($pinLines as $line) {
                $content .= pdf_text($margin + 34, $textY, $line, 'FB', 8.5);
                $textY -= 10.5;
            }
            $textY = $y - 11;
            foreach ($functionLines as $line) {
                $content .= pdf_text($margin + 145, $textY, $line, 'F1', 8.5);
                $textY -= 10.5;
            }
            $y -= $rowH;
        }
    }

    $content .= pdf_text($margin, 35, 'BELM Controller Wiring Library - Technical Reference', 'F1', 7.5, [0.45, 0.47, 0.52]);
    $pages[] = $content;

    $filename = 'Controller-Pinout-' . (string)$pinout['controller_number'] . '-' . (string)$pinout['machine_brand'] . '.pdf';
    return [$filename, $pages, $logoData, $logoSize];
}

function belm_output_controller_pinout_pdf(string $id): void {
    [$pinout, $pins, $photos] = belm_load_controller_pinout_pdf($id);
    $company = belm_get_company_details();
    [$filename, $pages, $logoData, $logoSize] = belm_build_controller_pinout_pdf($company, $pinout, $pins, $photos);
    belm_assemble_pdf($filename, $pages, $logoData, $logoSize);
}
