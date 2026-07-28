<?php
require_once __DIR__ . '/../config/helpers.php';

$user = require_auth();
require_page_access($user, 'suppliers');
$method = $_SERVER['REQUEST_METHOD'];
$id = $_GET['id'] ?? null;

if ($method === 'GET') {
    $q = $_GET['q'] ?? '';
    if ($q) {
        $like = "%$q%";
        $stmt = db()->prepare('SELECT * FROM suppliers WHERE deleted_at IS NULL AND (name LIKE ? OR specialty LIKE ? OR location LIKE ?) ORDER BY name ASC');
        $stmt->execute([$like, $like, $like]);
    } else {
        $stmt = db()->query('SELECT * FROM suppliers WHERE deleted_at IS NULL ORDER BY name ASC');
    }
    json_out($stmt->fetchAll());
}

if ($method === 'POST') {
    $b = body();
    $name = trim((string)($b['name'] ?? ''));
    $email = trim((string)($b['email'] ?? ''));
    if ($name === '') json_error('Supplier name is required.');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid supplier email.');
    $newId = uuid();
    db()->prepare('INSERT INTO suppliers (id, name, specialty, phone, whatsapp, email, location, notes, created_at) VALUES (?,?,?,?,?,?,?,?,NOW())')
        ->execute([$newId, $name, $b['specialty'] ?? null, $b['phone'] ?? null, $b['whatsapp'] ?? null, $email !== '' ? $email : null, $b['location'] ?? null, $b['notes'] ?? null]);
    json_out(['id' => $newId], 201);
}

if ($method === 'PUT') {
    $b = body();
    $name = trim((string)($b['name'] ?? ''));
    $email = trim((string)($b['email'] ?? ''));
    if ($name === '') json_error('Supplier name is required.');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Enter a valid supplier email.');
    $stmt = db()->prepare('UPDATE suppliers SET name=?, specialty=?, phone=?, whatsapp=?, email=?, location=?, notes=? WHERE id=? AND deleted_at IS NULL');
    $stmt->execute([$name, $b['specialty'] ?? null, $b['phone'] ?? null, $b['whatsapp'] ?? null, $email !== '' ? $email : null, $b['location'] ?? null, $b['notes'] ?? null, $id]);
    if ($stmt->rowCount() === 0) json_error('Supplier not found.', 404);
    json_out(['ok' => true]);
}

if ($method === 'DELETE') {
    $stmt = db()->prepare('SELECT name FROM suppliers WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    send_to_trash('supplier', $id, $row['name'], $user['id']);
    soft_delete('suppliers', $id);
    json_out(null, 204);
}

json_error('Unknown request', 404);
