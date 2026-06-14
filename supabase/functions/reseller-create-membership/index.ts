import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
function rnd(len: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map((b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 36]).join('');
}
async function freshToken(admin: any, len: number) {
  for (let i = 0; i < 8; i++) {
    const token = rnd(len);
    const { data } = await admin.from('membership_tokens').select('id').eq('token', token).maybeSingle();
    if (!data) return token;
  }
  return `${rnd(len)}${Date.now().toString(36).toUpperCase()}`;
}

const DEFAULT_TPL =
  '👑 *MEMBERSHIP AKTIF*\n\n📦 *{package_name}*\n📅 Berlaku hingga: {expires_at}\n\n🔗 *Link Akses:*\n{link}\n\n{replay_info_block}👤 Berlaku untuk *{max_devices} perangkat*.\n\n— *ReplayTime* 💖';

function build(tpl: string, v: Record<string, string>) {
  return tpl
    .replace(/\{package_name\}/g, v.package_name || '')
    .replace(/\{link\}/g, v.link || '')
    .replace(/\{password\}/g, v.password || '')
    .replace(/\{expires_at\}/g, v.expires_at || '')
    .replace(/\{duration_days\}/g, v.duration_days || '')
    .replace(/\{max_devices\}/g, v.max_devices || '1')
    .replace(/\{replay_info\}/g, v.replay_info || '')
    .replace(/\{replay_info_block\}/g, v.replay_info ? `🎬 *Info Replay:*\n${v.replay_info}\n\n` : '')
    .replace(/\{site\}/g, v.site || '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const phone = normalizePhone(body.phone || '');
  const pin = String(body.pin || '').trim();
  const packageId = String(body.package_id || '');
  const days = Math.floor(Number(body.days));
  if (!phone || !pin || !packageId) return json({ error: 'missing_fields' }, 400);
  if (!Number.isFinite(days) || days < 2 || days > 40) return json({ error: 'invalid_days', detail: 'Durasi 2–40 hari.' }, 400);

  const { data: verified } = await admin.rpc('reseller_verify', { _phone: phone, _pin: pin });
  if (verified !== true) return json({ error: 'unauthorized' }, 401);

  const { data: pkg } = await admin.from('membership_packages')
    .select('id,name,status,paused,max_devices,includes_replays,replay_info').eq('id', packageId).maybeSingle();
  if (!pkg) return json({ error: 'package_not_found' }, 404);
  if (pkg.paused === true) return json({ error: 'package_paused' }, 400);

  const { data: settings } = await admin.from('site_settings').select('key,value')
    .in('key', ['site_origin', 'wa_membership_template', 'reseller_membership_replay_info']);
  const sm = new Map((settings ?? []).map((x: any) => [x.key, x.value]));
  const origin = ((sm.get('site_origin') as string) || 'https://realtime48stream.my.id').replace(/\/+$/, '');
  const tpl = (sm.get('wa_membership_template') as string) || DEFAULT_TPL;
  const replayInfo = String(sm.get('reseller_membership_replay_info') || '').trim() || (pkg.replay_info || '');

  const token = await freshToken(admin, 12);
  const password = await freshToken(admin, 8);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const { data: ba } = await admin.from('bot_admins').select('label').eq('phone', phone).maybeSingle();
  const resellerLabel = (ba?.label || '').trim();

  const { data: tk, error } = await admin.from('membership_tokens').insert({
    token, password, phone,
    label: `reseller:${phone} / ${pkg.name}`,
    duration_days: days,
    starts_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    max_devices: pkg.max_devices || 1,
    includes_replays: pkg.includes_replays !== false,
    replay_info: replayInfo,
    package_id: pkg.id,
    created_by: `reseller:${phone}`,
  }).select('id').maybeSingle();
  if (error || !tk) return json({ error: 'create_failed', detail: error?.message }, 500);

  const link = `${origin}/live?mtoken=${encodeURIComponent(token)}&mp=${encodeURIComponent(password)}`;
  const expStr = expiresAt.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const message = build(tpl, {
    package_name: pkg.name,
    link, password,
    expires_at: expStr,
    duration_days: String(days),
    max_devices: String(pkg.max_devices || 1),
    replay_info: replayInfo,
    site: origin.replace(/^https?:\/\//, ''),
  }) + `\n\n📝 Dibuat oleh reseller (${days} hari).`;

  await admin.from('token_deliveries').insert({
    phone, replay_id: null, replay_title: `Membership • ${pkg.name}`,
    access_token: token, link, source: 'bot', requested_by: phone,
  });
  await admin.from('reseller_audit_log').insert({
    reseller_phone: phone, reseller_label: resellerLabel,
    kind: 'membership', target_id: pkg.id, target_title: pkg.name,
    token, expires_at: expiresAt.toISOString(), duration_days: days,
    meta: { max_devices: pkg.max_devices || 1, includes_replays: pkg.includes_replays !== false, replay_info_source: replayInfo === (pkg.replay_info || '') ? 'package' : 'reseller_setting' },
  });

  return json({
    ok: true, token, password, link, message,
    title: pkg.name, expires_at: expiresAt.toISOString(), duration_days: days,
  });
});
