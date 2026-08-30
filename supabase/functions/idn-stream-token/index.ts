// Generates IDN (hanabira48) playback credentials server-side.
// PROTECTED: requires a short-lived signed grant issued by unlock-live, so only
// viewers that already passed token/membership/password validation can obtain
// playback credentials. Returns { xShowId, xTokenId, xSecKey, xApiToken, playbackUrl }.

import { verifyGrant } from '../_shared/stream-grant.ts';

const ALLOWED_ORIGINS = [
  'https://realtime48stream.my.id',
  'https://www.realtime48stream.my.id',
  'https://replaytime.lovable.app',
  'http://localhost:8080',
];

function cors(origin: string | null) {
  const allowed = origin && (ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin))
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as Record<string, string>;
}

// Static credentials per playback_baru.txt
const X_TOKEN_ID = '114e0e89-f8b4-44ee-9354-bb06805cc02f';
const X_SEC_KEY = '49c647f3-c84b-4b93-9b84-9d1ad158428e';
const PARTNER_SECRET = Deno.env.get('HANABIRA_PARTNER_SECRET') || 'Hanabirastream2026';
const PLAYBACK_URL = 'https://idn.mediastream48.workers.dev/api/proxy/playback';

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlStr(s: string): string {
  return b64url(new TextEncoder().encode(s));
}
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generateApiToken(showId: string): Promise<string> {
  // Step A: JWT secret = HEX(SHA256(secKey:tokenId:partnerSecret))
  const seed = `${X_SEC_KEY}:${X_TOKEN_ID}:${PARTNER_SECRET}`;
  const seedHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  const jwtSecret = toHex(new Uint8Array(seedHash));

  // Step B: Payload
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sid: showId, tid: X_TOKEN_ID, exp: now + 7200 };
  const signingInput = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(payload))}`;

  // Step C: HMAC-SHA256
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

Deno.serve(async (req) => {
  const corsHeaders = cors(req.headers.get('origin'));
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!PARTNER_SECRET) return json({ error: 'server_misconfigured' }, 503);

    const body = await req.json().catch(() => ({}));
    const showId = String(body?.showId || '').trim();
    const grant = String(body?.grant || '');
    if (!showId || showId.length > 64) return json({ error: 'showId tidak valid' }, 400);

    // Gate: hanya penonton yang sudah lolos validasi unlock-live (token / membership /
    // sandi) yang boleh mengambil kredensial IDN.
    const claims = await verifyGrant(grant);
    if (!claims) return json({ error: 'akses_ditolak' }, 401);
    if (claims.idn !== showId) return json({ error: 'grant_mismatch' }, 403);

    const xApiToken = await generateApiToken(showId);
    return json({
      xShowId: showId,
      xTokenId: X_TOKEN_ID,
      xSecKey: X_SEC_KEY,
      xApiToken,
      playbackUrl: PLAYBACK_URL,
      expiresIn: 7200,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
