<?php
/**
 * Read-only Supabase Storage backup helpers.
 *
 * Objects are stored under hash-based local names. The manifest retains the
 * original bucket and object path, which prevents remote names from becoming
 * unsafe local paths while keeping every byte restorable.
 */

declare(strict_types=1);

function crmStorageEncodePath(string $path): string {
    return implode('/', array_map('rawurlencode', explode('/', $path)));
}

function crmStoragePathIsSafe(string $path): bool {
    if ($path === '' || strlen($path) > 4096 || str_contains($path, "\0") || str_contains($path, '\\')) {
        return false;
    }

    foreach (explode('/', $path) as $segment) {
        if ($segment === '' || $segment === '.' || $segment === '..') {
            return false;
        }
    }

    return true;
}

/**
 * @return array{ok: bool, status: int, body: string, error: string}
 */
function crmStorageRequest(
    string $method,
    string $url,
    string $serviceKey,
    ?array $jsonBody = null,
    ?string $downloadPath = null
): array {
    $headers = [
        'apikey: ' . $serviceKey,
        'Authorization: Bearer ' . $serviceKey,
    ];

    $ch = curl_init($url);
    $fileHandle = null;

    if ($jsonBody !== null) {
        $encoded = json_encode($jsonBody, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($encoded === false) {
            return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'could not encode request JSON'];
        }
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, $encoded);
    }

    if ($downloadPath !== null) {
        $fileHandle = fopen($downloadPath, 'wb');
        if ($fileHandle === false) {
            return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'could not open local download file'];
        }
        curl_setopt($ch, CURLOPT_FILE, $fileHandle);
    } else {
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    }

    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_FOLLOWLOCATION => false,
    ]);

    $result = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);

    if (is_resource($fileHandle)) {
        fclose($fileHandle);
    }

    $body = is_string($result) ? $result : '';
    $ok = $result !== false && $curlError === '' && $status >= 200 && $status < 300;
    if (!$ok && $downloadPath !== null) {
        @unlink($downloadPath);
    }

    return [
        'ok' => $ok,
        'status' => $status,
        'body' => $body,
        'error' => $curlError,
    ];
}

/**
 * @return array{buckets: array<int, array<string, mixed>>, error: ?string}
 */
function crmStorageListBuckets(string $supabaseUrl, string $serviceKey): array {
    $url = rtrim($supabaseUrl, '/') . '/storage/v1/bucket';
    $response = crmStorageRequest('GET', $url, $serviceKey);
    if (!$response['ok']) {
        $detail = $response['error'] !== '' ? $response['error'] : 'HTTP ' . $response['status'];
        return ['buckets' => [], 'error' => $detail];
    }

    $decoded = json_decode($response['body'], true);
    if (!is_array($decoded)) {
        return ['buckets' => [], 'error' => 'bucket response was not a JSON array'];
    }

    return ['buckets' => array_values($decoded), 'error' => null];
}

/**
 * Recursively lists every object in a bucket using the stable list endpoint.
 *
 * @return array{objects: array<int, array<string, mixed>>, errors: string[]}
 */
