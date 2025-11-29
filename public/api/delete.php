<?php
session_start();
header('Content-Type: application/json');
$data = json_decode(file_get_contents('php://input'), true);
$db = new PDO('sqlite:../db.sqlite');

$user = $_SESSION['user'] ?? null;
if (!$user || $user['voxKey'] !== $data['key']) {
    http_response_code(403);
    exit;
}

$db->prepare("DELETE FROM messages WHERE id = ?")->execute([$data['id']]);
echo json_encode(['success' => true]);
?>
