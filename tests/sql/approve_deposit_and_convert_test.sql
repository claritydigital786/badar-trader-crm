\set ON_ERROR_STOP off
\pset pager off
\set QUIET on
-- ═══ fixture actors ═══════════════════════════════════════════
INSERT INTO profiles(id, full_name, role) VALUES
 ('11111111-1111-4111-8111-111111111111','Muhammad Hanzala','agent'),
 ('22222222-2222-4222-8222-222222222222','Other Agent','agent'),
 ('33333333-3333-4333-8333-333333333333','Ehsan Wazir','admin'),
 ('44444444-4444-4444-8444-444444444444','Badar Tanveer','super_admin');

CREATE OR REPLACE FUNCTION mk(p_status text DEFAULT 'pending_approval', p_amt numeric DEFAULT 500,
                              p_plat text DEFAULT 'exness', p_acct text DEFAULT 'TEST-001',
                              p_escby uuid DEFAULT '11111111-1111-4111-8111-111111111111',
                              p_escat boolean DEFAULT true, p_docstatus text DEFAULT 'pending')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_lead uuid; v_doc uuid;
BEGIN
  INSERT INTO leads(full_name, status, assigned_agent_id, deposit_amount, deposit_platform, deposit_account_ref)
  VALUES ('T', p_status, '11111111-1111-4111-8111-111111111111', p_amt, p_plat, p_acct) RETURNING id INTO v_lead;
  INSERT INTO kyc_documents(client_id, document_type, status, agent_reviewed_by, agent_reviewed_at)
  VALUES (v_lead, 'deposit_screenshot', p_docstatus, CASE WHEN p_escat THEN p_escby END,
          CASE WHEN p_escat THEN now() END) RETURNING id INTO v_doc;
  RETURN v_doc;
END $$;

