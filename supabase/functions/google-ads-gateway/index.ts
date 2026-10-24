import { createClient } from "npm:@supabase/supabase-js@2";

const OWNER_EMAIL = "sobujkhamar.official@gmail.com";
const DASHBOARD_ORIGIN = "https://sobujkhamarofficial-ctrl.github.io";
const CONFIG_TABLE = "adpulse_auth_gate_config";
const CONNECTIONS_TABLE = "adpulse_google_ads_connections";
const TOKENS_TABLE = "adpulse_agent_tokens";
const AUDIT_TABLE = "adpulse_agent_audit_logs";
const ADS_API_VERSION = "v26";

type Principal = {
  ownerUserId: string;
  type: "owner" | "agent";
  tokenId: string | null;
  scopes: string[] | null;
  allowedCustomerIds: string[] | null;
  admin: ReturnType<typeof createClient>;
};

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin === DASHBOARD_ORIGIN ? DASHBOARD_ORIGIN : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-adpulse-agent-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
function secretKeys() {
  const map = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return String(map.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
}
function publishableKey() {
  const map = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
  return String(map.default ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "");
}
function adminClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = secretKeys();
  if (!url || !key) throw new Error("supabase_not_configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function sha256Hex(value: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(hash, b => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("token_encryption_key_invalid");
  const out = new Uint8Array(32);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}
async function decryptRefreshToken(ciphertext: string, ivBase64: string): Promise<string> {
  const keyBytes = hexToBytes(Deno.env.get("GOOGLE_ADS_TOKEN_ENCRYPTION_KEY") ?? "");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivBase64) },
    key,
    base64ToBytes(ciphertext),
  );
  return new TextDecoder().decode(clear);
}
function missingGoogleSecrets() {
  const missing: string[] = [];
  if (!Deno.env.get("GOOGLE_ADS_CLIENT_ID")) missing.push("GOOGLE_ADS_CLIENT_ID");
  if (!Deno.env.get("GOOGLE_ADS_CLIENT_SECRET")) missing.push("GOOGLE_ADS_CLIENT_SECRET");
  if (!/^[0-9a-fA-F]{64}$/.test(Deno.env.get("GOOGLE_ADS_TOKEN_ENCRYPTION_KEY") ?? "")) missing.push("GOOGLE_ADS_TOKEN_ENCRYPTION_KEY");
  return missing;
}
async function authenticate(req: Request, admin: ReturnType<typeof createClient>): Promise<Principal> {
  const agentKey = req.headers.get("x-adpulse-agent-key") ?? "";
  if (agentKey) {
    if (!agentKey.startsWith("ap_agent_") || agentKey.length < 30) throw new Response("Invalid agent token.", { status: 401 });
    const tokenHash = await sha256Hex(agentKey);
    const result = await admin.from(TOKENS_TABLE)
      .select("id,owner_user_id,scopes,allowed_customer_ids,expires_at,revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    const row = result.data;
    if (result.error || !row || row.revoked_at || Date.parse(row.expires_at) <= Date.now()) {
      throw new Response("Agent token is invalid, expired, or revoked.", { status: 401 });
    }
    await admin.from(TOKENS_TABLE).update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
    return {
      ownerUserId: row.owner_user_id,
      type: "agent",
      tokenId: row.id,
      scopes: row.scopes ?? [],
      allowedCustomerIds: row.allowed_customer_ids ?? [],
      admin,
    };
  }

  const jwt = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!jwt) throw new Response("Use an AdPulse owner session or an agent token.", { status: 401 });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const pubKey = publishableKey();
  if (!url || !pubKey) throw new Error("supabase_not_configured");
  const userClient = createClient(url, pubKey, {
    global: { headers: { Authorization: "Bearer " + jwt } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser(jwt);
  if (error || !data.user || (data.user.email ?? "").toLowerCase() !== OWNER_EMAIL) {
    throw new Response("Owner access required.", { status: 403 });
  }
  const cfg = await admin.from(CONFIG_TABLE).select("secret_value").eq("config_key", "auth_provision_marker").maybeSingle();
  const marker = cfg.data?.secret_value ? String(cfg.data.secret_value) : "";
  if (cfg.error || !marker || data.user.app_metadata?.adpulse_provision_marker !== marker) {
    throw new Response("This account is not provisioned for owner access.", { status: 403 });
  }
  return { ownerUserId: data.user.id, type: "owner", tokenId: null, scopes: null, allowedCustomerIds: null, admin };
}
async function requireScope(principal: Principal, scope: string) {
  if (principal.type === "agent" && !(principal.scopes ?? []).includes(scope)) {
    throw new Response("This agent token does not have the required permission: " + scope, { status: 403 });
  }
}
async function audit(principal: Principal, action: string, customerId: string | null, statusCode: number) {
  const result = await principal.admin.from(AUDIT_TABLE).insert({
    owner_user_id: principal.ownerUserId,
    agent_token_id: principal.tokenId,
    actor_type: principal.type,
    action,
    customer_id: customerId,
    status_code: statusCode,
  });
  if (result.error) console.error("[google-ads-gateway] audit write failed:", result.error.message);
}
async function connectionFor(principal: Principal) {
  const result = await principal.admin.from(CONNECTIONS_TABLE)
    .select("encrypted_refresh_token,refresh_token_iv,granted_scopes")
    .eq("owner_user_id", principal.ownerUserId)
    .maybeSingle();
  if (result.error) throw new Error("google_connection_lookup_failed");
  if (!result.data) throw new Response("Connect Google Ads in AdPulse before calling the agent API.", { status: 409 });
  return result.data;
}
async function getAccessToken(principal: Principal): Promise<string> {
  const configMissing = missingGoogleSecrets();
  if (configMissing.length) throw new Response(JSON.stringify({ message: "Google Ads server setup is incomplete.", missing_secrets: configMissing }), { status: 503 });
  const row = await connectionFor(principal);
  const refreshToken = await decryptRefreshToken(row.encrypted_refresh_token, row.refresh_token_iv);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_ADS_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("GOOGLE_ADS_CLIENT_SECRET") ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    console.error("[google-ads-gateway] Google OAuth refresh failed with status", response.status);
    throw new Response("Google authorization could not be refreshed. Reconnect Google Ads in AdPulse.", { status: 401 });
  }
  await principal.admin.from(CONNECTIONS_TABLE)
    .update({ last_api_call_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("owner_user_id", principal.ownerUserId);
  return String(payload.access_token);
}
function customerId(value: unknown): string {
  const id = typeof value === "string" ? value.replaceAll("-", "").trim() : "";
  if (!/^\d{10}$/.test(id)) throw new Response("customer_id must be a ten-digit Google Ads customer ID.", { status: 400 });
  return id;
}
async function googleRequest(path: string, accessToken: string, method = "GET", body?: unknown) {
  const headers: Record<string, string> = {
    "Authorization": "Bearer " + accessToken,
    "Accept": "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const manager = (Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "").replaceAll("-", "").trim();
  if (/^\d{10}$/.test(manager)) headers["login-customer-id"] = manager;
  const response = await fetch("https://googleads.googleapis.com/" + ADS_API_VERSION + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  const requestId = response.headers.get("request-id") ?? response.headers.get("google-ads-request-id") ?? null;
  if (!response.ok) {
    console.error("[google-ads-gateway] API request failed:", response.status, requestId);
    const message = response.status === 401 || response.status === 403
      ? "Google Ads denied this request. Check the account access and developer-token access level."
      : response.status === 429
        ? "Google Ads API rate limit reached. Try again later."
        : "Google Ads API request failed with status " + response.status + ".";
    throw new Response(JSON.stringify({ message, google_status: response.status, request_id: requestId }), { status: response.status === 429 ? 429 : 502 });
  }
  return payload;
}
async function listAccounts(principal: Principal, accessToken: string) {
  const payload = await googleRequest("/customers:listAccessibleCustomers", accessToken);
  const all = Array.isArray(payload.resourceNames)
    ? payload.resourceNames.map((name: string) => String(name).split("/").pop() || "").filter((id: string) => /^\d{10}$/.test(id))
    : [];
  const filtered = principal.type === "agent"
    ? all.filter((id: string) => (principal.allowedCustomerIds ?? []).includes(id))
    : all;
  return { customer_ids: filtered, count: filtered.length };
}
function compactAds(rows: any[]) {
  return rows.map((row: any) => {
    const ad = row.adGroupAd?.ad ?? {};
    const rsa = ad.responsiveSearchAd ?? {};
    const toTexts = (items: any[]) => Array.isArray(items) ? items.map((x: any) => typeof x === "string" ? x : String(x.text ?? "")).filter(Boolean) : [];
    return {
      campaign_name: row.campaign?.name ?? null,
      campaign_id: row.campaign?.id ?? null,
      ad_group_name: row.adGroup?.name ?? null,
      ad_group_id: row.adGroup?.id ?? null,
      ad_id: ad.id ?? null,
      ad_type: ad.type ?? null,
      status: row.adGroupAd?.status ?? null,
      final_urls: ad.finalUrls ?? [],
      headlines: toTexts(rsa.headlines ?? []),
      descriptions: toTexts(rsa.descriptions ?? []),
    };
  });
}
async function perform(principal: Principal, action: string, body: any) {
  if (action === "connection_status") {
    if (principal.type !== "owner") throw new Response("Only the dashboard owner can inspect connection status.", { status: 403 });
    const result = await principal.admin.from(CONNECTIONS_TABLE)
      .select("connected_at,updated_at,last_api_call_at,granted_scopes")
      .eq("owner_user_id", principal.ownerUserId)
      .maybeSingle();
    if (result.error) throw new Error("connection_status_failed");
    const missing = missingGoogleSecrets();
    return {
      connected: !!result.data,
      connected_at: result.data?.connected_at ?? null,
      last_api_call_at: result.data?.last_api_call_at ?? null,
      granted_scopes: result.data?.granted_scopes ?? [],
      configured: missing.length === 0,
      missing_secrets: missing,
      api_version: ADS_API_VERSION,
      supported_actions: ["list_accounts", "list_ads", "campaign_performance"],
      write_actions_enabled: false,
    };
  }
  if (action === "list_accounts") {
    await requireScope(principal, "accounts.read");
    const accessToken = await getAccessToken(principal);
    const result = await listAccounts(principal, accessToken);
    return { action, ...result };
  }
  if (action === "list_ads") {
    await requireScope(principal, "ads.read");
    const id = customerId(body.customer_id);
    if (principal.type === "agent" && !(principal.allowedCustomerIds ?? []).includes(id)) {
      throw new Response("This agent token is not authorized for the requested customer ID.", { status: 403 });
    }
    const accessToken = await getAccessToken(principal);
    const query = `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED' ORDER BY campaign.id LIMIT 100`;
    const payload = await googleRequest("/customers/" + id + "/googleAds:search", accessToken, "POST", { query });
    const rows = Array.isArray(payload.results) ? payload.results : [];
    return { action, customer_id: id, count: rows.length, ads: compactAds(rows) };
  }
  if (action === "campaign_performance") {
    await requireScope(principal, "campaigns.read");
    const id = customerId(body.customer_id);
    if (principal.type === "agent" && !(principal.allowedCustomerIds ?? []).includes(id)) {
      throw new Response("This agent token is not authorized for the requested customer ID.", { status: 403 });
    }
    const accessToken = await getAccessToken(principal);
    const query = `SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED' ORDER BY metrics.impressions DESC LIMIT 100`;
    const payload = await googleRequest("/customers/" + id + "/googleAds:search", accessToken, "POST", { query });
    const rows = Array.isArray(payload.results) ? payload.results : [];
    return { action, customer_id: id, period: "LAST_30_DAYS", count: rows.length, campaigns: rows };
  }
  throw new Response("Unsupported action. Available read-only actions: list_accounts, list_ads, campaign_performance.", { status: 400 });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") {
    if (origin !== DASHBOARD_ORIGIN) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (req.method !== "POST") return json({ message: "Method not allowed." }, 405, origin);
  if (origin && origin !== DASHBOARD_ORIGIN) return json({ message: "Browser requests from this origin are not allowed." }, 403, origin);

  let principal: Principal | null = null;
  let action = "unknown";
  let id: string | null = null;
  try {
    const admin = adminClient();
    principal = await authenticate(req, admin);
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    action = typeof body.action === "string" ? body.action : "";
    if (typeof body.customer_id === "string") id = body.customer_id.replaceAll("-", "").trim().slice(0, 10);
    const result = await perform(principal, action, body);
    await audit(principal, action, id, 200);
    return json(result as Record<string, unknown>, 200, origin);
  } catch (error) {
    const status = error instanceof Response ? error.status : 503;
    let message = "Google Ads gateway is temporarily unavailable.";
    let extra: Record<string, unknown> = {};
    if (error instanceof Response) {
      const raw = await error.text();
      try {
        const parsed = JSON.parse(raw);
        message = String(parsed.message ?? message);
        if (parsed.missing_secrets) extra.missing_secrets = parsed.missing_secrets;
        if (parsed.google_status) extra.google_status = parsed.google_status;
        if (parsed.request_id) extra.request_id = parsed.request_id;
      } catch { message = raw || message; }
    } else {
      console.error("[google-ads-gateway] request failed:", error instanceof Error ? error.message : "unknown");
    }
    if (principal) await audit(principal, action || "unknown", id, status);
    return json({ message, ...extra }, status, origin);
  }
});
