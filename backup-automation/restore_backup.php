<?php
/**
 * Validation and disposable-staging restore helpers for CRM backup archives.
 *
 * The production project is always refused. Remote restores require both an
 * explicit disposable-staging opt-in and the expected staging project ref.
 */

declare(strict_types=1);

require_once __DIR__ . '/storage_backup.php';
require_once __DIR__ . '/backup_scope.php';

const CRM_PRODUCTION_PROJECT_REF = 'vfskqzgphrunjxquqpks';

/** @return array<string, string> table => PostgREST conflict column */
function crmRestoreTableMap(): array {
    return crmBackupTableMap();
}

function crmRestoreArchivePathIsSafe(string $path): bool {
    if ($path === '' || strlen($path) > 4096 || str_contains($path, "\0") || str_contains($path, '\\')) {
        return false;
    }
    if (str_starts_with($path, '/') || preg_match('/^[A-Za-z]:\//', $path) === 1) {
        return false;
    }
    foreach (explode('/', rtrim($path, '/')) as $segment) {
        if ($segment === '' || $segment === '.' || $segment === '..') {
            return false;
        }
    }
    return true;
}

/** @return array{host: string, local: bool} */
function crmRestoreValidateTarget(string $targetUrl, bool $allowRemote, ?string $expectedProjectRef): array {
    $parts = parse_url($targetUrl);
    $scheme = strtolower((string) ($parts['scheme'] ?? ''));
    $host = strtolower((string) ($parts['host'] ?? ''));
    if (!in_array($scheme, ['http', 'https'], true) || $host === '') {
        throw new RuntimeException('restore target must be a complete HTTP or HTTPS URL');
    }

    if (str_contains($host, CRM_PRODUCTION_PROJECT_REF)) {
        throw new RuntimeException('refusing the live Badar Trader CRM Supabase project');
    }

    $local = in_array($host, ['localhost', '127.0.0.1', '::1'], true);
    if ($local) {
        return ['host' => $host, 'local' => true];
    }

    if (!$allowRemote) {
        throw new RuntimeException('remote restore refused without RESTORE_ALLOW_REMOTE_DISPOSABLE=true');
    }
    if ($expectedProjectRef === null || !preg_match('/^[a-z0-9]{20}$/', $expectedProjectRef)) {
        throw new RuntimeException('remote restore requires RESTORE_TARGET_PROJECT_REF');
    }
    if ($expectedProjectRef === CRM_PRODUCTION_PROJECT_REF || $host !== $expectedProjectRef . '.supabase.co') {
        throw new RuntimeException('restore target host does not match the disposable staging project ref');
    }

    return ['host' => $host, 'local' => false];
}

/** @return array{ok: bool, status: int, body: string, error: string} */
function crmRestoreRequest(string $method, string $url, string $serviceKey, string $body, array $extraHeaders = []): array {
    $headers = array_merge([
        'apikey: ' . $serviceKey,
        'Authorization: Bearer ' . $serviceKey,
    ], $extraHeaders);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_FOLLOWLOCATION => false,
    ]);
    $result = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    $responseBody = is_string($result) ? $result : '';
    return [
        'ok' => $result !== false && $error === '' && $status >= 200 && $status < 300,
        'status' => $status,
        'body' => $responseBody,
        'error' => $error,
    ];
}

function crmRestoreVerifySafetyMarker(string $targetUrl, string $serviceKey): void {
    $url = rtrim($targetUrl, '/') . '/rest/v1/rpc/confirm_disposable_restore_safety';
    $response = crmRestoreRequest('POST', $url, $serviceKey, '{}', ['Content-Type: application/json']);
    if (!$response['ok']) {
        throw new RuntimeException('target has not passed the disposable-staging outbound safety check');
    }
    $marker = json_decode($response['body'], true);
    if ($marker !== 'BADAR_DISPOSABLE_STAGING_SAFE_V1') {
        throw new RuntimeException('target returned an invalid disposable-staging safety marker');
    }
}

