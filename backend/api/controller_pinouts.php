<?php
require_once __DIR__ . '/../config/helpers.php';
require_once __DIR__ . '/controller_pinout_pdf_helper.php';

$user = require_auth();
require_page_access($user, 'checklist-templates');
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;
$action = $_GET['action'] ?? '';

function fetch_pinout_photos(string $pinoutId, bool $includeData = false): array {
    $columns = $includeData
        ? 'id, label, photo_data, photo_mime, sort_order'
        : 'id, label, photo_mime, sort_order';
    $stmt = db()->prepare("SELECT $columns FROM controller_pinout_photos WHERE pinout_id = ? ORDER BY sort_order ASC, created_at ASC");
    $stmt->execute([$pinoutId]);
    return $stmt->fetchAll();
}

function fetch_pinout_pins(string $pinoutId): array {
    $stmt = db()->prepare('SELECT id, pin_label, pin_function, sort_order FROM controller_pinout_pins WHERE pinout_id = ? ORDER BY sort_order ASC, created_at ASC');
    $stmt->execute([$pinoutId]);
    return $stmt->fetchAll();
}


if ($method === 'GET' && $action === 'pdf') {
    if (!$id) json_error('Controller pinout ID is required.');
    log_activity($user, 'controller-pinout-pdf-downloaded', 'controllerPinout', $id, []);
    belm_output_controller_pinout_pdf($id);
}

// GET ?action=photo&photoId=X[&download=1] — serves one stored photo.
if ($method === 'GET' && $action === 'photo') {
    $photoId = trim((string)($_GET['photoId'] ?? ''));
    if ($photoId === '') json_error('photoId is required.');
    $stmt = db()->prepare('SELECT photo_data, photo_mime, label FROM controller_pinout_photos WHERE id = ?');
    $stmt->execute([$photoId]);
    $photo = $stmt->fetch();
    if (!$photo) json_error('Photo not found.', 404);
    $binary = base64_decode((string)$photo['photo_data'], true);
    if ($binary === false) json_error('Photo is damaged.', 500);
    header('Content-Type: ' . $photo['photo_mime']);
    header('Content-Length: ' . strlen($binary));
    $disposition = !empty($_GET['download']) ? 'attachment' : 'inline';
    $filename = preg_replace('/[^A-Za-z0-9._-]+/', '-', (string)($photo['label'] ?: 'pinout-photo'));
    header("Content-Disposition: $disposition; filename=\"$filename.jpg\"");
    echo $binary;
    exit;
}

if ($method === 'GET' && !$action) {
    $q = trim((string)($_GET['q'] ?? ''));
    $sql = 'SELECT * FROM controller_pinouts WHERE deleted_at IS NULL';
    $params = [];
    if ($q !== '') {
        $sql .= ' AND (machine_brand ILIKE ? OR controller_number ILIKE ? OR controller_brand ILIKE ? OR system ILIKE ?)';
        $like = '%' . $q . '%';
        $params = [$like, $like, $like, $like];
    }
    $sql .= ' ORDER BY created_at DESC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        $row['photos'] = fetch_pinout_photos($row['id']);
        $row['pins'] = fetch_pinout_pins($row['id']);
    }
    unset($row);
    json_out($rows);
}

if ($method === 'GET' && $action === 'one') {
    if (!$id) json_error('Controller pinout ID is required.');
    $stmt = db()->prepare('SELECT * FROM controller_pinouts WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found.', 404);
    $row['photos'] = fetch_pinout_photos($id);
    $row['pins'] = fetch_pinout_pins($id);
    json_out($row);
}

if ($method === 'POST' && !$action) {
    $b = body();
    $machineBrand = trim((string)($b['machineBrand'] ?? ''));
    $controllerNumber = trim((string)($b['controllerNumber'] ?? ''));
    $controllerBrand = trim((string)($b['controllerBrand'] ?? ''));
    $system = trim((string)($b['system'] ?? ''));
    $notes = trim((string)($b['notes'] ?? ''));
    if ($machineBrand === '') json_error('Machine brand is required.');
    if ($controllerNumber === '') json_error('Controller number is required.');
    if ($controllerBrand === '') json_error('Controller brand is required.');

    $photos = is_array($b['photos'] ?? null) ? $b['photos'] : [];
    $pins = is_array($b['pins'] ?? null) ? $b['pins'] : [];
    if (count($photos) > 12) json_error('A maximum of 12 photos per controller is supported.');
    if (count($pins) > 200) json_error('A maximum of 200 pin entries is supported.');

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $newId = uuid();
        $pdo->prepare(
            'INSERT INTO controller_pinouts
             (id, machine_brand, controller_number, controller_brand, system, notes, created_by_id, created_by_name, created_at)
             VALUES (?,?,?,?,?,?,?,?,NOW())'
        )->execute([
            $newId, $machineBrand, $controllerNumber, $controllerBrand,
            $system !== '' ? $system : null, $notes !== '' ? $notes : null,
            $user['id'], $user['name'],
        ]);

        foreach ($photos as $index => $photo) {
            $dataUrl = trim((string)($photo['data'] ?? ''));
            if ($dataUrl === '') continue;
            [$photoData, $photoMime] = validate_receipt_upload($dataUrl, (string)($photo['label'] ?? 'photo'));
            $pdo->prepare(
                'INSERT INTO controller_pinout_photos (id, pinout_id, label, photo_data, photo_mime, sort_order, created_at)
                 VALUES (?,?,?,?,?,?,NOW())'
            )->execute([uuid(), $newId, trim((string)($photo['label'] ?? '')) ?: null, $photoData, $photoMime, $index]);
        }

        foreach ($pins as $index => $pin) {
            $pinLabel = trim((string)($pin['label'] ?? ''));
            $pinFunction = trim((string)($pin['function'] ?? ''));
            if ($pinLabel === '' && $pinFunction === '') continue;
            if ($pinLabel === '') json_error('Every pin entry needs a pin number/label.');
            $pdo->prepare(
                'INSERT INTO controller_pinout_pins (id, pinout_id, pin_label, pin_function, sort_order, created_at)
                 VALUES (?,?,?,?,?,NOW())'
            )->execute([uuid(), $newId, $pinLabel, $pinFunction, $index]);
        }

        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    log_activity($user, 'controller-pinout-created', 'controllerPinout', $newId, ['controllerNumber' => $controllerNumber]);
    json_out(['id' => $newId, 'message' => 'Controller pinout saved successfully.'], 201);
}

