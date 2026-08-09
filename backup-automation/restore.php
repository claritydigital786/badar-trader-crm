<?php
/** Validate an archive by default, or restore it to disposable staging. */

declare(strict_types=1);

require_once __DIR__ . '/restore_backup.php';

$archivePath = $argv[1] ?? '';
if ($archivePath === '') {
    fwrite(STDERR, "Usage: php restore.php /absolute/path/to/backup.zip\n");
    exit(2);
}

$targetUrl = getenv('RESTORE_TARGET_URL') ?: 'http://127.0.0.1';
$serviceKey = getenv('RESTORE_SERVICE_ROLE_KEY') ?: '';
$apply = filter_var(getenv('RESTORE_APPLY') ?: 'false', FILTER_VALIDATE_BOOLEAN);
$allowRemote = filter_var(getenv('RESTORE_ALLOW_REMOTE_DISPOSABLE') ?: 'false', FILTER_VALIDATE_BOOLEAN);
$confirmation = getenv('RESTORE_CONFIRMATION') ?: '';
$expectedProjectRef = getenv('RESTORE_TARGET_PROJECT_REF') ?: null;

try {
    $result = crmRestoreArchive(
        $archivePath,
        $targetUrl,
        $serviceKey,
        $apply,
        $confirmation,
        $allowRemote,
        $expectedProjectRef,
        static function (string $message): void {
            fwrite(STDOUT, $message . PHP_EOL);
        }
    );
    fwrite(STDOUT, $result['applied'] ? "RESULT: RESTORED TO DISPOSABLE STAGING\n" : "RESULT: ARCHIVE VALID\n");
    exit(0);
} catch (Throwable $error) {
    fwrite(STDERR, 'RESTORE REFUSED OR FAILED: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