/** @return array{directory: string, entries: int, bytes: int} */
function crmRestoreExtractArchive(string $archivePath, int $maxEntries = 100000, int $maxBytes = 10737418240): array {
    if (!is_file($archivePath)) {
        throw new RuntimeException('backup archive does not exist');
    }
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('PHP zip extension is required');
    }

    $zip = new ZipArchive();
    if ($zip->open($archivePath) !== true) {
        throw new RuntimeException('backup archive could not be opened');
    }
    $entryCount = $zip->numFiles;
    if ($entryCount < 1 || $entryCount > $maxEntries) {
        $zip->close();
        throw new RuntimeException('backup archive entry count is outside the safety limit');
    }

    $directory = sys_get_temp_dir() . '/badar-crm-restore-' . bin2hex(random_bytes(10));
    if (!mkdir($directory, 0700, true)) {
        $zip->close();
        throw new RuntimeException('could not create restore workspace');
    }

    $totalBytes = 0;
    try {
        for ($index = 0; $index < $entryCount; $index++) {
            $stat = $zip->statIndex($index);
            $name = is_array($stat) ? (string) ($stat['name'] ?? '') : '';
            if (!crmRestoreArchivePathIsSafe($name)) {
                throw new RuntimeException('backup archive contains an unsafe path');
            }
            if (str_ends_with($name, '/')) {
                continue;
            }
            $size = (int) ($stat['size'] ?? 0);
            $totalBytes += $size;
            if ($size < 0 || $totalBytes > $maxBytes) {
                throw new RuntimeException('backup archive exceeds the extraction safety limit');
            }

            $destination = $directory . '/' . $name;
            $parent = dirname($destination);
            if (!is_dir($parent) && !mkdir($parent, 0700, true) && !is_dir($parent)) {
                throw new RuntimeException('could not create restore archive directory');
            }
            $input = $zip->getStream($name);
            $output = fopen($destination, 'xb');
            if ($input === false || $output === false) {
                if (is_resource($input)) {
                    fclose($input);
                }
                if (is_resource($output)) {
                    fclose($output);
                }
                throw new RuntimeException('could not extract backup archive entry');
            }
            $copied = stream_copy_to_stream($input, $output);
            fclose($input);
            fclose($output);
            if ($copied !== $size) {
                throw new RuntimeException('backup archive entry size changed during extraction');
            }
        }
    } catch (Throwable $error) {
        $zip->close();
        crmDeleteTree($directory);
        throw $error;
    }
    $zip->close();
    return ['directory' => $directory, 'entries' => $entryCount, 'bytes' => $totalBytes];
}

/**
 * @param callable(string): void $log
 * @return array{tables: int, rows: int, buckets: int, objects: int, bytes: int, applied: bool}
 */
