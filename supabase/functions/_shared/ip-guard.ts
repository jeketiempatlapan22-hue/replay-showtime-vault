// Shared IP guard helper for edge functions.
// Lightweight: 1 RPC call (`record_ip_visit`) which also checks block status.
// Designed for sensitive/auth endpoints only — DO NOT use on hot live polling paths.

export function getClientIp(req: Request): string {
  const h = req.headers;
  const xff = h.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  if (first) return first;
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("fly-client-ip") ||
    h.get("true-client-ip") ||
    ""
  );
}

type GuardResult =
  | { blocked: false }
  | { blocked: true; status: number; body: { error: string; reason: string } };

/**
 * Records the visit and returns guard outcome.
 * If the IP is blocked or auto-blocked, returns blocked=true.
 * Failures are swallowed (fail-open) so a DB hiccup doesn't break the app.
 */
export async function ipGuard(
  supabase: any,
  req: Request,
  endpoint: string,
  maxPerMin = 30,
): Promise<GuardResult> {
  try {
    const ip = getClientIp(req);
    if (!ip) return { blocked: false };
    const ua = req.headers.get("user-agent") || "";
    let path = "";
    try { path = new URL(req.url).pathname; } catch {}

    const { data, error } = await supabase.rpc("record_ip_visit", {
      _ip: ip,
      _user_agent: ua.slice(0, 500),
      _path: path.slice(0, 200),
      _endpoint: endpoint,
      _max_per_min: maxPerMin,
    });
    if (error) return { blocked: false };
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.blocked) {
      return {
        blocked: true,
        status: 403,
        body: { error: "ip_blocked", reason: row.reason || "blocked" },
      };
    }
    return { blocked: false };
  } catch {
    return { blocked: false };
  }
}
