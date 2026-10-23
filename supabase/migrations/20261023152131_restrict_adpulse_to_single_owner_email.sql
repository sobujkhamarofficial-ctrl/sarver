-- Restrict this single-user AdPulse deployment to its configured owner email.
-- This trigger runs inside Auth's database transaction, so the restriction is server-side.
CREATE OR REPLACE FUNCTION public.adpulse_restrict_auth_to_owner_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF lower(coalesce(NEW.email, '')) <> 'sobujkhamar.official@gmail.com' THEN
    RAISE EXCEPTION 'AdPulse is restricted to its configured owner email.'
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
