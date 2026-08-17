<?php

declare(strict_types=1);

function crmBackupPathUsesCommonWebRoot(string $path): bool {
    $normalized = strtolower(str_replace('\\', '/', $path));
    $segments = array_values(array_filter(explode('/', $normalized), static fn(string $segment): bool => $segment !== ''));
    return array_intersect($segments, ['public_html', 'htdocs', 'wwwroot']) !== [];
}

function crmBackupResolveConfigFile(string $scriptDirectory): ?string {
    $override = getenv('BACKUP_CONFIG_FILE');
    $candidate = $override === false || trim($override) === ''
        ? rtrim($scriptDirectory, '/\\') . '/config.php'
        : trim($override);

    if ($override !== false && trim($override) !== '' && !str_starts_with($candidate, '/')) {
        throw new RuntimeException('BACKUP_CONFIG_FILE must be an absolute path');
    }
    if (!is_file($candidate)) {
        if ($override !== false && trim($override) !== '') {
            throw new RuntimeException('BACKUP_CONFIG_FILE does not identify a readable file');
        }
        return null;
    }

    $resolved = realpath($candidate);
    if ($resolved === false || !is_readable($resolved)) {
        throw new RuntimeException('backup credential file could not be resolved or read');
    }
    if (crmBackupPathUsesCommonWebRoot($resolved)) {
        throw new RuntimeException('backup credential file must stay outside public_html, htdocs, and wwwroot');
    }
    return $resolved;
}

function crmBackupAssertPrivateDataPath(string $path, string $label): void {
    $pathsToCheck = [$path];
    $resolved = realpath($path);
    if ($resolved !== false) {
        $pathsToCheck[] = $resolved;
    } else {
        $resolvedParent = realpath(dirname($path));
        if ($resolvedParent !== false) {
            $pathsToCheck[] = $resolvedParent . '/' . basename($path);
        }
    }
    foreach ($pathsToCheck as $candidate) {
        if (crmBackupPathUsesCommonWebRoot($candidate)) {
            throw new RuntimeException("$label must stay outside public_html, htdocs, and wwwroot");
        }
    }
}
