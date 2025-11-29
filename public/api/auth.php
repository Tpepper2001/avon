<?php
session_start();
header('Content-Type: application/json');

$db = new PDO('sqlite:../db.sqlite');

if ($_GET['action'] === 'logout') {
    unset($_SESSION['user']);
    echo json_encode(['success' => true]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode(['user' => $_SESSION['user'] ?? null]);
    exit;
}

parse_str(file_get_contents('php://input'), $post);

$action = $post['action'] ?? '';
$email = $post['email'] ?? '';
$pass = $post['password'] ?? '';

if ($action === 'register') {
    if (strlen($pass) < 6) {
        echo json_encode(['error' => 'Password too short']);
        exit;
    }
    $stmt = $db->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        echo json_encode(['error' => 'Email taken']);
        exit;
    }
    $voxKey = 'VX-' . substr(str_shuffle('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), 0, 8);
    $hash = password_hash($pass, PASSWORD_DEFAULT);
    $db->prepare("INSERT INTO users (email, password, voxKey) VALUES (?, ?, ?)")->execute([$email, $hash, $voxKey]);
    $user = ['email' => $email, 'voxKey' => $voxKey];
    $_SESSION['user'] = $user;
    echo json_encode(['success' => true, 'user' => $user]);
}

if ($action === 'login') {
    $stmt = $db->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    if ($user && password_verify($pass, $user['password'])) {
        $_SESSION['user'] = ['email' => $user['email'], 'voxKey' => $user['voxKey']];
        echo json_encode(['success' => true, 'user' => $_SESSION['user']]);
    } else {
        echo json_encode(['error' => 'Wrong credentials']);
    }
}
?>
