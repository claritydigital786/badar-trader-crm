<?php
/**
 * Badar Trader CRM - Supabase data backup.
 *
 * Requested 2026-07-21: back up the CRM's Supabase data 4 times a day onto
 * Badar's own Hostinger hosting, so the client keeps a continuously-updated
 * copy independent of Supabase itself. Run from cron every 6 hours - see
 * README.md for the exact hPanel setup.
 *
 * This never touches live customer conversations or campaign traffic. It
 * only reads data (GET requests against Supabase's REST API) and writes
 * files on this same hosting account - it cannot alter anything in
 * Supabase or in the CRM.
 *
 * Credentials are never hardcoded here. Copy config.example.php to
 * config.php (gitignored) and fill in the real project URL and service
 * role key - or export them as environment variables (SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY) via the hosting's cron job command instead,
 * whichever Hostinger's control panel makes easier.
 */

declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '1');

$scriptDir = __DIR__;
$storageHelpers = $scriptDir . '/storage_backup.php';
require_once $storageHelpers;
$configFile = $scriptDir . '/config.php';
if (is_file($configFile)) {
    require $configFile;
}

$supabaseUrl = getenv('SUPABASE_URL') ?: (defined('SUPABASE_URL') ? SUPABASE_URL : null);
$serviceKey  = getenv('SUPABASE_SERVICE_ROLE_KEY') ?: (defined('SUPABASE_SERVICE_ROLE_KEY') ? SUPABASE_SERVICE_ROLE_KEY : null);

// How many past backups to keep on disk. Shared hosting has a storage cap,
// and 4 backups/day means this fills up fast without pruning. 28 backups is
// exactly 7 days of history at 4x/day.
$retainCount = (int) (getenv('BACKUP_RETAIN_COUNT') ?: (defined('BACKUP_RETAIN_COUNT') ? BACKUP_RETAIN_COUNT : 28));

$storageEnabledRaw = getenv('BACKUP_STORAGE_ENABLED');
if ($storageEnabledRaw === false && defined('BACKUP_STORAGE_ENABLED')) {
    $storageEnabledRaw = BACKUP_STORAGE_ENABLED ? 'true' : 'false';
}
$storageEnabled = $storageEnabledRaw === false
    ? true
    : filter_var($storageEnabledRaw, FILTER_VALIDATE_BOOLEAN);

$storageBucketsRaw = getenv('BACKUP_STORAGE_BUCKETS');
if ($storageBucketsRaw === false && defined('BACKUP_STORAGE_BUCKETS')) {
    $storageBucketsRaw = (string) BACKUP_STORAGE_BUCKETS;
}
$storageBucketAllowList = $storageBucketsRaw === false || trim($storageBucketsRaw) === ''
    ? null
    : array_values(array_filter(array_map('trim', explode(',', $storageBucketsRaw)), fn(string $v): bool => $v !== ''));

$storageMaxObjects = (int) (getenv('BACKUP_STORAGE_MAX_OBJECTS') ?: (defined('BACKUP_STORAGE_MAX_OBJECTS') ? BACKUP_STORAGE_MAX_OBJECTS : 50000));

$backupsDir = getenv('BACKUP_OUTPUT_DIR') ?: $scriptDir . '/backups';
$logFile    = getenv('BACKUP_LOG_FILE') ?: $scriptDir . '/backup.log';

function backupLog(string $logFile, string $message): void {
    $line = '[' . date('Y-m-d H:i:s') . '] ' . $message . PHP_EOL;
    file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX);
    echo $line;
}

if (!$supabaseUrl || !$serviceKey) {
    backupLog($logFile, 'FATAL: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. Copy config.example.php to config.php and fill it in, or set the two environment variables in the cron job command.');
    exit(1);
}

// Every active table in supabase/schema.sql as of 2026-08-10. If a new table is
// added later, add its name here too - this list is not auto-discovered,
// on purpose, so a backup run's scope is always exactly what's reviewed
// and committed, not whatever happens to exist live at run time.
$tables = [
    'profiles',
    'leads',
    'lead_activity',
    'audit_log',
    'settings',
    'transactions',
    'kyc_documents',
    'communications',
    'automation_rules',
    'signals',
    'ai_knowledge_base',
    'keyword_replies',
    'follow_up_sequences',
    'message_templates',
    'subscribers',
    'appointments',
    'follow_up_sends',
    'signal_broadcasts',
    'ai_agents',
    'payroll_settings',
    'payroll_runs',
    // notifications is deliberately excluded while its migration remains
    // parked by Muhammad's instruction. Add it only if that module is revived.
    'communication_logs',
    'communication_message_actions',
];

/**
 * Fetches every row of one table via PostgREST, paginating with the Range
 * header since Supabase caps a single response at 1000 rows by default.
 * Returns null (not an empty array) on a real failure, so the caller can
 * tell "table has zero rows" apart from "the request failed".
 */
