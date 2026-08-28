// Webhook Telegram: bot @Real48time_bot — info show, pembelian QRIS Pakasir,
// dan pengiriman link token otomatis (sama seperti bot WhatsApp).
//
// Perintah:
//   /start [KODE] — mulai / hubungkan akun (kode dari halaman Profil)
//   /show         — daftar show aktif + harga + tombol beli
//   /replay       — daftar replay terbaru + harga
//   /beli         — panduan singkat pembelian
//   /status       — cek pembayaran order terakhir
//   /token        — link token pembelian terakhir
//   /akun         — status akun & nomor terhubung
//   /bantuan      — daftar perintah
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  sendTelegram, sendTelegramRich, sendTelegramPhoto, answerCallbackQuery, setBotCommands,
  deleteTelegramMessage,
  deriveTelegramWebhookSecret, safeEqual, type InlineKeyboard,
} from '../_shared/telegram.ts';

type Admin = ReturnType<typeof createClient>;

const SITE = 'https://realtime48stream.my.id';

/** Masa berlaku QRIS yang ditampilkan di Telegram. */
const QR_TTL_MS = 5 * 60 * 1000;

/** Identitas pembeli Telegram (tanpa nomor WhatsApp). */
const tgPhone = (chatId: number) => `tg${chatId}`;

function normalizePhone(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}

const rupiah = (n: number) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

function fmtDate(date?: string, time?: string) {
  if (!date) return '';
  try {
    const d = new Date(`${date}T${(time || '00:00:00').padEnd(8, ':00').slice(0, 8)}+07:00`);
    return d.toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }) + ' WIB';
  } catch { return date; }
}

const HELP_TEXT = [
  '🎬 *REALTIME48 · ReplayTime Bot*',
  '━━━━━━━━━━━━━━━━━━',
  '',
  '🎫 *Pembelian*',
  '`/show` — daftar show aktif + harga',
  '`/replay` — daftar replay + harga',
  '`/status` — cek pembayaran terakhir',
  '',
  '🔗 *Akun*',
  '`/start <KODE>` — hubungkan akun (kode dari halaman Profil)',
  '`/akun` — status akun & nomor terhubung',
  '`/token` — link token pembelian terakhir',
  '',
  '❓ `/bantuan` — tampilkan pesan ini',
  '',
  `🌐 Website: ${SITE}`,
].join('\n');

const BOT_COMMANDS = [
  { command: 'show', description: '🎤 Daftar show aktif & harga' },
  { command: 'replay', description: '🎬 Daftar replay & harga' },
  { command: 'status', description: '💳 Cek status pembayaran' },
  { command: 'token', description: '🎟️ Link token terakhir' },
  { command: 'akun', description: '👤 Status akun Telegram' },
  { command: 'bantuan', description: '❓ Bantuan & daftar perintah' },
];

