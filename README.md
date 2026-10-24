# AdPulse — Performance Marketing OS

AdPulse is a performance-marketer-first workspace for campaign tracking, diagnostics, optimization tasks, experiments, UTM links, and optimization history.

## Live application

https://sobujkhamarofficial-ctrl.github.io/sarver/

## Current features

- Supabase Auth sign-in, account creation and password-reset flow
- User-scoped campaign data protected by Row Level Security
- Campaign records and daily performance metrics
- KPIs: spend, conversions, CTR, CPC, CPA and ROAS
- Rules-based diagnostic signals comparing complete 7-day windows
- Campaign-specific targets and minimum-sample guardrails
- Optimization task queue with priorities and status tracking
- Experiment log for creative, audience, offer, landing-page and bidding tests
- UTM URL builder and saved tracking-link library
- Optimization history for changes, rationale, before/after notes and outcomes

## Supabase backend

Project reference: `gkmfjvlptyvsmlgpfpuz`

The browser app uses the Supabase project URL and a publishable key. A publishable key is intended for browser use only alongside Supabase Auth, least-privilege grants and Row Level Security. Never add a Supabase secret or service-role key to this repository.

The current initial data model is user-scoped. Each signed-in user can access only their own campaigns and related records. The first version is not yet an organization/team multi-tenant system, and there is no global super-admin control panel.

## One-time Auth URL setup

In Supabase Dashboard, open **Authentication → URL Configuration** and set the Site URL to:

`https://sobujkhamarofficial-ctrl.github.io/sarver/`

Add the same URL to the allowed Redirect URLs. This lets confirmation and password-recovery links return to the hosted app. Existing Auth settings were not changed by the code deployment.

## Deploys

The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` publishes the repository's static files to GitHub Pages on pushes to `main`.

## Database migrations

Versioned SQL files are tracked under `supabase/migrations/`. The live schema and RLS policies were applied to the connected Supabase project. The first migration file records the original campaign schema baseline for source history; do not blindly replay that baseline against an already-initialized database.

## Current limitations

- Ad-platform APIs are not connected. Campaign metrics are added manually for now.
- Diagnostics use deterministic rules and are advisory, not causal explanations.
- Optimization recommendations do not change bids or budgets in ad accounts.
- The dashboard needs authenticated end-to-end testing with test accounts before broad public launch.


## Authentication and account setup

Each person can create an account and sign in with their own email and password. New accounts may need email confirmation depending on the Supabase Auth configuration.

Set the Supabase Site URL and allowed redirect URL to:
`https://sobujkhamarofficial-ctrl.github.io/sarver/`

New users can create accounts from the login screen. If email confirmation is enabled in Supabase Auth, they must confirm the address once before their first sign-in.

Each authenticated account sees and edits its own workspace data under Row Level Security.

## Temporary single-owner access gate

The testing build uses the server-side Supabase Edge Function `auth-gate` to check the owner email, an access password and a six-digit confirmation code in two sequential steps. The fixed access password and code must be set as **Edge Function secrets** in the Supabase Dashboard:

- `ADPULSE_GATE_PASSWORD`
- `ADPULSE_GATE_PIN`

Never commit these values to this repository or include them in browser code. The gate provisions the single owner Auth account server-side after both checks pass, marks its email as confirmed without sending a confirmation email, and limits repeated failed attempts. The database also blocks public sign-up and denies client access to the gate's server-only configuration tables.
