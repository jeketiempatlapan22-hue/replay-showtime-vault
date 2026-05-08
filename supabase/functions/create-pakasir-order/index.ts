// Create a Pakasir dynamic QRIS order for an active show purchase.
// Each call creates a NEW order_id; webhook will deliver token via WhatsApp.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizePhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('62')) return d;
  if (d.startsWith('8')) return '62' + d;
  return d;
}

function validPhone(p: string) {
  return /^62\d{8,13}$/.test(p);
}

function genOrderId() {
  return 'rt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const showId = String(body.show_id ?? '');
    const replayId = String(body.replay_id ?? '');
    const kind = String(body.kind ?? 'show'); // 'show' | 'replay' | 'replay_only'
    const phone = normalizePhone(String(body.phone ?? ''));

    if (!validPhone(phone)) return new Response(JSON.stringify({ error: 'invalid phone' }), { status: 400, headers: corsHeaders });
    if (!['show', 'replay', 'replay_only'].includes(kind)) {
      return new Response(JSON.stringify({ error: 'invalid kind' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const slug = Deno.env.get('PAKASIR_PROJECT_SLUG');
    if (!slug) return new Response(JSON.stringify({ error: 'pakasir not configured' }), { status: 500, headers: corsHeaders });

    let amount = 0;
    let itemTitle = '';
    let resolvedShowId: string | null = null;
    let resolvedReplayId: string | null = null;

    if (kind === 'replay_only') {
      // Standalone replay purchase — default Rp 2.000 if not provided.
      if (!replayId) return new Response(JSON.stringify({ error: 'missing replay_id' }), { status: 400, headers: corsHeaders });
      const { data: replay, error: rerr } = await admin
        .from('replays').select('id, title').eq('id', replayId).maybeSingle();
      if (rerr || !replay) return new Response(JSON.stringify({ error: 'replay not found' }), { status: 404, headers: corsHeaders });
      amount = Math.max(2000, Number(body.amount || 0) || 2000);
      itemTitle = `Replay • ${replay.title}`;
      resolvedReplayId = replay.id;
    } else {
      if (!showId) return new Response(JSON.stringify({ error: 'missing show_id' }), { status: 400, headers: corsHeaders });
      const { data: show, error: showErr } = await admin
        .from('active_shows').select('*').eq('id', showId).maybeSingle();
      if (showErr || !show) return new Response(JSON.stringify({ error: 'show not found' }), { status: 404, headers: corsHeaders });
      if (kind === 'replay') {
        const a = Number(show.price_replay || show.pakasir_amount || 0);
        amount = a >= 100 ? a : 2000; // default Rp 2.000 for replay if admin not set
      } else {
        amount = Number(show.price_show || show.pakasir_amount || 0);
      }
      itemTitle = `${kind === 'replay' ? 'Replay' : 'Show'} • ${show.title}`;
      resolvedShowId = show.id;
      resolvedReplayId = kind === 'replay' ? show.replay_id : null;
    }

    if (!amount || amount < 100) return new Response(JSON.stringify({ error: 'invalid amount' }), { status: 400, headers: corsHeaders });

    const orderId = genOrderId();
    const qrUrl = `https://app.pakasir.com/pay/${slug}/${orderId}?amount=${amount}&qris_only=1`;
    const apiKey = Deno.env.get('PAKASIR_API_KEY') || '';

    // Call Pakasir API to get raw QRIS string so we can render it in our own UI.
    let qrString = '';
    let totalPayment = amount;
    let expiredAt = '';
    try {
      const pres = await fetch(`https://app.pakasir.com/api/transactioncreate/qris`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: slug, order_id: orderId, amount, api_key: apiKey }),
      });
      const pjson: any = await pres.json().catch(() => ({}));
      const p = pjson?.payment || {};
      qrString = String(p.payment_number || '');
      totalPayment = Number(p.total_payment || amount);
      expiredAt = String(p.expired_at || '');
      if (!pres.ok || !qrString) {
        return new Response(JSON.stringify({ error: 'pakasir_create_failed', detail: pjson }), { status: 502, headers: corsHeaders });
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: 'pakasir_unreachable', detail: String(e) }), { status: 502, headers: corsHeaders });
    }

    const { data: order, error: orderErr } = await admin.from('orders').insert({
      user_phone: phone,
      replay_id: resolvedReplayId,
      show_id: resolvedShowId,
      item_title: itemTitle,
      amount,
      status: 'pending',
      pakasir_order_id: orderId,
      pakasir_qr_url: qrUrl,
    }).select('id').single();
    if (orderErr) return new Response(JSON.stringify({ error: orderErr.message }), { status: 500, headers: corsHeaders });

    return new Response(JSON.stringify({
      ok: true, order_id: order.id, pakasir_order_id: orderId, amount,
      qr_url: qrUrl, qr_string: qrString, total_payment: totalPayment, expired_at: expiredAt,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
