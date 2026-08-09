<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/restore_backup.php';

function restoreTestAssert(bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

/** @param callable(ZipArchive): void|null $mutate */
function restoreTestArchive(string $path, ?callable $mutate = null): void {
    $zip = new ZipArchive();
    restoreTestAssert($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) === true, 'could not create restore fixture');
    foreach (crmRestoreTableMap() as $table => $conflictColumn) {
        $row = $table === 'settings'
            ? ['key' => 'test_key', 'value' => 'test_value']
            : [$conflictColumn => '00000000-0000-4000-8000-000000000001'];
        $rows = [$row];
        if ($table === 'settings') {
            $rows[] = ['key' => 'meta_token', 'value' => 'old-archive-secret'];
        }
        $zip->addFromString($table . '.json', json_encode($rows, JSON_THROW_ON_ERROR));
    }
    $bytes = "restore-test\0bytes";
    $archiveObjectPath = 'storage/objects/' . hash('sha256', "attachments\0docs/test.bin") . '.bin';
    $zip->addFromString($archiveObjectPath, $bytes);
    $zip->addFromString('storage/manifest.json', json_encode([
        'format_version' => 1,
        'buckets' => [[
            'id' => 'attachments',
            'name' => 'attachments',
            'type' => 'STANDARD',
            'public' => false,
        ]],
        'objects' => [[
            'bucket' => 'attachments',
            'path' => 'docs/test.bin',
            'archive_path' => $archiveObjectPath,
            'status' => 'ok',
            'size' => strlen($bytes),
            'sha256' => hash('sha256', $bytes),
        ]],
    ], JSON_THROW_ON_ERROR));
    if ($mutate !== null) {
        $mutate($zip);
    }
    $zip->close();
}

function restoreTestExpectFailure(callable $callback, string $contains): void {
    try {
        $callback();
    } catch (Throwable $error) {
        restoreTestAssert(str_contains($error->getMessage(), $contains), "unexpected failure: {$error->getMessage()}");
        return;
    }
    throw new RuntimeException("expected failure containing '$contains'");
}

$socket = stream_socket_server('tcp://127.0.0.1:0', $errorCode, $errorMessage);
if ($socket === false) {
    throw new RuntimeException("could not reserve restore mock port: $errorCode $errorMessage");
}
$address = stream_socket_get_name($socket, false);
fclose($socket);
$port = (int) substr((string) strrchr((string) $address, ':'), 1);

$tempDir = sys_get_temp_dir() . '/badar-restore-test-' . bin2hex(random_bytes(6));
mkdir($tempDir, 0700, true);
$requestLog = $tempDir . '/requests.jsonl';
$serverLog = $tempDir . '/server.log';
$archivePath = $tempDir . '/valid.zip';
restoreTestArchive($archivePath);

$process = proc_open(
    [PHP_BINARY, '-S', '127.0.0.1:' . $port, __DIR__ . '/mock_restore_router.php'],
    [0 => ['pipe', 'r'], 1 => ['file', $serverLog, 'a'], 2 => ['file', $serverLog, 'a']],
    $pipes,
    __DIR__,
    ['MOCK_RESTORE_REQUEST_LOG' => $requestLog]
);
if (!is_resource($process)) {
    crmDeleteTree($tempDir);
    throw new RuntimeException('could not start restore mock server');
}

