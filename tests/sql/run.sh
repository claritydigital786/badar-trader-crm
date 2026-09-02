#!/usr/bin/env bash
# Executes the approve_deposit_and_convert() suite against a THROWAWAY local
# Postgres. Touches nothing outside /tmp/pgt and never contacts production.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)
[ -n "$PGBIN" ] || { echo "no local postgres found - skipping SQL suite"; exit 0; }
rm -rf /tmp/pgt && mkdir -p /tmp/pgt/sock && chown -R postgres:postgres /tmp/pgt
cp "$HERE/fixture.sql" "$HERE/approve_deposit_and_convert_test.sql" /tmp/pgt/
cp "$HERE/../../supabase/migrations/20260901060000_deposit_approval_transaction.sql" /tmp/pgt/migration.sql
chown postgres:postgres /tmp/pgt/*.sql
cat > /tmp/pgt/go.sh <<'INNER'
export PATH=PGBIN_PLACEHOLDER:$PATH
initdb -D /tmp/pgt/data -U postgres --auth=trust >/dev/null 2>&1
pg_ctl -D /tmp/pgt/data -o "-k /tmp/pgt/sock -c listen_addresses=" -l /tmp/pgt/pg.log -w start >/dev/null 2>&1
createdb -h /tmp/pgt/sock -U postgres crmtest
P="psql -h /tmp/pgt/sock -U postgres -d crmtest -v ON_ERROR_STOP=1 -q"
$P -c "CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN;"
$P -f /tmp/pgt/fixture.sql
$P -f /tmp/pgt/migration.sql
psql -h /tmp/pgt/sock -U postgres -d crmtest -f /tmp/pgt/approve_deposit_and_convert_test.sql 2>&1
INNER
sed -i "s|PGBIN_PLACEHOLDER|$PGBIN|" /tmp/pgt/go.sh
chmod +x /tmp/pgt/go.sh && chown postgres:postgres /tmp/pgt/go.sh
OUT=$(su postgres -s /bin/bash -c /tmp/pgt/go.sh 2>&1 | sed 's/^psql:[^:]*:[0-9]*: NOTICE:  //')
echo "$OUT" | grep -E "^(PASS|FAIL)" || true
FAILS=$(echo "$OUT" | grep -c "^FAIL" || true)
TOTAL=$(echo "$OUT" | grep -cE "^(PASS|FAIL)" || true)
echo "==== SQL suite: $((TOTAL-FAILS))/$TOTAL passed ===="
[ "$FAILS" -eq 0 ]
