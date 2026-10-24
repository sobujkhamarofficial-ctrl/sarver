import { createClient } from "npm:@supabase/supabase-js@2";

const OWNER_EMAIL = "sobujkhamar.official@gmail.com";
const DASHBOARD_ORIGIN = "https://sobujkhamarofficial-ctrl.github.io";
const DASHBOARD_URL = DASHBOARD_ORIGIN + "/sarver/";
const CONFIG_TABLE = "adpulse_auth_gate_config";
const CONNECTIONS_TABLE = "adpulse_google_ads_connections";
const STATES_TABLE = "adpulse_google_ads_oauth_states";
const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin === DASHBOARD_ORIGIN ? DASHBOARD_ORIGIN : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
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

function getSecretKey(): string {
  const map = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return String(map.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
}
function getPublishableKey(): string {
  const map = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
  return String(map.default ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "");
}
function adminClient() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = getSecretKey();
  if (!url || !key) throw new Error("supabase_not_configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function publishableKey() {
  const key = getPublishableKey();
  if (!key) throw new Error("supabase_not_configured");
  return key;
}
async function requireOwner(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!jwt) throw new Response("Sign in to AdPulse first.", { status: 401 });
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    publishableKey(),
    { global: { headers: { Authorization: "Bearer " + jwt } }, auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await userClient.auth.getUser(jwt);
  if (error || !data.user || (data.user.email ?? "").toLowerCase() !== OWNER_EMAIL) {
    throw new Response("Owner access required.", { status: 403 });
  }
  const admin = adminClient();
  const config = await admin.from(CONFIG_TABLE).select("secret_value").eq("config_key", "auth_provision_marker").maybeSingle();
  const expected = config.data?.secret_value ? String(config.data.secret_value) : "";
  if (config.error || !expected || data.user.app_metadata?.adpulse_provision_marker !== expected) {
    throw new Response("This account is not provisioned for owner access.", { status: 403 });
  }
  return { user: data.user, admin };
}
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}
function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("token_encryption_key_invalid");
  const out = new Uint8Array(32);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
async function sha256Hex(value: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(hash, b => b.toString(16).padStart(2, "0")).join("");
}
async function encryptRefreshToken(token: string) {
  const rawKey = hexToBytes(Deno.env.get("GOOGLE_ADS_TOKEN_ENCRYPTION_KEY") ?? "");
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return { encrypted: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv) };
}
function configured() {
  return {
    clientId: Deno.env.get("GOOGLE_ADS_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("GOOGLE_ADS_CLIENT_SECRET") ?? "",
    developerToken: Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "",
    redirectUri: Deno.env.get("GOOGLE_ADS_REDIRECT_URI") ?? "",
    encryptionKey: Deno.env.get("GOOGLE_ADS_TOKEN_ENCRYPTION_KEY") ?? "",
  };
}
function missingSetup(config: ReturnType<typeof configured>) {
  const missing: string[] = [];
  if (!config.clientId) missing.push("GOOGLE_ADS_CLIENT_ID");
  if (!config.clientSecret) missing.push("GOOGLE_ADS_CLIENT_SECRET");
  if (!config.redirectUri) missing.push("GOOGLE_ADS_REDIRECT_URI");
  if (!/^[0-9a-fA-F]{64}$/.test(config.encryptionKey)) missing.push("GOOGLE_ADS_TOKEN_ENCRYPTION_KEY");
  return missing;
}
function redirect(code: string) {
  const url = new URL(DASHBOARD_URL);
  url.searchParams.set("google_ads", code);
  return Response.redirect(url.toString(), 302);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") {
    if (origin !== DASHBOARD_ORIGIN) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors(origin) });
  }

  const requestUrl = new URL(req.url);
  // OAuth returns to this server endpoint directly; never expose the code or tokens to the dashboard.
  if (req.method === "GET" && (requestUrl.searchParams.has("code") || requestUrl.searchParams.has("error"))) {
    const code = requestUrl.searchParams.get("code") ?? "";
    const state = requestUrl.searchParams.get("state") ?? "";
    if (requestUrl.searchParams.get("error")) return redirect("denied");
    if (!code || !state) return redirect("state_invalid");

    try {
      const config = configured();
      const missing = missingSetup(config);
      if (missing.length) return redirect("server_setup_missing");

      const admin = adminClient();
      const stateHash = await sha256Hex(state);
      const selected = await admin.from(STATES_TABLE)
        .select("id, owner_user_id, expires_at, consumed_at")
        .eq("state_hash", stateHash)
        .maybeSingle();
      if (selected.error || !selected.data || selected.data.consumed_at || Date.parse(selected.data.expires_at) <= Date.now()) {
        return redirect("state_invalid");
      }
      const consumed = await admin.from(STATES_TABLE)
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", selected.data.id)
        .is("consumed_at", null)
        .gt("expires_at", new Date().toISOString())
        .select("id");
      if (consumed.error || !consumed.data?.length) return redirect("state_invalid");

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokens = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !tokens.refresh_token) return redirect("token_exchange_failed");
      const scopes = String(tokens.scope ?? "").split(/\s+/).filter(Boolean);
      if (scopes.length && !scopes.includes(ADS_SCOPE)) return redirect("ads_scope_missing");

      const encrypted = await encryptRefreshToken(String(tokens.refresh_token));
      const stored = await admin.from(CONNECTIONS_TABLE).upsert({
        owner_user_id: selected.data.owner_user_id,
        encrypted_refresh_token: encrypted.encrypted,
        refresh_token_iv: encrypted.iv,
        granted_scopes: scopes.length ? scopes : [ADS_SCOPE],
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "owner_user_id" });
      if (stored.error) {
        console.error("[google-ads-connect] secure token storage failed:", stored.error.message);
        return redirect("secure_storage_failed");
      }
      await admin.from(STATES_TABLE).delete().lt("expires_at", new Date().toISOString());
      return redirect("connected");
    } catch (error) {
      console.error("[google-ads-connect] callback failed:", error instanceof Error ? error.message : "unknown");
      return redirect("callback_failed");
    }
  }

  if (req.method !== "POST") return json({ message: "Method not allowed." }, 405, origin);
  if (origin !== DASHBOARD_ORIGIN) return json({ message: "Forbidden origin." }, 403, origin);

  try {
    const { user, admin } = await requireOwner(req);
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    if (body.action !== "start") return json({ message: "Unsupported action." }, 400, origin);
    const config = configured();
    const missing = missingSetup(config);
    if (missing.length) {
      return json({ message: "Google Ads server setup is incomplete.", missing_secrets: missing }, 503, origin);
    }

    const state = (() => {
      const raw = crypto.getRandomValues(new Uint8Array(32));
      return Array.from(raw, b => b.toString(16).padStart(2, "0")).join("");
    })();
    const stateHash = await sha256Hex(state);
    const inserted = await admin.from(STATES_TABLE).insert({
      owner_user_id: user.id,
      state_hash: stateHash,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (inserted.error) throw new Error("oauth_state_storage_failed");

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", config.clientId);
    authUrl.searchParams.set("redirect_uri", config.redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", ADS_SCOPE);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent select_account");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", state);
    return json({ authorization_url: authUrl.toString(), expires_in: 600 }, 200, origin);
  } catch (error) {
    if (error instanceof Response) return json({ message: await error.text() }, error.status, origin);
    console.error("[google-ads-connect] start failed:", error instanceof Error ? error.message : "unknown");
    return json({ message: "Could not start Google Ads connection." }, 503, origin);
  }
});