function crmStorageListObjects(
    string $supabaseUrl,
    string $serviceKey,
    string $bucket,
    int $pageSize = 1000,
    int $maxObjects = 50000
): array {
    $pageSize = max(1, min($pageSize, 1000));
    $maxObjects = max(1, $maxObjects);
    $queue = [''];
    $seenFolders = ['' => true];
    $seenObjects = [];
    $objects = [];
    $errors = [];

    while ($queue !== []) {
        $prefix = array_shift($queue);
        $offset = 0;

        while (true) {
            $url = rtrim($supabaseUrl, '/') . '/storage/v1/object/list/' . rawurlencode($bucket);
            $response = crmStorageRequest('POST', $url, $serviceKey, [
                'prefix' => $prefix,
                'limit' => $pageSize,
                'offset' => $offset,
                'sortBy' => ['column' => 'name', 'order' => 'asc'],
            ]);

            if (!$response['ok']) {
                $detail = $response['error'] !== '' ? $response['error'] : 'HTTP ' . $response['status'];
                $errors[] = "could not list bucket '$bucket' prefix '$prefix': $detail";
                break;
            }

            $items = json_decode($response['body'], true);
            if (!is_array($items)) {
                $errors[] = "bucket '$bucket' prefix '$prefix' returned invalid JSON";
                break;
            }

            foreach ($items as $item) {
                if (!is_array($item) || !isset($item['name']) || !is_string($item['name'])) {
                    $errors[] = "bucket '$bucket' prefix '$prefix' returned an invalid item";
                    continue;
                }

                $name = $item['name'];
                $path = $prefix === '' ? $name : $prefix . '/' . $name;
                if (!crmStoragePathIsSafe($path)) {
                    $errors[] = "rejected unsafe object path in bucket '$bucket'";
                    continue;
                }

                $isObject = isset($item['id']) && is_string($item['id']) && $item['id'] !== '';
                if (!$isObject) {
                    if (substr_count($path, '/') >= 64) {
                        $errors[] = "folder depth limit reached in bucket '$bucket'";
                        continue;
                    }
                    if (!isset($seenFolders[$path])) {
                        $seenFolders[$path] = true;
                        $queue[] = $path;
                    }
                    continue;
                }

                if (!isset($seenObjects[$path])) {
                    $seenObjects[$path] = true;
                    $item['path'] = $path;
                    $objects[] = $item;
                    if (count($objects) > $maxObjects) {
                        $errors[] = "object safety limit of $maxObjects exceeded in bucket '$bucket'";
                        return ['objects' => $objects, 'errors' => $errors];
                    }
                }
            }

            if (count($items) < $pageSize) {
                break;
            }
            $offset += $pageSize;
        }
    }

    usort($objects, fn(array $a, array $b): int => strcmp((string) $a['path'], (string) $b['path']));
    return ['objects' => $objects, 'errors' => $errors];
}

/**
 * @return array{ok: bool, status: int, error: string}
 */
function crmStorageDownloadObject(
    string $supabaseUrl,
    string $serviceKey,
    string $bucket,
    string $objectPath,
    string $destination
): array {
    if (!crmStoragePathIsSafe($objectPath)) {
        return ['ok' => false, 'status' => 0, 'error' => 'unsafe object path'];
    }

    $url = rtrim($supabaseUrl, '/') . '/storage/v1/object/' . rawurlencode($bucket)
        . '/' . crmStorageEncodePath($objectPath);
    $response = crmStorageRequest('GET', $url, $serviceKey, null, $destination);
    return [
        'ok' => $response['ok'],
        'status' => $response['status'],
        'error' => $response['error'] !== '' ? $response['error'] : ($response['ok'] ? '' : 'HTTP ' . $response['status']),
    ];
}

/**
 * @param callable(string): void $log
 * @return array{bucket_count: int, object_count: int, failed_count: int, total_bytes: int, manifest_path: string}
 */
