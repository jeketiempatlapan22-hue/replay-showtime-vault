## Goals

1. Stop bot WhatsApp dari spam/balasan beruntun ke nomor yang sama.
2. Tambah jenis token replay baru: **token satuan** (1 user, 1 device).
3. Pertahankan **token master publik** (link yang bisa dibuka banyak orang) yang sudah ada.
4. Bot bisa membuat kedua jenis token via WhatsApp.
5. Rapikan halaman Admin dengan menu hamburger (drawer) menggantikan deretan tab.
6. Jangan ganggu pemutaran replay yang sudah berjalan.

---

## 1. Rate limit bot per nomor

**Database — migrasi baru:**
```
CREATE TABLE bot_rate_limit (
  phone text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bot_rate_limit ENABLE ROW LEVEL SECURITY;
-- (no public policies; service role only)
```

**Edge function `fonnte-webhook`:**
- Setelah dedup, sebelum membalas: cek `bot_rate_limit.phone = phoneNorm`.
- Bila `now() - last_sent_at < 8 detik` → return tanpa membalas (silent drop).
- Bila lolos → upsert `last_sent_at = now()` dan lanjut proses.
- Janitor: hapus baris > 10 menit.

Kombinasi dengan `bot_inbox_dedup` yang sudah ada memastikan: webhook duplikat diabaikan, dan kalau pun lolos, satu nomor maksimal dapat 1 balasan per 8 detik.

---

## 2. Token satuan replay (1 user / 1 device)

Token master publik yang sudah ada (`replays.access_token`) tetap dipertahankan apa adanya — link ini bisa dibuka banyak orang dan banyak device.

**Tabel baru:**
```
CREATE TABLE replay_personal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  replay_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  label text DEFAULT '',
  max_devices int NOT NULL DEFAULT 1,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE replay_token_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES replay_personal_tokens(id) ON DELETE CASCADE,
  browser_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(token_id, browser_id)
);
```
RLS: admin-only ALL untuk kedua tabel; insert device dilakukan oleh service role di edge function.

**Edge function `get-replay-source` (update):**
- Kalau `access_token` cocok dengan `replays.access_token` → master path (perilaku lama, tanpa device lock).
- Kalau tidak cocok, lookup di `replay_personal_tokens`:
  - jika ditemukan, tidak revoked, dan `replay_id` cocok → wajib `browser_id` di body. Cek/insert ke `replay_token_devices` mirip pola `unlock-live`. Bila count ≥ `max_devices` dan device belum terdaftar → tolak (`device_limit`).
  - Bila lolos → kembalikan source (sama format seperti master).

**Frontend `Akses.tsx` & `Index.tsx`:**
- `Akses.tsx` menerima token apa pun. Validasi ringan: cek `replays.id`. Tidak lagi memblokir bila `access_token != token` (token bisa berasal dari `replay_personal_tokens`). Validasi penuh tetap dilakukan server-side oleh `get-replay-source`.
- Saat panggil `getReplaySource`, kirim juga `browser_id` (dari `getBrowserId()`) supaya device-lock berfungsi. Kalau response `device_limit`, tampilkan toast "Token sudah dipakai di perangkat lain".

Halaman replay/embed/HLS/YouTube tidak diubah — flow tetap "sessionStorage token → fetch source → render player".

**Admin UI — sub-section di tab Replay:**
- Pada baris setiap replay, tombol "Token Satuan" buka dialog: list token personal (label, dipakai/limit, revoke, copy link `/akses?token=...&replay=...`, hapus) + form tambah (label + max_devices, default 1).

---

## 3. Bot bisa buat kedua jenis token

Tambahkan command (insert ke `bot_commands`):
- `/buattoken <kode>` (sudah ada) → master publik (perilaku lama, tetap).
- `/tokensatuan <kode> [label]` → buat 1 token personal (max_devices=1), balas link `/akses`.
  - Tetap admin-only (`bot_admins` whitelist).
  - Catat ke `token_deliveries` dengan `source='bot'`.
- `/menu` di-update agar menampilkan command baru.

---

## 4. Admin panel: menu hamburger

**Perubahan `src/pages/Admin.tsx`:**
- Hapus `TabsList` panjang (10 trigger).
- Ganti dengan: tombol hamburger di header → buka `Sheet` (`@/components/ui/sheet`) dari kiri berisi daftar menu vertikal (Replay, Show, Live, Member, Bot WA, Riwayat, Preview, Komentar, Blokir, Setelan), tiap item dengan icon + label.
- Header juga menampilkan label tab aktif (mis. "Admin · Replay").
- Pertahankan komponen `Tabs` tapi controlled via state `activeTab`; klik di drawer set state lalu tutup drawer.
- `TabsContent` masing-masing tetap dirender seperti sekarang — tidak menyentuh isi tab supaya tidak ada regresi.

---

## Technical details

- Files diubah: `supabase/functions/fonnte-webhook/index.ts`, `supabase/functions/get-replay-source/index.ts`, `src/pages/Akses.tsx`, `src/pages/Index.tsx` (kirim browser_id), `src/pages/Admin.tsx` (drawer + sub-dialog token satuan), `src/components/admin/BotAdmin.tsx` (seed command baru).
- Files baru: 1 migrasi (3 tabel + RLS + seed `bot_commands` `/tokensatuan`), `src/components/admin/ReplayPersonalTokensDialog.tsx`.
- Tidak menyentuh `YouTubePlayer`, `HlsPlayer`, `EmbedPlayer`, `ReplayCardComponent` — pemutaran replay tidak terganggu.
- Memori `mem://security/source-protection` tetap valid: `youtube_id` / `m3u8_url` hanya keluar via `get-replay-source` setelah validasi.