CREATE OR REPLACE FUNCTION chk(label text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN RAISE NOTICE '%  %', CASE WHEN cond THEN 'PASS' ELSE 'FAIL' END, label; END $$;

CREATE OR REPLACE FUNCTION try_approve(p_doc uuid, p_as uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  PERFORM set_config('test.uid', p_as::text, true);
  SELECT * INTO r FROM public.approve_deposit_and_convert(p_doc);
  RETURN CASE WHEN r.already_approved THEN 'already' ELSE 'approved:' || r.amount END;
EXCEPTION WHEN OTHERS THEN RETURN 'ERROR:' || SQLERRM;
END $$;
\set QUIET off

-- ═══ 8/9. NO transaction at any pre-approval stage ════════════
DO $$
DECLARE d uuid;
BEGIN
  -- customer submission (doc pending, not escalated) + agent review + resend states
  d := mk(p_escat := false);                              -- submitted, agent has not escalated
  PERFORM chk('customer submission = 0 transactions', (SELECT count(*) FROM transactions)=0);
  d := mk();                                              -- agent escalated (Send to Admin)
  PERFORM chk('agent review + Send to Admin = 0 transactions', (SELECT count(*) FROM transactions)=0);
  d := mk(p_docstatus := 'rejected', p_escat := false);   -- Ehsan returned it
  PERFORM chk('Return to Agent = 0 transactions', (SELECT count(*) FROM transactions)=0);
  d := mk(p_docstatus := 'pending');                      -- agent re-sent it
  PERFORM chk('resend = 0 transactions', (SELECT count(*) FROM transactions)=0);
END $$;

-- ═══ 6. Successful approval = exactly ONE transaction ═════════
DO $$
DECLARE d uuid; res text; t record; l record;
BEGIN
  DELETE FROM transactions; DELETE FROM kyc_documents; DELETE FROM leads; DELETE FROM automation_events_fired;
  d := mk();
  res := try_approve(d, '33333333-3333-4333-8333-333333333333');   -- Ehsan
  PERFORM chk('Ehsan approval succeeds ('||res||')', res LIKE 'approved:500%');
  PERFORM chk('exactly ONE transaction', (SELECT count(*) FROM transactions)=1);
  SELECT * INTO t FROM transactions LIMIT 1;
  SELECT * INTO l FROM leads LIMIT 1;
  PERFORM chk('transaction type=deposit', t.type='deposit');
  PERFORM chk('transaction amount = submitted deposit (500)', t.amount=500);
  PERFORM chk('transaction currency = USD', t.currency='USD');
  PERFORM chk('transaction linked to the deposit document', t.deposit_document_id=d);
  PERFORM chk('transaction attributed to the correct lead', t.client_id=l.id);
  PERFORM chk('recorded_by = the approving admin', t.recorded_by='33333333-3333-4333-8333-333333333333');
  PERFORM chk('lead attributed to the assigned agent', l.assigned_agent_id='11111111-1111-4111-8111-111111111111');
  PERFORM chk('lead converted', l.status='converted');
  PERFORM chk('account_balance = 500 from the SUBMITTED amount', l.account_balance=500);
  PERFORM chk('balance locked', l.balance_locked);
  PERFORM chk('converted_at stamped', l.converted_at IS NOT NULL);
  PERFORM chk('document marked verified', (SELECT status FROM kyc_documents WHERE id=d)='verified');
  PERFORM chk('balance_audit_log records the real admin',
    (SELECT changed_by FROM balance_audit_log LIMIT 1)='33333333-3333-4333-8333-333333333333');
  PERFORM chk('AFTER INSERT trigger fired deposit_recorded exactly once',
    (SELECT count(*) FROM automation_events_fired WHERE event='deposit_recorded')=1);
END $$;

-- ═══ 7. Duplicate approval / double-click = still exactly ONE ═
DO $$
DECLARE d uuid; r1 text; r2 text; r3 text;
BEGIN
  DELETE FROM transactions; DELETE FROM kyc_documents; DELETE FROM leads; DELETE FROM automation_events_fired;
  d := mk();
  r1 := try_approve(d, '33333333-3333-4333-8333-333333333333');
  r2 := try_approve(d, '33333333-3333-4333-8333-333333333333');   -- double-click
  r3 := try_approve(d, '44444444-4444-4444-8444-444444444444');   -- a second admin tries too
  PERFORM chk('1st approval approves ('||r1||')', r1 LIKE 'approved:%');
  PERFORM chk('2nd (double-click) reports already ('||r2||')', r2='already');
  PERFORM chk('3rd (different admin) reports already ('||r3||')', r3='already');
  PERFORM chk('STILL exactly one transaction', (SELECT count(*) FROM transactions)=1);
  PERFORM chk('no duplicate automation event', (SELECT count(*) FROM automation_events_fired)=1);
  PERFORM chk('AUM counted once (500)', (SELECT sum(account_balance) FROM leads WHERE status='converted')=500);
END $$;

-- ═══ The unique index is a hard guarantee, not a convention ═══
DO $$
DECLARE d uuid; l uuid; msg text;
BEGIN
  DELETE FROM transactions; DELETE FROM kyc_documents; DELETE FROM leads;
  d := mk(); SELECT client_id INTO l FROM kyc_documents WHERE id=d;
  PERFORM try_approve(d, '33333333-3333-4333-8333-333333333333');
  BEGIN
    INSERT INTO transactions(client_id, type, amount, currency, deposit_document_id)
    VALUES (l, 'deposit', 500, 'USD', d);
    msg := 'NO ERROR';
  EXCEPTION WHEN unique_violation THEN msg := 'blocked';
  END;
  PERFORM chk('a second transaction for the same document is BLOCKED by the DB ('||msg||')', msg='blocked');
  PERFORM chk('still one transaction', (SELECT count(*) FROM transactions)=1);
  -- ...while manual transactions (NULL) stay unconstrained
  INSERT INTO transactions(client_id, type, amount, currency) VALUES (l,'deposit',10,'USD');
  INSERT INTO transactions(client_id, type, amount, currency) VALUES (l,'deposit',20,'USD');
  PERFORM chk('manual transactions with NULL link are NOT constrained',
    (SELECT count(*) FROM transactions WHERE deposit_document_id IS NULL)=2);
END $$;

-- ═══ 10/11. Failure rolls everything back ═════════════════════
DO $$
DECLARE d uuid; l uuid; msg text;
BEGIN
  DELETE FROM transactions; DELETE FROM kyc_documents; DELETE FROM leads; DELETE FROM balance_audit_log;
  d := mk(); SELECT client_id INTO l FROM kyc_documents WHERE id=d;
  -- Force the transaction INSERT to fail, after the conversion has been written
  -- inside the same function, by making the currency CHECK unsatisfiable.
  ALTER TABLE transactions DROP CONSTRAINT transactions_currency_check;
  ALTER TABLE transactions ADD CONSTRAINT transactions_currency_check CHECK (currency = 'IMPOSSIBLE');
  msg := try_approve(d, '33333333-3333-4333-8333-333333333333');
  PERFORM chk('approval fails loudly when the transaction cannot be written', msg LIKE 'ERROR:%');
  PERFORM chk('ROLLBACK: lead NOT converted', (SELECT status FROM leads WHERE id=l)='pending_approval');
  PERFORM chk('ROLLBACK: account_balance unchanged', (SELECT account_balance FROM leads WHERE id=l)=0);
  PERFORM chk('ROLLBACK: balance not locked', NOT (SELECT balance_locked FROM leads WHERE id=l));
  PERFORM chk('ROLLBACK: document NOT verified', (SELECT status FROM kyc_documents WHERE id=d)='pending');
  PERFORM chk('ROLLBACK: no transaction', (SELECT count(*) FROM transactions)=0);
  PERFORM chk('ROLLBACK: no balance audit row', (SELECT count(*) FROM balance_audit_log)=0);
  ALTER TABLE transactions DROP CONSTRAINT transactions_currency_check;
  ALTER TABLE transactions ADD CONSTRAINT transactions_currency_check
    CHECK (currency = ANY (ARRAY['USD','EUR','GBP','USDT','BTC']));
  -- and the retry then works cleanly
  msg := try_approve(d, '33333333-3333-4333-8333-333333333333');
  PERFORM chk('retry after the failure succeeds ('||msg||')', msg LIKE 'approved:%');
  PERFORM chk('retry produced exactly one transaction', (SELECT count(*) FROM transactions)=1);
END $$;

-- ═══ Failed conversion creates no transaction ═════════════════
DO $$
DECLARE d uuid; msg text;
BEGIN
  DELETE FROM transactions; DELETE FROM kyc_documents; DELETE FROM leads;
  d := mk(p_status := 'qualified');            -- lead not in pending_approval
  msg := try_approve(d, '33333333-3333-4333-8333-333333333333');
  PERFORM chk('conversion refused when lead is not Pending Approval', msg LIKE 'ERROR:%Pending Approval%');
  PERFORM chk('failed conversion created NO transaction', (SELECT count(*) FROM transactions)=0);
END $$;

-- ═══ Validation: every missing field is fatal ═════════════════
DO $$
DECLARE d uuid; msg text;
BEGIN
  DELETE FROM transactions; DELETE FROM kyc_documents; DELETE FROM leads;
  d := mk(p_amt := NULL);
  PERFORM chk('no deposit amount -> refused', try_approve(d,'33333333-3333-4333-8333-333333333333') LIKE 'ERROR:%amount%');
  d := mk(p_plat := NULL);
  PERFORM chk('no broker -> refused', try_approve(d,'33333333-3333-4333-8333-333333333333') LIKE 'ERROR:%broker%');
  d := mk(p_acct := NULL);
  PERFORM chk('no account reference -> refused', try_approve(d,'33333333-3333-4333-8333-333333333333') LIKE 'ERROR:%trading account%');
  d := mk(p_escat := false);
  PERFORM chk('never escalated by the agent -> refused', try_approve(d,'33333333-3333-4333-8333-333333333333') LIKE 'ERROR:%has not sent%');
  d := mk(p_docstatus := 'rejected', p_escat := false);
  PERFORM chk('returned document -> refused until re-sent', try_approve(d,'33333333-3333-4333-8333-333333333333') LIKE 'ERROR:%send it again%');
  d := mk(p_escby := '22222222-2222-4222-8222-222222222222');
  PERFORM chk('escalated by the WRONG agent -> refused', try_approve(d,'33333333-3333-4333-8333-333333333333') LIKE 'ERROR:%other than the assigned agent%');
  PERFORM chk('none of the refusals created a transaction', (SELECT count(*) FROM transactions)=0);
END $$;

-- ═══ Authorisation ════════════════════════════════════════════
DO $$
DECLARE d uuid;
BEGIN
  DELETE FROM transactions; DELETE FROM kyc_documents; DELETE FROM leads;
  d := mk();
  PERFORM chk('an AGENT cannot approve', try_approve(d,'11111111-1111-4111-8111-111111111111') LIKE 'ERROR:%Only an admin%');
  PERFORM chk('a signed-out caller cannot approve', try_approve(d, NULL) LIKE 'ERROR:%Not signed in%');
  PERFORM chk('neither created a transaction', (SELECT count(*) FROM transactions)=0);
  PERFORM chk('a SUPER ADMIN can approve', try_approve(d,'44444444-4444-4444-8444-444444444444') LIKE 'approved:%');
END $$;

-- ═══ Reports / payroll / AUM consume it correctly ═════════════
DO $$
DECLARE d uuid; l uuid;
BEGIN
  DELETE FROM transactions; DELETE FROM kyc_documents; DELETE FROM leads;
  d := mk(); SELECT client_id INTO l FROM kyc_documents WHERE id=d;
  PERFORM try_approve(d, '33333333-3333-4333-8333-333333333333');
  -- report_financial_summary()'s query
  PERFORM chk('Reports: total deposits = 500',
    (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='deposit')=500);
  PERFORM chk('Reports: net AUM = 500',
    (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='deposit')
    - (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='withdrawal') = 500);
  -- loadPayrollDepositTransactions()'s filter
  PERFORM chk('Payroll: row matches type=deposit AND currency=USD in range',
    (SELECT count(*) FROM transactions WHERE type='deposit' AND currency='USD'
      AND created_at >= now()-interval '1 day' AND created_at <= now()+interval '1 day')=1);
  PERFORM chk('Payroll: attributed to Hanzala via the lead',
    (SELECT count(*) FROM transactions t JOIN leads le ON le.id=t.client_id
      WHERE le.assigned_agent_id='11111111-1111-4111-8111-111111111111')=1);
  PERFORM chk('Payroll: 5% commission on 500 = 25',
    (SELECT SUM(amount)*0.05 FROM transactions WHERE type='deposit' AND currency='USD')=25);
  -- approvedAum() equivalent: status='converted' only
  PERFORM chk('AUM (approved-only rule) unchanged in shape = 500',
    (SELECT COALESCE(SUM(account_balance),0) FROM leads WHERE status='converted')=500);
  PERFORM chk('AUM and the ledger agree',
    (SELECT COALESCE(SUM(account_balance),0) FROM leads WHERE status='converted')
    = (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE type='deposit'));
END $$;
