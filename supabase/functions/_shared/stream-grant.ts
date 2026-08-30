// Short-lived signed grant proving that a viewer passed unlock-live (or free-token) validation.
// Used as a Bearer token for idn-stream-token so IDN credentials can't be fetched anonymously.

const SECRET = Deno.env.get("STREAM_GRANT_SECRET") || "";

export const GRANT_TTL_PAID = 6 * 3600;   // 6 jam (maksimum)
export const GRANT_TTL_FREE = 30 * 60;    // 30 menit

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function key() {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export type GrantKind = "show" | "membership" | "free";

export type GrantClaims = {
  sid: string;        // active_shows.id
  idn: string;        // idn_show_id allowed
  bid: string;        // browser_id / fingerprint
  kind?: GrantKind;   // sumber akses
  tid?: string;       // id baris token (Token Factory) bila ada
  iat?: number;       // unix seconds
  exp: number;        // unix seconds
};

export async function signGrant(
  claims: Omit<GrantClaims, "exp" | "iat">,
  ttlSec = GRANT_TTL_PAID,
): Promise<string> {
  if (!SECRET) return "";
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.min(Math.max(60, ttlSec), GRANT_TTL_PAID);
  const payload: GrantClaims = { ...claims, iat: now, exp: now + ttl };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyGrant(grant: string): Promise<GrantClaims | null> {
  if (!SECRET || !grant || grant.length > 2048) return null;
  const [body, sig] = grant.split(".");
  if (!body || !sig) return null;
  const expected = await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(body));
  const a = b64url(new Uint8Array(expected));
  if (a.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as GrantClaims;
    const now = Math.floor(Date.now() / 1000);
    if (!claims?.exp || claims.exp < now) return null;
    // Hard cap: apapun isinya, umur token tidak boleh melebihi 6 jam.
    if (claims.iat && claims.exp - claims.iat > GRANT_TTL_PAID) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Ambil bearer token dari header Authorization. */
export function bearerFrom(req: Request): string {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!h.toLowerCase().startsWith("bearer ")) return "";
  return h.slice(7).trim();
}
