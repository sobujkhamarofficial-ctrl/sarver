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


## Single-owner access restriction

Migration `20261023152131_restrict_adpulse_to_single_owner_email.sql` adds a database trigger on `auth.users`. Signup or email changes are rejected unless the email is `sobujkhamar.official@gmail.com`. This is enforced on the server-side database, not only in browser JavaScript. The current Auth user for that email exists but was unconfirmed at the time this restriction was added.

The browser login form fixes the owner email, validates it on submission, prevents non-owner sessions from opening the workspace, and provides confirmation-email resend and password-reset options. Supabase email confirmation is intentionally retained: the owner must confirm mailbox access before logging in. Configure **Authentication → URL Configuration** with the GitHub Pages site URL and allowed redirect URL to `https://sobujkhamarofficial-ctrl.github.io/sarver/`.

The project is intentionally restricted to a single owner account. If another administrator or teammate needs access later, update this policy intentionally rather than disabling the restriction.