function fnUrl(name: string) {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1/${name}`;
}

async function callFn(name: string, body: Record<string, unknown>) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res = await fetch(fnUrl(name), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data: data as any };
}

async function getLink(admin: Admin, chatId: number) {
  const { data } = await admin.from('telegram_links')
    .select('id,phone,chat_id').eq('chat_id', chatId).maybeSingle();
  return data as { id: string; phone: string; chat_id: number } | null;
}


async function listShows(admin: Admin, chatId: number) {
  const { data } = await admin.from('active_shows')
    .select('id,title,show_date,show_time,price_show,price_replay,replay_enabled,category,description')
    .eq('is_active', true)
    .order('show_date', { ascending: true })
    .order('show_time', { ascending: true })
    .limit(10);
  const shows = data ?? [];
  if (!shows.length) {
    await sendTelegramRich(chatId, '📭 Belum ada show aktif saat ini.\n\nCek lagi nanti ya — jadwal baru biasanya diumumkan H-1. 💖', [
      [{ text: '🌐 Buka Website', url: `${SITE}/shows` }],
    ]);
    return;
  }
  const lines: string[] = ['🎤 *SHOW AKTIF*', '━━━━━━━━━━━━━━━━━━', ''];
  const keyboard: InlineKeyboard = [];
  shows.forEach((s: any, i: number) => {
    lines.push(`*${i + 1}. ${s.title}*`);
    if (s.show_date) lines.push(`📅 ${fmtDate(s.show_date, s.show_time)}`);
    const priceShow = Number(s.price_show || 0);
    const priceReplay = Number(s.price_replay || 0);
    if (priceShow >= 100) lines.push(`🎟️ Nonton Live: *${rupiah(priceShow)}*`);
    if (s.replay_enabled && priceReplay >= 100) lines.push(`🎬 Replay: *${rupiah(priceReplay)}*`);
    lines.push('');
    const row: InlineKeyboard[number] = [];
    if (priceShow >= 100) row.push({ text: `🎟️ ${i + 1}. Live ${rupiah(priceShow)}`, callback_data: `b:s:${s.id}` });
    if (s.replay_enabled && priceReplay >= 100) row.push({ text: `🎬 Replay ${rupiah(priceReplay)}`, callback_data: `b:r:${s.id}` });
    if (row.length) keyboard.push(row);
  });
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('Tekan tombol di bawah untuk membeli. QRIS akan dikirim otomatis. 💳');
  keyboard.push([{ text: '🌐 Lihat di Website', url: `${SITE}/shows` }]);
  await sendTelegramRich(chatId, lines.join('\n'), keyboard);
}

async function listReplays(admin: Admin, chatId: number) {
  const { data } = await admin.from('replays')
    .select('id,title,date,price_idr,is_offline')
    .order('date', { ascending: false })
    .limit(8);
  const rows = (data ?? []).filter((r: any) => !r.is_offline);
  if (!rows.length) {
    await sendTelegramRich(chatId, '📭 Belum ada replay tersedia.', [[{ text: '🌐 Buka Website', url: SITE }]]);
    return;
  }
  const lines: string[] = ['🎬 *REPLAY TERBARU*', '━━━━━━━━━━━━━━━━━━', ''];
  const keyboard: InlineKeyboard = [];
  rows.forEach((r: any, i: number) => {
    const price = Number(r.price_idr || 0) >= 100 ? Number(r.price_idr) : 2000;
    const d = r.date ? new Date(r.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    lines.push(`*${i + 1}. ${r.title}*${d ? `\n📅 ${d}` : ''}\n🎬 *${rupiah(price)}*`, '');
    keyboard.push([{ text: `🎬 ${i + 1}. ${rupiah(price)}`, callback_data: `b:o:${r.id}` }]);
  });
  lines.push('━━━━━━━━━━━━━━━━━━', 'Tekan tombol untuk membeli replay. 💳');
  await sendTelegramRich(chatId, lines.join('\n'), keyboard);
}

async function createOrderAndSendQr(
  admin: Admin, chatId: number,
  kind: 'show' | 'replay' | 'replay_only', id: string,
) {
  // Tanpa nomor WhatsApp: order diikat langsung ke chat Telegram.
  const body: Record<string, unknown> = { kind, telegram_chat_id: chatId };

  if (kind === 'replay_only') {
    body.replay_id = id;
    const { data: rp } = await admin.from('replays').select('price_idr').eq('id', id).maybeSingle();
    const p = Number((rp as any)?.price_idr || 0);
    if (p >= 100) body.amount = p;
  } else body.show_id = id;
  const { ok, data } = await callFn('create-pakasir-order', body);
  if (!ok || !data?.qr_string) {
    const detail = String(data?.message || data?.error || 'gagal membuat order');
    await sendTelegram(chatId, `❌ Gagal membuat pembayaran.\n\n_${detail}_\n\nCoba lagi beberapa saat, atau beli lewat website: ${SITE}`);
    return;
  }
  const amount = Number(data.total_payment || data.amount || 0);
  const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=16&data=${encodeURIComponent(data.qr_string)}`;
  const deadline = new Date(Date.now() + QR_TTL_MS).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';
  const caption = [
    '💳 *PEMBAYARAN QRIS*',
    '━━━━━━━━━━━━━━━━━━',
    `💰 Total  : *${rupiah(amount)}*`,
    `⏳ Berlaku : *5 menit* (s/d ${deadline})`,
    '',
    '📲 Scan QR di atas dengan GoPay / DANA / OVO / ShopeePay / m-banking.',
    '⚠️ Bayar *tepat* sesuai nominal.',
    '',
    '✅ Setelah bayar, tekan tombol di bawah — link token & sandi replay langsung dikirim ke chat ini.',
  ].join('\n');
  const keyboard: InlineKeyboard = [
    [{ text: '✅ Saya Sudah Bayar', callback_data: `c:${data.order_id}` }],
  ];
  const sent = await sendTelegramPhoto(chatId, qrImg, caption, keyboard);
  let messageId = Number((sent.data as any)?.result?.message_id || 0);
  if (!sent.ok) {
    const alt = await sendTelegramRich(chatId, `${caption}\n\n🔗 QRIS: ${data.qr_url}`, keyboard);
    messageId = Number((alt.data as any)?.result?.message_id || 0);
  }
  scheduleQrExpiry(admin, chatId, messageId, String(data.order_id));
}

