#!/usr/bin/env bash
# Executes the approve_deposit_and_convert() suite against a THROWAWAY local
# Postgres. Touches nothing outside /tmp/pgt and never contacts production.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)
[ -n "$PGBIN" ] || { echo "no local postgres found - skipping SQL suite"; exit 0; }
rm -rf /tmp/pgt && mkdir -p /tmp/pgt/sock && chown -R postgres:postgres /tmp/pgt
cp "$HERE/fixture.sql" "$HERE/approve_deposit_and_convert_test.sql" "$HERE/production_kpis_test.sql" "$HERE/customer_reactions_test.sql" /tmp/pgt/
cp "$HERE/../../supabase/migrations/20260901060000_deposit_approval_transaction.sql" /tmp/pgt/migration.sql
cp "$HERE/../../supabase/migrations/20260902100000_production_kpis_exclude_bot_test.sql" /tmp/pgt/migration_kpis.sql
cp "$HERE/../../supabase/migrations/20260903000000_customer_reactions.sql" /tmp/pgt/migration_reactions.sql
chown postgres:postgres /tmp/pgt/*.sql
cat > /tmp/pgt/go.sh <<'INNER'
export PATH=PGBIN_PLACEHOLDER:$PATH
initdb -D /tmp/pgt/data -U postgres --auth=trust >/dev/null 2>&1
pg_ctl -D /tmp/pgt/data -o "-k /tmp/pgt/sock -c listen_addresses=" -l /tmp/pgt/pg.log -w start >/dev/null 2>&1
createdb -h /tmp/pgt/sock -U postgres crmtest
P="psql -h /tmp/pgt/sock -U postgres -d crmtest -v ON_ERROR_STOP=1 -q"
# service_role too: production's Supabase cluster has it, and a migration that
# REVOKEs from it fails outright without it. Found by this fixture on
# 2026-09-02 - the same class of gap as the unqualified-table-name one.
$P -c "CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE service_role NOLOGIN;"
$P -f /tmp/pgt/fixture.sql
$P -f /tmp/pgt/migration.sql
$P -f /tmp/pgt/migration_kpis.sql
psql -h /tmp/pgt/sock -U postgres -d crmtest -f /tmp/pgt/approve_deposit_and_convert_test.sql 2>&1
# The KPI suite seeds its own leads, so it runs last, in its own database.
createdb -h /tmp/pgt/sock -U postgres kpitest
K="psql -h /tmp/pgt/sock -U postgres -d kpitest -v ON_ERROR_STOP=1 -q"
$K -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" 2>/dev/null || true
$K -f /tmp/pgt/fixture.sql
$K -f /tmp/pgt/migration.sql
$K -f /tmp/pgt/migration_kpis.sql
psql -h /tmp/pgt/sock -U postgres -d kpitest -f /tmp/pgt/production_kpis_test.sql 2>&1
# Customer reactions get their own database: the suite seeds its own leads,
# communications and RLS policies.
createdb -h /tmp/pgt/sock -U postgres rxtest
R="psql -h /tmp/pgt/sock -U postgres -d rxtest -v ON_ERROR_STOP=1 -q"
$R -f /tmp/pgt/fixture.sql
$R -c "CREATE TABLE IF NOT EXISTS communications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE, type text, direction text, subject text, body text, logged_by uuid, created_at timestamptz NOT NULL DEFAULT now(), attachment_path text, wa_message_id text, delivery_status text, channel text);"
$R -f /tmp/pgt/migration_reactions.sql
psql -h /tmp/pgt/sock -U postgres -d rxtest -f /tmp/pgt/customer_reactions_test.sql 2>&1
INNER
sed -i "s|PGBIN_PLACEHOLDER|$PGBIN|" /tmp/pgt/go.sh
chmod +x /tmp/pgt/go.sh && chown postgres:postgres /tmp/pgt/go.sh
OUT=$(su postgres -s /bin/bash -c /tmp/pgt/go.sh 2>&1 | sed 's/^psql:[^:]*:[0-9]*: NOTICE:  //')
echo "$OUT" | grep -E "^(PASS|FAIL)" || true
FAILS=$(echo "$OUT" | grep -c "^FAIL" || true)
TOTAL=$(echo "$OUT" | grep -cE "^(PASS|FAIL)" || true)
echo "==== SQL suite: $((TOTAL-FAILS))/$TOTAL passed ===="
[ "$FAILS" -eq 0 ]