try {
    $target = 'http://127.0.0.1:' . $port;
    $ready = false;
    for ($attempt = 0; $attempt < 50; $attempt++) {
        if (@file_get_contents($target . '/health') === 'ok') {
            $ready = true;
            break;
        }
        usleep(20000);
    }
    restoreTestAssert($ready, 'restore mock server did not become ready');

    $messages = [];
    $validated = crmRestoreArchive($archivePath, $target, '', false, '', false, null, function (string $message) use (&$messages): void {
        $messages[] = $message;
    });
    restoreTestAssert($validated['tables'] === 22, 'validation did not cover all 22 tables');
    restoreTestAssert($validated['rows'] === 22, 'validation row count was wrong');
    restoreTestAssert($validated['objects'] === 1 && $validated['bytes'] === 18, 'Storage validation totals were wrong');
    restoreTestAssert(!$validated['applied'], 'validation-only mode reported an apply');
    restoreTestAssert(!is_file($requestLog), 'validation-only mode wrote to the target');
    restoreTestExpectFailure(
        fn() => crmRestoreVerifySafetyMarker($target . '/missing-safety-marker', 'test-key'),
        'outbound safety check'
    );

    $schemaSql = (string) file_get_contents(dirname(__DIR__, 2) . '/supabase/schema.sql');
    preg_match_all('/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+public\.([a-z_][a-z0-9_]*)/i', $schemaSql, $schemaMatches);
    $activeSchemaTables = array_values(array_diff(array_unique($schemaMatches[1]), ['notifications']));
    sort($activeSchemaTables);
    $restoreTables = array_keys(crmRestoreTableMap());
    sort($restoreTables);
    restoreTestAssert($restoreTables === $activeSchemaTables, 'restore table scope drifted from the active schema');

    restoreTestExpectFailure(
        fn() => crmRestoreArchive($archivePath, $target, 'test-key', true, '', false, null, fn(string $message) => null),
        'DISPOSABLE_STAGING_ONLY'
    );
    restoreTestExpectFailure(
        fn() => crmRestoreValidateTarget('https://' . CRM_PRODUCTION_PROJECT_REF . '.supabase.co', true, CRM_PRODUCTION_PROJECT_REF),
        'live Badar Trader CRM'
    );
    restoreTestExpectFailure(
        fn() => crmRestoreValidateTarget('https://abcdefghijklmnopqrst.supabase.co', false, null),
        'remote restore refused'
    );

    $tamperedPath = $tempDir . '/tampered.zip';
    restoreTestArchive($tamperedPath, function (ZipArchive $zip): void {
        $manifest = json_decode((string) $zip->getFromName('storage/manifest.json'), true, 512, JSON_THROW_ON_ERROR);
        $manifest['objects'][0]['sha256'] = str_repeat('0', 64);
        $zip->addFromString('storage/manifest.json', json_encode($manifest, JSON_THROW_ON_ERROR));
    });
    restoreTestExpectFailure(
        fn() => crmRestoreArchive($tamperedPath, $target, '', false, '', false, null, fn(string $message) => null),
        'checksum or size'
    );

    $unsafePath = $tempDir . '/unsafe.zip';
    restoreTestArchive($unsafePath, fn(ZipArchive $zip) => $zip->addFromString('../escape.txt', 'no'));
    restoreTestExpectFailure(
        fn() => crmRestoreArchive($unsafePath, $target, '', false, '', false, null, fn(string $message) => null),
        'unsafe path'
    );
    restoreTestAssert(!is_file($tempDir . '/escape.txt'), 'unsafe archive escaped the restore workspace');

    $applied = crmRestoreArchive(
        $archivePath,
        $target,
        'test-service-key',
        true,
        'DISPOSABLE_STAGING_ONLY',
        false,
        null,
        fn(string $message) => null
    );
    restoreTestAssert($applied['applied'], 'mock disposable restore did not complete');
    $requests = array_values(array_filter(explode("\n", trim((string) file_get_contents($requestLog)))));
    restoreTestAssert(count($requests) === 24, 'restore did not issue 22 table, 1 bucket and 1 object writes');
    $decodedRequests = array_map(fn(string $line): array => json_decode($line, true, 512, JSON_THROW_ON_ERROR), $requests);
    restoreTestAssert(count(array_filter($decodedRequests, fn(array $row): bool => str_starts_with($row['uri'], '/rest/v1/'))) === 22, 'not every table was restored');
    $objectRequests = array_values(array_filter($decodedRequests, fn(array $row): bool => str_starts_with($row['uri'], '/storage/v1/object/')));
    restoreTestAssert(count($objectRequests) === 1, 'Storage object restore request was missing');
    restoreTestAssert($objectRequests[0]['sha256'] === hash('sha256', "restore-test\0bytes"), 'Storage bytes changed during restore');
    $settingsRequests = array_values(array_filter($decodedRequests, fn(array $row): bool => str_starts_with($row['uri'], '/rest/v1/settings')));
    restoreTestAssert(count($settingsRequests) === 1, 'settings restore request was missing');
    $safeSettingsBody = json_encode([['key' => 'test_key', 'value' => 'test_value']]);
    restoreTestAssert($settingsRequests[0]['sha256'] === hash('sha256', $safeSettingsBody), 'older archive secret setting was not removed before restore');

    echo "PASS: archive integrity, complete table scope, production refusal, confirmation gate, dry-run isolation, traversal defense, checksums and mock disposable restore.\n";
} finally {
    proc_terminate($process);
    foreach ($pipes as $pipe) {
        if (is_resource($pipe)) {
            fclose($pipe);
        }
    }
    proc_close($process);
    crmDeleteTree($tempDir);
}