/** Setelah 5 menit QRIS dihapus dari chat bila belum dibayar. */
function scheduleQrExpiry(admin: Admin, chatId: number, messageId: number, orderUuid: string) {
  const task = (async () => {
    try {
      await new Promise((r) => setTimeout(r, QR_TTL_MS));
      const { data } = await admin.from('orders').select('status').eq('id', orderUuid).maybeSingle();
      if (String((data as any)?.status || '') === 'paid') return;
      if (messageId) await deleteTelegramMessage(chatId, messageId);
      await sendTelegramRich(
        chatId,
        '⌛ *QRIS sudah kadaluarsa*\n━━━━━━━━━━━━━━━━━━\n\nBatas waktu 5 menit terlewati, jadi kode QR tadi dihapus.\n\nSilakan lakukan pembelian ulang untuk mendapatkan QRIS baru. 💖',
        [[{ text: '🎤 Beli Lagi', callback_data: 'menu:show' }]],
      );
    } catch (e) {
      console.error('qr expiry error:', String(e));
    }
  })();
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(task); } catch { /* ignore */ }
}

async function checkOrder(admin: Admin, chatId: number, orderUuid: string) {
  const { data } = await callFn('check-pakasir-status', { order_id: orderUuid });
  const status = String(data?.status || '');
  if (status === 'paid') {
    await sendTelegram(chatId, '✅ *Pembayaran terkonfirmasi!*\n\nLink token sedang dikirim ke chat ini. Kalau belum muncul dalam 1 menit, ketik `/token`. 💖');
  } else {
    await sendTelegramRich(chatId, '⏳ *Pembayaran belum terdeteksi.*\n\nKalau sudah bayar, tunggu ±1 menit lalu tekan tombol di bawah lagi.', [
      [{ text: '🔄 Cek Lagi', callback_data: `c:${orderUuid}` }],
    ]);
  }
}


/** Semua identitas pembeli untuk chat ini: identitas Telegram + nomor WA (bila terhubung). */
async function identities(admin: Admin, chatId: number): Promise<string[]> {
  const list = [tgPhone(chatId)];
  const link = await getLink(admin, chatId);
  if (link?.phone && !/^tg\d+$/.test(link.phone)) list.push(normalizePhone(link.phone));
  return list;
}

async function showStatus(admin: Admin, chatId: number, phones: string[]) {
  const { data } = await admin.from('orders')
    .select('id,item_title,amount,status,created_at')
    .in('user_phone', phones)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (!data) {
    await sendTelegram(chatId, '📭 Belum ada pembelian dari akun Telegram ini.\n\nKetik `/show` untuk melihat show yang tersedia.');
    return;
  }
  if (data.status === 'paid') {
    await sendTelegramRich(chatId, `✅ *${data.item_title}*\nStatus: *LUNAS* (${rupiah(Number(data.amount))})\n\nKetik \`/token\` untuk melihat link akses.`);
    return;
  }
  await checkOrder(admin, chatId, data.id as string);
}

