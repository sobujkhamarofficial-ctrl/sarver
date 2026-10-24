-- Allow the trusted Edge Function to initialize protected server-side gate state.
GRANT SELECT, INSERT, UPDATE ON TABLE public.adpulse_auth_gate_config TO service_role;
