// Proxy HLS bertanda tangan untuk Chromecast / browser TV.
// Chromecast tidak bisa mengirim header khusus (x-api-token dll), jadi TV cukup
// membuka alamat sementara ini: server yang menempelkan kredensial IDN.
//
// GET ?t=<grant>            -> manifest master (URI di dalamnya ditulis ulang ke proxy ini)
// GET ?t=<grant>&u=<b64url> -> segmen / playlist turunan
//
// `t` adalah grant HMAC dari unlock-live / tv-pair. Umur maksimum 6 jam.

import { verifyGrant } from '../_shared/stream-grant.ts';
import { generateApiToken, PLAYBACK_URL, X_SEC_KEY, X_TOKEN_ID } from '../_shared/idn-credentials.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
};

const b64urlEncode = (s: string) =>
  btoa(s).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const b64urlDecode = (s: string) => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(p + '='.repeat((4 - (p.length % 4)) % 4));
};

const isManifest = (ct: string, body: string) =>
  /mpegurl/i.test(ct) || body.trimStart().startsWith('#EXTM3U');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  const t = url.searchParams.get('t') || '';
  const u = url.searchParams.get('u') || '';

  const claims = await verifyGrant(t);
  if (!claims?.idn) {
    return new Response('unauthorized', { status: 401, headers: CORS });
  }

  let upstream: string;
  try {
    upstream = u ? b64urlDecode(u) : PLAYBACK_URL;
    if (!/^https?:\/\//i.test(upstream)) throw new Error('bad');
  } catch {
    return new Response('bad_url', { status: 400, headers: CORS });
  }

  const playbackHost = new URL(PLAYBACK_URL).host;
  const headers: Record<string, string> = {};
  if (new URL(upstream).host === playbackHost) {
    headers['x-api-token'] = await generateApiToken(claims.idn);
    headers['x-sec-key'] = X_SEC_KEY;
    headers['x-showid'] = claims.idn;
    headers['x-token-id'] = X_TOKEN_ID;
  }
  const range = req.headers.get('range');
  if (range) headers['range'] = range;

  let res: Response;
  try {
    res = await fetch(upstream, { headers, redirect: 'follow' });
  } catch {
    return new Response('upstream_error', { status: 502, headers: CORS });
  }

  const ct = res.headers.get('content-type') || '';
  const self = `${url.origin}${url.pathname}`;
  const proxied = (abs: string) => `${self}?t=${encodeURIComponent(t)}&u=${encodeURIComponent(b64urlEncode(abs))}`;

  // Segmen media / biner: teruskan apa adanya (streaming).
  if (!/mpegurl/i.test(ct) && !/text\/plain/i.test(ct)) {
    const out = new Headers(CORS);
    const passthrough = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'];
    for (const h of passthrough) {
      const v = res.headers.get(h);
      if (v) out.set(h, v);
    }
    return new Response(res.body, { status: res.status, headers: out });
  }

  const body = await res.text();
  if (!isManifest(ct, body)) {
    return new Response(body, {
      status: res.status,
      headers: { ...CORS, 'Content-Type': ct || 'text/plain' },
    });
  }

  const base = res.url || upstream;
  const rewritten = body
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        // Tulis ulang atribut URI="..." (KEY, MAP, MEDIA, I-FRAME).
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${proxied(new URL(uri, base).toString())}"`);
      }
      return proxied(new URL(trimmed, base).toString());
    })
    .join('\n');

  return new Response(rewritten, {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-store',
    },
  });
});