async function sendTokens(admin: Admin, chatId: number, phones: string[]) {
  const { data } = await admin.from('token_deliveries')
    .select('replay_title,link,created_at')
    .in('phone', phones).order('created_at', { ascending: false }).limit(5);
  if (!data?.length) {
    await sendTelegram(chatId, '📭 Belum ada token untuk akun ini.\n\nSetelah pembayaran terkonfirmasi, token muncul di sini otomatis.');
    return;
  }
  const lines = data.map((d: any, i: number) => `${i + 1}. *${d.replay_title || 'Akses'}*\n🔗 ${d.link}`);
  await sendTelegram(chatId, `🎟️ *TOKEN TERAKHIR ANDA*\n━━━━━━━━━━━━━━━━━━\n\n${lines.join('\n\n')}`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
  if (!TELEGRAM_API_KEY) return new Response('Not configured', { status: 500 });
  const expectedSecret = await deriveTelegramWebhookSecret(TELEGRAM_API_KEY);
  const isSetup = req.headers.get('x-bot-setup') === expectedSecret;
  if (!isSetup && !safeEqual(req.headers.get('X-Telegram-Bot-Api-Secret-Token'), expectedSecret)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const respond = (extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({ ok: true, ...extra }), { headers: { 'Content-Type': 'application/json' } });

  if (isSetup) {
    const res = await setBotCommands(BOT_COMMANDS);
    return respond({ commands: res.data });
  }

  let update: any;
  try { update = await req.json(); } catch { return respond(); }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // ===== Tombol inline =====
    const cq = update.callback_query;
    if (cq) {
      const chatId = cq.message?.chat?.id;
      const data = String(cq.data || '');
      await answerCallbackQuery(cq.id, 'Diproses…');
      if (!chatId) return respond();
      if (data === 'menu:show') { await listShows(admin, chatId); return respond(); }
      if (data === 'menu:replay') { await listReplays(admin, chatId); return respond(); }
      if (data.startsWith('c:')) {
        await checkOrder(admin, chatId, data.slice(2));
        return respond();
      }
      if (data.startsWith('b:')) {
        const [, type, id] = data.split(':');
        const kind = type === 's' ? 'show' : type === 'r' ? 'replay' : 'replay_only';
        await sendTelegram(chatId, '⏳ Membuat QRIS pembayaran…');
        await createOrderAndSendQr(admin, chatId, kind as any, id);
      }
      return respond();
    }

    const message = update.message ?? update.edited_message;
    const chatId: number | undefined = message?.chat?.id;
    if (!chatId) return respond();

    // ===== Bagikan kontak = hubungkan nomor =====
    const contact = message.contact;
    if (contact) {
      if (contact.user_id && Number(contact.user_id) !== Number(message.from?.id)) {
        await sendTelegram(chatId, '❌ Nomor yang dibagikan harus nomor Anda sendiri.');
        return respond();
      }
      const phone = normalizePhone(String(contact.phone_number || ''));
      if (!/^628\d{8,11}$/.test(phone)) {
        await sendTelegram(chatId, '❌ Nomor tidak valid. Gunakan nomor WhatsApp Indonesia.');
        return respond();
      }
      await admin.from('telegram_links').upsert(
        { phone, chat_id: chatId, linked_at: new Date().toISOString() },
        { onConflict: 'phone' },
      );
      await sendTelegramRich(
        chatId,
        `✅ *Berhasil terhubung!*\n\n📱 Nomor: \`${phone}\`\n\nSekarang Anda bisa membeli show langsung di sini. Ketik \`/show\` untuk melihat daftarnya. 💖`,
        undefined,
        { reply_markup: { remove_keyboard: true } },
      );
      return respond();
    }

    const text: string = String(message?.text ?? '').trim();
    if (!text) return respond();
    const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, '');

    if (cmd === '/start') {
      const code = text.split(/\s+/)[1]?.trim().toUpperCase() || '';
      if (!code) {
        const link = await getLink(admin, chatId);
        await sendTelegramRich(
          chatId,
          `👋 *Selamat datang di ReplayTime!*\n━━━━━━━━━━━━━━━━━━\n\nBeli tiket show & replay langsung dari Telegram — bayar QRIS, link token dikirim otomatis ke sini.\n\n${link?.phone ? `✅ Terhubung: \`${link.phone}\`` : '⚠️ Akun belum terhubung. Bagikan nomor WhatsApp Anda lewat tombol di bawah.'}\n\n${HELP_TEXT}`,
          [[{ text: '🎤 Lihat Show', callback_data: 'menu:show' }], [{ text: '🌐 Website', url: SITE }]],
          link?.phone ? {} : {
            reply_markup: {
              keyboard: [[{ text: '📱 Bagikan Nomor WhatsApp', request_contact: true }]],
              resize_keyboard: true, one_time_keyboard: true,
            },
          },
        );
        return respond();
      }
      const { data: link } = await admin.from('telegram_links')
        .select('id,phone').eq('link_code', code).maybeSingle();
      if (!link) {
        await sendTelegram(chatId, '❌ Kode tidak ditemukan atau sudah tidak berlaku.\n\nBuat kode baru di halaman *Profil* website, lalu kirim `/start <KODE>` lagi.');
        return respond();
      }
      await admin.from('telegram_links')
        .update({ chat_id: chatId, linked_at: new Date().toISOString() }).eq('id', link.id);
      await sendTelegram(chatId, `✅ *Telegram berhasil terhubung!*\n\n📱 Nomor: \`${link.phone}\`\n\nKetik \`/show\` untuk melihat show yang tersedia. 💖`);
      return respond();
    }

    if (cmd === '/show' || cmd === '/shows' || text === 'menu:show') { await listShows(admin, chatId); return respond(); }
    if (cmd === '/replay') { await listReplays(admin, chatId); return respond(); }

    if (cmd === '/beli') {
      await sendTelegramRich(chatId, [
        '🛒 *CARA BELI DI TELEGRAM*',
        '━━━━━━━━━━━━━━━━━━',
        '1️⃣ Hubungkan nomor WhatsApp (`/akun`)',
        '2️⃣ Ketik `/show` atau `/replay`',
        '3️⃣ Tekan tombol harga → bot kirim QRIS',
        '4️⃣ Bayar, lalu tekan *Saya Sudah Bayar*',
        '5️⃣ Link token & sandi dikirim otomatis ke sini 💖',
      ].join('\n'), [[{ text: '🎤 Lihat Show', callback_data: 'menu:show' }]]);
      return respond();
    }

    if (cmd === '/akun') {
      const link = await getLink(admin, chatId);
      const wa = link?.phone && !/^tg\d+$/.test(link.phone) ? link.phone : '';
      await sendTelegramRich(chatId, [
        '👤 *AKUN TELEGRAM*',
        '━━━━━━━━━━━━━━━━━━',
        '✅ Siap membeli — *tanpa perlu nomor WhatsApp*.',
        wa ? `📱 WhatsApp terhubung: \`${wa}\`` : '📱 WhatsApp: belum terhubung (opsional)',
        '',
        'Semua link token & sandi replay dikirim langsung ke chat ini. 💖',
      ].join('\n'), [[{ text: '🎤 Lihat Show', callback_data: 'menu:show' }]]);
      return respond();
    }

    if (cmd === '/status') { await showStatus(admin, chatId, await identities(admin, chatId)); return respond(); }
    if (cmd === '/token') { await sendTokens(admin, chatId, await identities(admin, chatId)); return respond(); }

    await sendTelegramRich(chatId, HELP_TEXT, [
      [{ text: '🎤 Show Aktif', callback_data: 'menu:show' }],
      [{ text: '🌐 Website', url: SITE }],
    ]);
  } catch (e) {
    console.error('telegram-webhook error:', String(e));
  }
  return respond();
});
