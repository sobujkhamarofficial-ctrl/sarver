# Google Ads Gateway for AdPulse

AdPulse now has a **read-only** server-side Google Ads gateway. Google OAuth and Google Ads credentials stay in Supabase Edge Function Secrets; they must never be committed to GitHub or pasted into an AI prompt.

## What the gateway supports

- OAuth 2.0 connection with a one-time state value and fixed callback URL.
- AES-GCM encryption of the Google refresh token before it is saved.
- Owner-only connection setup and token management.
- Separate AI-agent tokens, stored as hashes, that can be revoked and expire.
- Per-agent read-only scopes plus an explicit Google Ads customer-ID allowlist.
- Audit records for each gateway action.
- No arbitrary GAQL endpoint and no write actions. The server does not create/edit campaigns, change budgets/bids, or enable/disable ads.

The current API endpoint uses Google Ads API **v26**. Update only after checking Google Ads release notes and API sunset dates.

## 1. Set up Google Cloud and Google Ads

1. In Google Cloud Console, enable the Google Ads API for the project.
2. Configure the OAuth consent screen and add your Google account as a test user if the app is still in testing.
3. Create an OAuth client with application type **Web application**.
4. Add this exact authorized redirect URI (including scheme, host, path, and no trailing slash):

   `https://gkmfjvlptyvsmlgpfpuz.supabase.co/functions/v1/google-ads-connect`

5. In Google Ads, obtain a **Developer Token** from the API Center. Google Ads API calls require OAuth 2.0 credentials and API access enabled/approved for the Google Cloud project that owns those credentials. A generic API key or the payment card on your Ads account does not grant API access. The old Developer Token onboarding path was sunset on September 9, 2026; new projects are managed from Google Cloud Console.
6. Ensure the Google account used in the consent flow has access to the Google Ads account(s) you want this server to read.
7. Enable **Google Ads API** in this same Google Cloud project, then open the **Google Ads API Overview** page and check the project's API access level. Enabling the API gives Test access; apply for Explorer access to query real production accounts. New API access levels are managed in Google Cloud, not through the old developer-token flow.
8. If Google rejects the request, review the reason in Cloud Console. Make sure the project/billing account is not on a restricted Free Trial or suspended/disabled, and complete any brand/OAuth verification Google asks for. A card on the Google Ads billing profile is not a substitute for these project-level approvals.

**Testing-mode note:** If the OAuth consent screen is External and its publishing status is still Testing, Google may expire refresh tokens after 7 days for this Ads scope. Move the app to the appropriate production status before relying on a long-lived connection, and follow Google's verification requirements where applicable.

Enable the Google Ads API in the same Google Cloud project as the OAuth Client ID. Then visit the Google Ads API Overview page to apply for Explorer access to production accounts. New projects no longer apply through the old Ads API Center developer-token flow.

An OpenAPI specification for AI tools that accept custom REST actions is available at [`google-ads-openapi.yaml`](google-ads-openapi.yaml).

Official references:
- [Google Ads API authorization and required headers](https://developers.google.com/google-ads/api/rest/auth)
- [Google Ads OAuth overview](https://developers.google.com/google-ads/api/docs/oauth/overview)
- [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google OAuth refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)
- [Google Ads API release notes](https://developers.google.com/google-ads/api/docs/release-notes)
- [Current Google Ads API access levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels)
- [Developer-token migration notice](https://developers.google.com/google-ads/api/docs/api-policy/developer-token)

## 2. Add secrets in Supabase

Open the [AdPulse Edge Function Secrets page](https://supabase.com/dashboard/project/gkmfjvlptyvsmlgpfpuz/functions/secrets) and add these keys. Enter values directly in Supabase; do not commit them to GitHub or send them in chat.

| Secret name | Value |
| --- | --- |
| `GOOGLE_ADS_CLIENT_ID` | The OAuth Web application client ID from Google Cloud |
| `GOOGLE_ADS_CLIENT_SECRET` | The matching OAuth client secret |
| `GOOGLE_ADS_REDIRECT_URI` | The exact redirect URI shown above |
| `GOOGLE_ADS_TOKEN_ENCRYPTION_KEY` | A fresh 32-byte random key encoded as 64 hexadecimal characters |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Optional. Your 10-digit manager account ID if API calls must be made through a manager account |

Generate the encryption key **locally** on your computer, for example using Python:

```powershell
py -c "import secrets; print(secrets.token_hex(32))"
```

Paste the generated value directly into Supabase Secrets. Keep a secure backup of it: losing or replacing it without re-encrypting the stored refresh token will prevent AdPulse from decrypting the current Google connection. Never use the encryption key as an AI-agent token.

Supabase Edge Function secrets are read server-side by deployed functions. They are not public configuration and do not belong in `script.js`, `index.html`, GitHub Actions, or an agent prompt.

## 3. Connect and issue an agent token

1. Open the AdPulse dashboard and sign in.
2. Open **Integrations**.
3. Select **Connect Google Ads**. Google will show its own login and consent page; approve the requested Google Ads permission.
4. Return to Integrations and select **Refresh status** / **Load account IDs**.
5. Create a key for each agent. Select only the permissions and customer IDs that agent needs, and choose a short expiry.
6. Copy the generated `ap_agent_...` value once. AdPulse stores only its hash, so the raw token cannot be displayed again. Keep it in the AI agent's server-side secret manager. Revoke it from the Integrations page if it is no longer needed.

### Available agent permissions

- `accounts.read`: list only the customer IDs assigned to the token.
- `ads.read`: retrieve a bounded list of ad copy (headlines, descriptions, final URLs) for an assigned customer ID.
- `campaigns.read`: retrieve a bounded campaign-performance report for the last 30 days for an assigned customer ID.

Every token must have at least one allowed customer ID. The gateway rejects account-specific requests for IDs outside the token's allowlist. The Google user consent is still the underlying permission boundary.

## 4. HTTP API for AI agents

Endpoint:

`https://gkmfjvlptyvsmlgpfpuz.supabase.co/functions/v1/google-ads-gateway`

Header:

`x-adpulse-agent-key: ap_agent_...`

Content type: `application/json`

### List the approved customer IDs

```http
POST /functions/v1/google-ads-gateway
Content-Type: application/json
x-adpulse-agent-key: ap_agent_YOUR_TOKEN

{"action":"list_accounts"}
```

The token must include `accounts.read`.

### Read ad copy

```json
{"action":"list_ads","customer_id":"1234567890"}
```

The token must include `ads.read` and the customer ID must be allowlisted.

### Read campaign performance

```json
{"action":"campaign_performance","customer_id":"1234567890"}
```

The token must include `campaigns.read` and the customer ID must be allowlisted.

The gateway supports these fixed action names only: `list_accounts`, `list_ads`, and `campaign_performance`. It does not accept arbitrary Google Ads Query Language (GAQL) supplied by an agent.

## 5. Agent safety model and known limits

- The agent receives only the data returned by its allowed gateway actions; it never receives Google's client secret or refresh token.
- Agent tokens are independently revocable, time-limited and constrained by action scope and customer ID.
- Calls are recorded in a server-side audit table without recording the returned ad data or raw secrets.
- The initial implementation is read-only. Any future write capability should use separate scopes, explicit confirmation, allowlists and audit controls.
- A normal REST API is not automatically an MCP server. An AI agent must support custom HTTP/API tools (for example, a custom action); a dedicated MCP adapter can be added if the target agent requires MCP.
- Google Ads API access can be limited until the Developer Token is approved for the relevant access level. OAuth consent alone does not guarantee that API queries will succeed.
