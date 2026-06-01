# Sistem Tagihan Reseller (per-Link)

## Ringkasan
- Tombol **Reset** & **Hapus semua** hanya untuk admin (di Reseller panel dihapus).
- Admin set **harga per link** untuk tiap Show (default + override per show).
- Tagihan reseller dihitung otomatis: `jumlah_salin × harga_per_link`.
- Reseller bisa **bayar via QRIS dinamis**. Setelah lunas → log salin reseller itu **terhapus otomatis**.
- Admin dapat **override jumlah tagihan** per reseller (mis. 20k → 10k) sebelum/saat order aktif.

---

## 1. Reseller Panel (`src/pages/Reseller.tsx`)
- Hapus akses tombol reset / hapus log (reseller hanya melihat, tidak menghapus).
- Tambah panel **Tagihan Saya**:
  - Tampilkan rincian: Show A — 10 link × Rp2.000 = Rp20.000
  - Total tagihan + tombol **Bayar QRIS**.
  - Saat klik bayar → buat order via edge function `reseller-create-bill` (Pakasir), tampilkan QR code & countdown.
  - Polling status (re-use pola `check-pakasir-status`).
  - Jika lunas → toast sukses, log lokal & server dibersihkan, panel tagihan kosong.

## 2. Admin Panel
### a. `ResellerAuditAdmin.tsx`
- Tampilkan kolom **Harga/link** & **Subtotal** untuk tiap baris show.
- Tombol Reset / Hapus semua tetap (admin-only — sudah aman via RLS).
- Untuk tiap reseller: tampilkan **Total tagihan**, status order aktif (jika ada), tombol **Override harga** (input manual Rp).

### b. `MembershipAdmin.tsx` / komponen pricing baru `ResellerPricingAdmin.tsx`
- Set **harga default per link** (site_settings key `reseller_price_per_link`).
- Per-show override (tabel baru `reseller_show_prices`).
- List semua show + input harga.

## 3. Database (migrasi)
```sql
-- harga per-show (override)
CREATE TABLE public.reseller_show_prices (
  show_id uuid PRIMARY KEY,
  price_per_link integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- + GRANT + RLS admin-only + SELECT untuk semua (untuk reseller lihat tagihan)

-- order tagihan reseller
CREATE TABLE public.reseller_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_phone text NOT NULL,
  amount integer NOT NULL,                   -- bisa di-override admin
  computed_amount integer NOT NULL,          -- hasil hitung otomatis
  status text NOT NULL DEFAULT 'pending',    -- pending|paid|expired|cancelled
  pakasir_order_id text,
  pakasir_qr_url text DEFAULT '',
  breakdown jsonb NOT NULL DEFAULT '[]',     -- snapshot {show_id,title,qty,price}
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- + GRANT + RLS admin-only
```

### RPC baru
- `reseller_compute_bill(_phone, _pin)` → return breakdown + total (harga per-show, fallback ke default).
- `reseller_create_bill(_phone, _pin)` → buat row `reseller_bills` status pending, return id + amount + breakdown.
- `reseller_get_active_bill(_phone, _pin)` → ambil bill pending terbaru.
- `admin_override_reseller_bill(_bill_id, _amount)` → ubah `amount`.
- `mark_reseller_bill_paid(_bill_id)` (SECURITY DEFINER, dipanggil edge function) → set paid, hapus `reseller_copy_log` untuk phone tsb.
- `admin_set_show_price(_show_id, _price)` & default via `site_settings`.

## 4. Edge Functions
- **`reseller-create-bill`**: validasi phone+pin → panggil `reseller_create_bill` → buat invoice Pakasir → simpan `pakasir_order_id` & `pakasir_qr_url`.
- **`reseller-check-bill`**: cek status Pakasir; jika `completed` → `mark_reseller_bill_paid` (hapus log salin reseller).
- Re-use webhook pakasir yang ada bila perlu, atau polling dari frontend.

## 5. Flow
```
Reseller salin link → reseller_copy_log bertambah
Reseller buka tab Tagihan → compute_bill → tampilkan rincian + total
Klik Bayar → create_bill (QRIS dinamis Pakasir)
Bayar → webhook/polling → mark_paid → DELETE FROM reseller_copy_log WHERE phone=...
Panel reseller refresh → tagihan 0, log bersih
```

## 6. Admin override harga
- Di kartu reseller (admin panel): tombol "Ubah tagihan" → dialog input Rp baru → `admin_override_reseller_bill`.
- Jika belum ada bill pending, admin bisa buatkan manual juga.

## Catatan
- Tidak menyentuh halaman Live, player, atau playlist.
- Pakasir secrets sudah tersedia (`PAKASIR_API_KEY`, `PAKASIR_PROJECT_SLUG`).
- Setelah migrasi disetujui, kode frontend & edge function akan dibuat.
