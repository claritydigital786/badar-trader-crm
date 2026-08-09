<?php

declare(strict_types=1);

$logPath = getenv('MOCK_RESTORE_REQUEST_LOG');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

if ($method === 'GET' && $path === '/health') {
    http_response_code(200);
    echo 'ok';
    return;
}

if ($method === 'POST' && $path === '/rest/v1/rpc/confirm_disposable_restore_safety') {
    http_response_code(200);
    header('Content-Type: application/json');
    echo json_encode('BADAR_DISPOSABLE_STAGING_SAFE_V1');
    return;
}

if ($method === 'POST' && (str_starts_with((string) $path, '/rest/v1/')
    || $path === '/storage/v1/bucket'
    || str_starts_with((string) $path, '/storage/v1/object/'))) {
    $body = (string) file_get_contents('php://input');
    if (is_string($logPath) && $logPath !== '') {
        file_put_contents($logPath, json_encode([
            'method' => $method,
            'uri' => $_SERVER['REQUEST_URI'] ?? '',
            'bytes' => strlen($body),
            'sha256' => hash('sha256', $body),
        ], JSON_UNESCAPED_SLASHES) . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
    http_response_code(201);
    header('Content-Type: application/json');
    echo '{}';
    return;
}

http_response_code(404);
echo 'not found';
