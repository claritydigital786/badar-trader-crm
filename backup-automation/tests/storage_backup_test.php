<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/storage_backup.php';
require_once dirname(__DIR__) . '/backup_scope.php';
require_once dirname(__DIR__) . '/backup_config.php';

function testAssert(bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function testRemoveTree(string $path): void {
    if (is_dir($path)) {
        crmDeleteTree($path);
    } elseif (is_file($path)) {
        @unlink($path);
    }
}

$socket = stream_socket_server('tcp://127.0.0.1:0', $errorCode, $errorMessage);
if ($socket === false) {
    throw new RuntimeException("could not reserve mock port: $errorCode $errorMessage");
}
$address = stream_socket_get_name($socket, false);
fclose($socket);
$port = (int) substr((string) strrchr((string) $address, ':'), 1);

$tempDir = sys_get_temp_dir() . '/badar-storage-backup-test-' . bin2hex(random_bytes(6));
mkdir($tempDir, 0755, true);
$serverLog = $tempDir . '/mock-server.log';
$router = __DIR__ . '/mock_storage_router.php';
$command = escapeshellarg(PHP_BINARY) . ' -S 127.0.0.1:' . $port . ' ' . escapeshellarg($router);
$pipes = [];
$process = proc_open($command, [
    0 => ['pipe', 'r'],
    1 => ['file', $serverLog, 'a'],
    2 => ['file', $serverLog, 'a'],
], $pipes, __DIR__);
if (!is_resource($process)) {
    testRemoveTree($tempDir);
    throw new RuntimeException('could not start mock Storage server');
}

try {
    $baseUrl = 'http://127.0.0.1:' . $port;
    $ready = false;
    for ($attempt = 0; $attempt < 50; $attempt++) {
        $probe = @file_get_contents($baseUrl . '/storage/v1/bucket', false, stream_context_create([
            'http' => ['header' => "Authorization: Bearer test-service-key\r\napikey: test-service-key\r\n"],
        ]));
        if ($probe !== false) {
            $ready = true;
            break;
        }
        usleep(20000);
    }
    testAssert($ready, 'mock Storage server did not become ready');

    testAssert(crmStoragePathIsSafe('docs/report.pdf'), 'valid nested path was rejected');
    testAssert(!crmStoragePathIsSafe('../escape.bin'), 'parent traversal path was accepted');
    testAssert(!crmStoragePathIsSafe('docs/../../escape.bin'), 'nested traversal path was accepted');
    testAssert(!crmStoragePathIsSafe('docs\\escape.bin'), 'backslash path was accepted');
    testAssert(!crmStoragePathIsSafe("bad\0name.bin"), 'NUL path was accepted');
    testAssert(crmBackupPathUsesCommonWebRoot('/home/account/public_html/config.php'), 'public_html config path was not detected');
    testAssert(crmBackupPathUsesCommonWebRoot('/srv/htdocs/backups'), 'htdocs output path was not detected');
    testAssert(!crmBackupPathUsesCommonWebRoot('/home/account/backup-automation/config.php'), 'private config path was rejected');

    $listed = crmStorageListObjects($baseUrl, 'test-service-key', 'attachments', 1, 20);
    testAssert($listed['errors'] === [], 'recursive list returned errors: ' . implode('; ', $listed['errors']));
    $listedPaths = array_map(fn(array $item): string => (string) $item['path'], $listed['objects']);
    testAssert($listedPaths === [
        'broken.bin',
        'docs/nested/voice.ogg',
        'docs/report.pdf',
        'root.bin',
    ], 'pagination or recursive folder listing was incomplete');

    $runDir = $tempDir . '/run';
    mkdir($runDir, 0755, true);
    $logs = [];
    $result = crmBackupStorage(
        $baseUrl,
        'test-service-key',
        $runDir,
        function (string $message) use (&$logs): void {
            $logs[] = $message;
        },
        ['attachments'],
        1,
        20
    );

    testAssert($result['bucket_count'] === 1, 'non-file bucket was not skipped');
    testAssert($result['object_count'] === 3, 'successful object count was wrong');
    testAssert($result['failed_count'] === 1, 'partial download failure was not counted');
    testAssert($result['total_bytes'] === 34, 'binary byte total was wrong');
    testAssert(count(array_filter($logs, fn(string $line): bool => str_contains($line, 'broken.bin'))) === 1, 'failed object was not logged once');

    $manifest = json_decode((string) file_get_contents($result['manifest_path']), true);
    testAssert(is_array($manifest), 'manifest was not valid JSON');
    testAssert(count($manifest['objects']) === 4, 'manifest did not include all listed objects');

    $byPath = [];
    foreach ($manifest['objects'] as $entry) {
        $byPath[$entry['path']] = $entry;
    }
    testAssert($byPath['broken.bin']['status'] === 'failed', 'failed object was not marked in manifest');

    $expectedBytes = [
        'root.bin' => "\x00ROOT\xff",
        'docs/report.pdf' => "%PDF-test\n\x00binary",
        'docs/nested/voice.ogg' => "OggS\x00\x01voice",
    ];
    foreach ($expectedBytes as $path => $bytes) {
        $entry = $byPath[$path];
        $localPath = $runDir . '/' . $entry['archive_path'];
        testAssert(file_get_contents($localPath) === $bytes, "binary bytes changed for $path");
        testAssert($entry['size'] === strlen($bytes), "manifest size was wrong for $path");
        testAssert($entry['sha256'] === hash('sha256', $bytes), "manifest checksum was wrong for $path");
    }
    testAssert(!file_exists($tempDir . '/escape.bin'), 'unsafe path escaped the run directory');

    $zipPath = $tempDir . '/archive.zip';
    $zip = new ZipArchive();
    testAssert($zip->open($zipPath, ZipArchive::CREATE) === true, 'could not create test archive');
    crmAddDirectoryToZip($zip, $runDir);
    $zip->close();

    $inspect = new ZipArchive();
    testAssert($inspect->open($zipPath) === true, 'could not reopen test archive');
    testAssert($inspect->locateName('storage/manifest.json') !== false, 'archive omitted Storage manifest');
    $rootArchivePath = $byPath['root.bin']['archive_path'];
    testAssert($inspect->getFromName($rootArchivePath) === $expectedBytes['root.bin'], 'archive changed binary bytes');
    $inspect->close();

    $pruneDir = $tempDir . '/prune';
    mkdir($pruneDir, 0755, true);
    foreach (['2026-08-10_000000.zip', '2026-08-10_060000.zip', '2026-08-10_120000.zip', '2026-08-10_180000.zip'] as $name) {
        file_put_contents($pruneDir . '/' . $name, $name);
    }
    $pruned = [];
    crmPruneOldBackups($pruneDir, 2, function (string $message) use (&$pruned): void {
        $pruned[] = $message;
    });
    $remaining = array_values(array_filter(scandir($pruneDir), fn(string $name): bool => str_ends_with($name, '.zip')));
    sort($remaining);
    testAssert($remaining === ['2026-08-10_120000.zip', '2026-08-10_180000.zip'], 'retention did not keep the newest archives');
    testAssert(count($pruned) === 2, 'retention did not report both removals');

    $integrationDir = $tempDir . '/integration-backups';
    $integrationLog = $tempDir . '/integration.log';
    $integrationConfig = $tempDir . '/private-config.php';
    file_put_contents(
        $integrationConfig,
        "<?php\ndefine('SUPABASE_URL', " . var_export($baseUrl, true) . ");\n"
        . "define('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');\n"
    );
    $backupScript = dirname(__DIR__) . '/backup.php';
    $integrationPipes = [];
    $integrationProcess = proc_open(
        [PHP_BINARY, $backupScript],
        [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ],
        $integrationPipes,
        dirname(__DIR__),
        [
            'BACKUP_CONFIG_FILE' => $integrationConfig,
            'BACKUP_OUTPUT_DIR' => $integrationDir,
            'BACKUP_LOG_FILE' => $integrationLog,
            'BACKUP_RETAIN_COUNT' => '3',
            'BACKUP_STORAGE_ENABLED' => 'true',
            'BACKUP_STORAGE_BUCKETS' => 'clean',
            'BACKUP_STORAGE_MAX_OBJECTS' => '10',
        ]
    );
    testAssert(is_resource($integrationProcess), 'could not start full backup integration test');
    fclose($integrationPipes[0]);
    $integrationStdout = stream_get_contents($integrationPipes[1]);
    $integrationStderr = stream_get_contents($integrationPipes[2]);
    fclose($integrationPipes[1]);
    fclose($integrationPipes[2]);
    $integrationExit = proc_close($integrationProcess);
    testAssert(
        $integrationExit === 0,
        "full backup script failed with exit $integrationExit\n$integrationStdout\n$integrationStderr"
    );

    $integrationArchives = glob($integrationDir . '/*.zip');
    testAssert(count($integrationArchives) === 1, 'full backup did not create exactly one archive');
    $integrationZip = new ZipArchive();
    testAssert($integrationZip->open($integrationArchives[0]) === true, 'full backup archive could not be opened');
    testAssert($integrationZip->locateName('profiles.json') !== false, 'full backup archive omitted database JSON');
    testAssert($integrationZip->locateName('backup_manifest.json') !== false, 'full backup archive omitted its manifest');
    testAssert($integrationZip->locateName('storage/manifest.json') !== false, 'full backup archive omitted Storage manifest');
    $settingsRows = json_decode((string) $integrationZip->getFromName('settings.json'), true);
    testAssert($settingsRows === [['key' => 'openai_model', 'value' => 'test-safe-model']], 'secret settings were not excluded from the archive');
    $backupManifest = json_decode((string) $integrationZip->getFromName('backup_manifest.json'), true);
    testAssert($backupManifest['format_version'] === 3, 'backup manifest version did not require table checksums');
    testAssert($backupManifest['secret_values_included'] === false, 'backup manifest did not record secret exclusion');
    testAssert($backupManifest['excluded_secret_setting_keys'] === crmBackupSecretSettingKeys(), 'backup manifest secret-key list was wrong');
    testAssert(count($backupManifest['tables']) === 25, 'backup manifest did not cover all 25 tables');
    foreach ($backupManifest['tables'] as $table => $metadata) {
        $databaseJson = $integrationZip->getFromName($table . '.json');
        testAssert(is_string($databaseJson), "backup manifest references missing $table.json");
        $databaseRows = json_decode($databaseJson, true, 512, JSON_THROW_ON_ERROR);
        testAssert($metadata['rows'] === count($databaseRows), "backup manifest row count was wrong for $table");
        testAssert($metadata['bytes'] === strlen($databaseJson), "backup manifest byte count was wrong for $table");
        testAssert($metadata['sha256'] === hash('sha256', $databaseJson), "backup manifest checksum was wrong for $table");
    }
    $integrationManifest = json_decode((string) $integrationZip->getFromName('storage/manifest.json'), true);
    testAssert($integrationManifest['objects'][0]['bucket'] === 'clean', 'full backup used the wrong bucket');
    testAssert($integrationManifest['objects'][0]['path'] === 'clean.txt', 'full backup lost the original object path');
    $integrationObjectPath = $integrationManifest['objects'][0]['archive_path'];
    testAssert($integrationZip->getFromName($integrationObjectPath) === "clean storage bytes\n", 'full backup changed object bytes');
    $integrationZip->close();
    testAssert(str_contains((string) file_get_contents($integrationLog), 'Backup run finished: 25 tables OK, 0 failed'), 'full backup log did not report success');
    testAssert(str_contains((string) file_get_contents($integrationLog), 'Validated the finalized archive'), 'full backup did not validate the finalized ZIP');

    $noStorageDir = $tempDir . '/no-storage-backups';
    $noStorageLog = $tempDir . '/no-storage.log';
    $noStoragePipes = [];
    $noStorageProcess = proc_open(
        [PHP_BINARY, $backupScript],
        [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ],
        $noStoragePipes,
        dirname(__DIR__),
        [
            'BACKUP_CONFIG_FILE' => $integrationConfig,
            'BACKUP_OUTPUT_DIR' => $noStorageDir,
            'BACKUP_LOG_FILE' => $noStorageLog,
            'BACKUP_RETAIN_COUNT' => '1',
            'BACKUP_STORAGE_ENABLED' => 'false',
        ]
    );
    testAssert(is_resource($noStorageProcess), 'could not start disabled-Storage backup test');
    fclose($noStoragePipes[0]);
    $noStorageStdout = stream_get_contents($noStoragePipes[1]);
    $noStorageStderr = stream_get_contents($noStoragePipes[2]);
    fclose($noStoragePipes[1]);
    fclose($noStoragePipes[2]);
    $noStorageExit = proc_close($noStorageProcess);
    testAssert(
        $noStorageExit === 0,
        "disabled-Storage backup failed with exit $noStorageExit\n$noStorageStdout\n$noStorageStderr"
    );
    $noStorageArchives = glob($noStorageDir . '/*.zip');
    testAssert(count($noStorageArchives) === 1, 'disabled-Storage run did not retain a validated ZIP');
    $noStorageZip = new ZipArchive();
    testAssert($noStorageZip->open($noStorageArchives[0]) === true, 'disabled-Storage ZIP could not be opened');
    $noStorageManifest = json_decode((string) $noStorageZip->getFromName('storage/manifest.json'), true);
    testAssert($noStorageManifest['buckets'] === [] && $noStorageManifest['objects'] === [], 'disabled-Storage manifest was not empty');
    $noStorageZip->close();
    testAssert(str_contains((string) file_get_contents($noStorageLog), 'Validated the finalized archive'), 'disabled-Storage ZIP was not self-validated');

    $schemaSql = (string) file_get_contents(dirname(__DIR__, 2) . '/supabase/schema.sql');
    preg_match_all('/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+public\.([a-z_][a-z0-9_]*)/i', $schemaSql, $schemaMatches);
    $activeSchemaTables = array_values(array_diff(array_unique($schemaMatches[1]), ['notifications']));
    sort($activeSchemaTables);

    $configuredTables = array_keys(crmBackupTableMap());
    sort($configuredTables);
    $missingTables = array_values(array_diff($activeSchemaTables, $configuredTables));
    testAssert($missingTables === [], 'active schema tables missing from backup: ' . implode(', ', $missingTables));

    echo "PASS: Storage pagination, recursion, binary preservation, manifest, partial failures, path safety, full cron integration, schema scope, archive inspection and retention.\n";
} finally {
    proc_terminate($process);
    foreach ($pipes as $pipe) {
        if (is_resource($pipe)) {
            fclose($pipe);
        }
    }
    proc_close($process);
    testRemoveTree($tempDir);
}
