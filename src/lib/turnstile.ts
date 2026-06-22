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

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });

  const data = await res.json();
  return data.success === true;
}
