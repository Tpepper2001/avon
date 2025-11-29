<?php
session_start();
header('Content-Type: application/json');

$db = new PDO('sqlite:../db.sqlite');
$key = $_POST['key'] ?? '';

$stmt = $db->prepare("SELECT id FROM users WHERE voxKey = ?");
$stmt->execute([$key]);
if (!$stmt->fetch()) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid key']);
    exit;
}

$uploadDir = '../messages/';
if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

$file = $_FILES['video'];
$ext = pathinfo($file['name'], PATHINFO_EXTENSION);
$filename = uniqid('vox_') . '.' . $ext;
move_uploaded_file($file['tmp_name'], $uploadDir . $filename);

$db->prepare("INSERT INTO messages (voxKey, videoUrl, timestamp) VALUES (?, ?, ?)")
   ->execute([$key, "/messages/$filename", time()]);

echo json_encode(['success' => true]);
?>
