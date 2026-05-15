# Sistem Koin & Bottom Navigation

## 1. Database (migration)

**Tabel baru:**
- `coin_balances` — `user_id` (PK), `balance` int, `updated_at`. RLS: user lihat saldo sendiri, admin lihat semua.
- `coin_transactions` — `id`, `user_id`, `delta` int (positif = kredit, negatif = debit), `reason` text (`topup`, `purchase_show`, `purchase_replay`, `admin_grant`, `admin_revoke`), `related_order_id`, `related_show_id`, `related_replay_id`, `meta` jsonb, `created_at`. RLS: user lihat sendiri, admin manage.
- `coin_packages` — `id`, `label`, `price_idr` int, `coins` int, `sort_order`, `enabled`. Public read, admin manage.

**Kolom baru:**
- `active_shows.price_show_coins` int, `active_shows.price_replay_coins` int (0 = nonaktif).
- `replays.price_coins` int (0 = nonaktif).
- `orders.kind` text (`show`|`replay`|`replay_only`|`coin_topup`), `orders.coin_package_id`, `orders.coin_amount` int.

**Function:**
- `grant_coins(_user_id, _delta, _reason, _meta)` SECURITY DEFINER untuk transaksi atomik (insert tx + upsert balance).

## 2. Edge Functions

**Baru:**
- `create-coin-topup` — auth required, buat order Pakasir kind=`coin_topup` dengan `coin_amount` & `coin_package_id`.
- `purchase-with-coins` — auth required, verifikasi `phone`, lock baris `coin_balances`, debit, terbitkan token (`active_show_tokens` atau `replay_personal_tokens` max_devices=1), kirim WA via template yang sudah ada, catat di `coin_transactions` & `token_deliveries`. Idempotent per (user_id, show_id/replay_id) sambil order pending dihindari.

**Modifikasi (pakasir-webhook, check-pakasir-status, poll-pending-orders):**
- Saat `kind='coin_topup'` & paid: kredit koin lewat `grant_coins`, kirim WA "Top-up berhasil", JANGAN buat token.
- Selain itu: alur lama tetap.

## 3. Frontend

**Bottom Navigation (`src/components/BottomNav.tsx`):**
- Mobile only (`md:hidden`), fixed bottom, 4 tab: Home (`/`), Shows (`/shows`), Koin (`/koin`), Akun (`/auth` atau profile).
- Badge saldo koin di tab Koin (jika login).

**Halaman `/koin` (`src/pages/Koin.tsx`):**
- Wajib login (redirect `/auth`).
- Card saldo besar, daftar paket top-up (klik → `create-coin-topup` → tampilkan QR Pakasir reuse `BuyShowDialog`-style flow), riwayat transaksi.

**`BuyShowDialog` — tab pembayaran:**
- Tab "QRIS" (existing) — **wajib login**, jika belum login tampilkan tombol "Login dulu".
- Tab "Koin" — tampil hanya jika `price_*_coins > 0`. Tampilkan saldo, harga koin, tombol "Tukar Koin". Wajib phone (autofill dari profile, bisa edit). Klik → `purchase-with-coins` → toast sukses + token tampil.
- Default tab: Koin jika tersedia & saldo cukup; selain itu QRIS.

**Admin (`src/components/admin/CoinAdmin.tsx` + tab di `Admin.tsx`):**
- CRUD `coin_packages` (label, price_idr, coins, enabled, sort).
- Cari user (by email/phone) → lihat saldo & riwayat → tombol Tambah/Kurangi koin (alasan wajib).
- Daftar transaksi terbaru.
- Field harga koin (`price_show_coins`, `price_replay_coins`) ditambahkan di form edit show & replay (di komponen yang sudah ada).

## 4. Validasi & keamanan

- QRIS purchase: cek `useAuth().user`. Jika tidak login → tombol diganti "Login untuk beli dengan QRIS".
- Koin purchase: cek auth + phone non-empty (E.164 normalisasi sederhana 8/0/62 → 62…).
- `purchase-with-coins` & `grant_coins` di server: validasi balance ≥ price, debit dengan `UPDATE … WHERE balance >= price RETURNING` untuk anti race.
- Token koin: max_devices = 1 (sama seperti QRIS).
- Idempotency: cek apakah user sudah punya token aktif untuk show/replay tsb sebelum debit.

## 5. Catatan

- Pesan WA reuse template `wa_message_template` di `site_settings` (tidak diubah).
- Top-up berhasil pakai pesan terpisah sederhana ("✅ Top-up berhasil. +N koin. Saldo: X").
- Tidak mengubah alur Pakasir non-coin agar tetap kompatibel.
