-- ============================================================================
-- Badar Trader CRM — Database Schema (production snapshot)
-- Project: vfskqzgphrunjxquqpks (Supabase)  ·  Generated from live catalog.
--
-- This file reflects the CURRENT deployed schema, including tables/columns the
-- app grew after the original schema.sql: the WhatsApp bot state machine
-- (leads.bot_stage, language, retry_count, needs_human, handoff_reason, agent
-- ping/ack columns), the deposit-into-own-account model
-- (deposit_platform/deposit_amount/deposit_account_ref/verified/converted_at),
-- and the signals + communication_logs tables.
--
-- Runtime configuration (API tokens, phone IDs, IB links) is NOT stored here —
-- it lives in the `settings` table (key/value). See .env.example and README.md.
-- ============================================================================

-- Assumes: pgcrypto (gen_random_uuid), pg_net, pg_cron extensions enabled,
-- and Supabase auth schema (auth.users, auth.uid()).

-- ─────────────────────────── Helper functions ───────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- ─────────────────────────────── Tables ─────────────────────────────────────
CREATE TABLE public.audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  actor_id uuid,
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.automation_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  trigger_event text NOT NULL,
  channel text NOT NULL,
  template_subject text,
  template_body text,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  assign_agent_id uuid,
  condition_filter text
);

CREATE TABLE public.communication_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  lead_id uuid,
  created_by uuid,
  type text DEFAULT 'note'::text NOT NULL,
  message text NOT NULL
);

CREATE TABLE public.communications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid NOT NULL,
  type text NOT NULL,
  direction text NOT NULL,
  subject text,
  body text NOT NULL,
  logged_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  attachment_path text
);

CREATE TABLE public.kyc_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  document_type text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  notes text,
  reviewed_by uuid,
  uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
  reviewed_at timestamp with time zone,
  file_path text
);

CREATE TABLE public.lead_activity (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  channel text NOT NULL,
  summary text NOT NULL,
  follow_up_date date,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  source text DEFAULT 'meta'::text NOT NULL,
  meta_ad_id text,
  meta_campaign text,
  instrument_type text,
  status text DEFAULT 'new'::text NOT NULL,
  notes text,
  assigned_agent_id uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  account_balance numeric(15,2) DEFAULT 0 NOT NULL,
  risk_profile text,
  trading_plan text,
  signal_group text,
  kyc_status text DEFAULT 'pending'::text NOT NULL,
  bot_state text DEFAULT 'new'::text,
  interest text,
  budget text,
  trading_experience text,
  bot_stage text DEFAULT 'awaiting_language'::text NOT NULL,
  broker_choice text,
  trader_experience text,
  ready_to_deposit boolean,
  deposit_platform text,
  deposit_amount numeric(15,2),
  converted_at timestamp with time zone,
  verified boolean DEFAULT false NOT NULL,
  deposit_account_ref text,
  retry_count integer DEFAULT 0 NOT NULL,
  needs_human boolean DEFAULT false NOT NULL,
  handoff_reason text,
  language text,
  is_unread boolean DEFAULT true NOT NULL,
  agent_ping_count integer DEFAULT 0 NOT NULL,
  agent_last_pinged_at timestamp with time zone,
  agent_acknowledged_at timestamp with time zone,
  agent_escalated boolean DEFAULT false NOT NULL
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text DEFAULT ''::text NOT NULL,
  email text DEFAULT ''::text NOT NULL,
  role text DEFAULT 'agent'::text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  is_suspended boolean DEFAULT false
);

CREATE TABLE public.settings (
  key text NOT NULL,
  value text,
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.signals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  type text NOT NULL,
  instrument text NOT NULL,
  entry numeric,
  tp numeric,
  sl numeric,
  message text,
  recipients integer DEFAULT 0 NOT NULL,
  outcome text DEFAULT 'pending'::text NOT NULL,
  resolved_at timestamp with time zone
);

CREATE TABLE public.transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  type text NOT NULL,
  amount numeric(15,2) NOT NULL,
  currency text DEFAULT 'USD'::text NOT NULL,
  notes text,
  recorded_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ─────────────────────── Constraints (PK / FK / CHECK) ───────────────────────
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])));
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_assign_agent_id_fkey FOREIGN KEY (assign_agent_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'email'::text, 'sms'::text, 'assign_agent'::text])));
ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_trigger_event_check CHECK ((trigger_event = ANY (ARRAY['lead_created'::text, 'status_changed'::text, 'kyc_verified'::text, 'deposit_recorded'::text])));

ALTER TABLE public.communication_logs ADD CONSTRAINT communication_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.communication_logs ADD CONSTRAINT communication_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.communication_logs ADD CONSTRAINT communication_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.communication_logs ADD CONSTRAINT communication_logs_type_check CHECK ((type = ANY (ARRAY['whatsapp'::text, 'email'::text, 'call'::text, 'note'::text, 'sms'::text])));

