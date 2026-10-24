# AdPulse — Performance Marketing OS

AdPulse is a performance-marketer-first workspace for campaign tracking, diagnostics, optimization tasks, experiments, UTM links, and optimization history.

## Live application

https://sobujkhamarofficial-ctrl.github.io/sarver/

## Current features

- Single-owner testing login gate with server-verified password plus six-digit confirmation code
- User-scoped campaign data protected by Row Level Security
- Campaign records and daily performance metrics
- KPIs: spend, conversions, CTR, CPC, CPA and ROAS
- Rules-based diagnostic signals comparing complete 7-day windows
- Campaign-specific targets and minimum-sample guardrails
- Optimization task queue with priorities and status tracking
- Experiment log for creative, audience, offer, landing-page and bidding tests
- UTM URL builder and saved tracking-link library
- Optimization history for changes, rationale, before/after notes and outcomes
- Google Ads OAuth gateway foundation with encrypted refresh tokens, revocable scoped AI-agent tokens and read-only ad/campaign reporting

## Supabase backend

Project reference: `gkmfjvlptyvsmlgpfpuz`

The browser app uses the Supabase project URL and a publishable key. A publishable key is intended for browser use only alongside Supabase Auth, least-privilege grants and Row Level Security. Never add a Supabase secret or service-role key to this repository.

The current initial data model is user-scoped. Each signed-in user can access only their own campaigns and related records. The first version is not yet an organization/team multi-tenant system, and there is no global super-admin control panel.

## Login gate setup

The testing dashboard is restricted to the owner email `sobujkhamar.official@gmail.com`. It verifies a fixed access password first, then a fixed six-digit code, through the server-side `auth-gate` Edge Function. Email confirmation links are not part of this testing flow.

Set the following two **Edge Function secrets** in the Supabase Dashboard before using the login gate:

- `ADPULSE_GATE_PASSWORD`
- `ADPULSE_GATE_PIN`

Never commit these values to the repository or expose them in browser JavaScript. The function limits repeated failed attempts and the database denies browser clients access to its private gate configuration and challenge tables.

## Google Ads gateway

The server-side OAuth and read-only API gateway are deployed, but the integration remains **unconfigured until you add Google OAuth credentials, the Google Ads Developer Token and a local-generated token-encryption key to Supabase Edge Function Secrets** and authorize your Google Ads account. No Google credentials should be committed to this repository.

Setup instructions, required secret names, redirect URI, allowed read-only actions, and the agent HTTP API are documented in [`docs/google-ads-gateway.md`](docs/google-ads-gateway.md). A compatible custom-API/OpenAPI schema is available in [`docs/google-ads-openapi.yaml`](docs/google-ads-openapi.yaml). The first version cannot change budgets, bids, campaigns, or ad status. It does not expose arbitrary GAQL queries.

## Deploys

The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` publishes the repository's static files to GitHub Pages on pushes to `main`.

## Database migrations

Versioned SQL files are tracked under `supabase/migrations/`. The live schema and RLS policies were applied to the connected Supabase project. The first migration file records the original campaign schema baseline for source history; do not blindly replay that baseline against an already-initialized database.

## Current limitations

- Google Ads live data cannot be read until the Google credentials are added and an account is authorized. Until then, manually entered campaign metrics remain available.
- Diagnostics use deterministic rules and are advisory, not causal explanations.
- Optimization recommendations do not change bids or budgets in ad accounts.
- The dashboard needs authenticated end-to-end testing with test accounts before broad public launch.