function fetchAllRows(string $supabaseUrl, string $serviceKey, string $table, string $logFile): ?array {
    $pageSize = 1000;
    $offset = 0;
    $all = [];

    while (true) {
        $url = rtrim($supabaseUrl, '/') . '/rest/v1/' . rawurlencode($table)
            . '?select=*&order=' . rawurlencode('id.asc');

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'apikey: ' . $serviceKey,
                'Authorization: Bearer ' . $serviceKey,
                'Range-Unit: items',
                'Range: ' . $offset . '-' . ($offset + $pageSize - 1),
            ],
            CURLOPT_TIMEOUT => 60,
        ]);
        $body = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        // No curl_close() - a no-op since PHP 8.0 (the handle is freed when
        // $ch goes out of scope), and calling it is a deprecation warning on
        // 8.5+. Omitting it works correctly on every PHP version Hostinger
        // is likely to run.

        if ($body === false || $curlError) {
            backupLog($logFile, "  ERROR fetching '$table' at offset $offset: curl error: $curlError");
            return null;
        }
        // 200 = full result fits, 206 = partial (more pages follow), both fine.
        if ($httpCode !== 200 && $httpCode !== 206) {
            backupLog($logFile, "  ERROR fetching '$table' at offset $offset: HTTP $httpCode - " . substr($body, 0, 300));
            return null;
        }

        $rows = json_decode($body, true);
        if (!is_array($rows)) {
            backupLog($logFile, "  ERROR fetching '$table' at offset $offset: response was not a JSON array");
            return null;
        }

        $all = array_merge($all, $rows);

        if (count($rows) < $pageSize) {
            break; // last page
        }
        $offset += $pageSize;
    }

    return $all;
}

// ── Run ──────────────────────────────────────────────────────────────
$runStamp = date('Y-m-d_His');
$runDir = $backupsDir . '/' . $runStamp;
if (file_exists($runDir) || is_link($runDir)) {
    backupLog($logFile, "FATAL: backup run path already exists: $runDir");
    exit(1);
}
if (!is_dir($runDir) && !mkdir($runDir, 0755, true) && !is_dir($runDir)) {
    backupLog($logFile, "FATAL: could not create backup directory $runDir");
    exit(1);
}

backupLog($logFile, "Backup run started: $runStamp");

$okCount = 0;
$failCount = 0;
$totalRows = 0;

foreach ($tables as $table) {
    $rows = fetchAllRows($supabaseUrl, $serviceKey, $table, $logFile);

    if ($rows === null) {
        $failCount++;
        continue;
    }

    $written = file_put_contents(
        $runDir . '/' . $table . '.json',
        json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    );

    if ($written === false) {
        backupLog($logFile, "  ERROR writing $table.json to disk");
        $failCount++;
        continue;
    }

    $rowCount = count($rows);
    $totalRows += $rowCount;
    $okCount++;
    backupLog($logFile, "  OK: $table ($rowCount rows)");
}

if ($storageEnabled) {
    try {
        $storageResult = crmBackupStorage(
            $supabaseUrl,
            $serviceKey,
            $runDir,
            function (string $message) use ($logFile): void {
                backupLog($logFile, $message);
            },
            $storageBucketAllowList,
            1000,
            $storageMaxObjects
        );
        $failCount += $storageResult['failed_count'];
        backupLog(
            $logFile,
            "Storage backup: {$storageResult['bucket_count']} buckets, {$storageResult['object_count']} objects, "
            . "{$storageResult['failed_count']} failed, {$storageResult['total_bytes']} bytes."
        );
    } catch (Throwable $error) {
        $failCount++;
        backupLog($logFile, '  ERROR backing up Storage: ' . $error->getMessage());
    }
} else {
    backupLog($logFile, '  NOTE: Storage backup disabled by BACKUP_STORAGE_ENABLED.');
}

// Zip the run's folder into one file if PHP's zip extension is available -
// far more practical to keep or move around than the JSON and binary files.
if (class_exists('ZipArchive')) {
    $zipPath = $backupsDir . '/' . $runStamp . '.zip';
    $zip = new ZipArchive();
    if ($zip->open($zipPath, ZipArchive::CREATE) === true) {
        $zipOk = true;
        try {
            crmAddDirectoryToZip($zip, $runDir);
        } catch (Throwable $error) {
            $zipOk = false;
            backupLog($logFile, '  ERROR adding files to zip: ' . $error->getMessage());
        }
        if (!$zip->close()) {
            $zipOk = false;
            backupLog($logFile, '  ERROR finalizing zip archive');
        }

        if ($zipOk) {
            // Loose files are redundant once the archive is safely finalized.
            crmDeleteTree($runDir);
            backupLog($logFile, "Zipped to $runStamp.zip");
        } else {
            $failCount++;
            @unlink($zipPath);
            backupLog($logFile, "  WARNING: zip failed, leaving $runStamp/ as loose files");
        }
    } else {
        $failCount++;
        backupLog($logFile, "  WARNING: could not create zip, leaving $runStamp/ as loose files");
    }
} else {
    backupLog($logFile, '  NOTE: PHP zip extension not available, leaving backup as loose JSON files');
}

crmPruneOldBackups(
    $backupsDir,
    $retainCount,
    function (string $message) use ($logFile): void {
        backupLog($logFile, $message);
    }
);

backupLog($logFile, "Backup run finished: $okCount tables OK, $failCount failed, $totalRows total rows.");

// Non-zero exit on any failure so a cron-failure-monitoring email (if
// Hostinger's cron ever sends one) actually fires.
exit($failCount > 0 ? 1 : 0);