ALTER TABLE public.communications ADD CONSTRAINT communications_pkey PRIMARY KEY (id);
ALTER TABLE public.communications ADD CONSTRAINT communications_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.communications ADD CONSTRAINT communications_logged_by_fkey FOREIGN KEY (logged_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.communications ADD CONSTRAINT communications_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])));
ALTER TABLE public.communications ADD CONSTRAINT communications_type_check CHECK ((type = ANY (ARRAY['email'::text, 'whatsapp'::text, 'call'::text, 'sms'::text])));

ALTER TABLE public.kyc_documents ADD CONSTRAINT kyc_documents_pkey PRIMARY KEY (id);
ALTER TABLE public.kyc_documents ADD CONSTRAINT kyc_documents_client_id_fkey FOREIGN KEY (client_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.kyc_documents ADD CONSTRAINT kyc_documents_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.kyc_documents ADD CONSTRAINT kyc_documents_document_type_check CHECK ((document_type = ANY (ARRAY['passport'::text, 'national_id'::text, 'utility_bill'::text, 'other'::text])));
ALTER TABLE public.kyc_documents ADD CONSTRAINT kyc_documents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])));

ALTER TABLE public.lead_activity ADD CONSTRAINT lead_activity_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_activity ADD CONSTRAINT lead_activity_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.lead_activity ADD CONSTRAINT lead_activity_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.lead_activity ADD CONSTRAINT lead_activity_channel_check CHECK ((channel = ANY (ARRAY['call'::text, 'whatsapp'::text, 'email'::text, 'note'::text])));

ALTER TABLE public.leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);
ALTER TABLE public.leads ADD CONSTRAINT leads_assigned_agent_id_fkey FOREIGN KEY (assigned_agent_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT leads_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT leads_bot_stage_check CHECK ((bot_stage = ANY (ARRAY['awaiting_language'::text, 'awaiting_menu'::text, 'awaiting_broker'::text, 'awaiting_experience'::text, 'awaiting_traded_before'::text, 'awaiting_deposit_confirm'::text, 'qualified'::text, 'declined'::text])));
ALTER TABLE public.leads ADD CONSTRAINT leads_broker_choice_check CHECK ((broker_choice = ANY (ARRAY['exness'::text, 'doprime'::text])));
ALTER TABLE public.leads ADD CONSTRAINT leads_deposit_platform_check CHECK ((deposit_platform = ANY (ARRAY['exness'::text, 'dooprime'::text, 'course_only'::text, 'other'::text])));
ALTER TABLE public.leads ADD CONSTRAINT leads_kyc_status_check CHECK ((kyc_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text, 'not_started'::text])));
ALTER TABLE public.leads ADD CONSTRAINT leads_language_check CHECK ((language = ANY (ARRAY['en'::text, 'ur'::text])));
ALTER TABLE public.leads ADD CONSTRAINT leads_risk_profile_check CHECK ((risk_profile = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
ALTER TABLE public.leads ADD CONSTRAINT leads_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'meta'::text, 'referral'::text, 'website'::text, 'whatsapp'::text, 'other'::text])));
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'proposal_sent'::text, 'converted'::text, 'lost'::text])));
ALTER TABLE public.leads ADD CONSTRAINT leads_trader_experience_check CHECK ((trader_experience = ANY (ARRAY['new'::text, 'experienced'::text])));

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'agent'::text])));

ALTER TABLE public.settings ADD CONSTRAINT settings_pkey PRIMARY KEY (key);
ALTER TABLE public.settings ADD CONSTRAINT settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.signals ADD CONSTRAINT signals_pkey PRIMARY KEY (id);
ALTER TABLE public.signals ADD CONSTRAINT signals_outcome_check CHECK ((outcome = ANY (ARRAY['pending'::text, 'tp_hit'::text, 'sl_hit'::text, 'be'::text, 'cancelled'::text])));

ALTER TABLE public.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES leads(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text, 'USDT'::text, 'BTC'::text])));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['deposit'::text, 'withdrawal'::text])));

