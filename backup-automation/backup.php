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

$backupsDir = $scriptDir . '/backups';
$logFile    = $scriptDir . '/backup.log';

function backupLog(string $logFile, string $message): void {
    $line = '[' . date('Y-m-d H:i:s') . '] ' . $message . PHP_EOL;
    file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX);
    echo $line;
}

if (!$supabaseUrl || !$serviceKey) {
    backupLog($logFile, 'FATAL: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. Copy config.example.php to config.php and fill it in, or set the two environment variables in the cron job command.');
    exit(1);
}

// Every table in supabase/schema.sql as of 2026-08-07. If a new table is
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
    // Referenced by index.html but not defined in schema.sql (known drift,
    // see PROJECT_BLUEPRINT.md) - attempted defensively. A missing table
    // just logs a skip below, it does not fail the whole run.
    'communication_logs',
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

function pruneOldBackups(string $backupsDir, int $retainCount, string $logFile): void {
    if (!is_dir($backupsDir)) {
        return;
    }
    // A finished backup is either a single <timestamp>.zip file (the normal
    // case, when PHP's zip extension is available) or a leftover
    // <timestamp>/ directory of loose JSON files (the fallback case, when
    // it isn't). Found by testing: pruning only ever looked for
    // directories, but the zip step deletes each run's directory right
    // after archiving it - so on any host with zip support, this function
    // was silently finding nothing to prune, ever, and backups would have
    // accumulated on disk forever.
    $entries = array_values(array_filter(scandir($backupsDir), function (string $name) use ($backupsDir): bool {
        if ($name === '.' || $name === '..') {
            return false;
        }
        $path = $backupsDir . '/' . $name;
        return is_dir($path) || str_ends_with($name, '.zip');
    }));
    sort($entries); // timestamped names sort chronologically as strings

    $excess = count($entries) - $retainCount;
    if ($excess <= 0) {
        return;
    }

    foreach (array_slice($entries, 0, $excess) as $old) {
        $path = $backupsDir . '/' . $old;
        if (is_dir($path)) {
            foreach (glob($path . '/*') as $file) {
                @unlink($file);
            }
            @rmdir($path);
        } else {
            @unlink($path);
        }
        backupLog($logFile, "Pruned old backup: $old");
    }
}

// ── Run ──────────────────────────────────────────────────────────────
$runStamp = date('Y-m-d_His');
$runDir = $backupsDir . '/' . $runStamp;
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

// Zip the run's folder into one file if PHP's zip extension is available -
// far more practical to keep or move around than 19 loose JSON files.
if (class_exists('ZipArchive')) {
    $zipPath = $backupsDir . '/' . $runStamp . '.zip';
    $zip = new ZipArchive();
    if ($zip->open($zipPath, ZipArchive::CREATE) === true) {
        foreach (glob($runDir . '/*.json') as $file) {
            $zip->addFile($file, basename($file));
        }
        $zip->close();
        // Loose JSON files are redundant once zipped - keep only the archive.
        foreach (glob($runDir . '/*.json') as $file) {
            @unlink($file);
        }
        @rmdir($runDir);
        backupLog($logFile, "Zipped to $runStamp.zip");
    } else {
        backupLog($logFile, "  WARNING: could not create zip, leaving $runStamp/ as loose JSON files");
    }
} else {
    backupLog($logFile, '  NOTE: PHP zip extension not available, leaving backup as loose JSON files');
}

pruneOldBackups($backupsDir, $retainCount, $logFile);

backupLog($logFile, "Backup run finished: $okCount tables OK, $failCount failed, $totalRows total rows.");

// Non-zero exit on any failure so a cron-failure-monitoring email (if
// Hostinger's cron ever sends one) actually fires.
exit($failCount > 0 ? 1 : 0);
