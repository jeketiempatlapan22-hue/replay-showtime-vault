// Generates IDN (hanabira48) playback credentials server-side.
// Public (no auth required). Returns { xShowId, xTokenId, xSecKey, xApiToken, playbackUrl }.
// Client uses these as request headers when calling the worker proxy playback URL.


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
  const payload = { sid: showId, tid: X_TOKEN_ID, exp: now + 90 };
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // Public endpoint — no auth required. Credentials are short-lived (2h) and
    // tied to a specific showId set by admin.

    const body = await req.json().catch(() => ({}));
    const showId = String(body?.showId || '').trim();
    if (!showId || showId.length > 64) {
      return new Response(JSON.stringify({ error: 'showId tidak valid' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const xApiToken = await generateApiToken(showId);
    return new Response(JSON.stringify({
      xShowId: showId,
      xTokenId: X_TOKEN_ID,
      xSecKey: X_SEC_KEY,
      xApiToken,
      playbackUrl: PLAYBACK_URL,
      expiresIn: 90,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
