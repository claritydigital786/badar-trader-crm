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

/** @param list<string> $profileIds */
function crmRestoreVerifyAuthIds(string $targetUrl, string $serviceKey, array $profileIds): void {
    $url = rtrim($targetUrl, '/') . '/rest/v1/rpc/confirm_disposable_restore_auth_ids';
    $body = json_encode(['p_profile_ids' => $profileIds], JSON_THROW_ON_ERROR);
    $response = crmRestoreRequest('POST', $url, $serviceKey, $body, ['Content-Type: application/json']);
    if (!$response['ok']) {
        throw new RuntimeException('staging Auth users do not match the archived profile IDs');
    }
    $marker = json_decode($response['body'], true);
    if ($marker !== 'BADAR_DISPOSABLE_AUTH_IDS_READY_V1') {
        throw new RuntimeException('target returned an invalid disposable-staging Auth-ID marker');
    }
}

/** @return array{directory: string, entries: int, bytes: int} */
function crmRestoreExtractArchive(
    string $archivePath,
    int $maxEntries = 100000,
    int $maxBytes = 10737418240,
    ?string $workspaceRoot = null
): array {
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

    $workspaceRoot = $workspaceRoot ?? sys_get_temp_dir();
    if (!is_dir($workspaceRoot) || !is_writable($workspaceRoot)) {
        $zip->close();
        throw new RuntimeException('restore workspace root is not a writable directory');
    }
    $directory = rtrim($workspaceRoot, '/\\') . '/badar-crm-restore-' . bin2hex(random_bytes(10));
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
    callable $log,
    ?string $workspaceRoot = null
): array {
    crmRestoreValidateTarget($targetUrl, $allowRemote, $expectedProjectRef);
    if ($apply && $confirmation !== 'DISPOSABLE_STAGING_ONLY') {
        throw new RuntimeException('apply mode requires RESTORE_CONFIRMATION=DISPOSABLE_STAGING_ONLY');
    }
    if ($apply && $serviceKey === '') {
        throw new RuntimeException('apply mode requires the staging service-role key');
    }

    $extracted = crmRestoreExtractArchive($archivePath, 100000, 10737418240, $workspaceRoot);
    $directory = $extracted['directory'];
    $tables = [];
    $rowCount = 0;
    $storageEntries = [];
    $buckets = [];
    $storageBytes = 0;

    try {
        $databaseManifestPath = $directory . '/backup_manifest.json';
        $databaseManifest = null;
        $databaseManifestVersion = 0;
        $databaseTableMetadata = [];
        if (is_file($databaseManifestPath)) {
            $databaseManifest = json_decode(
                (string) file_get_contents($databaseManifestPath),
                true,
                512,
                JSON_THROW_ON_ERROR
            );
            if (!is_array($databaseManifest)) {
                throw new RuntimeException('backup manifest is not a JSON object');
            }
            $databaseManifestVersion = (int) ($databaseManifest['format_version'] ?? 0);
            if (!in_array($databaseManifestVersion, [2, 3], true)) {
                throw new RuntimeException('unsupported backup manifest version');
            }
            if (($databaseManifest['secret_values_included'] ?? null) === true) {
                if ($apply) {
                    throw new RuntimeException('apply mode refuses an archive whose manifest includes secret settings');
                }
                $log('WARNING: archive manifest reports secret settings; validation will not write them.');
            }
            $databaseTableMetadata = $databaseManifest['tables'] ?? null;
            if (!is_array($databaseTableMetadata)) {
                throw new RuntimeException('backup manifest is missing table metadata');
            }
            $manifestTables = array_keys($databaseTableMetadata);
            $expectedTables = array_keys(crmRestoreTableMap());
            sort($manifestTables);
            sort($expectedTables);
            if ($manifestTables !== $expectedTables) {
                throw new RuntimeException('backup manifest table scope does not match the restore scope');
            }
        } elseif ($apply) {
            throw new RuntimeException('apply mode requires a format version 3 backup manifest');
        } else {
            $log('WARNING: legacy archive has no database checksum manifest; validation is structural only.');
        }

        if ($apply && $databaseManifestVersion !== 3) {
            throw new RuntimeException('apply mode requires a format version 3 backup manifest');
        }
        if ($apply && ($databaseManifest['secret_values_included'] ?? null) !== false) {
            throw new RuntimeException('apply mode requires confirmed secret exclusion in the backup manifest');
        }

        foreach (crmRestoreTableMap() as $table => $conflictColumn) {
            $path = $directory . '/' . $table . '.json';
            if (!is_file($path)) {
                throw new RuntimeException("backup archive is missing $table.json");
            }
            $tableBytes = filesize($path);
            $tableHash = hash_file('sha256', $path);
            if ($tableBytes === false || $tableHash === false) {
                throw new RuntimeException("could not verify $table.json");
            }
            if ($databaseManifestVersion === 3) {
                $metadata = $databaseTableMetadata[$table] ?? null;
                if (!is_array($metadata)
                    || !is_int($metadata['rows'] ?? null)
                    || !is_int($metadata['bytes'] ?? null)
                    || !is_string($metadata['sha256'] ?? null)
                    || preg_match('/^[a-f0-9]{64}$/', $metadata['sha256']) !== 1
                    || $metadata['rows'] < 0
                    || $metadata['bytes'] < 0) {
                    throw new RuntimeException("backup manifest contains invalid metadata for $table.json");
                }
                if ($tableBytes !== $metadata['bytes'] || !hash_equals($metadata['sha256'], $tableHash)) {
                    throw new RuntimeException("database table checksum or size validation failed for $table.json");
                }
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
            $manifestRowCount = $databaseManifestVersion === 3
                ? ($databaseTableMetadata[$table]['rows'] ?? null)
                : ($databaseTableMetadata[$table] ?? null);
            if ($databaseManifestVersion > 0
                && (!is_int($manifestRowCount) || $manifestRowCount < 0 || count($rows) !== $manifestRowCount)) {
                throw new RuntimeException("database table row-count validation failed for $table.json");
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

        if ($databaseManifestVersion === 2) {
            $log('WARNING: version 2 database manifest has row counts but no table checksums.');
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
        $profileIds = [];
        foreach ($tables['profiles']['rows'] as $profile) {
            $profileId = (string) ($profile['id'] ?? '');
            if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $profileId) !== 1) {
                throw new RuntimeException('profiles.json contains an invalid Auth user ID');
            }
            $profileIds[$profileId] = true;
        }
        crmRestoreVerifyAuthIds($targetUrl, $serviceKey, array_keys($profileIds));

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
