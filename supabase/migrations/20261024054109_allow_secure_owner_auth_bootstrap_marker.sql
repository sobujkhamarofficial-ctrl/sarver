-- Keep Auth provisioning restricted to the single owner while supporting GoTrue's
-- initial metadata handling. The one-time marker is moved into protected app metadata
-- and removed from user metadata before the auth.users row is written.
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

  IF expected_marker IS NULL THEN
    RAISE EXCEPTION 'AdPulse accounts can only be provisioned by secure dashboard login.'
      USING ERRCODE = '42501';
  END IF;

  IF coalesce(NEW.raw_app_meta_data ->> 'adpulse_provision_marker', '') <> expected_marker THEN
    IF coalesce(NEW.raw_user_meta_data ->> 'adpulse_provision_marker', '') <> expected_marker THEN
      RAISE EXCEPTION 'AdPulse accounts can only be provisioned by secure dashboard login.'
        USING ERRCODE = '42501';
    END IF;

    NEW.raw_app_meta_data :=
      coalesce(NEW.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('adpulse_provision_marker', expected_marker);
  END IF;

  NEW.raw_user_meta_data :=
    coalesce(NEW.raw_user_meta_data, '{}'::jsonb) - 'adpulse_provision_marker';

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.adpulse_restrict_auth_to_owner_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adpulse_restrict_auth_to_owner_email() FROM anon, authenticated;
