<?php

declare(strict_types=1);

$headers = array_change_key_case(getallheaders(), CASE_LOWER);
if (($headers['authorization'] ?? '') !== 'Bearer test-service-key'
    || ($headers['apikey'] ?? '') !== 'test-service-key') {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['message' => 'missing test authorization']);
    return;
}

$path = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET' && $path === '/storage/v1/bucket') {
    header('Content-Type: application/json');
    echo json_encode([
        [
            'id' => 'attachments',
            'name' => 'attachments',
            'public' => false,
            'type' => 'STANDARD',
        ],
        [
            'id' => 'analytics-test',
            'name' => 'analytics-test',
            'public' => false,
            'type' => 'ANALYTICS',
        ],
        [
            'id' => 'clean',
            'name' => 'clean',
            'public' => false,
            'type' => 'STANDARD',
        ],
    ]);
    return;
}

if ($method === 'POST' && $path === '/storage/v1/object/list/clean') {
    $body = json_decode((string) file_get_contents('php://input'), true);
    $prefix = (string) ($body['prefix'] ?? '');
    $offset = (int) ($body['offset'] ?? 0);
    $limit = max(1, (int) ($body['limit'] ?? 100));
    $items = $prefix === ''
        ? [['name' => 'clean.txt', 'id' => 'clean-id', 'metadata' => ['mimetype' => 'text/plain']]]
        : [];
    header('Content-Type: application/json');
    echo json_encode(array_slice($items, $offset, $limit));
    return;
}

if ($method === 'POST' && $path === '/storage/v1/object/list/attachments') {
    $body = json_decode((string) file_get_contents('php://input'), true);
    $prefix = (string) ($body['prefix'] ?? '');
    $offset = (int) ($body['offset'] ?? 0);
    $limit = max(1, (int) ($body['limit'] ?? 100));

    $itemsByPrefix = [
        '' => [
            ['name' => 'broken.bin', 'id' => 'broken-id', 'metadata' => ['mimetype' => 'application/octet-stream']],
            ['name' => 'docs', 'id' => null, 'metadata' => null],
            ['name' => 'root.bin', 'id' => 'root-id', 'metadata' => ['mimetype' => 'application/octet-stream']],
        ],
        'docs' => [
            ['name' => 'nested', 'id' => null, 'metadata' => null],
            ['name' => 'report.pdf', 'id' => 'report-id', 'metadata' => ['mimetype' => 'application/pdf']],
        ],
        'docs/nested' => [
            ['name' => 'voice.ogg', 'id' => 'voice-id', 'metadata' => ['mimetype' => 'audio/ogg']],
        ],
    ];

    header('Content-Type: application/json');
    echo json_encode(array_slice($itemsByPrefix[$prefix] ?? [], $offset, $limit));
    return;
}

if ($method === 'GET' && $path === '/storage/v1/object/clean/clean.txt') {
    header('Content-Type: application/octet-stream');
    echo "clean storage bytes\n";
    return;
}

if ($method === 'GET' && str_starts_with($path, '/rest/v1/')) {
    header('Content-Type: application/json');
    if ($path === '/rest/v1/settings') {
        if (($_GET['order'] ?? '') !== 'key.asc') {
            http_response_code(400);
            echo json_encode(['message' => 'settings backup used the wrong order column']);
            return;
        }
        echo json_encode([
            ['key' => 'meta_token', 'value' => 'test-meta-secret'],
            ['key' => 'wa_verify_token', 'value' => 'test-webhook-secret'],
            ['key' => 'wa_access_token', 'value' => 'test-whatsapp-secret'],
            ['key' => 'openai_api_key', 'value' => 'test-openai-secret'],
            ['key' => 'openai_model', 'value' => 'test-safe-model'],
        ]);
    } elseif ($path === '/rest/v1/payroll_settings') {
        if (($_GET['order'] ?? '') !== 'agent_id.asc') {
            http_response_code(400);
            echo json_encode(['message' => 'payroll settings backup used the wrong order column']);
            return;
        }
        echo '[]';
    } else {
        echo '[]';
    }
    return;
}

if ($method === 'GET' && str_starts_with($path, '/storage/v1/object/attachments/')) {
    $objectPath = substr($path, strlen('/storage/v1/object/attachments/'));
    if ($objectPath === 'broken.bin') {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['message' => 'intentional test failure']);
        return;
    }

    $objects = [
        'root.bin' => "\x00ROOT\xff",
        'docs/report.pdf' => "%PDF-test\n\x00binary",
        'docs/nested/voice.ogg' => "OggS\x00\x01voice",
    ];
    if (!array_key_exists($objectPath, $objects)) {
        http_response_code(404);
        return;
    }

    header('Content-Type: application/octet-stream');
    echo $objects[$objectPath];
    return;
}

http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['message' => 'unknown mock route', 'method' => $method, 'path' => $path]);
