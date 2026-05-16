import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const PLAYBACK_URL = 'https://proxy.mediastream48.workers.dev/api/proxy/playback';
const TOKEN_URL = 'https://hanabira48.com/api/stream-token';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { showId } = await req.json().catch(() => ({}));
    if (!showId || typeof showId !== 'string') {
      return new Response(JSON.stringify({ error: 'missing_show_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokRes = await fetch(`${TOKEN_URL}?showId=${encodeURIComponent(showId)}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!tokRes.ok) {
      const body = await tokRes.text().catch(() => '');
      return new Response(JSON.stringify({ error: 'token_fetch_failed', status: tokRes.status, body: body.slice(0, 500) }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const tokJson = await tokRes.json().catch(() => ({} as any));

    // Try common field names — be flexible with the upstream API shape.
    const xapi = tokJson.xapi || tokJson.xApi || tokJson.x_api || tokJson.api || tokJson.apiKey || '';
    const xsec = tokJson.xsec || tokJson.xSec || tokJson.x_sec || tokJson.sec || tokJson.secret || '';
    const xshowid = tokJson.xshowid || tokJson.xShowId || tokJson.x_show_id || tokJson.showId || showId;
    const xtoken = tokJson.xtoken || tokJson.xToken || tokJson.x_token || tokJson.token || '';

    if (!xapi || !xsec || !xtoken) {
      return new Response(JSON.stringify({ error: 'incomplete_token', received: Object.keys(tokJson) }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      playback_url: PLAYBACK_URL,
      headers: { xapi, xsec, xshowid: String(xshowid), xtoken },
      expires_at: tokJson.expires_at || tokJson.expiresAt || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
