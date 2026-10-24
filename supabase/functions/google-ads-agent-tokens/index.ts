import { createClient } from "npm:@supabase/supabase-js@2";

const OWNER_EMAIL = "sobujkhamar.official@gmail.com";
const DASHBOARD_ORIGIN = "https://sobujkhamarofficial-ctrl.github.io";
const CONFIG_TABLE = "adpulse_auth_gate_config";
const TOKENS_TABLE = "adpulse_agent_tokens";
const ALLOWED_SCOPES = new Set(["accounts.read", "ads.read", "campaigns.read"]);

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
async function requireOwner(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!jwt) throw new Response("Sign in to AdPulse first.", { status: 401 });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const pkey = getPublishableKey();
  if (!url || !pkey) throw new Error("supabase_not_configured");
  const userClient = createClient(url, pkey, { global: { headers: { Authorization: "Bearer " + jwt } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await userClient.auth.getUser(jwt);
  if (error || !data.user || (data.user.email ?? "").toLowerCase() !== OWNER_EMAIL) throw new Response("Owner access required.", { status: 403 });
  const admin = adminClient();
  const cfg = await admin.from(CONFIG_TABLE).select("secret_value").eq("config_key", "auth_provision_marker").maybeSingle();
  const expected = cfg.data?.secret_value ? String(cfg.data.secret_value) : "";
  if (cfg.error || !expected || data.user.app_metadata?.adpulse_provision_marker !== expected) {
    throw new Response("This account is not provisioned for owner access.", { status: 403 });
  }
  return { user: data.user, admin };
}
function randomAgentToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return "ap_agent_" + btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function sha256Hex(value: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(hash, b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") {
    if (origin !== DASHBOARD_ORIGIN) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (req.method !== "POST") return json({ message: "Method not allowed." }, 405, origin);
  if (origin !== DASHBOARD_ORIGIN) return json({ message: "Forbidden origin." }, 403, origin);

  try {
    const { user, admin } = await requireOwner(req);
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "list") {
      const result = await admin.from(TOKENS_TABLE)
        .select("id,label,scopes,allowed_customer_ids,created_at,expires_at,last_used_at,revoked_at")
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (result.error) throw new Error("token_list_failed");
      return json({ tokens: result.data ?? [] }, 200, origin);
    }

    if (action === "create") {
      const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";
      const scopes = Array.isArray(body.scopes) ? [...new Set(body.scopes.filter((s: unknown): s is string => typeof s === "string"))] : [];
      const customerIds = Array.isArray(body.allowed_customer_ids)
        ? [...new Set(body.allowed_customer_ids.filter((v: unknown): v is string => typeof v === "string").map((v: string) => v.replaceAll("-", "").trim()))]
        : [];
      const days = Number(body.expires_in_days ?? 30);
      if (!label) return json({ message: "Give the agent token a name." }, 400, origin);
      if (!scopes.length || scopes.some((s: string) => !ALLOWED_SCOPES.has(s))) {
        return json({ message: "Choose at least one supported read-only permission." }, 400, origin);
      }
      if (!Number.isInteger(days) || days < 1 || days > 90) return json({ message: "Token expiry must be between 1 and 90 days." }, 400, origin);
      if (customerIds.some((id: string) => !/^\d{10}$/.test(id))) return json({ message: "Customer IDs must be ten digits." }, 400, origin);
      if (scopes.some((s: string) => s === "ads.read" || s === "campaigns.read") && !customerIds.length) {
        return json({ message: "Select at least one Google Ads customer ID for ads or campaign reporting access." }, 400, origin);
      }
      const rawToken = randomAgentToken();
      const tokenHash = await sha256Hex(rawToken);
      const result = await admin.from(TOKENS_TABLE).insert({
        owner_user_id: user.id,
        token_hash: tokenHash,
        label,
        scopes,
        allowed_customer_ids: customerIds,
        expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
      }).select("id,label,scopes,allowed_customer_ids,created_at,expires_at").single();
      if (result.error) throw new Error("token_create_failed");
      return json({
        token: rawToken,
        warning: "Copy this token now. It is stored only as a SHA-256 hash and cannot be shown again.",
        created: result.data,
      }, 201, origin);
    }

    if (action === "revoke") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ message: "Invalid token ID." }, 400, origin);
      const result = await admin.from(TOKENS_TABLE)
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("owner_user_id", user.id)
        .is("revoked_at", null)
        .select("id");
      if (result.error) throw new Error("token_revoke_failed");
      return json({ revoked: !!result.data?.length }, 200, origin);
    }

    return json({ message: "Unsupported action." }, 400, origin);
  } catch (error) {
    if (error instanceof Response) return json({ message: await error.text() }, error.status, origin);
    console.error("[google-ads-agent-tokens] request failed:", error instanceof Error ? error.message : "unknown");
    return json({ message: "Could not manage agent access tokens." }, 503, origin);
  }
});
