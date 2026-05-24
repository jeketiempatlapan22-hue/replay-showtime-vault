
# Fitur Pembelian Show Membership

## Ringkasan
Membangun sistem pembelian membership di atas infrastruktur `membership_tokens` yang sudah ada. Admin dapat membuat **banyak paket** dengan kuota, harga IDR & koin, dan deskripsi keuntungan + info replay (info replay hanya dikirim via WA saat user sudah berhasil membeli). User melakukan checkout di halaman baru `/membership` dengan input email + nomor HP, lalu otomatis menerima link token membership aktif 30 hari yang bisa membuka semua live + countdown show terdekat.

---

## 1. Halaman Baru `/membership`

Halaman publik yang menampilkan semua paket membership aktif:
- **Hero section**: judul "Show Membership", subtitle penjelasan singkat
- **Card per paket** (grid responsive):
  - Nama paket, durasi (cth: "30 Hari")
  - Harga IDR (cth: "Rp 99.000") & harga koin (cth: "atau 990 koin")
  - **Deskripsi keuntungan** (rich text dari admin: cth: "✓ Akses semua live show selama 30 hari", "✓ Tonton dari 1 perangkat", dst)
  - Indikator kuota realtime: "Tersisa 12 dari 30 slot"
  - Progress bar visual
  - Status badge: `AKTIF` (hijau) / `SOLD OUT` (merah) / `DITUTUP` (abu)
  - 2 tombol: **Beli (QRIS)** dan **Tukar Koin** (disabled jika user belum login / koin kurang / kuota habis / ditutup)
- **Realtime sync**: subscribe ke perubahan `membership_packages` & `orders` → kuota berkurang langsung tanpa refresh.
- Jika **semua paket sold out / ditutup**, tampilkan empty state ramah ("Membership belum dibuka, pantau terus 💖").

### Dialog Checkout
Sebelum bayar, muncul dialog wajib isi:
- **Email** (validasi format, auto-prefill dari profil jika login)
- **Nomor WhatsApp** (validasi 62xxx, auto-prefill dari profil)
- Tombol konfirmasi → lanjut ke QRIS / debit koin

---

## 2. Admin Panel – Tab "Membership Packages" (baru)

Lokasi: `src/components/admin/MembershipPackagesAdmin.tsx`, ditambahkan sebagai tab di `Admin.tsx` (terpisah dari tab MembershipAdmin yang existing — itu untuk token manual).

**Form buat/edit paket**:
- Nama paket (cth: "Premium 30 Hari")
- Durasi hari (default 30)
- Harga IDR (untuk pakasir)
- Harga koin
- Kuota total (cth: 30)
- Max device per token (default 1)
- **Deskripsi keuntungan** (textarea multi-baris, ditampilkan di kartu paket)
- **Info Replay** (textarea, **hanya dikirim ke WA setelah user membeli** — tidak tampil di kartu publik)
- Toggle `Buka/Tutup` (status: `open` / `closed`)
- Toggle `includes_replays` (untuk membership_tokens.includes_replays)

**Tabel daftar paket**:
- Kolom: Nama, Harga, Kuota Terpakai/Total, Status, Aksi
- Aksi: Edit, Buka/Tutup (toggle realtime), Hapus
- Kolom "Pesanan" → buka dialog riwayat order paket ini (siapa beli, kapan, status)

---

## 3. Skema Database (migration baru)

### Tabel `membership_packages`
- `id`, `name`, `description` (keuntungan publik), `replay_info` (privat, untuk WA)
- `duration_days` (default 30)
- `price_idr`, `price_coins`, `pakasir_amount`
- `quota_total`, `quota_reserved` (counter atomik)
- `max_devices`, `includes_replays`
- `status` ('open' | 'closed'), `sort_order`
- `created_at`, `updated_at`

RLS: admin full; public read (untuk tampilkan kartu).

### Tabel `membership_orders`
- `id`, `package_id`, `user_id` (nullable utk guest? — kita wajibkan login agar lebih aman), `email`, `phone`
- `kind` ('qris' | 'coins'), `amount`, `coin_amount`
- `status` ('reserved' | 'paid' | 'expired' | 'cancelled')
- `pakasir_order_id`, `pakasir_qr_url`
- `membership_token_id` (FK ke membership_tokens setelah issued)
- `reserved_until` (15 menit dari created_at — auto-release jika expired)
- `paid_at`, `created_at`, `updated_at`

### RPC `reserve_membership_slot(_package_id, _user_id, _email, _phone, _kind)`
SECURITY DEFINER, atomik:
1. Lock baris paket (`SELECT ... FOR UPDATE`)
2. Cek `status = 'open'` dan `quota_reserved < quota_total`
3. Increment `quota_reserved`
4. Insert `membership_orders` status `reserved`, `reserved_until = now() + 15 min`
5. Return order_id + amount

### RPC `release_membership_slot(_order_id, _reason)`
Untuk order expired/cancelled: decrement `quota_reserved`, update status.

