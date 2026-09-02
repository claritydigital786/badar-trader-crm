-- Local throwaway mirror of the production objects approve_deposit_and_convert()
-- touches. Trigger and function bodies below are the REAL ones, read out of the
-- live project - not paraphrases - so a behaviour change in production that this
-- fixture does not mirror shows up as a test that stops matching reality.
--
-- Run with tests/sql/run.sh (needs a local postgres; nothing here touches production).
-- Faithful minimal mirror of the production objects this RPC touches.
-- Trigger and function bodies are the REAL ones read out of production.
CREATE SCHEMA IF NOT EXISTS auth;
-- auth.uid() in Supabase reads the JWT claim from a session GUC. Same shape here,
-- so SECURITY DEFINER behaves exactly as it does in production.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid;
$$;

CREATE TABLE profiles (
  id uuid PRIMARY KEY, full_name text, role text NOT NULL DEFAULT 'agent',
  is_suspended boolean NOT NULL DEFAULT false, receives_leads boolean DEFAULT true);

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), full_name text, phone text, email text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status = ANY (ARRAY['new','contacted','qualified','proposal_sent','pending_approval','converted','lost'])),
  assigned_agent_id uuid REFERENCES profiles(id),
  account_balance numeric NOT NULL DEFAULT 0,
  balance_locked boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  kyc_status text NOT NULL DEFAULT 'pending'
    CHECK (kyc_status = ANY (ARRAY['pending','verified','rejected','not_started'])),
  deposit_amount numeric, deposit_platform text, deposit_account_ref text,
  manual_tier text, converted_at timestamptz, updated_at timestamptz DEFAULT now());

CREATE TABLE kyc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  document_type text NOT NULL, status text NOT NULL DEFAULT 'pending', notes text,
  reviewed_by uuid, uploaded_at timestamptz DEFAULT now(), reviewed_at timestamptz,
  file_path text, agent_reviewed_by uuid, agent_reviewed_at timestamptz);

CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type = ANY (ARRAY['deposit','withdrawal'])),
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD'
    CHECK (currency = ANY (ARRAY['USD','EUR','GBP','USDT','BTC'])),
  notes text, recorded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE balance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid, changed_by uuid,
  old_balance numeric, new_balance numeric, action text, created_at timestamptz DEFAULT now());

-- Records every automation event fired, so the AFTER INSERT trigger's real
-- effect is observable instead of assumed.
CREATE TABLE automation_events_fired (id serial PRIMARY KEY, event text, lead_id uuid);
CREATE TABLE automation_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text, trigger_event text, channel text, is_active boolean DEFAULT false);

-- Must be schema-qualified with its own search_path: it is called from inside a
-- SECURITY DEFINER function running with search_path = '', exactly as production does.
CREATE OR REPLACE FUNCTION public.fire_automation_event(p_event text, p_lead uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN INSERT INTO public.automation_events_fired(event, lead_id) VALUES (p_event, p_lead); END; $$;

-- ── REAL production bodies ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin'));
$$;

CREATE OR REPLACE FUNCTION public.guard_leads_admin_only_columns() RETURNS trigger
 LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.account_balance IS DISTINCT FROM OLD.account_balance
       OR NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
      RAISE EXCEPTION 'Only admins may change account_balance or kyc_status';
    END IF;
  END IF;
  IF NEW.account_balance IS DISTINCT FROM OLD.account_balance THEN
    IF OLD.balance_locked AND NEW.balance_locked THEN
      RAISE EXCEPTION 'This lead''s balance is locked after approval - unlock it (with a reason) before editing.';
    END IF;
    INSERT INTO public.balance_audit_log (lead_id, changed_by, old_balance, new_balance, action)
      VALUES (NEW.id, auth.uid(), OLD.account_balance, NEW.account_balance,
              CASE WHEN OLD.balance_locked AND NOT NEW.balance_locked THEN 'unlock' ELSE 'edit' END);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_converted_admin_only() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  old_tier   TEXT := CASE WHEN TG_OP = 'UPDATE' THEN OLD.manual_tier ELSE NULL END;
  old_status TEXT := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status      ELSE NULL END;
  is_backend BOOLEAN := auth.uid() IS NULL;
BEGIN
  IF is_backend THEN RETURN NEW; END IF;
  IF NEW.manual_tier = 'closed' AND old_tier IS DISTINCT FROM 'closed' THEN
    RAISE EXCEPTION 'Converted is not a manual tier.' USING ERRCODE = '42501';
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF NEW.status = 'converted' AND old_status IS DISTINCT FROM 'converted' THEN
    RAISE EXCEPTION 'Only an admin can convert a lead.' USING ERRCODE = '42501';
  END IF;
  IF old_status = 'converted' AND NEW.status IS DISTINCT FROM 'converted' THEN
    RAISE EXCEPTION 'Only an admin can move a lead out of Converted.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_transactions_deposit() RETURNS trigger
 LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type = 'deposit' THEN
    PERFORM public.fire_automation_event('deposit_recorded', NEW.client_id);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER leads_guard_admin_columns BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION guard_leads_admin_only_columns();
CREATE TRIGGER trg_leads_converted_admin_only BEFORE INSERT OR UPDATE OF manual_tier, status ON leads
  FOR EACH ROW EXECUTE FUNCTION enforce_converted_admin_only();
CREATE TRIGGER automation_deposit_recorded AFTER INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION trg_transactions_deposit();
