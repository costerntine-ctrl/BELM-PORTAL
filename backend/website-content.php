<?php
require_once __DIR__ . '/config/helpers.php';

function wc_ensure_tables(): void {
    db()->exec("CREATE TABLE IF NOT EXISTS website_gallery_photos (
        id UUID PRIMARY KEY,
        caption VARCHAR(180) NOT NULL DEFAULT '',
        mime_type VARCHAR(40) NOT NULL,
        image_base64 TEXT NOT NULL,
        is_published BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )");
    db()->exec("CREATE TABLE IF NOT EXISTS website_machine_promotions (
        id UUID PRIMARY KEY,
        title VARCHAR(180) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        mime_type VARCHAR(40) NOT NULL,
        image_base64 TEXT NOT NULL,
        is_published BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )");
}

function wc_require_super_admin(): array {
    $payload = current_token_payload();
    if (!$payload || ($payload['type'] ?? '') !== 'staff') json_error('Admin session required.', 401);
    $id = trim((string)($payload['id'] ?? ''));
    if ($id === '') json_error('Admin session required.', 401);
    $stmt = db()->prepare("SELECT u.id,r.name AS role_name FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.deleted_at IS NULL AND u.is_active=1 LIMIT 1");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row || ($row['role_name'] ?? '') !== 'Super Admin') json_error('Super Admin access required.', 403);
    return $row;
}

function wc_decode_image(array $b): array {
    $dataUrl = (string)($b['imageData'] ?? '');
    if (!preg_match('#^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$#', $dataUrl, $m)) {
        json_error('Use a JPG, PNG or WEBP photo.', 400);
    }
    $base64 = preg_replace('/\s+/', '', $m[2]);
    $bytes = base64_decode($base64, true);
    if ($bytes === false) json_error('Photo data is invalid.', 400);
    if (strlen($bytes) > 1100000) json_error('Photo is too large. Compress it below about 1 MB.', 413);
    return [strtolower($m[1]), $base64];
}

function wc_image_response(string $table, string $id): void {
    $stmt = db()->prepare("SELECT mime_type,image_base64 FROM {$table} WHERE id=? AND is_published=TRUE LIMIT 1");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) { http_response_code(404); exit; }
    $bytes = base64_decode((string)$row['image_base64'], true);
    if ($bytes === false) { http_response_code(500); exit; }
    if (ob_get_level() > 0) ob_clean();
    header('Content-Type: ' . (string)$row['mime_type']);
    header('Cache-Control: public, max-age=3600');
    echo $bytes;
    exit;
}

wc_ensure_tables();
$method = $_SERVER['REQUEST_METHOD'];
$action = trim((string)($_GET['action'] ?? 'public'));
$base = portal_base_url() . '/api/website-content.php';

if ($method === 'GET' && $action === 'gallery-image') wc_image_response('website_gallery_photos', trim((string)($_GET['id'] ?? '')));
if ($method === 'GET' && $action === 'promotion-image') wc_image_response('website_machine_promotions', trim((string)($_GET['id'] ?? '')));

if ($method === 'GET' && $action === 'public') {
    $gallery = db()->query("SELECT id,caption,created_at FROM website_gallery_photos WHERE is_published=TRUE ORDER BY created_at DESC LIMIT 18")->fetchAll();
    $promos = db()->query("SELECT id,title,description,created_at FROM website_machine_promotions WHERE is_published=TRUE ORDER BY created_at DESC LIMIT 12")->fetchAll();
    foreach ($gallery as &$g) $g['image_url'] = $base . '?action=gallery-image&id=' . rawurlencode((string)$g['id']);
    foreach ($promos as &$p) $p['image_url'] = $base . '?action=promotion-image&id=' . rawurlencode((string)$p['id']);
    json_out(['ok'=>true,'gallery'=>$gallery,'promotions'=>$promos]);
}

wc_require_super_admin();

if ($method === 'GET' && $action === 'admin') {
    $gallery = db()->query("SELECT id,caption,is_published,created_at FROM website_gallery_photos ORDER BY created_at DESC")->fetchAll();
    $promos = db()->query("SELECT id,title,description,is_published,created_at FROM website_machine_promotions ORDER BY created_at DESC")->fetchAll();
    foreach ($gallery as &$g) $g['image_url'] = $base . '?action=gallery-image&id=' . rawurlencode((string)$g['id']);
    foreach ($promos as &$p) $p['image_url'] = $base . '?action=promotion-image&id=' . rawurlencode((string)$p['id']);
    json_out(['ok'=>true,'gallery'=>$gallery,'promotions'=>$promos]);
}

$b = body();
if ($method === 'POST' && $action === 'gallery-create') {
    [$mime,$base64] = wc_decode_image($b);
    $caption = substr(trim((string)($b['caption'] ?? '')),0,180);
    $id = uuid();
    db()->prepare('INSERT INTO website_gallery_photos (id,caption,mime_type,image_base64,is_published) VALUES (?,?,?,?,?)')
      ->execute([$id,$caption,$mime,$base64,!empty($b['isPublished'])]);
    json_out(['ok'=>true,'id'=>$id],201);
}
if ($method === 'POST' && $action === 'gallery-toggle') {
    db()->prepare('UPDATE website_gallery_photos SET is_published=?,updated_at=NOW() WHERE id=?')->execute([!empty($b['isPublished']),$b['id'] ?? '']);
    json_out(['ok'=>true]);
}
if ($method === 'POST' && $action === 'gallery-delete') {
    db()->prepare('DELETE FROM website_gallery_photos WHERE id=?')->execute([$b['id'] ?? '']);
    json_out(['ok'=>true]);
}
if ($method === 'POST' && $action === 'promotion-create') {
    [$mime,$base64] = wc_decode_image($b);
    $title = substr(trim((string)($b['title'] ?? '')),0,180);
    if ($title==='') json_error('Promotion header/title is required.');
    $description = substr(trim((string)($b['description'] ?? '')),0,1200);
    $id = uuid();
    db()->prepare('INSERT INTO website_machine_promotions (id,title,description,mime_type,image_base64,is_published) VALUES (?,?,?,?,?,?)')
      ->execute([$id,$title,$description,$mime,$base64,!empty($b['isPublished'])]);
    json_out(['ok'=>true,'id'=>$id],201);
}
if ($method === 'POST' && $action === 'promotion-update') {
    $id = (string)($b['id'] ?? '');
    $title = substr(trim((string)($b['title'] ?? '')),0,180);
    $description = substr(trim((string)($b['description'] ?? '')),0,1200);
    if ($title==='') json_error('Promotion header/title is required.');
    db()->prepare('UPDATE website_machine_promotions SET title=?,description=?,is_published=?,updated_at=NOW() WHERE id=?')
      ->execute([$title,$description,!empty($b['isPublished']),$id]);
    json_out(['ok'=>true]);
}
if ($method === 'POST' && $action === 'promotion-delete') {
    db()->prepare('DELETE FROM website_machine_promotions WHERE id=?')->execute([$b['id'] ?? '']);
    json_out(['ok'=>true]);
}

json_error('Unsupported website-content action.',405);
