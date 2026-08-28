// Webhook Telegram: menerima pesan masuk ke bot @Real48time_bot.
// Perintah:
//   /start <KODE>  — hubungkan Telegram dengan nomor WA (kode dari halaman Profil)
//   /token         — tampilkan link token pembelian terakhir untuk nomor yang terhubung
//   /bantuan       — daftar perintah
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendTelegram, deriveTelegramWebhookSecret, safeEqual } from '../_shared/telegram.ts';

function normalizePhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}

const HELP_TEXT = [
  '🎬 *RealTime48 Bot*',
  '',
  'Perintah yang tersedia:',
  '• `/start <KODE>` — hubungkan Telegram dengan nomor WA Anda (kode ada di halaman Profil website)',
  '• `/token` — lihat link token pembelian terakhir Anda',
  '• `/bantuan` — tampilkan pesan ini',
  '',
  'Setelah terhubung, setiap pembelian yang sudah dibayar akan otomatis dikirim ke Telegram ini juga. 💖',
].join('\n');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
  if (!TELEGRAM_API_KEY) return new Response('Not configured', { status: 500 });
  const expectedSecret = await deriveTelegramWebhookSecret(TELEGRAM_API_KEY);
  if (!safeEqual(req.headers.get('X-Telegram-Bot-Api-Secret-Token'), expectedSecret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Selalu jawab 200 cepat agar Telegram tidak retry berulang.
  const respond = () => new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });

  let update: any;
  try { update = await req.json(); } catch { return respond(); }
  const message = update.message ?? update.edited_message;
  const chatId: number | undefined = message?.chat?.id;
  const text: string = String(message?.text ?? '').trim();
  if (!chatId || !text) return respond();

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    if (text.startsWith('/start')) {
      const code = text.split(/\s+/)[1]?.trim().toUpperCase() || '';
      if (!code) {
        await sendTelegram(chatId, HELP_TEXT);
        return respond();
      }
      // Cari kode penghubung
      const { data: link } = await admin
        .from('telegram_links')
        .select('id,phone,chat_id')
        .eq('link_code', code)
        .maybeSingle();
      if (!link) {
        await sendTelegram(chatId, '❌ Kode tidak ditemukan atau sudah tidak berlaku.\n\nBuat kode baru di halaman *Profil* website, lalu kirim `/start <KODE>` lagi.');
        return respond();
      }
      await admin.from('telegram_links')
        .update({ chat_id: chatId, linked_at: new Date().toISOString() })
        .eq('id', link.id);
      await sendTelegram(chatId, `✅ *Telegram berhasil terhubung!*\n\nNomor: \`${link.phone}\`\n\nMulai sekarang, link token pembelian Anda juga akan dikirim ke sini. Ketik /token untuk melihat token terakhir. 💖`);
      return respond();
    }

    if (text.startsWith('/token')) {
      const { data: link } = await admin
        .from('telegram_links')
        .select('phone')
        .eq('chat_id', chatId)
        .maybeSingle();
      if (!link?.phone) {
        await sendTelegram(chatId, '⚠️ Telegram Anda belum terhubung.\n\nBuat kode di halaman *Profil* website, lalu kirim `/start <KODE>`.');
        return respond();
      }
      const phone = normalizePhone(link.phone);
      const { data: deliveries } = await admin
        .from('token_deliveries')
        .select('replay_title,link,created_at')
        .eq('phone', phone)
        .order('created_at', { ascending: false })
        .limit(5);
      if (!deliveries?.length) {
        await sendTelegram(chatId, '📭 Belum ada token untuk nomor Anda.\n\nSetelah membeli dan pembayaran terkonfirmasi, token akan muncul di sini otomatis.');
        return respond();
      }
      const lines = deliveries.map((d: any, i: number) =>
        `${i + 1}. *${d.replay_title || 'Akses'}*\n🔗 ${d.link}`
      );
      await sendTelegram(chatId, `🎟️ *Token terakhir Anda:*\n\n${lines.join('\n\n')}`);
      return respond();
    }

    // /bantuan atau pesan lain
    await sendTelegram(chatId, HELP_TEXT);
  } catch (e) {
    console.error('telegram-webhook error:', String(e));
  }
  return respond();
});
