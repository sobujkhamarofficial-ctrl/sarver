-- Short-lived, single-use challenges for the second login step.
CREATE TABLE IF NOT EXISTS public.adpulse_auth_gate_challenges (
  challenge_hash text PRIMARY KEY,
  ip_hash text NOT NULL,
  owner_email text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.adpulse_auth_gate_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.adpulse_auth_gate_challenges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.adpulse_auth_gate_challenges TO service_role;
CREATE POLICY "Deny client access to auth gate challenges"
  ON public.adpulse_auth_gate_challenges
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
