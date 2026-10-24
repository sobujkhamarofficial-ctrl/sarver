-- Explicit deny policies make the intended private-only access model clear to the linter.
CREATE POLICY "Deny client access to auth gate configuration"
  ON public.adpulse_auth_gate_config
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Deny client access to auth gate attempts"
  ON public.adpulse_auth_gate_attempts
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
