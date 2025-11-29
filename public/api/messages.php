<?php
$db = new PDO('sqlite:../db.sqlite');
$key = $_GET['key'] ?? '';
$stmt = $db->prepare("SELECT * FROM messages WHERE voxKey = ? ORDER BY timestamp DESC");
$stmt->execute([$key]);
$msgs = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo json_encode($msgs);
?>