-- ─────────────────── Automation trigger functions & wiring ───────────────────
-- Postgres triggers call fire_automation_event(), which pg_net POSTs to the
-- fire-automation edge function (see supabase/functions/fire-automation).
CREATE OR REPLACE FUNCTION public.fire_automation_event(p_trigger_event text, p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM net.http_post(
    url     := 'https://vfskqzgphrunjxquqpks.supabase.co/functions/v1/fire-automation',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object('trigger_event', p_trigger_event, 'lead_id', p_lead_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_leads_created()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  PERFORM public.fire_automation_event('lead_created', NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_leads_status_changed()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.fire_automation_event('status_changed', NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_leads_kyc_verified()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.kyc_status = 'verified' AND NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    PERFORM public.fire_automation_event('kyc_verified', NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_transactions_deposit()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.type = 'deposit' THEN
    PERFORM public.fire_automation_event('deposit_recorded', NEW.client_id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_leads()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_id, table_name, record_id, action, new_data)
    VALUES (auth.uid(), 'leads', NEW.id, 'INSERT', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (actor_id, table_name, record_id, action, old_data, new_data)
    VALUES (auth.uid(), 'leads', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_id, table_name, record_id, action, old_data)
    VALUES (auth.uid(), 'leads', OLD.id, 'DELETE', to_jsonb(OLD));
  END IF;
  RETURN NULL;
END;
$function$;

-- Agents may not silently change money/KYC columns even on their own leads.
CREATE OR REPLACE FUNCTION public.guard_leads_admin_only_columns()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.account_balance IS DISTINCT FROM OLD.account_balance
       OR NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
      RAISE EXCEPTION 'Only admins may change account_balance or kyc_status';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER leads_audit AFTER INSERT OR DELETE OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION audit_leads();
CREATE TRIGGER leads_guard_admin_columns BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION guard_leads_admin_only_columns();
CREATE TRIGGER automation_lead_created AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION trg_leads_created();
CREATE TRIGGER automation_status_changed AFTER UPDATE OF status ON public.leads FOR EACH ROW EXECUTE FUNCTION trg_leads_status_changed();
CREATE TRIGGER automation_kyc_verified AFTER UPDATE OF kyc_status ON public.leads FOR EACH ROW EXECUTE FUNCTION trg_leads_kyc_verified();
CREATE TRIGGER automation_deposit_recorded AFTER INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION trg_transactions_deposit();

-- ──────────────────────── Row Level Security (enable) ────────────────────────
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────── RLS policies ──────────────────────────────────
-- Model: admins (is_admin()) get full access; agents are scoped to their own
-- assigned leads and those leads' child rows. `settings` is admin-only.
CREATE POLICY "audit: admin read" ON public.audit_log FOR SELECT USING (is_admin());

CREATE POLICY "automation_rules: admin only" ON public.automation_rules FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "comm_logs_admin_all" ON public.communication_logs FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "comm_logs_agent_select_own" ON public.communication_logs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM leads l WHERE l.id = communication_logs.lead_id AND l.assigned_agent_id = auth.uid()));
CREATE POLICY "comm_logs_agent_insert_own" ON public.communication_logs FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM leads l WHERE l.id = communication_logs.lead_id AND l.assigned_agent_id = auth.uid()));

CREATE POLICY "communications: admin full access" ON public.communications FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "communications: agent select own" ON public.communications FOR SELECT USING (EXISTS (SELECT 1 FROM leads l WHERE l.id = communications.lead_id AND l.assigned_agent_id = auth.uid()));
CREATE POLICY "communications: agent insert own" ON public.communications FOR INSERT WITH CHECK ((logged_by = auth.uid()) AND EXISTS (SELECT 1 FROM leads l WHERE l.id = communications.lead_id AND l.assigned_agent_id = auth.uid()));

CREATE POLICY "kyc: admin full access" ON public.kyc_documents FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "kyc: agent select own clients" ON public.kyc_documents FOR SELECT USING (EXISTS (SELECT 1 FROM leads l WHERE l.id = kyc_documents.client_id AND l.assigned_agent_id = auth.uid()));

CREATE POLICY "activity: admin full access" ON public.lead_activity FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "activity: agent select" ON public.lead_activity FOR SELECT USING ((actor_id = auth.uid()) OR EXISTS (SELECT 1 FROM leads l WHERE l.id = lead_activity.lead_id AND l.assigned_agent_id = auth.uid()));
CREATE POLICY "activity: agent insert" ON public.lead_activity FOR INSERT WITH CHECK ((actor_id = auth.uid()) AND EXISTS (SELECT 1 FROM leads l WHERE l.id = lead_activity.lead_id AND l.assigned_agent_id = auth.uid()));

CREATE POLICY "leads: admin full access" ON public.leads FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "leads: agent select own" ON public.leads FOR SELECT USING (assigned_agent_id = auth.uid());
CREATE POLICY "leads: agent update own" ON public.leads FOR UPDATE USING (assigned_agent_id = auth.uid()) WITH CHECK (assigned_agent_id = auth.uid());

CREATE POLICY "profiles: admin full access" ON public.profiles FOR ALL USING (is_admin());
CREATE POLICY "profiles: self read" ON public.profiles FOR SELECT USING (id = auth.uid());

CREATE POLICY "settings: admin only" ON public.settings FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "signals_public_read" ON public.signals FOR SELECT USING (true);
CREATE POLICY "signals_auth_insert" ON public.signals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "signals_auth_update" ON public.signals FOR UPDATE TO authenticated USING (true);

CREATE POLICY "transactions: admin full access" ON public.transactions FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "transactions: agent select own clients" ON public.transactions FOR SELECT USING (EXISTS (SELECT 1 FROM leads l WHERE l.id = transactions.client_id AND l.assigned_agent_id = auth.uid()));

-- ─────────────────────────── Scheduled jobs (pg_cron) ────────────────────────
-- Repeats the "new lead" ping to the assigned agent every 5 min until acked,
-- and broadcasts to the team after 3 unanswered pings. See functions/nudge-agents.
SELECT cron.schedule('nudge-agents-every-5-min', '*/5 * * * *', $$
  SELECT net.http_post(
    url     := 'https://vfskqzgphrunjxquqpks.supabase.co/functions/v1/nudge-agents',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
$$);
