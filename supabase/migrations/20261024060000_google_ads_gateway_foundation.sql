CREATE TABLE IF NOT EXISTS public.adpulse_google_ads_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_refresh_token text NOT NULL,
  refresh_token_iv text NOT NULL,
  granted_scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_api_call_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.adpulse_google_ads_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state_hash text NOT NULL UNIQUE CHECK (length(state_hash) = 64),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adpulse_google_ads_oauth_states_expiry_idx
  ON public.adpulse_google_ads_oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS public.adpulse_agent_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  scopes text[] NOT NULL CHECK (
    cardinality(scopes) > 0
    AND scopes <@ ARRAY['accounts.read','ads.read','campaigns.read']::text[]
  ),
  allowed_customer_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS adpulse_agent_tokens_owner_idx
  ON public.adpulse_agent_tokens (owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.adpulse_agent_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_token_id uuid REFERENCES public.adpulse_agent_tokens(id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('owner','agent')),
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 80),
  customer_id text,
  status_code integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS adpulse_agent_audit_owner_idx
  ON public.adpulse_agent_audit_logs (owner_user_id, created_at DESC);

ALTER TABLE public.adpulse_google_ads_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adpulse_google_ads_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adpulse_agent_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adpulse_agent_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.adpulse_google_ads_connections FROM anon, authenticated;
REVOKE ALL ON TABLE public.adpulse_google_ads_oauth_states FROM anon, authenticated;
REVOKE ALL ON TABLE public.adpulse_agent_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.adpulse_agent_audit_logs FROM anon, authenticated;

DROP POLICY IF EXISTS "deny direct access to google ads connections" ON public.adpulse_google_ads_connections;
CREATE POLICY "deny direct access to google ads connections"
  ON public.adpulse_google_ads_connections FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny direct access to google ads oauth states" ON public.adpulse_google_ads_oauth_states;
CREATE POLICY "deny direct access to google ads oauth states"
  ON public.adpulse_google_ads_oauth_states FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny direct access to adpulse agent tokens" ON public.adpulse_agent_tokens;
CREATE POLICY "deny direct access to adpulse agent tokens"
  ON public.adpulse_agent_tokens FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "deny direct access to adpulse agent audit logs" ON public.adpulse_agent_audit_logs;
CREATE POLICY "deny direct access to adpulse agent audit logs"
  ON public.adpulse_agent_audit_logs FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
