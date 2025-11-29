<?php
session_start();
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    $db = new PDO('sqlite:../db.sqlite');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // AUTO CREATE TABLES + MIGRATIONS
    $db->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        voxKey TEXT UNIQUE NOT NULL,
        created INTEGER DEFAULT (strftime('%s','now'))
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voxKey TEXT NOT NULL,
        videoUrl TEXT NOT NULL,
        timestamp INTEGER DEFAULT (strftime('%s','now'))
    )");

    $db->exec("CREATE INDEX IF NOT EXISTS idx_vox ON messages(voxKey)");

    // AUTO FIX old plain-text passwords on first login attempt
    $db->exec("UPDATE users SET password = 'MIGRATED_' || password WHERE password NOT LIKE '$2y$%' AND password NOT LIKE 'MIGRATED_%'");

} catch (Exception $e) {
    echo json_encode(['error' => 'Database error']);
    exit;
}

function generateKey() {
    return 'VX-' . substr(str_shuffle('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), 0, 8);
}

// GET = check session
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode(['user' => $_SESSION['user'] ?? null]);
    exit;
}

$data = [];
parse_str(file_get_contents('php://input'), $data);
$action = $data['action'] ?? ($_GET['action'] ?? '');

// LOGOUT
if ($action === 'logout') {
    unset($_SESSION['user']);
    echo json_encode(['success' => true]);
    exit;
}

$email = trim($data['email'] ?? '');
$pass  = $data['password'] ?? '';

// REGISTER
if ($action === 'register') {
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['error' => 'Invalid email']);
        exit;
    }
    if (strlen($pass) < 6) {
        echo json_encode(['error' => 'Password too short']);
        exit;
    }

    $stmt = $db->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        echo json_encode(['error' => 'Email already registered']);
        exit;
    }

    $voxKey = generateKey();
    while ($db->query("SELECT 1 FROM users WHERE voxKey = '$voxKey' LIMIT 1")->fetch()) {
        $voxKey = generateKey();
    }

    $hash = password_hash($pass, PASSWORD_DEFAULT);
    $db->prepare("INSERT INTO users (email, password, voxKey) VALUES (?, ?, ?)")
        ->execute([$email, $hash, $voxKey]);

    $user = ['email' => $email, 'voxKey' => $voxKey];
    $_SESSION['user'] = $user;
    echo json_encode(['success' => true, 'user' => $user]);
    exit;
}

// LOGIN + AUTO FIX old passwords
if ($action === 'login') {
    if (!$email || !$pass) {
        echo json_encode(['error' => 'Enter email & password']);
        exit;
    }

    $stmt = $db->prepare("SELECT * FROM users WHERE email = ?");
    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        echo json_encode(['error' => 'Wrong email or password']);
        exit;
    }

    $storedPass = $user['password'];

    // If password is old plain text or migrated marker → rehash it now
    if (strpos($storedPass, 'MIGRATED_') === 0) {
        $plain = substr($storedPass, 9);
        if ($plain === $pass) {
            $newHash = password_hash($pass, PASSWORD_DEFAULT);
            $db->prepare("UPDATE users SET password = ? WHERE id = ?")
                ->execute([$newHash, $user['id']]);
            $storedPass = $newHash;
        }
    }

    if (password_verify($pass, $storedPass)) {
        $sessionUser = ['email' => $user['email'], 'voxKey' => $user['voxKey']];
        $_SESSION['user'] = $sessionUser;
        echo json_encode(['success' => true, 'user' => $sessionUser]);
    } else {
        echo json_encode(['error' => 'Wrong email or password']);
    }
    exit;
}

// Default
echo json_encode(['error' => 'Invalid action']);
?>
