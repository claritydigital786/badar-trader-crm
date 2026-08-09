<?php
/**
 * Copy this file to a private location outside public_html, htdocs, or
 * wwwroot and fill in the real values. If the entire backup-automation
 * folder is already outside the web root, config.php may stay beside the
 * script. Otherwise set BACKUP_CONFIG_FILE in the cron command to the
 * private file's absolute path. config.php is gitignored, but an external
 * filename is safer because it cannot be accidentally uploaded with the app.
 * The service-role key must never be committed or pasted into a chat session.
 *
 * Get these from the Supabase Dashboard:
 * Project Settings -> API -> Project URL, and
 * Project Settings -> API -> service_role key (NOT the anon/public key -
 * the service role key is required here because it bypasses Row Level
 * Security, which a full backup needs; the anon key would only see what
 * an anonymous visitor is allowed to see, which is close to nothing).
 */

define('SUPABASE_URL', 'https://YOUR_PROJECT_REF.supabase.co');
define('SUPABASE_SERVICE_ROLE_KEY', 'YOUR_SERVICE_ROLE_KEY');

// Optional: how many past backups to keep (28 = 7 days at 4 runs/day).
// define('BACKUP_RETAIN_COUNT', 28);

// Storage objects such as deposit screenshots and conversation attachments
// are backed up by default. Set false only for a temporary diagnostic run.
// define('BACKUP_STORAGE_ENABLED', true);

// Optional comma-separated allowlist. Leave unset to include every standard
// file bucket returned by Supabase Storage.
// define('BACKUP_STORAGE_BUCKETS', 'deposit-screenshots,conversation-attachments');

// Safety cap for one run. Increase only after checking Hostinger disk space.
// define('BACKUP_STORAGE_MAX_OBJECTS', 50000);
