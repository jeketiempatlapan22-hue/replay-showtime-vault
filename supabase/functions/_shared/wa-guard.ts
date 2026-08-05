// Anti-spam guard for automated WhatsApp (Fonnte) sends.
//
// Masalah: pakasir-webhook, check-pakasir-status (dipanggil berulang dari
// browser user) dan poll-pending-orders bisa berjalan bersamaan untuk order
// yang sama. Pengecekan `token_sent_at` / `wa_outbox` dilakukan SEBELUM kirim,
// jadi beberapa proses paralel semuanya lolos -> user menerima pesan berkali-kali.
//
// Solusi: klaim atomik di database (tabel wa_send_claims + RPC claim_wa_send).
// Kunci = nomor tujuan + hash isi pesan. Hanya satu proses yang mendapat klaim;
// yang lain langsung dilewati. Bila pengiriman gagal, klaim boleh dicoba lagi
// setelah RETRY_SECONDS (default 15 menit).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RETRY_SECONDS = 900;

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function normalize(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) return '62' + d.slice(1);
  if (d.startsWith('8')) return '62' + d;
  return d;
}

async function hashMessage(message: string) {
  const bytes = new TextEncoder().encode(message);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).slice(0, 12)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function waDedupKey(phone: string, message: string) {
  return `${normalize(phone)}:${await hashMessage(message)}`;
}

/** true = boleh kirim (klaim didapat), false = sudah/sedang dikirim proses lain. */
export async function claimWaSend(key: string): Promise<boolean> {
  try {
    const { data, error } = await adminClient()
      .rpc('claim_wa_send', { _key: key, _retry_seconds: RETRY_SECONDS });
    if (error) return true; // jangan blokir pengiriman kalau guard bermasalah
    return data === true;
  } catch {
    return true;
  }
}

export async function markWaSent(key: string): Promise<void> {
  try {
    await adminClient().rpc('mark_wa_sent', { _key: key });
  } catch { /* ignore */ }
}