if ($method === 'PUT' && !$action) {
    if (!$id) json_error('Controller pinout ID is required.');
    $b = body();
    require_edit_confirmation($user, $b);
    $machineBrand = trim((string)($b['machineBrand'] ?? ''));
    $controllerNumber = trim((string)($b['controllerNumber'] ?? ''));
    $controllerBrand = trim((string)($b['controllerBrand'] ?? ''));
    $system = trim((string)($b['system'] ?? ''));
    $notes = trim((string)($b['notes'] ?? ''));
    if ($machineBrand === '') json_error('Machine brand is required.');
    if ($controllerNumber === '') json_error('Controller number is required.');
    if ($controllerBrand === '') json_error('Controller brand is required.');

    $stmt = db()->prepare(
        'UPDATE controller_pinouts SET machine_brand=?, controller_number=?, controller_brand=?, system=?, notes=? WHERE id=? AND deleted_at IS NULL'
    );
    $stmt->execute([$machineBrand, $controllerNumber, $controllerBrand, $system !== '' ? $system : null, $notes !== '' ? $notes : null, $id]);
    if ($stmt->rowCount() === 0) json_error('Controller pinout not found.', 404);

    // Pins are simplest to fully replace on every save (small list, no
    // meaningful IDs the frontend needs to keep stable between edits).
    if (array_key_exists('pins', $b)) {
        $pdo = db();
        $pdo->prepare('DELETE FROM controller_pinout_pins WHERE pinout_id = ?')->execute([$id]);
        $pins = is_array($b['pins']) ? $b['pins'] : [];
        foreach ($pins as $index => $pin) {
            $pinLabel = trim((string)($pin['label'] ?? ''));
            $pinFunction = trim((string)($pin['function'] ?? ''));
            if ($pinLabel === '' && $pinFunction === '') continue;
            $pdo->prepare(
                'INSERT INTO controller_pinout_pins (id, pinout_id, pin_label, pin_function, sort_order, created_at)
                 VALUES (?,?,?,?,?,NOW())'
            )->execute([uuid(), $id, $pinLabel, $pinFunction, $index]);
        }
    }

    // New photos are appended (existing ones are managed individually via
    // the delete-photo action) so re-saving the form never re-uploads or
    // duplicates photos that are already stored.
    $newPhotos = is_array($b['newPhotos'] ?? null) ? $b['newPhotos'] : [];
    if (count($newPhotos) > 12) json_error('A maximum of 12 photos per controller is supported.');
    $existingCount = count(fetch_pinout_photos($id));
    foreach ($newPhotos as $index => $photo) {
        $dataUrl = trim((string)($photo['data'] ?? ''));
        if ($dataUrl === '') continue;
        [$photoData, $photoMime] = validate_receipt_upload($dataUrl, (string)($photo['label'] ?? 'photo'));
        db()->prepare(
            'INSERT INTO controller_pinout_photos (id, pinout_id, label, photo_data, photo_mime, sort_order, created_at)
             VALUES (?,?,?,?,?,?,NOW())'
        )->execute([uuid(), $id, trim((string)($photo['label'] ?? '')) ?: null, $photoData, $photoMime, $existingCount + $index]);
    }

    log_activity($user, 'controller-pinout-edited', 'controllerPinout', $id, ['controllerNumber' => $controllerNumber]);
    json_out(['ok' => true, 'message' => 'Controller pinout updated successfully.']);
}

if ($method === 'DELETE' && $action === 'photo') {
    $photoId = trim((string)($_GET['photoId'] ?? ''));
    if ($photoId === '') json_error('photoId is required.');
    require_edit_confirmation($user, body());
    db()->prepare('DELETE FROM controller_pinout_photos WHERE id = ?')->execute([$photoId]);
    json_out(['ok' => true]);
}

if ($method === 'DELETE' && !$action) {
    if (!$id) json_error('Controller pinout ID is required.');
    $stmt = db()->prepare('SELECT controller_number FROM controller_pinouts WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found.', 404);
    $reason = require_delete_confirmation($user, body());
    send_to_trash('controllerPinout', $id, $row['controller_number'], $user['id'], $reason);
    soft_delete('controller_pinouts', $id);
    log_activity($user, 'controller-pinout-deleted', 'controllerPinout', $id, ['reason' => $reason]);
    json_out(null, 204);
}

json_error('Unknown request', 404);
