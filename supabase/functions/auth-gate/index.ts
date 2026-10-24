import { createClient } from "npm:@supabase/supabase-js@2";

const OWNER_EMAIL = "sobujkhamar.official@gmail.com";
const ALLOWED_ORIGIN = "https://sobujkhamarofficial-ctrl.github.io";
const CONFIG_TABLE = "adpulse_auth_gate_config";
const CHALLENGES_TABLE = "adpulse_auth_gate_challenges";
const ATTEMPTS_TABLE = "adpulse_auth_gate_attempts";
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const encoder = new TextEncoder();

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null",
    "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Pragma": "no-cache",
    },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function randomSecret(bytes = 36): string {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  let binary = "";
  for (const value of raw) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function readOrCreateConfig(admin: ReturnType<typeof createClient>, key: string): Promise<string> {
  const existing = await admin.from(CONFIG_TABLE).select("secret_value").eq("config_key", key).maybeSingle();
  if (existing.error) throw new Error("config-read-failed");
  if (existing.data?.secret_value) return String(existing.data.secret_value);

  const generated = randomSecret();
  const inserted = await admin.from(CONFIG_TABLE).insert({
    config_key: key,
    secret_value: generated,
    updated_at: new Date().toISOString(),
  });
  // A simultaneous first login may have inserted the same key; read the winner.
  if (inserted.error && inserted.error.code !== "23505") throw new Error("config-write-failed");
  const reread = await admin.from(CONFIG_TABLE).select("secret_value").eq("config_key", key).single();
  if (reread.error || !reread.data?.secret_value) throw new Error("config-reread-failed");
  return String(reread.data.secret_value);
}

async function hashIp(ip: string, pepper: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(pepper + ":" + ip));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}

async function getAttempt(admin: ReturnType<typeof createClient>, ipHash: string) {
  const result = await admin.from(ATTEMPTS_TABLE)
    .select("ip_hash, attempt_count, window_started_at, locked_until")
    .eq("ip_hash", ipHash)
    .maybeSingle();
  if (result.error) throw new Error("attempt-read-failed");
  return result.data;
}

async function recordFailure(admin: ReturnType<typeof createClient>, ipHash: string, previous: any) {
  const now = Date.now();
  const withinWindow = previous &&
    now - Date.parse(previous.window_started_at) < WINDOW_MS;
  const attemptCount = withinWindow ? Number(previous.attempt_count || 0) + 1 : 1;
  const windowStartedAt = withinWindow ? previous.window_started_at : new Date(now).toISOString();
  const lockedUntil = attemptCount >= MAX_FAILURES
    ? new Date(now + WINDOW_MS).toISOString()
    : null;
  const write = await admin.from(ATTEMPTS_TABLE).upsert({
    ip_hash: ipHash,
    attempt_count: attemptCount,
    window_started_at: windowStartedAt,
    locked_until: lockedUntil,
    updated_at: new Date(now).toISOString(),
  }, { onConflict: "ip_hash" });
  if (write.error) throw new Error("attempt-write-failed");
  return attemptCount >= MAX_FAILURES;
}

