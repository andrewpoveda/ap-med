export async function verifyTurnstileToken(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Fail CLOSED: a missing secret must reject, not silently wave traffic through.
    // Mandatory before the unauthenticated /r/{token}/no decline route ships (Phase 3).
    console.error("TURNSTILE_SECRET_KEY not set — rejecting submission (fail closed)");
    return false;
  }
  if (!token) {
    return false;
  }

  // Bound the siteverify call so a hung/slow Cloudflare can't stall the request
  // indefinitely — an aborted verification fails closed below.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let data: {
    success?: boolean;
    hostname?: string;
    action?: string;
    "error-codes"?: string[];
  };
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: controller.signal,
    });
    data = await res.json();
  } catch (err) {
    // Network error or timeout — fail closed.
    console.error("Turnstile siteverify request failed:", err);
    return false;
  } finally {
    clearTimeout(timeout);
  }

  if (data.success !== true) {
    return false;
  }

  // Defense-in-depth: bind the solved challenge to our own origin(s)/action.
  // Cloudflare returns the hostname the widget was solved on and the optional
  // action label. Enforced only when the allowlist env vars are configured, so
  // existing deployments — and the CF test keys used in local dev — keep working
  // until the allowlists are set in production.
  // AP MED is served directly from both the apex and www hostnames. Treat the
  // conventional www alias as the same hostname for this allowlist check; an
  // exact comparison rejected otherwise-valid tokens solved on www.ap-med.org
  // when production was configured with only ap-med.org (and vice versa).
  const allowedHosts = envList("TURNSTILE_ALLOWED_HOSTNAMES").map(normalizeHostname);
  if (allowedHosts.length > 0) {
    const host = normalizeHostname(data.hostname);
    if (!allowedHosts.includes(host)) {
      console.error(`Turnstile hostname not allowed: ${host || "(none)"}`);
      return false;
    }
  }

  const allowedActions = envList("TURNSTILE_ALLOWED_ACTIONS");
  if (allowedActions.length > 0) {
    const action = String(data.action ?? "");
    if (!allowedActions.includes(action)) {
      console.error(`Turnstile action not allowed: ${action || "(none)"}`);
      return false;
    }
  }

  return true;
}

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);
}

function normalizeHostname(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/^www\./, "");
}