### RPC `finalize_membership_order(_order_id)`
Dipanggil edge function setelah pembayaran sukses:
1. Buat row `membership_tokens` (token + password random, expires_at = now() + duration_days)
2. Update order → `paid`, simpan `membership_token_id`
3. **TIDAK** decrement quota_reserved (slot tetap terpakai)

### Cron job (`pg_cron`)
Setiap 5 menit: panggil fungsi yang me-release semua order `reserved` dengan `reserved_until < now()`.

### Realtime
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.membership_packages;`

---

## 4. Edge Functions

### `create-membership-order` (baru)
Input: `package_id`, `email`, `phone`, `kind` ('qris')
1. Auth required
2. Validasi email + phone (zod)
3. Panggil `reserve_membership_slot` → dapat order_id + amount
4. Buat QRIS via pakasir dengan `order_id` sebagai reference
5. Return `{ order_id, qr_url, amount, reserved_until }`

### `purchase-membership-with-coins` (baru, atau extend `purchase-with-coins`)
Input: `package_id`, `email`, `phone`
1. Auth required, validasi
2. Reserve slot
3. Debit koin atomik (`debit_coins_for_purchase` adaptasi atau RPC baru)
4. Jika gagal debit → release slot, return error `insufficient_balance`
5. Panggil `finalize_membership_order` → dapat token + password
6. Kirim WA dengan template membership (lihat §5)
7. Return `{ ok, link, balance }`

### `pakasir-webhook` (extend existing)
Deteksi `kind === 'membership'` (via `membership_orders.id` di reference):
- Panggil `finalize_membership_order`
- Build WA message membership → kirim via fonnte
- Log ke `wa_outbox` & `token_deliveries`

### Pesan WhatsApp Membership (template baru di `site_settings`: `wa_membership_template`, editable di PakasirAdmin)
Default:
```
👑 *MEMBERSHIP AKTIF*

📦 *{package_name}*
📅 Berlaku hingga: {expires_at}

🔗 *Link Akses Membership:*
{link}

🗝️ Sandi: *{password}*

🎬 *Info Replay:*
{replay_info}

👤 Berlaku untuk *{max_devices} perangkat*.

— *ReplayTime* 💖
```
Link berbentuk: `{site}/live?mtoken={token}&mp={password}` (sudah didukung Live.tsx).

---

## 5. Akses Live & Countdown Show

Sudah didukung oleh `src/lib/membershipAccess.ts` + `Live.tsx` saat ini — token membership otomatis membuka semua live show aktif. Yang perlu ditambah:
- Di `/live` saat akses via membership token, tampilkan **section "Show Terdekat"** dengan countdown timer ke `active_shows` berikutnya (jika belum live). Komponen baru: `<UpcomingShowCountdown />` yang query `active_shows` mendatang dan render `dd:hh:mm:ss`.

---

## 6. Detail Teknis

- **Race condition**: dijamin oleh `SELECT ... FOR UPDATE` di RPC `reserve_membership_slot`.
- **Realtime UI**: hook `useMembershipPackages()` yang subscribe `postgres_changes` di tabel `membership_packages` → kartu otomatis update kuota & status.
- **Reservasi expired**: cron 5 menit + fallback cek `reserved_until` saat user load halaman (jika ada order pending milik user, tampilkan "Selesaikan pembayaran" countdown).
- **Order pakasir gagal**: jika user batal/tidak bayar dalam 15 menit, slot otomatis kembali via cron.
- **Routing**: tambah `<Route path="/membership" element={<Membership />} />` di `App.tsx`. Tambah link di HamburgerMenu.
- **Validasi email/phone**: zod schema di edge function + client side dengan pesan error jelas.
- **Idempotency**: pakasir-webhook cek `membership_orders.status` agar tidak double-issue.

---

## File yang Dibuat / Diedit

**Baru**:
- `src/pages/Membership.tsx`
- `src/components/MembershipPackageCard.tsx`
- `src/components/MembershipCheckoutDialog.tsx`
- `src/components/UpcomingShowCountdown.tsx`
- `src/components/admin/MembershipPackagesAdmin.tsx`
- `src/components/admin/MembershipOrdersDialog.tsx`
- `src/hooks/useMembershipPackages.ts`
- `supabase/functions/create-membership-order/index.ts`
- `supabase/functions/purchase-membership-with-coins/index.ts`
- Migration: tabel + RPC + cron

**Diedit**:
- `src/App.tsx` (route /membership)
- `src/components/HamburgerMenu.tsx` (link Membership)
- `src/pages/Admin.tsx` (tab baru)
- `src/pages/Live.tsx` (tampilkan UpcomingShowCountdown saat membership)
- `src/components/admin/PakasirAdmin.tsx` (editor template `wa_membership_template`)
- `supabase/functions/pakasir-webhook/index.ts` (handle membership kind)
- `supabase/config.toml` (verify_jwt untuk function baru)

---

## Yang TIDAK Diubah
- Sistem live show / token live satuan / token replay satuan tetap utuh.
- Template WA show & replay yang sudah ada tidak diganggu.
- `MembershipAdmin.tsx` existing (untuk token manual oleh admin) tetap, sekarang berdampingan dengan tab baru "Packages".