async function clearFailures(admin: ReturnType<typeof createClient>, ipHash: string) {
  const now = new Date().toISOString();
  const result = await admin.from(ATTEMPTS_TABLE).upsert({
    ip_hash: ipHash,
    attempt_count: 0,
    window_started_at: now,
    locked_until: null,
    updated_at: now,
  }, { onConflict: "ip_hash" });
  if (result.error) throw new Error("attempt-reset-failed");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (origin !== ALLOWED_ORIGIN) {
    return jsonResponse({ message: "Forbidden origin." }, 403, origin);
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return jsonResponse({ message: "Method not allowed." }, 405, origin);

  const gatePassword = Deno.env.get("ADPULSE_GATE_PASSWORD") ?? "";
  const gatePin = Deno.env.get("ADPULSE_GATE_PIN") ?? "";
  if (gatePassword.length < 20 || !/^[0-9]{6}$/.test(gatePin)) {
    return jsonResponse({ message: "Secure login is not configured." }, 503, origin);
  }

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  let secretKey = "";
  let publishableKey = "";
  try {
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    secretKey = String(secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    publishableKey = String(publishableKeys.default ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "");
  } catch {
    return jsonResponse({ message: "Secure login is not configured." }, 503, origin);
  }
  if (!url || !secretKey || !publishableKey) {
    return jsonResponse({ message: "Secure login is not configured." }, 503, origin);
  }

  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const forwarded = req.headers.get("cf-connecting-ip")
      ?? req.headers.get("x-real-ip")
      ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "unknown";
    const ratePepper = await readOrCreateConfig(admin, "rate_limit_pepper");
    const ipHash = await hashIp(forwarded, ratePepper);
    const prior = await getAttempt(admin, ipHash);

    if (prior?.locked_until && Date.parse(prior.locked_until) > Date.now()) {
      return jsonResponse({ message: "Too many failed attempts. Try again later." }, 429, origin);
    }

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const stage = typeof body.stage === "string" ? body.stage : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const challengeToken = typeof body.challenge_token === "string" ? body.challenge_token : "";

    if (stage === "password") {
      const validPassword = email === OWNER_EMAIL && constantTimeEqual(password, gatePassword);
      if (!validPassword) {
        const locked = await recordFailure(admin, ipHash, prior);
        return jsonResponse({
          message: locked
            ? "Too many failed attempts. Try again later."
            : "The owner email or access password is incorrect.",
        }, locked ? 429 : 401, origin);
      }

      await admin.from(CHALLENGES_TABLE).delete().eq("ip_hash", ipHash).lt("expires_at", new Date().toISOString());
      const token = randomSecret(32);
      const challengeHash = await hashIp(token, ratePepper);
      const inserted = await admin.from(CHALLENGES_TABLE).insert({
        challenge_hash: challengeHash,
        ip_hash: ipHash,
        owner_email: OWNER_EMAIL,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        attempts: 0,
      });
      if (inserted.error) throw new Error("challenge-create-failed");
      return jsonResponse({
        step: "confirm_code",
        challenge_token: token,
        expires_in: 300,
      }, 200, origin);
    }

    if (stage !== "confirm_code") {
      const locked = await recordFailure(admin, ipHash, prior);
      return jsonResponse({
        message: locked ? "Too many failed attempts. Try again later." : "Access verification failed.",
      }, locked ? 429 : 401, origin);
    }

    const challengeHash = challengeToken ? await hashIp(challengeToken, ratePepper) : "";
    const challengeResult = await admin.from(CHALLENGES_TABLE)
      .select("challenge_hash, ip_hash, owner_email, expires_at, attempts, consumed_at")
      .eq("challenge_hash", challengeHash)
      .eq("ip_hash", ipHash)
      .eq("owner_email", OWNER_EMAIL)
      .maybeSingle();
    if (challengeResult.error) throw new Error("challenge-read-failed");
    const challenge = challengeResult.data;
    const challengeIsValid = !!challenge &&
      !challenge.consumed_at &&
      Date.parse(challenge.expires_at) > Date.now() &&
      email === OWNER_EMAIL;

    if (!challengeIsValid || !constantTimeEqual(code, gatePin)) {
      if (challenge && !challenge.consumed_at) {
        const nextAttempts = Number(challenge.attempts || 0) + 1;
        await admin.from(CHALLENGES_TABLE).update({
          attempts: nextAttempts,
          consumed_at: nextAttempts >= MAX_FAILURES ? new Date().toISOString() : null,
        }).eq("challenge_hash", challenge.challenge_hash).is("consumed_at", null);
      }
      const locked = await recordFailure(admin, ipHash, prior);
      return jsonResponse({
        message: locked
          ? "Too many failed attempts. Try again later."
          : "The confirmation code is incorrect or has expired.",
      }, locked ? 429 : 401, origin);
    }

    const consume = await admin.from(CHALLENGES_TABLE)
      .update({ consumed_at: new Date().toISOString() })
      .eq("challenge_hash", challenge.challenge_hash)
      .eq("ip_hash", ipHash)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("challenge_hash");
    if (consume.error) throw new Error("challenge-consume-failed");
    if (!consume.data || consume.data.length !== 1) {
      return jsonResponse({ message: "The confirmation code is incorrect or has expired." }, 401, origin);
    }

    const provisionMarker = await readOrCreateConfig(admin, "auth_provision_marker");
    const internalPassword = await readOrCreateConfig(admin, "internal_auth_password");
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listed.error) throw new Error("auth-user-list-failed");
    let user = listed.data.users.find((item: any) => (item.email ?? "").toLowerCase() === OWNER_EMAIL);

    if (!user) {
      const created = await admin.auth.admin.createUser({
        email: OWNER_EMAIL,
        password: internalPassword,
        email_confirm: true,
        app_metadata: { adpulse_provision_marker: provisionMarker },
        user_metadata: { full_name: "AdPulse Owner", adpulse_provision_marker: provisionMarker },
      });
      if (created.error) {
        const reread = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (reread.error) throw new Error("auth-user-create-failed");
        user = reread.data.users.find((item: any) => (item.email ?? "").toLowerCase() === OWNER_EMAIL);
        if (!user) throw new Error("auth-user-create-failed");
      } else {
        user = created.data.user;
      }
    }

    let signedIn = await authClient.auth.signInWithPassword({
      email: OWNER_EMAIL,
      password: internalPassword,
    });
    if (signedIn.error || !signedIn.data.session) {
      const updated = await admin.auth.admin.updateUserById(user.id, {
        password: internalPassword,
        email_confirm: true,
        app_metadata: {
          ...(user.app_metadata ?? {}),
          adpulse_provision_marker: provisionMarker,
        },
      });
      if (updated.error) throw new Error("auth-user-update-failed");
      signedIn = await authClient.auth.signInWithPassword({
        email: OWNER_EMAIL,
        password: internalPassword,
      });
    }
    if (signedIn.error || !signedIn.data.session) throw new Error("auth-session-create-failed");

    await clearFailures(admin, ipHash);
    return jsonResponse({
      access_token: signedIn.data.session.access_token,
      refresh_token: signedIn.data.session.refresh_token,
    }, 200, origin);
  } catch (error) {
    console.error("[auth-gate] secure authentication failed:", error instanceof Error ? error.message : "unknown");
    return jsonResponse({ message: "Secure sign-in is temporarily unavailable. Please try again." }, 503, origin);
  }
});
