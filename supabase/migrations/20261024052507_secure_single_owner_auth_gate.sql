-- Secure owner-only login gate tables and database-side user provisioning guard.
CREATE TABLE IF NOT EXISTS public.adpulse_auth_gate_config (
  config_key text PRIMARY KEY,
  secret_value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.adpulse_auth_gate_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.adpulse_auth_gate_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.adpulse_auth_gate_config TO service_role;

CREATE TABLE IF NOT EXISTS public.adpulse_auth_gate_attempts (
  ip_hash text PRIMARY KEY,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.adpulse_auth_gate_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.adpulse_auth_gate_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.adpulse_auth_gate_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.adpulse_restrict_auth_to_owner_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  expected_marker text;
BEGIN
  IF lower(coalesce(NEW.email, '')) <> 'sobujkhamar.official@gmail.com' THEN
    RAISE EXCEPTION 'AdPulse is restricted to its configured owner email.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.secret_value
    INTO expected_marker
    FROM public.adpulse_auth_gate_config AS c
   WHERE c.config_key = 'auth_provision_marker';

  IF expected_marker IS NULL
     OR coalesce(NEW.raw_app_meta_data ->> 'adpulse_provision_marker', '') <> expected_marker THEN
    RAISE EXCEPTION 'AdPulse accounts can only be provisioned by secure dashboard login.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.adpulse_restrict_auth_to_owner_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adpulse_restrict_auth_to_owner_email() FROM anon, authenticated;
DROP TRIGGER IF EXISTS adpulse_only_owner_email ON auth.users;
CREATE TRIGGER adpulse_only_owner_email
  BEFORE INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.adpulse_restrict_auth_to_owner_email();
