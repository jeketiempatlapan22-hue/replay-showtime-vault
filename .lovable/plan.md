# Penyempurnaan Reseller: TTL, Audit, Membership

## 1. TTL link reseller (otomatis expired)
- **Show** → `expires_at = (show_date + show_time)::timestamptz + interval '8 hours'` (akhir window jadwal show, sama seperti window auto-schedule live yang sudah ada).
- **Replay** → `expires_at = now() + interval '1 year'`.
- **Membership** → `expires_at = now() + interval '{days} days'` (2–40).

Penegakan:
- Show: `unlock-live` **sudah** memvalidasi `expires_at` & `wrong_show` (line 134–137). **Tidak ada perubahan pada halaman Live atau player.** Cukup mengisi kolom saat token dibuat.
- Replay: tambah cek `expires_at` di `get-replay-source` saat verifikasi `replay_personal_tokens`.
- Membership: sudah ada via `expires_at` di `membership_tokens` (alur existing menolak token expired).

Migrasi DB:
- `ALTER TABLE replay_personal_tokens ADD COLUMN expires_at timestamptz` (nullable; lama = abadi, baru = +1 tahun).

## 2. Scope per-show (sudah aman)
`unlock-live` line 134: `if (t.show_id !== resolvedShowId) → wrong_show`. Token show A **tidak bisa** dipakai untuk show B. Tidak ada perubahan diperlukan. Plan ini hanya mencatat sebagai verifikasi.

## 3. Reseller buat link Membership (2–40 hari)
UI tab baru **"Membership"** di `src/pages/Reseller.tsx`:
- List paket dari `membership_packages` (nama, max_devices, includes_replays, replay_info).
- Input **Durasi (hari)** per kartu (default 30, validasi client 2–40).
- Tombol **"Buat & Salin Link Membership"** → hit edge function → copy pesan WA → dialog ringkasan.

Edge function baru `supabase/functions/reseller-create-membership/index.ts`:
- Verifikasi `phone+pin` via `reseller_verify`.
- Validasi `package_id` ada; `days` integer 2..40.
- Generate token 12 char + password 8 char (pola sama `finalize_membership_order`).
- Insert `membership_tokens`:
  - `token`, `password`, `phone` (reseller), `label='reseller:'+phone+' / '+pkg.name`,
  - `duration_days=days`, `starts_at=now()`, `expires_at=now()+days*1day`,
  - `max_devices=pkg.max_devices`, `includes_replays=pkg.includes_replays`,
  - `replay_info=pkg.replay_info`, `package_id=pkg.id`, `created_by='reseller:'+phone`.
- **Tidak** menyentuh `membership_orders` / `quota_reserved`.
- Render pesan WA (re-use format dari `send-membership-token-wa`): nama paket, token, sandi, max_devices, durasi, expired (format Indonesia), `replay_info` dari paket, link site.
- Insert audit log (lihat §4).
- Output: `{ ok, token, password, expires_at, message }`.

## 4. Halaman Audit Reseller (Admin)
Migrasi tabel baru `reseller_audit_log`:
```
id uuid pk default gen_random_uuid(),
created_at timestamptz default now(),
reseller_phone text not null,
reseller_label text default '',
kind text not null check (kind in ('show','replay','membership')),
target_id uuid,
target_title text default '',
token text default '',
expires_at timestamptz,
duration_days int,
meta jsonb default '{}'::jsonb
```
GRANT: `service_role` ALL; `authenticated` SELECT; tanpa anon. RLS: `has_role(auth.uid(),'admin')` untuk SELECT (insert via service role).

Edge functions `reseller-create-token` & `reseller-create-membership` insert satu baris audit setelah berhasil membuat token.

UI Admin — tab baru **"Audit Reseller"** di `src/pages/Admin.tsx`. Komponen baru `src/components/admin/ResellerAuditAdmin.tsx`:
- Filter: search nomor/label reseller, dropdown jenis (Semua/Show/Replay/Membership), Refresh.
- List card/baris: waktu, +nomor (label), badge jenis, judul target, durasi (membership), expired, token (mask + tombol salin).
- Default 200 terakhir, sort `created_at DESC`. Paging client-side.

## 5. Update `reseller-create-token`
- Saat `kind='show'`: ambil `show_date,show_time` lalu set `expires_at = (date+time) + 8h`.
- Saat `kind='replay'`: set `expires_at = now()+1 year`.
- Insert kolom `expires_at` ke row token.
- Pesan WA tambah baris "⏳ Berlaku sampai: {tanggal/jam Indonesia}".
- Insert audit log.

## File yang dibuat/diubah
- Migrasi: `replay_personal_tokens.expires_at` + tabel `reseller_audit_log` (+ GRANT + RLS).
- `supabase/functions/reseller-create-token/index.ts` — set `expires_at` + audit log + baris expired di pesan WA.
- `supabase/functions/reseller-create-membership/index.ts` — **baru**.
- `supabase/functions/get-replay-source/index.ts` — tambah cek `expires_at` (select kolomnya, tolak jika lewat).
- `src/pages/Reseller.tsx` — tab Membership + label TTL di tombol.
- `src/pages/Admin.tsx` — daftar tab "Audit Reseller".
- `src/components/admin/ResellerAuditAdmin.tsx` — **baru**.

## Yang TIDAK diubah (sesuai instruksi)
- `src/pages/Live.tsx` dan seluruh komponen player (HlsPlayer, EmbedPlayer, YouTubePlayer).
- `supabase/functions/unlock-live/index.ts` — tidak diubah (sudah memvalidasi expires_at & wrong_show).
- Aturan/kuota paket membership user reguler (`membership_orders`, `reserve_membership_slot`).
