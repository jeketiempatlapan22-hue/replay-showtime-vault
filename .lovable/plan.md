# Rencana Perbaikan Membership, Unlock & Linter

## 1. Akar masalah error "membuka akses replay/live"

- Edge `unlock-live` & `verify-password` mengembalikan `reason` baru (`bad_membership_password`, `expired`, `not_started`, `scope`, `device_limit`, `no_device`) yang **tidak dipetakan** di `Live.tsx` / Akses → user lihat pesan generic "Gagal membuka akses live", terlihat seperti error.
- `unlock-live` saat membership: jika `mtoken` ada tapi `browser_id` kosong → `bind` gagal silent → user terkunci.
- `verify-password` (replay) tidak menolak konsisten saat `browser_id` kosong (anti-spoof bocor), dan tidak menambah `last_seen` → device pertama bisa diganti dari browser lain karena tidak ada penegak unique.
- Tabel `membership_token_devices` tidak punya `UNIQUE(token_id)` sehingga race-condition memungkinkan 2 device terikat.

## 2. Perubahan yang dilakukan

### A. Database (migration)
- Tambah `UNIQUE(token_id)` pada `membership_token_devices` (1 device per token, dijamin di DB).
- Tambah index `(browser_id)` untuk pencarian cepat.
- Tambah kolom `last_seen` sudah ada → pakai untuk audit.
- Perbaiki **semua linter Supabase**:
  - Tabel RLS-enabled tanpa policy (`login_attempts`) → tambah policy admin-only.
  - Hapus policy `USING (true)` non-SELECT (mis. `ratings UPDATE`, `blocked_browsers INSERT`) → ganti dengan policy edge-function-only (service role) atau scoping yang aman.
  - `SECURITY DEFINER` function publik → REVOKE EXECUTE FROM anon untuk fungsi yang tidak perlu publik (`record_login_attempt`, `check_login_lock`, `prune_*`, `update_*_timestamp`); biarkan `get_live_status`, `get_active_live`, `email_for_phone`, `phone_exists`, `has_role`, `increment_view_count` (dipakai client / RLS).
  - Public bucket listing → tambah policy `storage.objects SELECT` di-scope hanya ke bucket dan tolak listing root (atau set bucket non-public + signed URLs jika tidak dipakai listing). Pilih opsi yang **tidak merubah** akses gambar member/card → pakai policy SELECT spesifik per `bucket_id` sehingga listing tetap diblok.

### B. Edge functions (anti-spoof konsisten)
- `unlock-live` & `verify-password`:
  - Wajib `browser_id` non-kosong saat `mtoken` dipakai → reject `no_device`.
  - Hash `browser_id` (sha256 + salt server) sebelum disimpan/dibanding → mempersulit pemalsuan dengan menebak nilai dari client.
  - Pakai `upsert` dengan `onConflict: token_id` untuk memenuhi unique → jika sudah ada row dengan `browser_id` lain → tolak `device_limit`.
  - Update `last_seen` setiap unlock berhasil.
  - Sertakan `manual_resets_used`, `manual_resets_max`, `expires_at` di response sukses.
- `membership-self-reset`: tambahkan info `used`, `max`, `remaining` dan reject jika `browser_id` kosong.

### C. UI Live (`src/pages/Live.tsx`)
- Petakan semua `reason` ke pesan Indonesia yang jelas.
- Setelah unlock membership berhasil: tampilkan kartu kecil "Membership aktif sampai DD-MM-YYYY · Reset perangkat: X/Y terpakai · Sisa Z" + tombol **Reset perangkat ini**.
- Tombol self-reset pakai `mtoken` & `mp` dari URL/sessionStorage (tanpa `prompt()`).
- **Viewer counter**: ganti perhitungan presence — gunakan `Object.values(state).flat().length === 0 ? 0 : Object.keys(state).length` tetap, tapi tambahkan presence-key unik per tab `${bid}:${tabId}` lalu dedupe by prefix `bid` di client → mencegah hilang count saat 1 user buka 2 tab dan mencegah double-count saat reconnect. Tambah heartbeat `track({ at })` setiap 25s & `recount` pada `join`/`leave`.

### D. Admin (`MembershipAdmin.tsx`)
- Satu layar Tab Membership, per row aksi: **Copy link**, **Revoke**, **Reset perangkat** (delete devices), **Reset kuota perangkat** (set `manual_resets_used=0`), **Hapus**.
- Tampilkan device terikat (browser_id terpotong + `last_seen`) ekspandable.

## 3. Tidak akan diubah
- File player (`HlsPlayer.tsx`, `EmbedPlayer.tsx`), embed, autoplay, kontrol, chat, sumber, sorting replay/live.
- Skema kolom `replays`, `active_shows`, `live_config_private`.

## 4. Verifikasi
- Jalankan `supabase--linter` lagi → 0 WARN/ERROR (atau hanya yang dipertahankan dengan justifikasi di security memory).
- Manual test: unlock dengan token yang sudah terikat ke browser lain → dapat pesan "Batas perangkat tercapai", lalu self-reset → berhasil dan kuota berkurang di UI.
- Buka 2 tab → viewer count tetap 1; buka di 2 device → 2.

## Detail teknis singkat
```
membership_token_devices
  UNIQUE(token_id)                -- enforce 1 device
  hashed browser_id (sha256+salt) -- anti-spoof
  last_seen timestamp             -- audit

unlock response (sukses, mtoken):
  { valid, ...cfg, membership: { expires_at, resets_used, resets_max, remaining } }
```
