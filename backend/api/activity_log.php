<?php
require_once __DIR__ . '/../config/helpers.php';

// GET /api/activity-log            -> latest 100 events, all entities
// GET /api/activity-log?entity=X   -> filter by entity (customer, invoice, ...)
// GET /api/activity-log?limit=200  -> up to 500 events
$user = require_auth();
require_page_access($user, 'overview');

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET') json_error('Unknown request', 404);

$limit = (int)($_GET['limit'] ?? 100);
if ($limit <= 0) $limit = 100;
if ($limit > 500) $limit = 500;

$entity = trim((string)($_GET['entity'] ?? ''));

if ($entity !== '') {
    $stmt = db()->prepare(
        'SELECT a.id, a.action, a.entity, a.entity_id, a.metadata, a.created_at,
                u.name AS user_name, u.email AS user_email
         FROM activity_logs a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.entity = ?
         ORDER BY a.created_at DESC
         LIMIT ?'
    );
    $stmt->bindValue(1, $entity);
    $stmt->bindValue(2, $limit, PDO::PARAM_INT);
    $stmt->execute();
} else {
    $stmt = db()->prepare(
        'SELECT a.id, a.action, a.entity, a.entity_id, a.metadata, a.created_at,
                u.name AS user_name, u.email AS user_email
         FROM activity_logs a
         LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.created_at DESC
         LIMIT ?'
    );
    $stmt->bindValue(1, $limit, PDO::PARAM_INT);
    $stmt->execute();
}

json_out($stmt->fetchAll());
