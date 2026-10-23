# AdPulse Supabase Backend

AdPulse is being built as a performance-marketer-first optimization workspace. Supabase provides PostgreSQL, Auth, row-level security, and the Data API.

## Current database

- `campaigns` and `daily_metrics`: existing campaign performance records.
- `campaign_summary`: computes CTR, CPC, CPA, and ROAS.
- `campaign_targets`: per-campaign guardrails and decision thresholds.
- `optimization_tasks`: actionable optimization queue with evidence.
- `experiments`: creative, audience, offer, landing-page, and bidding test log.
- `tracking_links`: saved UTM-building inputs.
- `optimization_history`: the record of changes, rationale, and measured outcomes.
- `campaign_diagnostic_signals`: read-only rule-based signals using the last two complete seven-day windows.

## Security model

The first iteration is user-scoped: authenticated users can access their own rows only. Related records must reference a campaign owned by that user. RLS is enabled on every table listed above. The diagnostic views use `security_invoker = true` and are read-only for authenticated clients. Anonymous access and unnecessary table privileges are revoked; application users do not receive `TRUNCATE` privileges.

Never commit Supabase secret/service-role keys to this repository. A future dashboard should use the publishable key in the client together with Supabase Auth and RLS.

## Current implementation status

The schema and policies have been applied directly to Supabase migrations. Database checks confirmed that all seven tables and the diagnostic view exist; the security advisor reported no findings. Performance advisor warnings about unused indexes are expected while the tables have no records and have not yet been exercised by a real application workload.

Before a public launch, add authenticated end-to-end tests with test accounts, validate RLS using real user JWTs, and review Auth/email settings. No test users have been created by this setup.
