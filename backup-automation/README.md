# Supabase backup script

Backs up every table in the CRM's Supabase project to JSON plus every
standard Supabase Storage object (zipped), on
Badar's own Hostinger hosting, on a schedule - so the client keeps a copy
independent of Supabase itself. Built 2026-08-07, requested 2026-07-21.

Read-only against Supabase (GET requests only) and only ever writes files
inside this same folder on Hostinger - it cannot alter anything in
Supabase, the CRM, or any live conversation.

## One-time setup on Hostinger

1. Upload this whole `backup-automation/` folder to the hosting account
   (File Manager, or however the rest of the site is deployed).
2. Copy `config.example.php` to `config.php` in the same folder, and fill
   in the real `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Supabase
   Dashboard -> Project Settings -> API). `config.php` is gitignored - it
   only needs to exist on the server, never in this git repo.
3. In Hostinger's hPanel: **Advanced -> Cron Jobs -> Create a new cron job**.
   - Command: `php /home/YOUR_USERNAME/backup-automation/backup.php`
     (hPanel usually shows the full path for you - use that, not a guess).
   - Schedule: every 6 hours, so 4 runs a day. Common schedule field is
     `0 */6 * * *` (minute 0, every 6th hour) if hPanel exposes a raw cron
     expression; otherwise pick the closest preset ("Every 6 hours").
4. Trigger it once by hand (hPanel usually has a "Run now" button, or SSH
   in and run `php backup.php` directly) to confirm it works before
   trusting the schedule.

## What gets backed up

Every active table in `supabase/schema.sql` as of 2026-08-10 (22 tables - leads,
communications, profiles, transactions, kyc_documents, and so on - see the
table map in `backup_scope.php` for the exact set). If a new
table is added to the CRM later, add its name to that map too - it is a
deliberate, reviewed list, not auto-discovered from whatever exists live.
The parked Notifications migration remains excluded until Muhammad revives
that module.

The `settings` table is filtered before it reaches disk. `meta_token`,
`wa_verify_token`, `wa_access_token`, and `openai_api_key` are excluded because
the archive is stored on separate hosting and is not an appropriate secret
vault. `backup_manifest.json` records only the excluded key names. Restore those
credentials through the approved secret or configuration screens after recovery.

## Where backups land

`backups/<timestamp>.zip`, one per run. Each archive holds one JSON file per
table, a Storage manifest, and the exact binary bytes of every downloaded
Storage object. Storage objects use hash-based archive names so an unsafe
remote filename cannot escape the backup directory. The manifest maps each
hash back to its original bucket and path and records size and SHA-256.

Old backups are pruned automatically, keeping the most recent 28
(a week of history at 4 runs/day) - change `BACKUP_RETAIN_COUNT` in
`config.php` to keep more or fewer.

## Checking it worked

`backup.log` in this folder has a timestamped line for every run, and for
every table within that run (`OK: leads (312 rows)` or an `ERROR` line
naming exactly what failed). A cron job that silently stops running is the
usual way backups go unnoticed - worth glancing at this log occasionally,
not just trusting the schedule.

## Storage configuration

Storage backup is enabled by default and uses the same service-role key as the
database export. Normally no extra configuration is required.

- Set `BACKUP_STORAGE_BUCKETS` to a comma-separated allowlist only if you want
  to restrict the backup to named buckets.
- Set `BACKUP_STORAGE_MAX_OBJECTS` to cap one run. The default is 50,000.
- Set `BACKUP_STORAGE_ENABLED=false` only for a temporary diagnostic run.

If one object cannot be downloaded, the archive still contains all successful
tables and objects, the manifest marks the failed object, the log names it, and
the process exits non-zero so cron monitoring can alert you.

## What this deliberately does not do

- Does not touch WhatsApp, Meta, or any live customer conversation - it
  only reads already-stored Supabase data.
- The scheduled backup remains one-directional and cannot write to Supabase.
- `restore.php` is a separate, manually-invoked recovery tool. It validates an
  archive by default and makes no target request in that mode. Apply mode needs
  `RESTORE_APPLY=true` and the exact confirmation
  `RESTORE_CONFIRMATION=DISPOSABLE_STAGING_ONLY`.
- The live CRM project ref is permanently refused. A remote target also needs
  `RESTORE_ALLOW_REMOTE_DISPOSABLE=true` and a matching
  `RESTORE_TARGET_PROJECT_REF`, which must identify a different Supabase project.

## Validate and restore-test

Validate an archive without credentials or writes:

```sh
php restore.php /absolute/path/to/backup.zip
```

Before a real disposable-staging restore, rebuild the schema and create staging
Auth users whose IDs match the archived `profiles` rows. Supabase Auth password
hashes are not part of this public-schema backup, so staff passwords must be set
again in staging.

Important: `supabase/schema.sql` currently contains scheduled jobs and automation
callbacks with the production project URL. A staging rebuild must not be seeded
or used until those outbound paths are neutralized. Apply
`disposable_staging_safety.sql` to the disposable target immediately after its
schema is built. The restore calls its verification function before the first
write and refuses the target if any protected trigger, production cron command,
or production callback remains enabled.

Then set the staging values outside the repository and run:

```sh
RESTORE_TARGET_URL=https://STAGING_PROJECT_REF.supabase.co \
RESTORE_TARGET_PROJECT_REF=STAGING_PROJECT_REF \
RESTORE_SERVICE_ROLE_KEY=STAGING_SERVICE_ROLE_KEY \
RESTORE_ALLOW_REMOTE_DISPOSABLE=true \
RESTORE_APPLY=true \
RESTORE_CONFIRMATION=DISPOSABLE_STAGING_ONLY \
php restore.php /absolute/path/to/backup.zip
```

The restore upserts archived public-schema rows, recreates standard Storage
buckets when absent, and uploads objects after validating every recorded size
and SHA-256 checksum. It never deletes target rows. Run it only against an empty
or disposable staging project. Table writes are separate API operations, so a
failed run can leave a partial staging restore and should be rerun only after the
failure is understood. The automated test uses a loopback mock server, never
Supabase:

```sh
php tests/restore_test.php
```
