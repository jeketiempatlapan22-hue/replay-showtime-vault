import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ipGuard } from '../_shared/ip-guard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function normalizePhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let body: { phone?: string; pin?: string } = {};
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const phone = normalizePhone(body.phone || '');
  const pin = String(body.pin || '').trim();
  if (!phone || !pin) return json({ ok: false, error: 'missing_fields' }, 400);

  const ident = `reseller:${phone}`;
  const { data: lock } = await admin.rpc('check_login_lock', { _identifier: ident });
  if (lock && (lock as any)[0]?.locked) {
    return json({ ok: false, error: 'locked', seconds_remaining: (lock as any)[0].seconds_remaining }, 429);
  }

  const { data: rows, error } = await admin.rpc('reseller_login', { _phone: phone, _pin: pin });
  const row: any = Array.isArray(rows) ? rows[0] : rows;
  const ok = !!row?.ok;
  await admin.rpc('record_login_attempt', { _identifier: ident, _success: ok });
  if (error || !ok) return json({ ok: false, error: 'invalid_credentials' }, 401);

  return json({ ok: true, phone: row.phone, label: row.label || '' });
});
