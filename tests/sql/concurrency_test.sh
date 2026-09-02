export PATH=/usr/lib/postgresql/16/bin:$PATH
P="psql -h /tmp/pgt/sock -U postgres -d crmtest -tA"
$P -c "TRUNCATE transactions, kyc_documents, leads, balance_audit_log, automation_events_fired CASCADE;" >/dev/null
DOC=$($P -c "SELECT mk();")

# Session A holds the document lock inside an open transaction, then commits.
$P -c "BEGIN;
       SELECT set_config('test.uid','33333333-3333-4333-8333-333333333333',true);
       SELECT 'A:'||coalesce((SELECT transaction_id::text FROM approve_deposit_and_convert('$DOC')),'none');
       SELECT pg_sleep(3);
       COMMIT;" > /tmp/pgt/a.out 2>&1 &
sleep 1
# Session B races it. It must block on the FOR UPDATE, then find it already done.
$P -c "SELECT set_config('test.uid','44444444-4444-4444-8444-444444444444',true);
       SELECT 'B:'||approved::text||'/'||already_approved::text FROM approve_deposit_and_convert('$DOC');" > /tmp/pgt/b.out 2>&1 &
# A third racer for good measure.
$P -c "SELECT set_config('test.uid','33333333-3333-4333-8333-333333333333',true);
       SELECT 'C:'||approved::text||'/'||already_approved::text FROM approve_deposit_and_convert('$DOC');" > /tmp/pgt/c.out 2>&1 &
wait
echo "--- session A ---"; grep -E "^A:" /tmp/pgt/a.out
echo "--- session B ---"; cat /tmp/pgt/b.out
echo "--- session C ---"; cat /tmp/pgt/c.out
echo "--- final state ---"
$P -c "SELECT 'transactions='||count(*) FROM transactions;"
$P -c "SELECT 'converted_leads='||count(*) FROM leads WHERE status='converted';"
$P -c "SELECT 'AUM='||coalesce(sum(account_balance),0) FROM leads WHERE status='converted';"
$P -c "SELECT 'deposit_recorded_events='||count(*) FROM automation_events_fired;"
$P -c "SELECT 'balance_audit_rows='||count(*) FROM balance_audit_log;"
