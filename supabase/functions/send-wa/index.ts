// Send WhatsApp message via Fonnte. Admin-only.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  return d;
}

export async function sendFonnte(phone: string, message: string): Promise<{ ok: boolean; data: unknown }> {
  const token = Deno.env.get('FONNTE_TOKEN');
  if (!token) throw new Error('FONNTE_TOKEN not configured');
  const form = new FormData();
  form.append('target', normalizePhone(phone));
  form.append('message', message);
  form.append('countryCode', '62');
  const attempts = [18000, 32000];
  let last: { ok: boolean; data: unknown } = { ok: false, data: { error: 'no_attempt' } };
  for (const timeoutMs of attempts) {
    try {
      const res = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: { Authorization: token },
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data = await res.json().catch(() => ({}));
      last = { ok: res.ok && (data as { status?: boolean })?.status !== false, data };
      if (last.ok) return last;
    } catch (e) {
      last = { ok: false, data: { error: e instanceof Error ? e.message : String(e) } };
    }
  }
  return last;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: claimErr } = await supabase.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: claims.claims.sub, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const phone = String(body.phone ?? '').trim();
    const message = String(body.message ?? '').trim();
    const orderId = body.order_id ? String(body.order_id) : null;
    if (!phone || !message) {
      return new Response(JSON.stringify({ error: 'phone and message required' }), { status: 400, headers: corsHeaders });
    }

    const result = await sendFonnte(phone, message);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await admin.from('wa_outbox').insert({
      phone: normalizePhone(phone),
      message,
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? null : JSON.stringify(result.data),
      related_order_id: orderId,
      fonnte_response: result.data as Record<string, unknown>,
    });

    return new Response(JSON.stringify({ ok: result.ok, data: result.data }), {
      status: result.ok ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
