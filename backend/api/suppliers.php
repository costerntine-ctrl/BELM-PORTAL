<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
require_page_access($user, 'suppliers');
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;

function normalize_supplier(array $body): array {
    $name = trim((string)($body['name'] ?? ''));
    $email = strtolower(trim((string)($body['email'] ?? '')));
    $website = trim((string)($body['website'] ?? ''));
    if ($name === '') json_error('Supplier name is required.');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_error('Enter a valid supplier email.');
    }
    if ($website !== '' && !preg_match('#^https?://#i', $website)) {
        $website = 'https://' . $website;
    }
    if ($website !== '' && !filter_var($website, FILTER_VALIDATE_URL)) {
        json_error('Enter a valid supplier website.');
    }
    return [
        'name' => $name,
        'specialty' => trim((string)($body['specialty'] ?? '')) ?: null,
        'phone' => trim((string)($body['phone'] ?? '')) ?: null,
        'whatsapp' => trim((string)($body['whatsapp'] ?? '')) ?: null,
        'email' => $email !== '' ? $email : null,
        'website' => $website !== '' ? $website : null,
        'location' => trim((string)($body['location'] ?? '')) ?: null,
        'notes' => trim((string)($body['notes'] ?? '')) ?: null,
        'verified' => !empty($body['verified']) ? 1 : 0,
    ];
}

function supplier_trust_assessment(array $supplier): array {
    $score = 0;
    $reasons = [];
    if (trim((string)($supplier['name'] ?? '')) !== '') $score += 10;
    if (trim((string)($supplier['specialty'] ?? '')) !== '') {
        $score += 10;
        $reasons[] = 'Specialty recorded';
    }
    if (trim((string)($supplier['phone'] ?? '')) !== '') {
        $score += 10;
        $reasons[] = 'Phone available';
    }
    if (trim((string)($supplier['whatsapp'] ?? '')) !== '') {
        $score += 15;
        $reasons[] = 'WhatsApp available';
    }
    $email = strtolower(trim((string)($supplier['email'] ?? '')));
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $score += 10;
        $domain = substr(strrchr($email, '@') ?: '', 1);
        $freeDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];
        if ($domain !== '' && !in_array($domain, $freeDomains, true)) {
            $score += 10;
            $reasons[] = 'Business-domain email';
        } else {
            $reasons[] = 'Valid email';
        }
    }
    $website = trim((string)($supplier['website'] ?? ''));
    if ($website !== '' && filter_var($website, FILTER_VALIDATE_URL)) {
        $score += 15;
        $reasons[] = 'Website recorded';
    }
    if (trim((string)($supplier['location'] ?? '')) !== '') {
        $score += 10;
        $reasons[] = 'Location recorded';
    }
    if (trim((string)($supplier['notes'] ?? '')) !== '') $score += 5;
    if (!empty($supplier['verified'])) {
        $score += 15;
        $reasons[] = 'Verified by BELM admin';
    }
    $score = min(100, $score);
    $status = $score >= 70 ? 'TRUSTED' : ($score >= 45 ? 'REVIEW' : 'VERIFY');
    return ['score' => $score, 'status' => $status, 'reasons' => $reasons];
}

if ($method === 'GET') {
    $q = $_GET['q'] ?? '';
    if ($q) {
        $like = "%$q%";
        $stmt = db()->prepare('SELECT * FROM suppliers WHERE deleted_at IS NULL AND (name LIKE ? OR specialty LIKE ? OR location LIKE ? OR email LIKE ? OR website LIKE ?) ORDER BY name ASC');
        $stmt->execute([$like, $like, $like, $like, $like]);
    } else {
        $stmt = db()->query('SELECT * FROM suppliers WHERE deleted_at IS NULL ORDER BY name ASC');
    }
    $suppliers = $stmt->fetchAll();
    foreach ($suppliers as &$supplier) {
        $assessment = supplier_trust_assessment($supplier);
        $supplier['trustScore'] = $assessment['score'];
        $supplier['trustStatus'] = $assessment['status'];
        $supplier['trustReasons'] = $assessment['reasons'];
        $supplier['verified'] = (bool)$supplier['verified'];
    }
    usort($suppliers, static function (array $left, array $right): int {
        return $right['trustScore'] <=> $left['trustScore']
            ?: strcasecmp((string)$left['name'], (string)$right['name']);
    });
    json_out($suppliers);
}

if ($method === 'POST') {
    $supplier = normalize_supplier(body());
    $newId = uuid();
    db()->prepare('INSERT INTO suppliers (id, name, specialty, phone, whatsapp, email, website, location, notes, verified, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,NOW())')
        ->execute([
            $newId, $supplier['name'], $supplier['specialty'], $supplier['phone'],
            $supplier['whatsapp'], $supplier['email'], $supplier['website'],
            $supplier['location'], $supplier['notes'], $supplier['verified'],
        ]);
    $assessment = supplier_trust_assessment($supplier);
    log_activity($user['id'], 'created', 'supplier', $newId, ['name' => $supplier['name']]);
    json_out(['id' => $newId, 'trustScore' => $assessment['score'], 'trustStatus' => $assessment['status']], 201);
}

if ($method === 'PUT') {
    $supplier = normalize_supplier(body());
    $stmt = db()->prepare('UPDATE suppliers SET name=?, specialty=?, phone=?, whatsapp=?, email=?, website=?, location=?, notes=?, verified=? WHERE id=? AND deleted_at IS NULL');
    $stmt->execute([
        $supplier['name'], $supplier['specialty'], $supplier['phone'],
        $supplier['whatsapp'], $supplier['email'], $supplier['website'],
        $supplier['location'], $supplier['notes'], $supplier['verified'], $id,
    ]);
    if ($stmt->rowCount() === 0) json_error('Supplier not found.', 404);
    $assessment = supplier_trust_assessment($supplier);
    log_activity($user['id'], 'updated', 'supplier', $id, ['name' => $supplier['name']]);
    json_out(['ok' => true, 'trustScore' => $assessment['score'], 'trustStatus' => $assessment['status']]);
}

if ($method === 'DELETE') {
    $stmt = db()->prepare('SELECT name FROM suppliers WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    send_to_trash('supplier', $id, $row['name'], $user['id']);
    soft_delete('suppliers', $id);
    log_activity($user['id'], 'deleted', 'supplier', $id, ['name' => $row['name']]);
    json_out(null, 204);
}

json_error('Unknown request', 404);
