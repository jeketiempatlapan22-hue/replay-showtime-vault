# Rencana: Admin Buat User Membership Manual

Fitur baru di tab **User Membership** pada Admin Panel, tanpa menyentuh halaman Live, player, playlist, dan aturan Fonnte.

## 1. Tombol "Buat User Membership" (Admin)
Di `MembershipUsersAdmin.tsx`, tambah tombol "+ Buat Membership" di header. Membuka dialog dengan field:
- Email user
- Nomor WhatsApp (auto-normalisasi 62xxx)
- Pilih paket (dropdown dari `membership_packages`)
- Durasi (hari) — **bisa diubah bebas oleh admin**, default ikut paket
- Max devices (prefill dari paket, editable)
- Termasuk replay (toggle, prefill paket)
- Info replay (textarea, prefill `reseller_membership_replay_info` / paket)
- Catatan opsional

Saat disubmit → panggil RPC baru `admin_create_membership_user` yang:
1. Generate `token` (12 char) dan `password` (sandi replay 8 char) unik.
2. Insert ke `membership_tokens` dengan `starts_at = now()`, `expires_at = now() + durasi`, paket, max_devices, includes_replays, replay_info.
3. Insert ke `membership_orders` status `paid` (kind=`membership`), `paid_at = now()`, link ke token & paket, simpan email + phone.
4. Catat ke `admin_action_logs`.
5. Return `{ token, password, link, message, order_id }`.

Link memakai `siteOrigin.ts` → `https://realtime48stream.my.id/live?mtoken=...&mp=...`.

## 2. Tombol Kirim WA
Setelah create sukses dialog menampilkan preview pesan + tombol **Kirim WA**. Juga tambah tombol **Kirim WA** di tiap baris list user membership (di samping Edit/Reset/Hapus).

- Memakai fungsi edge yang sudah ada: `send-membership-token-wa` (dipakai oleh flow pembelian normal) supaya template pesan **identik** dengan user yang membeli via web (mengambil `wa_membership_template` dari `site_settings`, mengisi `{package_name} {link} {expires_at} {duration_days} {max_devices} {replay_info_block}`).
- Tambah/ pastikan fungsi menerima `order_id` ATAU `token_id` dan langsung kirim ke phone tersimpan. Bypass pause/circuit-breaker untuk trigger manual admin (sudah pola yang ada).
- Toast tampilkan response Fonnte mentah bila gagal.

## 3. Edit Durasi per User (sudah ada — diperluas)
Form Edit yang sudah ada di `MembershipUsersAdmin` sudah mendukung ubah `expires_at`. Tambah field "Perpanjang +N hari" sebagai helper cepat (geser `expires_at = max(now, current_expires) + N hari`). Tetap pakai RPC `admin_update_membership_user` yang sudah ada.

## 4. Penanganan Expiry untuk User
Tujuan: token kadaluarsa benar-benar tidak bisa dipakai, dan halaman `/membership` kembali ke mode "Beli Membership".

- `useActiveMembership.ts` sudah filter `expires_at > now()` → cukup. Tambahkan auto-refresh tiap 60 detik supaya UI berpindah ke mode beli begitu lewat expiry tanpa reload.
- `MembershipDashboard.tsx`: ketika `days_remaining <= 0` atau `expires_at <= now()`, tampilkan banner "Membership berakhir" dan tombol "Beli Membership Lagi" yang membuka daftar paket (set state `showPackages=true` di `Membership.tsx`).
- Bersihkan `localStorage` credential lama via `clearMembershipCredentials()` saat expired.
- Pastikan gate akses Live: server-side cek `expires_at > now() AND NOT revoked` di RPC `unlock_membership_token` / fungsi `unlock-live` (verifikasi singkat; tidak ubah aturan player Live). Jika sudah benar, tidak ada perubahan; jika tidak, tambah filter expiry (tanpa mengubah logika player).

## 5. File Yang Diubah / Dibuat

**Migrasi baru** `supabase/migrations/20260617_admin_create_membership.sql`:
- RPC `admin_create_membership_user(_email, _phone, _package_id, _days, _max_devices, _includes_replays, _replay_info, _note)` → SECURITY DEFINER, cek `has_role(auth.uid(),'admin')`, return JSON.
- (jika perlu) tambah index pada `membership_orders(token_id)`.

**Edge function**:
- `supabase/functions/send-membership-token-wa/index.ts` — pastikan dapat dipanggil ulang oleh admin dengan `order_id`, tetap pakai template `wa_membership_template`.

**Frontend**:
- `src/components/admin/MembershipUsersAdmin.tsx` — dialog create + tombol Kirim WA + tombol Perpanjang.
- `src/components/MembershipDashboard.tsx` — handling expired + tombol beli lagi.
- `src/pages/Membership.tsx` — refresh expiry, tampilkan paket saat expired.
- `src/hooks/useActiveMembership.ts` — polling/refresh tiap 60 dtk.

## 6. Yang TIDAK Disentuh
- Halaman `/live` (player, playlist, viewer count, aturan kualitas).
- Logika Fonnte (circuit breaker, polling, webhook).
- Edge functions lain di luar `send-membership-token-wa`.
- Template pesan WA (hanya menggunakan yang sudah ada di `site_settings.wa_membership_template`).
