# Disposable local staging

This lane rebuilds the CRM against a local Supabase stack using fake data only. It does not link to, query, or modify the hosted Supabase project.

The production migration history contains placeholder files for older SQL Editor changes. For that reason, an empty database cannot be rebuilt from `supabase/migrations` alone. `prepare.sh` copies the authoritative `supabase/schema.sql` into an isolated temporary project as the first migration, then copies every committed migration after it. No file is added to the production migration directory.

## Prerequisites

- Docker Desktop running
- Supabase CLI 2.113.0 or newer
- Python 3

## Prepare and start

```sh
qa/local-staging/prepare.sh /private/tmp/badar-crm-local-staging-20260810
supabase start \
  --workdir /private/tmp/badar-crm-local-staging-20260810 \
  --exclude studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta,mailpit
```

The QA lane starts only the local Database, Auth, and Data API services that the CRM needs. It excludes messaging, Edge Functions, Storage, analytics, and dashboard services. The local project uses ports 54321 through 54324 and PostgreSQL 15. New public tables are auto-exposed only inside this disposable project to match the legacy grants used by the hosted CRM.

## Seed and permission matrix

```sh
python3 qa/local-staging/local_qa.py \
  --runtime /private/tmp/badar-crm-local-staging-20260810 \
  seed

python3 qa/local-staging/local_qa.py \
  --runtime /private/tmp/badar-crm-local-staging-20260810 \
  rls
```

The seed command creates only fake `@local.test` users and fake CRM records. The RLS command signs in as the fake Admin, Agent A, and Agent B users and checks expected read and write boundaries through the local Data API.

The current matrix enforces assigned-lead access. Admin can access all fake leads. Each active Agent can access only the fake lead assigned to that Agent and its related records. Cross-Agent and unassigned-lead access is denied.

## Local browser override

When the CRM is served from `127.0.0.1` or `localhost`, `index.html` accepts these two query parameters:

- `local-supabase-url`
- `local-supabase-anon-key`

Overrides pointing anywhere except loopback HTTP are ignored. Hosted and non-loopback pages always use the production constants.

## Stop and discard

```sh
supabase stop --workdir /private/tmp/badar-crm-local-staging-20260810 --no-backup
```

The runtime directory contains local keys and generated migration copies. Keep it outside the repository and do not commit it.
