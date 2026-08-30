// Short-lived signed grant proving that a viewer passed unlock-live validation.
// Used to gate idn-stream-token so IDN credentials can't be fetched anonymously.

const SECRET = Deno.env.get("STREAM_GRANT_SECRET") || "";

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

export type GrantClaims = {
  sid: string;      // active_shows.id
  idn: string;      // idn_show_id allowed
  bid: string;      // browser_id
  exp: number;      // unix seconds
};

export async function signGrant(claims: Omit<GrantClaims, "exp">, ttlSec = 21600): Promise<string> {
  if (!SECRET) return "";
  const payload: GrantClaims = { ...claims, exp: Math.floor(Date.now() / 1000) + ttlSec };
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
    if (!claims?.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