function crmRestoreArchive(
    string $archivePath,
    string $targetUrl,
    string $serviceKey,
    bool $apply,
    string $confirmation,
    bool $allowRemote,
    ?string $expectedProjectRef,
    callable $log
): array {
    crmRestoreValidateTarget($targetUrl, $allowRemote, $expectedProjectRef);
    if ($apply && $confirmation !== 'DISPOSABLE_STAGING_ONLY') {
        throw new RuntimeException('apply mode requires RESTORE_CONFIRMATION=DISPOSABLE_STAGING_ONLY');
    }
    if ($apply && $serviceKey === '') {
        throw new RuntimeException('apply mode requires the staging service-role key');
    }

    $extracted = crmRestoreExtractArchive($archivePath);
    $directory = $extracted['directory'];
    $tables = [];
    $rowCount = 0;
    $storageEntries = [];
    $buckets = [];
    $storageBytes = 0;

    try {
        foreach (crmRestoreTableMap() as $table => $conflictColumn) {
            $path = $directory . '/' . $table . '.json';
            if (!is_file($path)) {
                throw new RuntimeException("backup archive is missing $table.json");
            }
            $rows = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
            if (!is_array($rows) || !array_is_list($rows)) {
                throw new RuntimeException("$table.json is not a JSON row array");
            }
            foreach ($rows as $row) {
                if (!is_array($row)) {
                    throw new RuntimeException("$table.json contains a non-object row");
                }
            }
            if ($table === 'settings') {
                $secretKeys = crmBackupSecretSettingKeys();
                $rows = array_values(array_filter($rows, static function (array $row) use ($secretKeys): bool {
                    return !in_array((string) ($row['key'] ?? ''), $secretKeys, true);
                }));
            }
            $tables[$table] = ['rows' => $rows, 'conflict' => $conflictColumn];
            $rowCount += count($rows);
        }

        $manifestPath = $directory . '/storage/manifest.json';
        if (!is_file($manifestPath)) {
            throw new RuntimeException('backup archive is missing the Storage manifest');
        }
        $manifest = json_decode((string) file_get_contents($manifestPath), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($manifest) || ($manifest['format_version'] ?? null) !== 1) {
            throw new RuntimeException('unsupported Storage manifest');
        }
        $buckets = is_array($manifest['buckets'] ?? null) ? $manifest['buckets'] : [];
        $objects = is_array($manifest['objects'] ?? null) ? $manifest['objects'] : [];

        foreach ($objects as $entry) {
            if (!is_array($entry) || ($entry['status'] ?? null) !== 'ok') {
                throw new RuntimeException('backup archive contains a failed Storage object');
            }
            $bucket = (string) ($entry['bucket'] ?? '');
            $objectPath = (string) ($entry['path'] ?? '');
            $archiveObjectPath = (string) ($entry['archive_path'] ?? '');
            if ($bucket === '' || !crmStoragePathIsSafe($objectPath)
                || !str_starts_with($archiveObjectPath, 'storage/objects/')
                || !crmRestoreArchivePathIsSafe($archiveObjectPath)) {
                throw new RuntimeException('Storage manifest contains an unsafe object path');
            }
            $localPath = $directory . '/' . $archiveObjectPath;
            if (!is_file($localPath)) {
                throw new RuntimeException('Storage manifest references a missing object');
            }
            $size = filesize($localPath);
            $hash = hash_file('sha256', $localPath);
            if ($size === false || $hash === false
                || $size !== (int) ($entry['size'] ?? -1)
                || !hash_equals((string) ($entry['sha256'] ?? ''), $hash)) {
                throw new RuntimeException('Storage object checksum or size validation failed');
            }
            $entry['local_path'] = $localPath;
            $storageEntries[] = $entry;
            $storageBytes += $size;
        }

        $log('Validated ' . count($tables) . " tables, $rowCount rows, " . count($buckets) . ' buckets and '
            . count($storageEntries) . " Storage objects ($storageBytes bytes).");

        if (!$apply) {
            $log('Validation-only mode completed. No target write was attempted.');
            return [
                'tables' => count($tables),
                'rows' => $rowCount,
                'buckets' => count($buckets),
                'objects' => count($storageEntries),
                'bytes' => $storageBytes,
                'applied' => false,
            ];
        }

        crmRestoreVerifySafetyMarker($targetUrl, $serviceKey);

        foreach ($tables as $table => $tableInfo) {
            foreach (array_chunk($tableInfo['rows'], 200) as $chunk) {
                if ($chunk === []) {
                    continue;
                }
                $body = json_encode($chunk, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                $url = rtrim($targetUrl, '/') . '/rest/v1/' . rawurlencode($table)
                    . '?on_conflict=' . rawurlencode($tableInfo['conflict']);
                $response = crmRestoreRequest('POST', $url, $serviceKey, $body, [
                    'Content-Type: application/json',
                    'Prefer: resolution=merge-duplicates,return=minimal',
                ]);
                if (!$response['ok']) {
                    throw new RuntimeException("restore failed for table $table: HTTP {$response['status']}");
                }
            }
            $log("Restored table $table (" . count($tableInfo['rows']) . ' rows).');
        }

        foreach ($buckets as $bucketRecord) {
            if (!is_array($bucketRecord)) {
                throw new RuntimeException('Storage manifest contains an invalid bucket');
            }
            $bucket = (string) ($bucketRecord['id'] ?? $bucketRecord['name'] ?? '');
            if ($bucket === '' || str_contains($bucket, "\0") || strlen($bucket) > 255) {
                throw new RuntimeException('Storage manifest contains an invalid bucket name');
            }
            $bucketPayload = [
                'id' => $bucket,
                'name' => $bucket,
                'public' => (bool) ($bucketRecord['public'] ?? false),
            ];
            if (array_key_exists('file_size_limit', $bucketRecord) && $bucketRecord['file_size_limit'] !== null) {
                $bucketPayload['file_size_limit'] = $bucketRecord['file_size_limit'];
            }
            if (array_key_exists('allowed_mime_types', $bucketRecord) && $bucketRecord['allowed_mime_types'] !== null) {
                $bucketPayload['allowed_mime_types'] = $bucketRecord['allowed_mime_types'];
            }
            $payload = json_encode($bucketPayload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $response = crmRestoreRequest('POST', rtrim($targetUrl, '/') . '/storage/v1/bucket', $serviceKey, $payload, [
                'Content-Type: application/json',
            ]);
            if (!$response['ok'] && $response['status'] !== 409) {
                throw new RuntimeException("restore failed creating Storage bucket $bucket: HTTP {$response['status']}");
            }
        }

        foreach ($storageEntries as $entry) {
            $bytes = file_get_contents($entry['local_path']);
            if ($bytes === false) {
                throw new RuntimeException('could not read a validated Storage object');
            }
            $url = rtrim($targetUrl, '/') . '/storage/v1/object/' . rawurlencode((string) $entry['bucket'])
                . '/' . crmStorageEncodePath((string) $entry['path']);
            $listedMetadata = is_array($entry['listed_metadata'] ?? null) ? $entry['listed_metadata'] : [];
            $objectMetadata = is_array($listedMetadata['metadata'] ?? null) ? $listedMetadata['metadata'] : [];
            $contentType = (string) ($objectMetadata['mimetype'] ?? $objectMetadata['contentType'] ?? 'application/octet-stream');
            if ($contentType === '' || str_contains($contentType, "\r") || str_contains($contentType, "\n")) {
                $contentType = 'application/octet-stream';
            }
            $response = crmRestoreRequest('POST', $url, $serviceKey, $bytes, [
                'Content-Type: ' . $contentType,
                'x-upsert: true',
            ]);
            if (!$response['ok']) {
                throw new RuntimeException("restore failed for Storage object: HTTP {$response['status']}");
            }
        }
        $log('Disposable staging restore completed.');

        return [
            'tables' => count($tables),
            'rows' => $rowCount,
            'buckets' => count($buckets),
            'objects' => count($storageEntries),
            'bytes' => $storageBytes,
            'applied' => true,
        ];
    } finally {
        crmDeleteTree($directory);
    }
}
