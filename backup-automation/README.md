# Supabase backup script

Backs up every table in the CRM's Supabase project to JSON (zipped), on
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

Every table in `supabase/schema.sql` as of 2026-08-07 (19 tables - leads,
communications, profiles, transactions, kyc_documents, and so on - see the
`$tables` list at the top of `backup.php` for the exact set). If a new
table is added to the CRM later, add its name to that list too - it is a
deliberate, reviewed list, not auto-discovered from whatever exists live.

## Where backups land

`backups/<timestamp>.zip`, one per run, each holding one JSON file per
table. Old backups are pruned automatically, keeping the most recent 28
(a week of history at 4 runs/day) - change `BACKUP_RETAIN_COUNT` in
`config.php` to keep more or fewer.

## Checking it worked

`backup.log` in this folder has a timestamped line for every run, and for
every table within that run (`OK: leads (312 rows)` or an `ERROR` line
naming exactly what failed). A cron job that silently stops running is the
usual way backups go unnoticed - worth glancing at this log occasionally,
not just trusting the schedule.

## What this deliberately does not do

- Does not touch WhatsApp, Meta, or any live customer conversation - it
  only reads already-stored Supabase data.
- Does not back up Supabase Storage buckets (deposit screenshots, chat
  attachments) - only the database tables. If those need backing up too,
  that is a separate, larger piece (Storage's API is different from
  PostgREST) - flag it if it's wanted.
- Does not restore anything. This is one-directional: Supabase -> JSON
  files on Hostinger. Writing a restore path back into Supabase is a much
  higher-risk piece of code and was not asked for.