function crmBackupStorage(
    string $supabaseUrl,
    string $serviceKey,
    string $runDir,
    callable $log,
    ?array $bucketAllowList = null,
    int $pageSize = 1000,
    int $maxObjects = 50000
): array {
    $storageDir = $runDir . '/storage';
    $objectDir = $storageDir . '/objects';
    if (!is_dir($objectDir) && !mkdir($objectDir, 0755, true) && !is_dir($objectDir)) {
        throw new RuntimeException('could not create Storage backup directory');
    }

    $manifest = [
        'format_version' => 1,
        'created_at' => gmdate('c'),
        'buckets' => [],
        'objects' => [],
    ];
    $failed = 0;
    $objectCount = 0;
    $totalBytes = 0;

    $bucketResult = crmStorageListBuckets($supabaseUrl, $serviceKey);
    if ($bucketResult['error'] !== null) {
        $failed++;
        $log('  ERROR listing Storage buckets: ' . $bucketResult['error']);
    } else {
        foreach ($bucketResult['buckets'] as $bucketRecord) {
            if (!is_array($bucketRecord)) {
                $failed++;
                $log('  ERROR: Storage returned an invalid bucket record');
                continue;
            }

            $bucket = $bucketRecord['id'] ?? $bucketRecord['name'] ?? null;
            if (!is_string($bucket) || $bucket === '' || strlen($bucket) > 255 || str_contains($bucket, "\0")) {
                $failed++;
                $log('  ERROR: Storage returned an invalid bucket identifier');
                continue;
            }

            if ($bucketAllowList !== null && !in_array($bucket, $bucketAllowList, true)) {
                continue;
            }

            $bucketType = strtoupper((string) ($bucketRecord['type'] ?? 'STANDARD'));
            if ($bucketType !== '' && $bucketType !== 'STANDARD') {
                $log("  NOTE: skipped non-file Storage bucket '$bucket' of type '$bucketType'");
                continue;
            }

            $manifest['buckets'][] = $bucketRecord;
            $listed = crmStorageListObjects($supabaseUrl, $serviceKey, $bucket, $pageSize, $maxObjects);
            foreach ($listed['errors'] as $error) {
                $failed++;
                $log('  ERROR: ' . $error);
            }

            foreach ($listed['objects'] as $object) {
                $objectPath = (string) $object['path'];
                $archiveName = hash('sha256', $bucket . "\0" . $objectPath) . '.bin';
                $localPath = $objectDir . '/' . $archiveName;
                $download = crmStorageDownloadObject(
                    $supabaseUrl,
                    $serviceKey,
                    $bucket,
                    $objectPath,
                    $localPath
                );

                $manifestEntry = [
                    'bucket' => $bucket,
                    'path' => $objectPath,
                    'archive_path' => 'storage/objects/' . $archiveName,
                    'listed_metadata' => $object,
                ];

                if (!$download['ok']) {
                    $failed++;
                    $manifestEntry['status'] = 'failed';
                    $manifestEntry['error'] = $download['error'];
                    $manifest['objects'][] = $manifestEntry;
                    $log("  ERROR downloading Storage object '$bucket/$objectPath': " . $download['error']);
                    continue;
                }

                $size = filesize($localPath);
                $sha256 = hash_file('sha256', $localPath);
                if ($size === false || $sha256 === false) {
                    @unlink($localPath);
                    $failed++;
                    $manifestEntry['status'] = 'failed';
                    $manifestEntry['error'] = 'could not verify downloaded file';
                    $manifest['objects'][] = $manifestEntry;
                    $log("  ERROR verifying Storage object '$bucket/$objectPath'");
                    continue;
                }

                $manifestEntry['status'] = 'ok';
                $manifestEntry['size'] = $size;
                $manifestEntry['sha256'] = $sha256;
                $manifest['objects'][] = $manifestEntry;
                $objectCount++;
                $totalBytes += $size;
            }

            $log("  OK: Storage bucket '$bucket' ($objectCount objects backed up so far)");
        }
    }

    $manifestPath = $storageDir . '/manifest.json';
    $manifestJson = json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($manifestJson === false || file_put_contents($manifestPath, $manifestJson) === false) {
        throw new RuntimeException('could not write Storage backup manifest');
    }

    return [
        'bucket_count' => count($manifest['buckets']),
        'object_count' => $objectCount,
        'failed_count' => $failed,
        'total_bytes' => $totalBytes,
        'manifest_path' => $manifestPath,
    ];
}

function crmAddDirectoryToZip(ZipArchive $zip, string $directory): void {
    $base = rtrim($directory, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
    );

    foreach ($iterator as $file) {
        if (!$file->isFile() || $file->isLink()) {
            continue;
        }
        $absolute = $file->getPathname();
        $relative = str_replace(DIRECTORY_SEPARATOR, '/', substr($absolute, strlen($base)));
        if (!$zip->addFile($absolute, $relative)) {
            throw new RuntimeException("could not add '$relative' to zip archive");
        }
    }
}

function crmDeleteTree(string $directory): void {
    if (!is_dir($directory) || is_link($directory)) {
        return;
    }

    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($iterator as $entry) {
        if ($entry->isDir() && !$entry->isLink()) {
            @rmdir($entry->getPathname());
        } else {
            @unlink($entry->getPathname());
        }
    }
    @rmdir($directory);
}

/** @param callable(string): void $log */
function crmPruneOldBackups(string $backupsDir, int $retainCount, callable $log): void {
    if (!is_dir($backupsDir)) {
        return;
    }
    $retainCount = max(1, $retainCount);
    $entries = array_values(array_filter(scandir($backupsDir), function (string $name) use ($backupsDir): bool {
        if ($name === '.' || $name === '..') {
            return false;
        }
        $path = $backupsDir . '/' . $name;
        return is_dir($path) || str_ends_with($name, '.zip');
    }));
    sort($entries);

    $excess = count($entries) - $retainCount;
    foreach (array_slice($entries, 0, max(0, $excess)) as $old) {
        $path = $backupsDir . '/' . $old;
        if (is_dir($path)) {
            crmDeleteTree($path);
        } else {
            @unlink($path);
        }
        $log("Pruned old backup: $old");
    }
}
